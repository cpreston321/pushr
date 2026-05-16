import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Switch, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@pushr/backend/_generated/api';
import type { Id } from '@pushr/backend/_generated/dataModel';
import { Avatar } from '@/components/Avatar';
import { ProGate } from '@/components/Pro';
import { SheetContainer } from '@/components/SheetContainer';
import { SheetHeader } from '@/components/SheetHeader';
import {
  apiRowSubtitle,
  DestructiveFooterButton,
  DetailRow,
  DetailSection,
  isMuted,
  quietHoursLabel,
  RoleBadge,
  SharingSummarySection,
  tomorrowAt8am,
  type AppRow
} from '@/components/source-app/shared';
import { useTheme, spacing, type } from '@/lib/theme';
import { haptic } from '@/lib/haptics';
import { showActionSheet } from '@/lib/actionSheet';
import { promptText } from '@/lib/prompt';
import { pickAndUploadLogo } from '@/lib/uploadLogo';
import { forgetToken } from '@/lib/tokenStore';

/**
 * formSheet — detail screen for a single source app. Replaces the
 * imperative `SourceAppDrawer.open(id)` API. Sub-sheets (sharing, api) are
 * separate formSheet routes pushed on top via `router.push`.
 */
export default function SourceAppDetailScreen() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ id?: string }>();
  const appId = params.id as Id<'sourceApps'> | undefined;

  const apps = useQuery(api.sourceApps.listMine) as AppRow[] | undefined;
  const app = appId ? apps?.find((a) => a._id === appId) : undefined;
  const role = app?.role;
  const canEdit = role === 'owner' || role === 'editor';

  const rename = useMutation(api.sourceApps.rename);

  async function promptRename() {
    if (!app) return;
    const next = await promptText({ title: 'Rename app', defaultValue: app.name });
    if (!next) return;
    haptic.success();
    rename({ id: app._id, name: next });
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.sheet }}>
      <SheetHeader title={app?.name ?? ''} />
      <SheetContainer scrollView contentContainerStyle={{ paddingTop: spacing.md, gap: spacing.lg }}>
        {appId ? (
          <Body
            appId={appId}
            onPromptRename={app && canEdit ? promptRename : undefined}
            onOpenSharing={() =>
              router.push({ pathname: '/source-app-sharing' as never, params: { id: appId } })
            }
            onOpenApi={() =>
              router.push({ pathname: '/source-app-api' as never, params: { id: appId } })
            }
          />
        ) : null}
      </SheetContainer>
    </View>
  );
}

