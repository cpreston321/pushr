import { useConvex, useMutation, useQuery } from 'convex/react';
import { api } from '@pushr/backend/_generated/api';
import type { Doc, Id } from '@pushr/backend/_generated/dataModel';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View
} from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader, ScreenBody } from '@/components/ScreenHeader';
import { ScreenTransition } from '@/components/ScreenTransition';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { useTheme, spacing, radius, type } from '@/lib/theme';
import { haptic } from '@/lib/haptics';
import { showActionSheet } from '@/lib/actionSheet';
import { promptText } from '@/lib/prompt';
import { pickAndUploadLogo } from '@/lib/uploadLogo';
import { recallToken } from '@/lib/tokenStore';
import { getProviderMeta } from '@/lib/providerDetection';

type AppRow = Doc<'sourceApps'> & {
  logoUrl: string | null;
  role: 'owner' | 'editor' | 'viewer';
};

function quietHoursLabel(row: Pick<Doc<'sourceApps'>, 'quietStart' | 'quietEnd'>): string | null {
  const { quietStart: s, quietEnd: e } = row;
  if (s === undefined || e === undefined || s === e) return null;
  const fmt = (m: number) => {
    const h = Math.floor(m / 60);
    const min = m % 60;
    const period = h >= 12 ? 'pm' : 'am';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return min === 0 ? `${h12}${period}` : `${h12}:${String(min).padStart(2, '0')}${period}`;
  };
  return `${fmt(s)}–${fmt(e)}`;
}

function isMuted(row: Pick<Doc<'sourceApps'>, 'mutedUntil'>): boolean {
  return !!row.mutedUntil && row.mutedUntil > Date.now();
}

function tomorrowAt8am(): number {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(8, 0, 0, 0);
  return d.getTime();
}

