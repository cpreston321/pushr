import { useMutation, useQuery } from 'convex/react';
import { api } from '@pushr/backend/_generated/api';
import type { Doc, Id } from '@pushr/backend/_generated/dataModel';
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
import { Image } from 'expo-image';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader, ScreenBody } from '@/components/ScreenHeader';
import { ScreenTransition } from '@/components/ScreenTransition';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Drawer, useDrawer, type DrawerRef } from '@/components/Drawer';
import { DrawerHeader } from '@/components/DrawerHeader';
import { SourceAppDrawer, type SourceAppDrawerRef } from '@/components/drawers/SourceAppDrawer';
import { useTheme, spacing, radius, type } from '@/lib/theme';
import { haptic } from '@/lib/haptics';
import { showActionSheet } from '@/lib/actionSheet';
import { promptText } from '@/lib/prompt';
import { pickAndUploadLogo } from '@/lib/uploadLogo';
import { recallToken, rememberToken } from '@/lib/tokenStore';

type AppRow = Doc<'sourceApps'> & {
  logoUrl: string | null;
  role: 'owner' | 'editor' | 'viewer';
};

const SITE_URL = process.env.EXPO_PUBLIC_CONVEX_SITE_URL ?? '';

function curlExample(appName: string, token = '<your_token>') {
  return `curl -X POST "${SITE_URL}/notify" \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{"title":"Hello","body":"Test from ${appName}","priority":"high"}'`;
}

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

  const sourceAppDrawerRef = useRef<SourceAppDrawerRef>(null);
  const createDrawerRef = useRef<DrawerRef>(null);
  const tokenDrawerRef = useRef<DrawerRef>(null);
  const [created, setCreated] = useState<{
    id: Id<'sourceApps'>;
    name: string;
    token: string;
  } | null>(null);

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
    sourceAppDrawerRef.current?.open(item._id);
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
              createDrawerRef.current?.present();
            }}
            hitSlop={10}
          >
            <SymbolView name="plus" size={26} tintColor={colors.accent} />
          </Pressable>
        )
      }
    />
  );

  const modals = (
    <>
      <SourceAppDrawer
        ref={sourceAppDrawerRef}
        onTokenRotated={async ({ id, name, token }) => {
          await rememberToken(id, token);
          setCreated({ id, name, token });
          // The detail drawer already dismisses itself; defer the token sheet
          // so the animations don't collide.
          setTimeout(() => tokenDrawerRef.current?.present(), 200);
        }}
      />
      <CreateDrawer
        ref={createDrawerRef}
        onCreated={async (row) => {
          await rememberToken(row.id, row.token);
          await createDrawerRef.current?.dismiss();
          setCreated(row);
          // Defer present so dismissal animation finishes first.
          setTimeout(() => tokenDrawerRef.current?.present(), 200);
        }}
        create={create}
        generateUploadUrl={generateUploadUrl}
      />
      <TokenDrawer ref={tokenDrawerRef} created={created} onClose={() => setCreated(null)} />
    </>
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
        {modals}
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
                onPress={() => createDrawerRef.current?.present()}
              />
            </View>
          </ScrollView>
        </ScreenBody>
        {modals}
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
                          color: colors.secondaryLabel,
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
      {modals}
    </ScreenTransition>
  );
}

const CreateDrawer = forwardRef<
  DrawerRef,
  {
    onCreated: (created: { id: Id<'sourceApps'>; name: string; token: string }) => void;
    create: ReturnType<typeof useMutation<typeof api.sourceApps.create>>;
    generateUploadUrl: ReturnType<typeof useMutation<typeof api.sourceApps.generateLogoUploadUrl>>;
  }
>(function CreateDrawer({ onCreated, create, generateUploadUrl }, ref) {
  return (
    <Drawer ref={ref} header={<CreateHeader />}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.md,
          paddingBottom: spacing.xl,
          gap: spacing.lg
        }}
        keyboardShouldPersistTaps="handled"
      >
        <CreateBody onCreated={onCreated} create={create} generateUploadUrl={generateUploadUrl} />
      </ScrollView>
    </Drawer>
  );
});

function CreateHeader() {
  const { dismiss } = useDrawer();
  return <DrawerHeader title="New source app" onClose={() => dismiss()} />;
}