function Body({
  appId,
  onPromptRename,
  onOpenSharing,
  onOpenApi
}: {
  appId: Id<'sourceApps'>;
  onPromptRename: (() => void) | undefined;
  onOpenSharing: () => void;
  onOpenApi: () => void;
}) {
  const { colors } = useTheme();
  const apps = useQuery(api.sourceApps.listMine) as AppRow[] | undefined;
  const app = apps?.find((a) => a._id === appId);
  const role = app?.role;
  const isOwner = role === 'owner';
  const canEdit = role === 'owner' || role === 'editor';

  const setEnabled = useMutation(api.sourceApps.setEnabled);
  const setMute = useMutation(api.sourceApps.setMute);
  const setQuietHours = useMutation(api.sourceApps.setQuietHours);
  const deleteApp = useMutation(api.sourceApps.deleteApp);
  const setLogo = useMutation(api.sourceApps.setLogo);
  const removeLogo = useMutation(api.sourceApps.removeLogo);
  const generateUploadUrl = useMutation(api.sourceApps.generateLogoUploadUrl);
  const leaveApp = useMutation(api.sharing.leaveApp);
  const sendTestPush = useMutation(api.notifications.sendTest);
  const [sendingTest, setSendingTest] = useState(false);

  if (apps === undefined) {
    return (
      <View style={{ paddingTop: spacing.xxl, alignItems: 'center' }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!app) {
    return (
      <View style={{ paddingTop: spacing.xxl, alignItems: 'center' }}>
        <Text style={{ ...type.body, color: colors.secondaryLabel }}>Source app not found.</Text>
      </View>
    );
  }

  const muted = isMuted(app);
  const quiet = quietHoursLabel(app);

  async function changeLogo() {
    if (!app) return;
    const url = await generateUploadUrl({});
    const picked = await pickAndUploadLogo(url);
    if (!picked.ok) {
      if (picked.reason !== 'Canceled') {
        haptic.error();
        Alert.alert("Couldn't set logo", picked.reason);
      }
      return;
    }
    haptic.success();
    await setLogo({ id: app._id, storageId: picked.storageId });
  }

  function handleAvatarPress() {
    if (!app || !canEdit) return;
    haptic.light();
    if (!app.logoUrl) {
      changeLogo();
      return;
    }
    showActionSheet({
      title: 'Logo',
      options: [
        { label: 'Change logo', onPress: changeLogo },
        {
          label: 'Remove logo',
          destructive: true,
          onPress: () => {
            haptic.warning();
            removeLogo({ id: app._id });
          }
        }
      ]
    });
  }

  function openMutePresets() {
    if (!app) return;
    haptic.light();
    const now = Date.now();
    const presets = [
      { label: 'Mute 1 hour', ms: 60 * 60 * 1000 },
      { label: 'Mute 8 hours', ms: 8 * 60 * 60 * 1000 },
      { label: 'Mute until tomorrow 8am', ms: 'tomorrow' as const }
    ];
    showActionSheet({
      title: 'Mute',
      options: presets.map((p) => ({
        label: p.label,
        onPress: async () => {
          haptic.light();
          const until = p.ms === 'tomorrow' ? tomorrowAt8am() : now + p.ms;
          await setMute({ id: app._id, until });
        }
      }))
    });
  }

  function openQuietHours() {
    if (!app) return;
    haptic.light();
    const presets = [
      { label: 'No quiet hours', start: null, end: null },
      { label: '10pm – 7am', start: 22 * 60, end: 7 * 60 },
      { label: '11pm – 8am', start: 23 * 60, end: 8 * 60 },
      { label: 'Midnight – 6am', start: 0, end: 6 * 60 },
      { label: 'Workday (9am – 5pm)', start: 9 * 60, end: 17 * 60 }
    ];
    showActionSheet({
      title: `${app.name} quiet hours`,
      message:
        'Within this window pushes are downgraded to default priority and silent — they still land in the feed.',
      options: presets.map((p) => ({
        label: p.label,
        onPress: async () => {
          haptic.success();
          await setQuietHours({ id: app._id, start: p.start, end: p.end });
        }
      }))
    });
  }

  function confirmRevoke() {
    if (!app) return;
    haptic.warning();
    Alert.alert(
      'Delete app?',
      `Permanently deletes ${app.name} and everything tied to it: the bearer token, notification history, delivery records, live activities, the logo, members, and pending invites. This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            haptic.error();
            const id = app._id;
            router.back();
            try {
              await deleteApp({ id });
              await forgetToken(id);
            } catch (err: any) {
              haptic.error();
              Alert.alert(
                "Couldn't delete app",
                err?.data?.message ?? err?.message ?? 'Please try again.'
              );
            }
          }
        }
      ]
    );
  }

  function confirmLeave() {
    if (!app) return;
    haptic.warning();
    Alert.alert(
      'Leave app?',
      `You'll stop receiving pushes from ${app.name}. The owner can re-invite you later.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            haptic.success();
            await leaveApp({ sourceAppId: app._id });
            router.back();
          }
        }
      ]
    );
  }

  async function handleSendTest() {
    if (!app || sendingTest) return;
    setSendingTest(true);
    try {
      await sendTestPush({ sourceAppId: app._id });
      haptic.success();
    } catch (err: any) {
      haptic.error();
      Alert.alert('Test push failed', err?.data?.message ?? err?.message ?? 'Please try again.');
    } finally {
      setSendingTest(false);
    }
  }

  return (
    <>
      <View style={{ alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md }}>
        <Pressable
          onPress={canEdit ? handleAvatarPress : undefined}
          disabled={!canEdit}
          accessibilityRole={canEdit ? 'button' : undefined}
          accessibilityLabel={canEdit ? 'Change logo' : undefined}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <Avatar url={app.logoUrl} name={app.name} size={72} />
          {canEdit && (
            <View
              style={{
                position: 'absolute',
                bottom: -2,
                right: -2,
                width: 26,
                height: 26,
                borderRadius: 13,
                backgroundColor: colors.accent,
                borderWidth: 3,
                borderColor: colors.sheet,
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <SymbolView name="camera.fill" size={11} tintColor={colors.accentContrast} />
            </View>
          )}
        </Pressable>
        {!!app.description && (
          <Text
            style={{
              ...type.subhead,
              color: colors.secondaryLabel,
              textAlign: 'center',
              paddingHorizontal: spacing.xl
            }}
            numberOfLines={3}
          >
            {app.description}
          </Text>
        )}
        {!isOwner && <RoleBadge role={role!} />}
      </View>

      <DetailSection title="Delivery">
        <DetailRow
          icon="bell.fill"
          tint={colors.accent}
          title="Enabled"
          subtitle={app.enabled ? 'Accepting pushes from this app' : 'All pushes rejected'}
          trailing={
            <Switch
              style={{ alignSelf: 'center' }}
              value={app.enabled}
              disabled={!canEdit}
              onValueChange={(v) => {
                setEnabled({ id: app._id, enabled: v });
              }}
            />
          }
        />
        <DetailRow
          icon={muted ? 'bell.slash.fill' : 'moon.zzz'}
          tint={muted ? colors.warning : colors.secondaryLabel}
          title={muted ? 'Unmute' : 'Mute'}
          subtitle={
            muted
              ? app.mutedUntil
                ? `Muted until ${new Date(app.mutedUntil).toLocaleString()}`
                : 'Muted'
              : canEdit
                ? 'Silence pushes for a while'
                : 'Owner or editor required'
          }
          onPress={
            !canEdit
              ? undefined
              : muted
                ? () => setMute({ id: app._id, until: null })
                : openMutePresets
          }
          chevron={canEdit && !muted}
        />
        <ProGate feature="Quiet hours" icon="clock.badge.fill">
          <DetailRow
            icon="clock.badge.fill"
            tint={colors.accent}
            title="Quiet hours"
            subtitle={quiet ?? 'Not set'}
            onPress={canEdit ? openQuietHours : undefined}
            chevron={canEdit}
          />
        </ProGate>
      </DetailSection>

      <SharingSummarySection sourceAppId={app._id} onPress={onOpenSharing} />

      {canEdit && (
        <DetailSection title="Integration">
          <DetailRow
            icon="paperplane.fill"
            tint={colors.success}
            title={sendingTest ? 'Sending…' : 'Send test push'}
            subtitle="Fires a notification to your devices right now"
            onPress={sendingTest ? undefined : handleSendTest}
          />
          {isOwner && (
            <DetailRow
              icon="key.fill"
              tint={colors.accent}
              title="API & token"
              subtitle={apiRowSubtitle(app.webhookConfigs)}
              onPress={onOpenApi}
              chevron
              badge={app.webhookConfigs && app.webhookConfigs.length > 0 ? 'ON' : undefined}
            />
          )}
        </DetailSection>
      )}

      <DestructiveFooterButton
        label={isOwner ? 'Delete app' : 'Leave app'}
        onPress={isOwner ? confirmRevoke : confirmLeave}
      />
    </>
  );
}