function formatRelative(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  const m = Math.round(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

function formatMuteRemaining(until: number): string {
  const m = Math.round((until - Date.now()) / 60000);
  if (m <= 0) return '';
  if (m < 60) return `muted ${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `muted ${h}h`;
  const d = Math.round(h / 24);
  return `muted ${d}d`;
}

export default function Apps() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(120, insets.bottom + spacing.xxl + 60);
  const apps = useQuery(api.sourceApps.listMine) as AppRow[] | undefined;
  const pendingInvites = useQuery(api.sharing.listMyPendingInvites);
  const convex = useConvex();

  // Lightweight per-app recent activity for the list (fetched on demand)
  const [activity, setActivity] = useState<Record<string, { count7d: number; primaryProvider?: string }>>({});

  useEffect(() => {
    if (!apps || apps.length === 0) return;

    const loadActivity = async () => {
      const toFetch = apps.slice(0, 8); // keep it very lightweight
      const results = await Promise.all(
        toFetch.map(async (app) => {
          try {
            const stats = await convex.query(api.sourceApps.getStats, { id: app._id });
            return [
              app._id,
              {
                count7d: stats?.notificationCount7d ?? 0,
                primaryProvider: stats?.primaryProvider,
              },
            ] as const;
          } catch {
            return [app._id, { count7d: 0 }] as const;
          }
        })
      );
      const map: Record<string, any> = {};
      for (const [id, data] of results) map[id] = data;
      setActivity(map);
    };

    loadActivity();
  }, [apps, convex]);

  const create = useMutation(api.sourceApps.create);
  const setEnabled = useMutation(api.sourceApps.setEnabled);
  const setMute = useMutation(api.sourceApps.setMute);
  const setQuietHours = useMutation(api.sourceApps.setQuietHours);
  const rename = useMutation(api.sourceApps.rename);
  const generateUploadUrl = useMutation(api.sourceApps.generateLogoUploadUrl);
  const setLogo = useMutation(api.sourceApps.setLogo);
  const removeLogo = useMutation(api.sourceApps.removeLogo);
  const acceptInvite = useMutation(api.sharing.acceptInvite);
  const declineInvite = useMutation(api.sharing.declineInvite);

  const plan = useQuery(api.tiers.getMyPlan);
  const atLimit =
    !!plan && plan.sourceAppLimit !== null && plan.sourceAppCount >= plan.sourceAppLimit;

  async function copySavedToken(item: AppRow) {
    const token = await recallToken(item._id);
    if (!token) {
      haptic.warning();
      Alert.alert(
        'Token not on this device',
        'We only cache the token on the device it was created on. To use it elsewhere, revoke and create a new app.'
      );
      return;
    }
    await Clipboard.setStringAsync(token);
    haptic.success();
  }

  async function changeLogo(id: Id<'sourceApps'>) {
    const uploadUrl = await generateUploadUrl({});
    const picked = await pickAndUploadLogo(uploadUrl);
    if (!picked.ok) {
      if (picked.reason !== 'Canceled') {
        haptic.error();
        Alert.alert("Couldn't set logo", picked.reason);
      }
      return;
    }
    haptic.success();
    await setLogo({ id, storageId: picked.storageId });
  }

  function openQuietHours(item: AppRow) {
    haptic.light();
    type Preset = { label: string; start: number | null; end: number | null };
    const presets: Preset[] = [
      { label: 'No quiet hours', start: null, end: null },
      { label: '10pm – 7am', start: 22 * 60, end: 7 * 60 },
      { label: '11pm – 8am', start: 23 * 60, end: 8 * 60 },
      { label: 'Midnight – 6am', start: 0, end: 6 * 60 },
      { label: 'Weekdays 9am – 5pm (workday only)', start: 9 * 60, end: 17 * 60 }
    ];
    showActionSheet({
      title: `${item.name} quiet hours`,
      message:
        'Within this window, incoming pushes are downgraded to default priority and silent — they still land in the feed.',
      options: presets.map((p) => ({
        label: p.label,
        onPress: async () => {
          haptic.success();
          await setQuietHours({ id: item._id, start: p.start, end: p.end });
        }
      }))
    });
  }

  function openActions(item: AppRow) {
    haptic.light();
    router.push({ pathname: '/source-app-detail' as never, params: { id: item._id } });
  }

  async function promptRename(item: AppRow) {
    const next = await promptText({
      title: 'Rename app',
      defaultValue: item.name
    });
    if (!next || next === item.name) return;
    haptic.success();
    rename({ id: item._id, name: next, description: item.description });
  }

  const header = (
    <ScreenHeader
      eyebrow={apps ? `${apps.length} ${apps.length === 1 ? 'app' : 'apps'}` : undefined}
      title="Apps"
      accessory={
        atLimit ? (
          <Pressable
            accessibilityLabel="Upgrade to add more apps"
            accessibilityRole="button"
            onPress={() => {
              haptic.light();
              router.push('/upgrade');
            }}
            hitSlop={10}
          >
            <SymbolView name="sparkles" size={24} tintColor={colors.warning} />
          </Pressable>
        ) : (
          <Pressable
            accessibilityLabel="Create source app"
            accessibilityRole="button"
            onPress={() => {
              haptic.light();
              router.push('/create-app' as never);
            }}
            hitSlop={10}
          >
            <SymbolView name="plus" size={26} tintColor={colors.accent} />
          </Pressable>
        )
      }
    />
  );

  if (apps === undefined) {
    return (
      <ScreenTransition style={{ backgroundColor: colors.background }}>
        {header}
        <ScreenBody>
          <View
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              paddingTop: spacing.xxl
            }}
          >
            <ActivityIndicator color={colors.accent} />
          </View>
        </ScreenBody>
      </ScreenTransition>
    );
  }

  const invitesBanner =
    pendingInvites && pendingInvites.length > 0 ? (
      <InvitesBanner
        invites={pendingInvites}
        onAccept={async (id) => {
          haptic.success();
          await acceptInvite({ inviteId: id });
        }}
        onDecline={async (id) => {
          haptic.warning();
          await declineInvite({ inviteId: id });
        }}
      />
    ) : null;

  if (apps.length === 0) {
    return (
      <ScreenTransition style={{ backgroundColor: colors.background }}>
        {header}
        <ScreenBody>
          <ScrollView
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={{
              flexGrow: 1,
              paddingTop: spacing.xl,
              paddingBottom: bottomPad
            }}
          >
            {invitesBanner}
            <View
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                padding: spacing.xxl,
                gap: spacing.md
              }}
            >
              <SymbolView name="app.badge" size={48} tintColor={colors.tertiaryLabel} />
              <Text style={{ ...type.title3, color: colors.label }}>No source apps</Text>
              <Text
                style={{
                  ...type.subhead,
                  color: colors.secondaryLabel,
                  textAlign: 'center',
                  marginBottom: spacing.lg
                }}
              >
                Create one for each project or service that should be able to send you pushes.
              </Text>
              <Button
                title="Create source app"
                onPress={() => router.push('/create-app' as never)}
              />
            </View>
          </ScrollView>
        </ScreenBody>
      </ScreenTransition>
    );
  }

  return (
    <ScreenTransition style={{ backgroundColor: colors.background }}>
      {header}
      <ScreenBody>
        <FlatList
          data={apps}
          keyExtractor={(a) => a._id}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ paddingTop: spacing.xl, paddingBottom: bottomPad }}
          ListHeaderComponent={invitesBanner}
          renderItem={({ item, index }) => {
            const isFirst = index === 0;
            const isLast = index === apps.length - 1;
            return (
              <View
                style={{
                  marginHorizontal: spacing.lg,
                  backgroundColor: colors.cell,
                  borderTopLeftRadius: isFirst ? radius.lg : 0,
                  borderTopRightRadius: isFirst ? radius.lg : 0,
                  borderBottomLeftRadius: isLast ? radius.lg : 0,
                  borderBottomRightRadius: isLast ? radius.lg : 0,
                  borderCurve: 'continuous',
                  overflow: 'hidden'
                }}
              >
                <ReanimatedSwipeable
                  friction={2}
                  rightThreshold={40}
                  overshootRight={false}
                  renderRightActions={() => (
                    <Pressable
                      onPress={() => copySavedToken(item)}
                      accessibilityRole="button"
                      accessibilityLabel={`Copy token for ${item.name}`}
                      style={{
                        backgroundColor: colors.accent,
                        justifyContent: 'center',
                        alignItems: 'center',
                        width: 96
                      }}
                    >
                      <SymbolView name="doc.on.doc.fill" size={20} tintColor="#FFFFFF" />
                      <Text style={{ color: '#FFFFFF', ...type.caption1, marginTop: 4 }}>
                        Copy token
                      </Text>
                    </Pressable>
                  )}
                >
                  <Pressable
                    onPress={() => openActions(item)}
                    onLongPress={() => changeLogo(item._id)}
                    accessibilityRole="button"
                    accessibilityLabel={`${item.name}${isMuted(item) ? ', muted' : ''}${
                      item.lastUsedAt
                        ? `, last used ${formatRelative(item.lastUsedAt)}`
                        : ', never used'
                    }`}
                    accessibilityHint="Opens app actions. Swipe left to copy token."
                    style={({ pressed }) => ({
                      backgroundColor: pressed ? colors.cellHighlight : colors.cell,
                      paddingHorizontal: spacing.lg,
                      paddingVertical: spacing.md,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: spacing.md,
                      minHeight: 64
                    })}
                  >
                    <Avatar url={item.logoUrl} name={item.name} size={44} />
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                        <Text
                          style={{ ...type.body, color: colors.label, flexShrink: 1 }}
                          numberOfLines={1}
                        >
                          {item.name}
                        </Text>

                        {activity[item._id] && activity[item._id].count7d > 0 && (
                          <View
                            style={{
                              paddingHorizontal: 6,
                              paddingVertical: 1,
                              borderRadius: radius.xs,
                              backgroundColor: colors.fill,
                            }}
                          >
                            <Text style={{ ...type.caption2, color: colors.secondaryLabel, fontVariant: ['tabular-nums'] }}>
                              {activity[item._id].count7d} in 7d
                            </Text>
                          </View>
                        )}

                        {activity[item._id]?.primaryProvider && (
                          <View
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: 3,
                              backgroundColor: getProviderMeta(activity[item._id].primaryProvider as any).tint || colors.accent,
                            }}
                          />
                        )}

                        {isMuted(item) && (
                          <View
                            style={{
                              paddingHorizontal: 6,
                              paddingVertical: 2,
                              borderRadius: radius.xs,
                              backgroundColor: colors.fill,
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 4
                            }}
                          >
                            <SymbolView
                              name="bell.slash.fill"
                              size={10}
                              tintColor={colors.secondaryLabel}
                            />
                            <Text style={{ ...type.caption2, color: colors.secondaryLabel }}>
                              {formatMuteRemaining(item.mutedUntil!)}
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text
                        style={{
                          ...type.caption1,
                          color: item.lastUsedAt && Date.now() - item.lastUsedAt < 1000 * 60 * 60 * 24 * 3
                            ? colors.success
                            : colors.secondaryLabel,
                          marginTop: 2
                        }}
                        numberOfLines={1}
                      >
                        {item.lastUsedAt
                          ? `Last used ${formatRelative(item.lastUsedAt)}`
                          : 'Never used'}
                      </Text>
                    </View>
                    {item.role !== 'owner' && <RoleBadge role={item.role} />}
                    <Switch
                      value={item.enabled}
                      disabled={item.role === 'viewer'}
                      onValueChange={(v) => {
                        haptic.light();
                        setEnabled({ id: item._id, enabled: v });
                      }}
                      accessibilityLabel={`${item.name} enabled`}
                      style={{ alignSelf: 'center' }}
                    />
                  </Pressable>
                </ReanimatedSwipeable>
                {!isLast && (
                  <View
                    style={{
                      height: 0.5,
                      backgroundColor: colors.separator,
                      marginLeft: 76
                    }}
                  />
                )}
              </View>
            );
          }}
        />
      </ScreenBody>
    </ScreenTransition>
  );
}


type PendingInvite = {
  _id: Id<'sourceAppInvites'>;
  sourceAppId: Id<'sourceApps'>;
  sourceAppName: string;
  sourceAppLogoUrl: string | null;
  role: 'editor' | 'viewer';
  invitedByEmail: string | null;
};

function InvitesBanner({
  invites,
  onAccept,
  onDecline
}: {
  invites: PendingInvite[];
  onAccept: (id: Id<'sourceAppInvites'>) => Promise<void>;
  onDecline: (id: Id<'sourceAppInvites'>) => Promise<void>;
}) {
  const { colors, tintBg } = useTheme();
  return (
    <Animated.View
      entering={FadeIn}
      exiting={FadeOut}
      layout={LinearTransition}
      style={{
        marginHorizontal: spacing.lg,
        marginBottom: spacing.lg,
        backgroundColor: colors.cell,
        borderRadius: radius.lg,
        borderCurve: 'continuous',
        overflow: 'hidden'
      }}
    >
      <View
        style={{
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.sm,
          backgroundColor: tintBg(colors.accent)
        }}
      >
        <Text style={{ ...type.footnote, color: colors.accent, fontWeight: '600' }}>
          {invites.length === 1
            ? 'You have 1 invitation'
            : `You have ${invites.length} invitations`}
        </Text>
      </View>
      {invites.map((invite, i) => (
        <Animated.View
          key={invite._id}
          entering={FadeIn}
          exiting={FadeOut}
          layout={LinearTransition}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.md,
              padding: spacing.lg
            }}
          >
            <Avatar url={invite.sourceAppLogoUrl} name={invite.sourceAppName} size={40} />
            <View style={{ flex: 1 }}>
              <Text style={{ ...type.body, color: colors.label }} numberOfLines={1}>
                {invite.sourceAppName}
              </Text>
              <Text
                style={{ ...type.footnote, color: colors.secondaryLabel, marginTop: 1 }}
                numberOfLines={1}
                selectable
              >
                {invite.invitedByEmail
                  ? `${invite.invitedByEmail} invited you as ${invite.role}`
                  : `Invited as ${invite.role}`}
              </Text>
            </View>
          </View>
          <View
            style={{
              flexDirection: 'row',
              gap: spacing.sm,
              paddingHorizontal: spacing.lg,
              paddingBottom: spacing.lg
            }}
          >
            <Pressable
              onPress={() => onAccept(invite._id)}
              style={({ pressed }) => ({
                flex: 1,
                backgroundColor: pressed ? tintBg(colors.accent) : colors.accent,
                paddingVertical: spacing.md,
                borderRadius: radius.md,
                borderCurve: 'continuous',
                alignItems: 'center'
              })}
            >
              <Text style={{ ...type.callout, color: colors.accentContrast, fontWeight: '600' }}>
                Accept
              </Text>
            </Pressable>
            <Pressable
              onPress={() => onDecline(invite._id)}
              style={({ pressed }) => ({
                flex: 1,
                backgroundColor: pressed ? colors.cellHighlight : colors.fill,
                paddingVertical: spacing.md,
                borderRadius: radius.md,
                borderCurve: 'continuous',
                alignItems: 'center'
              })}
            >
              <Text style={{ ...type.callout, color: colors.label }}>Decline</Text>
            </Pressable>
          </View>
          {i < invites.length - 1 && (
            <View
              style={{
                height: 0.5,
                backgroundColor: colors.separator,
                marginHorizontal: spacing.lg
              }}
            />
          )}
        </Animated.View>
      ))}
    </Animated.View>
  );
}

function RoleBadge({ role }: { role: 'owner' | 'editor' | 'viewer' }) {
  const { colors, tintBg } = useTheme();
  const label = role === 'owner' ? 'Owner' : role === 'editor' ? 'Editor' : 'Viewer';
  const tint =
    role === 'owner' ? colors.accent : role === 'editor' ? colors.success : colors.secondaryLabel;
  return (
    <View
      style={{
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: radius.xs,
        backgroundColor: tintBg(tint),
        marginRight: spacing.xs
      }}
    >
      <Text style={{ ...type.caption2, color: tint, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}