function CreateBody({
  onCreated,
  create,
  generateUploadUrl
}: {
  onCreated: (created: { id: Id<'sourceApps'>; name: string; token: string }) => void;
  create: ReturnType<typeof useMutation<typeof api.sourceApps.create>>;
  generateUploadUrl: ReturnType<typeof useMutation<typeof api.sourceApps.generateLogoUploadUrl>>;
}) {
  const { colors } = useTheme();
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [logo, setLogo] = useState<{
    storageId: Id<'_storage'>;
    localUri: string;
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setName('');
    setDesc('');
    setLogo(null);
    setUploading(false);
    setSubmitting(false);
  }

  async function pickLogo() {
    if (uploading) return;
    setUploading(true);
    try {
      const url = await generateUploadUrl({});
      const res = await pickAndUploadLogo(url);
      if (!res.ok) {
        if (res.reason !== 'Canceled') {
          haptic.error();
          Alert.alert("Couldn't set logo", res.reason);
        }
        return;
      }
      haptic.light();
      setLogo({ storageId: res.storageId, localUri: res.localUri });
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    haptic.success();
    try {
      const result = await create({
        name: trimmed,
        description: desc.trim() || undefined,
        logoStorageId: logo?.storageId
      });
      const row = { id: result.id, name: trimmed, token: result.token };
      reset();
      onCreated(row);
    } catch (err: any) {
      haptic.error();
      Alert.alert("Couldn't create app", err?.message ?? 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <View style={{ alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md }}>
        <Pressable onPress={pickLogo} disabled={uploading}>
          {logo ? (
            <Image
              source={{ uri: logo.localUri }}
              style={{
                width: 92,
                height: 92,
                borderRadius: 46,
                backgroundColor: colors.fill
              }}
              contentFit="cover"
            />
          ) : (
            <View
              style={{
                width: 92,
                height: 92,
                borderRadius: 46,
                backgroundColor: colors.fill,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: colors.separator,
                borderStyle: 'dashed'
              }}
            >
              <SymbolView
                name={uploading ? 'arrow.up.circle' : 'photo.badge.plus'}
                size={34}
                tintColor={colors.secondaryLabel}
              />
            </View>
          )}
        </Pressable>
        <Pressable onPress={pickLogo} disabled={uploading} hitSlop={8}>
          <Text style={{ ...type.footnote, color: colors.accent }}>
            {uploading ? 'Uploading…' : logo ? 'Change logo' : 'Add a logo (optional)'}
          </Text>
        </Pressable>
      </View>

      <Input label="Name" placeholder="e.g. home" value={name} onChangeText={setName} autoFocus />
      <Input
        label="Description (optional)"
        placeholder="What sends from this app?"
        value={desc}
        onChangeText={setDesc}
      />

      <Button title="Create" onPress={submit} disabled={!name.trim()} loading={submitting} />
    </>
  );
}

const TokenDrawer = forwardRef<
  DrawerRef,
  {
    created: { name: string; token: string } | null;
    onClose: () => void;
  }
>(function TokenDrawer({ created, onClose }, ref) {
  return (
    <Drawer ref={ref} header={<TokenHeader />} onDismiss={onClose}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.md,
          paddingBottom: 40,
          gap: spacing.lg
        }}
        keyboardShouldPersistTaps="handled"
      >
        <TokenBody created={created} />
      </ScrollView>
    </Drawer>
  );
});

function TokenHeader() {
  const { dismiss } = useDrawer();
  return <DrawerHeader title="Your token" onClose={() => dismiss()} />;
}

function TokenBody({ created }: { created: { name: string; token: string } | null }) {
  const { colors, tintBg } = useTheme();
  const { dismiss } = useDrawer();
  const [copied, setCopied] = useState<'token' | 'curl' | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function copy(kind: 'token' | 'curl', text: string) {
    await Clipboard.setStringAsync(text);
    haptic.success();
    setCopied(kind);
    setTimeout(() => setCopied((c) => (c === kind ? null : c)), 2000);
  }

  function handleDone() {
    if (!confirming && copied !== 'token') {
      haptic.warning();
      setConfirming(true);
      setTimeout(() => setConfirming(false), 4000);
      return;
    }
    setCopied(null);
    setConfirming(false);
    dismiss();
  }

  const tokenCopied = copied === 'token';
  const curlCopied = copied === 'curl';
  const accent = colors.warning;

  return (
    <>
      {/* Compact warning hero — one icon, two lines. */}
      <View style={{ alignItems: 'center', gap: spacing.xs }}>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: radius.lg,
            borderCurve: 'continuous',
            backgroundColor: tintBg(accent),
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <SymbolView name="exclamationmark.shield.fill" size={22} tintColor={accent} />
        </View>
        <Text
          style={{
            ...type.title3,
            color: colors.label,
            textAlign: 'center',
            marginTop: spacing.xs
          }}
        >
          Save this token now
        </Text>
        <Text
          style={{
            ...type.footnote,
            color: colors.secondaryLabel,
            textAlign: 'center',
            paddingHorizontal: spacing.lg
          }}
        >
          {created?.name ? `Token for ${created.name}. ` : ''}
          Shown once — close this and you'll need to regenerate.
        </Text>
      </View>

      {/* Single unified card: token + tap-to-copy rows. */}
      <View
        style={{
          backgroundColor: colors.cell,
          borderRadius: radius.lg,
          borderCurve: 'continuous',
          overflow: 'hidden'
        }}
      >
        {/* Token value */}
        <View
          style={{
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.md,
            paddingBottom: spacing.md,
            gap: spacing.xs
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <Text
              style={{
                ...type.footnote,
                color: colors.secondaryLabel,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                fontWeight: '600'
              }}
            >
              Bearer token
            </Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                paddingHorizontal: 7,
                paddingVertical: 2,
                borderRadius: 999,
                backgroundColor: tintBg(tokenCopied ? colors.success : accent)
              }}
            >
              <View
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 3,
                  backgroundColor: tokenCopied ? colors.success : accent
                }}
              />
              <Text
                style={{
                  ...type.caption2,
                  color: tokenCopied ? colors.success : accent,
                  fontWeight: '700',
                  letterSpacing: 0.5
                }}
              >
                {tokenCopied ? 'COPIED' : 'SHOWN ONCE'}
              </Text>
            </View>
          </View>
          <Text
            selectable
            style={{
              fontFamily: 'Menlo',
              fontSize: 14,
              lineHeight: 22,
              color: colors.label
            }}
          >
            {created?.token ?? ''}
          </Text>
        </View>

        <View style={{ height: 0.5, backgroundColor: colors.separator }} />

        {/* Tap to copy token */}
        <TokenSheetRow
          icon={tokenCopied ? 'checkmark.circle.fill' : 'doc.on.doc'}
          tint={tokenCopied ? colors.success : colors.accent}
          title={tokenCopied ? 'Copied' : 'Copy token'}
          onPress={() => {
            if (created) copy('token', created.token);
          }}
        />

        <View
          style={{
            height: 0.5,
            backgroundColor: colors.separator,
            marginLeft: 56
          }}
        />

        {/* Tap to copy curl example */}
        <TokenSheetRow
          icon={curlCopied ? 'checkmark.circle.fill' : 'terminal.fill'}
          tint={curlCopied ? colors.success : colors.accent}
          title={curlCopied ? 'Copied' : 'Copy curl example'}
          subtitle={curlCopied ? undefined : 'Try it from the command line right now'}
          onPress={() => {
            if (created) copy('curl', curlExample(created.name, created.token));
          }}
        />
      </View>

      <Button
        title={confirming ? 'Tap again to dismiss without copying' : 'Done'}
        variant={tokenCopied ? 'primary' : 'secondary'}
        onPress={handleDone}
      />
    </>
  );
}

function TokenSheetRow({
  icon,
  tint,
  title,
  subtitle,
  onPress
}: {
  icon: SFSymbol;
  tint: string;
  title: string;
  subtitle?: string;
  onPress: () => void;
}) {
  const { colors, tintBg } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        opacity: pressed ? 0.6 : 1,
        minHeight: 52
      })}
    >
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: radius.md,
          backgroundColor: tintBg(tint),
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <SymbolView name={icon} size={16} tintColor={tint} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ ...type.body, color: colors.label }}>{title}</Text>
        {!!subtitle && (
          <Text
            style={{
              ...type.footnote,
              color: colors.secondaryLabel,
              marginTop: 1
            }}
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        )}
      </View>
    </Pressable>
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
