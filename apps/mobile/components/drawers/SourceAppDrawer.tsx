import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useMutation, useQuery } from 'convex/react';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import type { FunctionReturnType } from 'convex/server';
import { api } from '@pushr/backend/_generated/api';
import type { Doc, Id } from '@pushr/backend/_generated/dataModel';
import { Avatar } from '@/components/Avatar';
import { Drawer, useDrawer, type DrawerRef } from '@/components/Drawer';
import { DrawerHeader } from '@/components/DrawerHeader';
import { ProGate } from '@/components/Pro';
import { useTheme, spacing, radius, type } from '@/lib/theme';
import { haptic } from '@/lib/haptics';
import { showActionSheet } from '@/lib/actionSheet';
import { promptText } from '@/lib/prompt';
import { pickAndUploadLogo } from '@/lib/uploadLogo';
import { forgetToken, recallToken } from '@/lib/tokenStore';
import { backendConfig } from '@/lib/backend';

type Role = 'owner' | 'editor' | 'viewer';
type AppRow = Doc<'sourceApps'> & {
  logoUrl: string | null;
  role: Role;
  // Owner-only: per-provider webhook signing configs. Empty array for
  // viewers/editors (server hides them).
  webhookConfigs: Array<{ provider: string; secret: string }>;
};
type SharingData = NonNullable<FunctionReturnType<typeof api.sharing.listMembers>>;
type Member = SharingData['members'][number];
type Invite = SharingData['invites'][number];

export type SourceAppDrawerRef = DrawerRef & {
  open: (id: Id<'sourceApps'>) => Promise<void>;
};

export type SourceAppDrawerProps = {
  /**
   * Called after the owner rotates a source-app token. The drawer dismisses
   * itself first; the parent typically presents a TokenDrawer to reveal the
   * new bearer (only chance to capture it).
   */
  onTokenRotated?: (info: { id: Id<'sourceApps'>; name: string; token: string }) => void;
};

/**
 * Three TrueSheets stacked: the detail sheet, plus a sharing sheet and an
 * API/token sheet that present on top of it when their entry rows are tapped.
 * iOS handles the stack; back-arrow on a child sheet dismisses just the top.
 */
export const SourceAppDrawer = forwardRef<SourceAppDrawerRef, SourceAppDrawerProps>(
  function SourceAppDrawer({ onTokenRotated }, ref) {
    const detailRef = useRef<DrawerRef>(null);
    const sharingRef = useRef<DrawerRef>(null);
    const apiRef = useRef<DrawerRef>(null);
    const [appId, setAppId] = useState<Id<'sourceApps'> | null>(null);

    useImperativeHandle(
      ref,
      () => ({
        present: (i) => detailRef.current?.present(i) ?? Promise.resolve(),
        dismiss: () => detailRef.current?.dismiss() ?? Promise.resolve(),
        open: async (id) => {
          setAppId(id);
          await detailRef.current?.present();
        }
      }),
      []
    );

    return (
      <>
        <Drawer
          ref={detailRef}
          header={<DetailHeader appId={appId} onClose={() => detailRef.current?.dismiss()} />}
        >
          <ScrollView
            contentContainerStyle={{
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.md,
              paddingBottom: 40,
              gap: spacing.lg
            }}
          >
            {appId ? (
              <DetailBody
                appId={appId}
                onOpenSharing={() => sharingRef.current?.present()}
                onOpenApi={() => apiRef.current?.present()}
              />
            ) : null}
          </ScrollView>
        </Drawer>

        <Drawer
          ref={sharingRef}
          header={
            <DrawerHeader
              title="Sharing"
              leading="back"
              onClose={() => sharingRef.current?.dismiss()}
            />
          }
        >
          <ScrollView
            contentContainerStyle={{
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.md,
              paddingBottom: 40,
              gap: spacing.lg
            }}
          >
            {appId ? <SharingBody sourceAppId={appId} /> : null}
          </ScrollView>
        </Drawer>

        <Drawer
          ref={apiRef}
          header={
            <DrawerHeader
              title="API & token"
              leading="back"
              onClose={() => apiRef.current?.dismiss()}
            />
          }
        >
          <ScrollView
            contentContainerStyle={{
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.md,
              paddingBottom: 40,
              gap: spacing.lg
            }}
          >
            {appId ? (
              <ApiBody
                appId={appId}
                onTokenRotated={async (info) => {
                  await apiRef.current?.dismiss();
                  await detailRef.current?.dismiss();
                  onTokenRotated?.(info);
                }}
              />
            ) : null}
          </ScrollView>
        </Drawer>
      </>
    );
  }
);

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

function DetailHeader({ appId, onClose }: { appId: Id<'sourceApps'> | null; onClose: () => void }) {
  const apps = useQuery(api.sourceApps.listMine) as AppRow[] | undefined;
  const app = apps?.find((a) => a._id === appId);
  const role = app?.role;
  const canEdit = role === 'owner' || role === 'editor';

  const rename = useMutation(api.sourceApps.rename);

  async function promptRename() {
    if (!app) return;
    const next = await promptText({
      title: 'Rename app',
      defaultValue: app.name
    });
    if (!next) return;
    haptic.success();
    rename({ id: app._id, name: next });
  }

  return (
    <DrawerHeader
      title={app?.name ?? ''}
      onPressTitle={app && canEdit ? promptRename : undefined}
      onClose={onClose}
    />
  );
}

function DetailBody({
  appId,
  onOpenSharing,
  onOpenApi
}: {
  appId: Id<'sourceApps'>;
  onOpenSharing: () => void;
  onOpenApi: () => void;
}) {
  const { colors } = useTheme();
  const { dismiss } = useDrawer();
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
            const appId = app._id;
            // Close the sheet immediately so the destructive action feels
            // instant; the cascade-delete + background sweep run after.
            await dismiss();
            try {
              await deleteApp({ id: appId });
              await forgetToken(appId);
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
            await dismiss();
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
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md
        }}
      >
        <Pressable
          onPress={canEdit ? handleAvatarPress : undefined}
          disabled={!canEdit}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          accessibilityRole={canEdit ? 'button' : undefined}
          accessibilityLabel={canEdit ? 'Change logo' : undefined}
        >
          <Avatar url={app.logoUrl} name={app.name} size={56} />
        </Pressable>
        <View style={{ flex: 1, gap: 2 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.xs
            }}
          >
            <Text style={{ ...type.title3, color: colors.label, flexShrink: 1 }} numberOfLines={1}>
              {app.name}
            </Text>
            {!isOwner && <RoleBadge role={role!} />}
          </View>
          {!!app.description && (
            <Text style={{ ...type.subhead, color: colors.secondaryLabel }} numberOfLines={2}>
              {app.description}
            </Text>
          )}
        </View>
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

function SharingSummarySection({
  sourceAppId,
  onPress
}: {
  sourceAppId: Id<'sourceApps'>;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const data = useQuery(api.sharing.listMembers, { sourceAppId });

  const subtitle = sharingSubtitle(data);
  const memberCount = data?.members.length ?? 0;
  const pendingCount = data?.invites.length ?? 0;
  const atLimit =
    data?.sharedUsersLimit !== null &&
    data?.sharedUsersLimit !== undefined &&
    data.sharedUsersUsed >= data.sharedUsersLimit;

  return (
    <DetailSection title="Sharing">
      <DetailRow
        icon={atLimit ? 'sparkles' : 'person.2.fill'}
        tint={atLimit ? colors.warning : colors.accent}
        title="Manage sharing"
        subtitle={subtitle}
        onPress={onPress}
        chevron
        trailing={
          memberCount + pendingCount > 0 ? (
            <SharingCountBadge memberCount={memberCount} pendingCount={pendingCount} />
          ) : undefined
        }
      />
    </DetailSection>
  );
}

function DestructiveFooterButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        haptic.selection();
        onPress();
      }}
      style={({ pressed }) => ({
        backgroundColor: pressed ? colors.cellHighlight : colors.cell,
        borderRadius: radius.lg,
        borderCurve: 'continuous',
        paddingVertical: spacing.md,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 52
      })}
    >
      <Text
        style={{
          ...type.body,
          color: colors.destructive,
          fontWeight: '600'
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// API & token
// ---------------------------------------------------------------------------

type WebhookProviderId = 'github' | 'sentry' | 'grafana';

type WebhookProviderMeta = {
  label: string;
  /** True if the provider HMAC-signs payloads (so a signing secret matters). */
  signs: boolean;
  signatureHeader?: string;
  /** Where the user goes to copy the secret on the provider's side. */
  configHint?: string;
  hookPath: string;
};

const WEBHOOK_PROVIDERS: Record<WebhookProviderId, WebhookProviderMeta> = {
  github: {
    label: 'GitHub',
    signs: true,
    signatureHeader: 'X-Hub-Signature-256',
    configHint: 'Repo → Settings → Webhooks',
    hookPath: '/hooks/github'
  },
  sentry: {
    label: 'Sentry',
    signs: true,
    signatureHeader: 'Sentry-Hook-Signature',
    configHint: 'Settings → Custom Integrations → Webhooks',
    hookPath: '/hooks/sentry'
  },
  grafana: {
    label: 'Grafana',
    // Grafana doesn't sign webhook payloads natively — auth is bearer-only.
    signs: false,
    configHint: 'Alerting → Contact points → Webhook',
    hookPath: '/hooks/grafana'
  }
};

const WEBHOOK_PROVIDER_ORDER: WebhookProviderId[] = ['github', 'sentry', 'grafana'];

function isWebhookProviderId(v: string | undefined): v is WebhookProviderId {
  return v === 'github' || v === 'sentry' || v === 'grafana';
}

function ApiBody({
  appId,
  onTokenRotated
}: {
  appId: Id<'sourceApps'>;
  onTokenRotated: (info: { id: Id<'sourceApps'>; name: string; token: string }) => void;
}) {
  const { colors, tintBg } = useTheme();
  const apps = useQuery(api.sourceApps.listMine) as AppRow[] | undefined;
  const app = apps?.find((a) => a._id === appId);
  const rotateToken = useMutation(api.sourceApps.rotateToken);
  const setProviderWebhookSecret = useMutation(api.sourceApps.setProviderWebhookSecret);
  const [rotating, setRotating] = useState(false);
  const [savingFor, setSavingFor] = useState<WebhookProviderId | null>(null);

  if (apps === undefined) {
    return (
      <View style={{ paddingTop: spacing.xxl, alignItems: 'center' }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!app || app.role !== 'owner') {
    return (
      <View style={{ paddingTop: spacing.xxl, alignItems: 'center' }}>
        <Text style={{ ...type.body, color: colors.secondaryLabel }}>Owner access required.</Text>
      </View>
    );
  }

  // Per-provider config lookup. `webhookConfigs` is owner-only, server-side
  // populated; we always treat undefined as empty.
  const configsByProvider = new Map<WebhookProviderId, string>();
  for (const c of app.webhookConfigs ?? []) {
    if (isWebhookProviderId(c.provider)) {
      configsByProvider.set(c.provider, c.secret);
    }
  }

  async function setSecretFor(providerId: WebhookProviderId) {
    if (!app || savingFor) return;
    const meta = WEBHOOK_PROVIDERS[providerId];
    const existing = configsByProvider.get(providerId);
    const value = await promptText({
      title: existing ? `Update ${meta.label} signing secret` : `Set ${meta.label} signing secret`,
      message: meta.configHint
        ? `Paste the secret from ${meta.configHint}. We'll verify ${meta.signatureHeader} on every delivery to ${meta.hookPath}.`
        : `We'll verify ${meta.signatureHeader} on every delivery to ${meta.hookPath}.`,
      placeholder: 'Paste signing secret',
      contentType: 'password',
      confirmLabel: 'Save'
    });
    if (!value) return;
    setSavingFor(providerId);
    try {
      await setProviderWebhookSecret({
        id: app._id,
        provider: providerId,
        secret: value
      });
      haptic.success();
    } catch (err: any) {
      haptic.error();
      Alert.alert(
        `Couldn't save ${meta.label} secret`,
        err?.data?.message ?? err?.message ?? 'Please try again.'
      );
    } finally {
      setSavingFor(null);
    }
  }

  async function clearSecretFor(providerId: WebhookProviderId) {
    if (!app || savingFor) return;
    const meta = WEBHOOK_PROVIDERS[providerId];
    Alert.alert(
      `Clear ${meta.label} signing secret?`,
      `${meta.label} deliveries to ${app.name} will stop being signature-verified. Other providers configured on this app are unaffected. The bearer token still authenticates each request.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            setSavingFor(providerId);
            try {
              await setProviderWebhookSecret({
                id: app._id,
                provider: providerId,
                secret: null
              });
              haptic.success();
            } catch (err: any) {
              haptic.error();
              Alert.alert(
                `Couldn't clear ${meta.label} secret`,
                err?.data?.message ?? err?.message ?? 'Please try again.'
              );
            } finally {
              setSavingFor(null);
            }
          }
        }
      ]
    );
  }

  function tapProvider(providerId: WebhookProviderId) {
    if (!app || savingFor) return;
    const meta = WEBHOOK_PROVIDERS[providerId];
    if (!meta.signs) return; // Bearer-only — nothing to configure.
    haptic.light();
    if (configsByProvider.has(providerId)) {
      showActionSheet({
        title: `${meta.label} webhook`,
        options: [
          {
            label: 'Update signing secret',
            onPress: () => setSecretFor(providerId)
          },
          {
            label: 'Clear signing secret',
            destructive: true,
            onPress: () => clearSecretFor(providerId)
          }
        ]
      });
    } else {
      setSecretFor(providerId);
    }
  }

  async function copyCurl() {
    if (!app) return;
    await Clipboard.setStringAsync(curlExample(app.name));
    haptic.success();
  }

  async function copyTokenPrefix() {
    if (!app) return;
    await Clipboard.setStringAsync(app.tokenPrefix);
    haptic.light();
  }

  async function copySavedToken() {
    if (!app) return;
    const token = await recallToken(app._id);
    if (!token) {
      haptic.warning();
      Alert.alert(
        'Token not on this device',
        'We only cache the token on the device it was created on. To use it elsewhere, regenerate the token.'
      );
      return;
    }
    await Clipboard.setStringAsync(token);
    haptic.success();
  }

  async function handleRotate() {
    if (!app || rotating) return;
    Alert.alert(
      'Regenerate token?',
      `Any caller still using the current token for ${app.name} will stop working immediately. The notification feed history is preserved.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Regenerate',
          style: 'destructive',
          onPress: async () => {
            setRotating(true);
            try {
              const { token } = await rotateToken({ id: app._id });
              haptic.success();
              onTokenRotated({ id: app._id, name: app.name, token });
            } catch (err: any) {
              haptic.error();
              Alert.alert(
                "Couldn't regenerate token",
                err?.data?.message ?? err?.message ?? 'Please try again.'
              );
            } finally {
              setRotating(false);
            }
          }
        }
      ]
    );
  }

  return (
    <View style={{ gap: spacing.xs }}>
      <Text
        style={{
          ...type.footnote,
          color: colors.secondaryLabel,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          paddingHorizontal: spacing.sm
        }}
      >
        Bearer token
      </Text>

      {/* Token card — prefix shown big & monospace, with inline copy. */}
      <Pressable
        onPress={copyTokenPrefix}
        style={({ pressed }) => ({
          backgroundColor: colors.cell,
          borderRadius: radius.lg,
          borderCurve: 'continuous',
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          opacity: pressed ? 0.7 : 1
        })}
        accessibilityRole="button"
        accessibilityLabel="Copy token prefix"
      >
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: radius.lg,
            backgroundColor: tintBg(colors.accent),
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <SymbolView name="key.fill" size={18} tintColor={colors.accent} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            style={{
              ...type.footnote,
              color: colors.secondaryLabel,
              textTransform: 'uppercase',
              letterSpacing: 0.5
            }}
          >
            Prefix
          </Text>
          <Text
            selectable
            numberOfLines={1}
            style={{
              ...type.body,
              color: colors.label,
              fontFamily: 'Menlo'
            }}
          >
            {app.tokenPrefix}
            <Text style={{ color: colors.secondaryLabel }}>…</Text>
          </Text>
        </View>
        <SymbolView name="doc.on.doc" size={16} tintColor={colors.secondaryLabel} />
      </Pressable>

      {/* Token actions — grouped DetailSection underneath the card. */}
      <View style={{ marginTop: spacing.sm }}>
        <DetailSection title="Token actions">
          <DetailRow
            icon="terminal.fill"
            tint={colors.accent}
            title="Copy curl example"
            subtitle="Paste into any shell to send a push"
            onPress={copyCurl}
          />
          <DetailRow
            icon="square.on.square"
            tint={colors.accent}
            title="Copy full token"
            subtitle="Only on the device the app was created on"
            onPress={copySavedToken}
          />
          <DetailRow
            icon="arrow.triangle.2.circlepath"
            tint={colors.warning}
            title={rotating ? 'Regenerating…' : 'Regenerate token'}
            subtitle="Invalidates the old token. The new one is shown once."
            onPress={rotating ? undefined : handleRotate}
            destructive
          />
        </DetailSection>
      </View>

      <View style={{ marginTop: spacing.sm }}>
        <DetailSection title="Webhook integrations">
          {WEBHOOK_PROVIDER_ORDER.map((providerId) => {
            const meta = WEBHOOK_PROVIDERS[providerId];
            const secret = configsByProvider.get(providerId);
            const isSet = !!secret;
            const saving = savingFor === providerId;
            const subtitle = !meta.signs
              ? `Bearer-only · POST ${meta.hookPath}`
              : isSet
                ? `Set · ${secret!.length} chars · verifies ${meta.signatureHeader}`
                : `Tap to set · verifies ${meta.signatureHeader} on ${meta.hookPath}`;
            return (
              <DetailRow
                key={providerId}
                icon={
                  saving
                    ? 'arrow.triangle.2.circlepath'
                    : !meta.signs
                      ? 'info.circle'
                      : isSet
                        ? 'lock.shield.fill'
                        : 'lock.open.fill'
                }
                tint={!meta.signs ? colors.secondaryLabel : isSet ? colors.success : colors.accent}
                title={meta.label}
                subtitle={saving ? 'Saving…' : subtitle}
                onPress={meta.signs && !saving ? () => tapProvider(providerId) : undefined}
                chevron={meta.signs && !saving}
                badge={isSet ? 'ON' : undefined}
              />
            );
          })}
        </DetailSection>
      </View>
    </View>
  );
}

function apiRowSubtitle(configs: Array<{ provider: string; secret: string }> | undefined): string {
  const count = configs?.length ?? 0;
  if (count === 0) return 'Curl example, copy token, regenerate';
  if (count === 1) {
    const provider = configs![0].provider;
    const meta = isWebhookProviderId(provider) ? WEBHOOK_PROVIDERS[provider] : null;
    return meta
      ? `${meta.label} signing on · curl, regenerate`
      : 'Webhook signing on · curl, regenerate';
  }
  return `${count} webhook signers · curl, regenerate`;
}

// ---------------------------------------------------------------------------
// Sharing
// ---------------------------------------------------------------------------

function SharingBody({ sourceAppId }: { sourceAppId: Id<'sourceApps'> }) {
  const { colors } = useTheme();

  const app = useQuery(api.sourceApps.getById, { id: sourceAppId });
  const data = useQuery(api.sharing.listMembers, { sourceAppId });

  const inviteByEmail = useMutation(api.sharing.inviteByEmail);
  const cancelInvite = useMutation(api.sharing.cancelInvite);
  const removeMember = useMutation(api.sharing.removeMember);
  const setMemberRole = useMutation(api.sharing.setMemberRole);
  const setInviteRole = useMutation(api.sharing.setInviteRole);

  if (app === undefined || data === undefined) {
    return (
      <View style={{ paddingTop: spacing.xxl, alignItems: 'center' }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!app) {
    return (
      <EmptyMessage
        icon="exclamationmark.triangle"
        title="Source app not found"
        message="It may have been revoked or you no longer have access."
      />
    );
  }

  const isOwner = data.myRole === 'owner';
  const limit = data.sharedUsersLimit;
  const used = data.sharedUsersUsed;
  const atLimit = limit !== null && used >= limit;

  async function handleInvite() {
    const email = await promptText({
      title: `Invite to ${app!.name}`,
      message: "They'll receive pushes from this app on their devices and see the feed.",
      placeholder: 'person@example.com',
      keyboardType: 'email-address',
      contentType: 'emailAddress',
      confirmLabel: 'Next'
    });
    if (!email) return;
    haptic.light();
    showActionSheet({
      title: `Invite ${email} as…`,
      message: 'Editors can adjust delivery settings. Viewers only receive pushes.',
      options: [
        { label: 'Editor', onPress: () => sendInvite(email, 'editor') },
        { label: 'Viewer', onPress: () => sendInvite(email, 'viewer') }
      ]
    });
  }

  async function sendInvite(email: string, role: 'editor' | 'viewer') {
    try {
      const result = await inviteByEmail({ sourceAppId, email, role });
      haptic.success();
      if ('alreadyMember' in result && result.alreadyMember) {
        Alert.alert('Already a member', `${email} already has access to ${app!.name}.`);
      } else if ('refreshed' in result && result.refreshed) {
        Alert.alert('Invite refreshed', `Updated the existing invite for ${email}.`);
      }
    } catch (err: any) {
      haptic.error();
      Alert.alert(
        "Couldn't send invite",
        err?.data?.message ?? err?.message ?? 'Please try again.'
      );
    }
  }

  function memberMenu(member: Member) {
    if (!isOwner || member.isMe) return;
    haptic.light();
    showActionSheet({
      title: member.email ?? 'Member',
      options: [
        {
          label: member.role === 'editor' ? 'Demote to viewer' : 'Promote to editor',
          onPress: async () => {
            haptic.success();
            await setMemberRole({
              sourceAppId,
              memberId: member._id,
              role: member.role === 'editor' ? 'viewer' : 'editor'
            });
          }
        },
        {
          label: 'Remove from app',
          destructive: true,
          onPress: () => {
            Alert.alert(
              'Remove member?',
              `${member.email ?? 'This user'} will stop receiving pushes from ${app!.name}.`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Remove',
                  style: 'destructive',
                  onPress: async () => {
                    haptic.error();
                    await removeMember({
                      sourceAppId,
                      memberId: member._id
                    });
                  }
                }
              ]
            );
          }
        }
      ]
    });
  }

  function inviteMenu(invite: Invite) {
    haptic.light();
    const otherRole: 'editor' | 'viewer' = invite.role === 'editor' ? 'viewer' : 'editor';
    showActionSheet({
      title: invite.email,
      message: `Pending · ${labelForRole(invite.role)}`,
      options: [
        {
          label: `Change role to ${labelForRole(otherRole)}`,
          onPress: async () => {
            try {
              await setInviteRole({ inviteId: invite._id, role: otherRole });
              haptic.success();
            } catch (err: any) {
              haptic.error();
              Alert.alert(
                "Couldn't change role",
                err?.data?.message ?? err?.message ?? 'Please try again.'
              );
            }
          }
        },
        {
          label: 'Resend invite',
          onPress: async () => {
            try {
              await inviteByEmail({
                sourceAppId,
                email: invite.email,
                role: invite.role
              });
              haptic.success();
            } catch (err: any) {
              haptic.error();
              Alert.alert(
                "Couldn't resend",
                err?.data?.message ?? err?.message ?? 'Please try again.'
              );
            }
          }
        },
        {
          label: 'Cancel invite',
          destructive: true,
          onPress: async () => {
            haptic.warning();
            await cancelInvite({ inviteId: invite._id });
          }
        }
      ]
    });
  }

  return (
    <>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          paddingVertical: spacing.sm
        }}
      >
        <Avatar url={app.logoUrl ?? null} name={app.name} size={48} />
        <View style={{ flex: 1 }}>
          <Text style={{ ...type.title3, color: colors.label }} numberOfLines={1}>
            {app.name}
          </Text>
          <Text
            style={{
              ...type.subhead,
              color: colors.secondaryLabel,
              marginTop: 2
            }}
            numberOfLines={1}
          >
            {memberSummary(data)}
          </Text>
        </View>
      </View>

      <UsageCard tier={data.ownerTier} used={used} limit={limit} atLimit={atLimit} />

      {isOwner && (
        <Pressable
          accessibilityRole="button"
          onPress={atLimit ? undefined : handleInvite}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            padding: spacing.md,
            borderRadius: radius.lg,
            borderCurve: 'continuous',
            backgroundColor: atLimit ? colors.cell : pressed ? colors.cellHighlight : colors.cell,
            opacity: pressed ? 0.85 : 1
          })}
        >
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: radius.xl,
              backgroundColor: atLimit ? colors.warning : colors.accent,
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <SymbolView
              name={atLimit ? 'sparkles' : 'person.crop.circle.badge.plus'}
              size={20}
              tintColor={colors.accentContrast}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                ...type.body,
                color: colors.label,
                fontWeight: '600'
              }}
            >
              {atLimit ? 'Upgrade to invite more' : 'Invite by email'}
            </Text>
            <Text
              style={{
                ...type.footnote,
                color: colors.secondaryLabel,
                marginTop: 1
              }}
            >
              {atLimit
                ? 'Free plan allows 1 shared user per app'
                : "They'll receive pushes from this app on their devices"}
            </Text>
          </View>
          <SymbolView name="chevron.right" size={14} tintColor={colors.tertiaryLabel} />
        </Pressable>
      )}

      <Section
        title="Members"
        count={data.members.length}
        emptyIcon="person.2"
        emptyText={
          isOwner ? "You're the only member. Invite someone above." : 'Just you here for now.'
        }
      >
        {data.members.map((m) => (
          <Animated.View key={m._id} entering={FadeIn} exiting={FadeOut} layout={LinearTransition}>
            <MemberRow
              member={m}
              onPress={isOwner && !m.isMe ? () => memberMenu(m) : undefined}
              showMenuHint={isOwner && !m.isMe}
            />
          </Animated.View>
        ))}
      </Section>

      <Section
        title="Pending invites"
        count={data.invites.length}
        emptyIcon="envelope"
        emptyText={isOwner ? 'No invites waiting for a response.' : 'No outstanding invitations.'}
      >
        {data.invites.map((i) => (
          <Animated.View key={i._id} entering={FadeIn} exiting={FadeOut} layout={LinearTransition}>
            <InviteRow
              invite={i}
              onPress={isOwner ? () => inviteMenu(i) : undefined}
              showMenuHint={isOwner}
            />
          </Animated.View>
        ))}
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Shared row / section primitives
// ---------------------------------------------------------------------------

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  const rows = React.Children.toArray(children).filter(React.isValidElement);
  if (rows.length === 0) return null;
  return (
    <View style={{ gap: spacing.xs }}>
      <Text
        style={{
          ...type.footnote,
          color: colors.secondaryLabel,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          paddingHorizontal: spacing.sm
        }}
      >
        {title}
      </Text>
      <View
        style={{
          backgroundColor: colors.cell,
          borderRadius: radius.lg,
          borderCurve: 'continuous',
          overflow: 'hidden'
        }}
      >
        {rows.map((child, i) => (
          <View key={i}>
            {child}
            {i < rows.length - 1 && (
              <View
                style={{
                  height: 0.5,
                  backgroundColor: colors.separator,
                  marginLeft: 56
                }}
              />
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

function DetailRow({
  icon,
  tint,
  title,
  titleSelectable,
  subtitle,
  trailing,
  onPress,
  chevron,
  destructive,
  badge
}: {
  icon: SFSymbol;
  tint: string;
  title: string;
  titleSelectable?: boolean;
  subtitle?: string;
  trailing?: React.ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  destructive?: boolean;
  badge?: string;
}) {
  const { colors, tintBg } = useTheme();
  const titleColor = destructive ? colors.destructive : colors.label;

  const content = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.md,
        gap: spacing.md,
        minHeight: 56
      }}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: radius.lg,
          backgroundColor: tintBg(tint),
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <SymbolView name={icon} size={18} tintColor={tint} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <Text
            style={{ ...type.body, color: titleColor }}
            numberOfLines={1}
            selectable={titleSelectable}
          >
            {title}
          </Text>
          {badge && (
            <View
              style={{
                paddingHorizontal: 6,
                paddingVertical: 1,
                borderRadius: radius.xs,
                backgroundColor: colors.accent
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: '700',
                  color: colors.accentContrast,
                  letterSpacing: 0.5
                }}
              >
                {badge}
              </Text>
            </View>
          )}
        </View>
        {!!subtitle && (
          <Text
            style={{
              ...type.footnote,
              color: colors.secondaryLabel,
              marginTop: 1
            }}
            numberOfLines={2}
          >
            {subtitle}
          </Text>
        )}
      </View>
      {trailing}
      {chevron && !trailing && (
        <SymbolView name="chevron.right" size={14} tintColor={colors.tertiaryLabel} />
      )}
    </View>
  );

  if (!onPress) return content;
  return (
    <Pressable
      onPress={() => {
        haptic.selection();
        onPress();
      }}
      style={({ pressed }) => ({
        backgroundColor: pressed ? colors.cellHighlight : 'transparent'
      })}
    >
      {content}
    </Pressable>
  );
}

function SharingCountBadge({
  memberCount,
  pendingCount
}: {
  memberCount: number;
  pendingCount: number;
}) {
  const { colors } = useTheme();
  const total = memberCount + pendingCount;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Text
        style={{
          ...type.subhead,
          color: colors.secondaryLabel,
          fontVariant: ['tabular-nums']
        }}
      >
        {total}
      </Text>
      {pendingCount > 0 && (
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: radius.xs,
            backgroundColor: colors.warning
          }}
        />
      )}
    </View>
  );
}

function RoleBadge({ role, muted }: { role: Role; muted?: boolean }) {
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
        backgroundColor: muted ? colors.fill : tintBg(tint)
      }}
    >
      <Text
        style={{
          ...type.caption2,
          color: muted ? colors.secondaryLabel : tint,
          fontWeight: '600'
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function UsageCard({
  tier,
  used,
  limit,
  atLimit
}: {
  tier: SharingData['ownerTier'];
  used: number;
  limit: number | null;
  atLimit: boolean;
}) {
  const { colors } = useTheme();
  const isFree = tier === 'free';
  const limitDisplay = limit ?? '∞';
  const tint = atLimit ? colors.warning : colors.accent;

  return (
    <View
      style={{
        backgroundColor: colors.cell,
        borderRadius: radius.lg,
        borderCurve: 'continuous',
        padding: spacing.lg,
        gap: spacing.sm
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <SymbolView name="person.2.fill" size={16} tintColor={tint} />
        <Text
          style={{
            ...type.footnote,
            color: tint,
            fontWeight: '600',
            textTransform: 'uppercase',
            letterSpacing: 0.5
          }}
        >
          {isFree ? 'Free plan' : 'Pro plan'}
        </Text>
        <View style={{ flex: 1 }} />
        <Text
          style={{
            ...type.footnote,
            color: colors.secondaryLabel,
            fontVariant: ['tabular-nums']
          }}
        >
          {used} of {limitDisplay} used
        </Text>
      </View>
      {limit !== null && (
        <View
          style={{
            height: 4,
            borderRadius: 2,
            backgroundColor: colors.fill,
            overflow: 'hidden'
          }}
        >
          <View
            style={{
              width: `${Math.min(1, used / Math.max(limit, 1)) * 100}%`,
              height: '100%',
              backgroundColor: tint
            }}
          />
        </View>
      )}
      {atLimit && isFree && (
        <Text style={{ ...type.footnote, color: colors.secondaryLabel }}>
          Upgrade to Pro for unlimited shared users per app.
        </Text>
      )}
    </View>
  );
}

function Section({
  title,
  count,
  emptyIcon,
  emptyText,
  children
}: {
  title: string;
  count: number;
  emptyIcon: SFSymbol;
  emptyText: string;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  const rows = React.Children.toArray(children).filter(React.isValidElement);
  return (
    <View style={{ gap: spacing.xs }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'baseline',
          gap: spacing.xs,
          paddingHorizontal: spacing.sm
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
          {title}
        </Text>
        {count > 0 && (
          <Text
            style={{
              ...type.footnote,
              color: colors.tertiaryLabel,
              fontVariant: ['tabular-nums']
            }}
          >
            ({count})
          </Text>
        )}
      </View>
      {rows.length === 0 ? (
        <View
          style={{
            backgroundColor: colors.cell,
            borderRadius: radius.lg,
            borderCurve: 'continuous',
            paddingVertical: spacing.xl,
            paddingHorizontal: spacing.lg,
            alignItems: 'center',
            gap: spacing.sm
          }}
        >
          <SymbolView name={emptyIcon} size={28} tintColor={colors.tertiaryLabel} />
          <Text
            style={{
              ...type.footnote,
              color: colors.secondaryLabel,
              textAlign: 'center'
            }}
          >
            {emptyText}
          </Text>
        </View>
      ) : (
        <View
          style={{
            backgroundColor: colors.cell,
            borderRadius: radius.lg,
            borderCurve: 'continuous',
            overflow: 'hidden'
          }}
        >
          {rows.map((child, i) => (
            <View key={i}>
              {child}
              {i < rows.length - 1 && (
                <View
                  style={{
                    height: 0.5,
                    backgroundColor: colors.separator,
                    marginLeft: 64
                  }}
                />
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function MemberRow({
  member,
  onPress,
  showMenuHint
}: {
  member: Member;
  onPress?: () => void;
  showMenuHint?: boolean;
}) {
  const { colors } = useTheme();
  const display = member.email ?? 'Member';
  const subtitle = member.isMe ? `${labelForRole(member.role)} · You` : labelForRole(member.role);

  const content = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.lg,
        minHeight: 60
      }}
    >
      <Avatar url={null} name={display} size={36} />
      <View style={{ flex: 1 }}>
        <Text selectable style={{ ...type.body, color: colors.label }} numberOfLines={1}>
          {display}
        </Text>
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
      </View>
      <RoleBadge role={member.role} />
      {showMenuHint && <SymbolView name="ellipsis" size={16} tintColor={colors.tertiaryLabel} />}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: pressed ? 'rgba(127,127,127,0.08)' : 'transparent'
      })}
    >
      {content}
    </Pressable>
  );
}

function InviteRow({
  invite,
  onPress,
  showMenuHint
}: {
  invite: Invite;
  onPress?: () => void;
  showMenuHint?: boolean;
}) {
  const { colors, tintBg } = useTheme();
  const expiresIn = formatExpiresIn(invite.expiresAt);
  const sent = formatRelativeShort(invite.createdAt);

  const content = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.lg,
        minHeight: 60
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: tintBg(colors.warning),
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <SymbolView name="envelope.fill" size={16} tintColor={colors.warning} />
      </View>
      <View style={{ flex: 1 }}>
        <Text selectable style={{ ...type.body, color: colors.label }} numberOfLines={1}>
          {invite.email}
        </Text>
        <Text
          style={{
            ...type.footnote,
            color: colors.secondaryLabel,
            marginTop: 1
          }}
          numberOfLines={1}
        >
          Invited as {labelForRole(invite.role)} · sent {sent} · {expiresIn}
        </Text>
      </View>
      <RoleBadge role={invite.role} muted />
      {showMenuHint && <SymbolView name="ellipsis" size={16} tintColor={colors.tertiaryLabel} />}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: pressed ? 'rgba(127,127,127,0.08)' : 'transparent'
      })}
    >
      {content}
    </Pressable>
  );
}

function EmptyMessage({
  icon,
  title,
  message
}: {
  icon: SFSymbol;
  title: string;
  message: string;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        alignItems: 'center',
        paddingVertical: spacing.xxl,
        paddingHorizontal: spacing.lg,
        gap: spacing.md
      }}
    >
      <SymbolView name={icon} size={48} tintColor={colors.tertiaryLabel} />
      <Text style={{ ...type.title3, color: colors.label }}>{title}</Text>
      <Text
        style={{
          ...type.subhead,
          color: colors.secondaryLabel,
          textAlign: 'center'
        }}
      >
        {message}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function labelForRole(role: Role): string {
  return role === 'owner' ? 'Owner' : role === 'editor' ? 'Editor' : 'Viewer';
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

function curlExample(appName: string, token = '<your_token>'): string {
  // backendConfig() throws if the app booted without EXPO_PUBLIC_CONVEX_SITE_URL,
  // and respects the user's self-hosted override saved via Server Config — so
  // the curl always points at a real, reachable endpoint.
  const { siteUrl } = backendConfig();
  return `curl -X POST ${siteUrl}/notify \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{"title":"Hello from ${appName}","body":"It works!"}'`;
}

function sharingSubtitle(data: SharingData | undefined): string {
  if (!data) return 'Loading…';
  const members = data.members.length;
  const pending = data.invites.length;
  const limit = data.sharedUsersLimit;
  if (members === 0 && pending === 0) {
    return data.myRole === 'owner'
      ? limit !== null
        ? `Invite up to ${limit} other ${limit === 1 ? 'person' : 'people'}`
        : 'Invite others to receive these pushes'
      : 'Just you';
  }
  const parts: string[] = [];
  parts.push(members === 1 ? '1 member' : `${members} members`);
  if (pending > 0) parts.push(`${pending} pending`);
  return parts.join(' · ');
}

function memberSummary(data: SharingData): string {
  const total = data.members.length;
  const pending = data.invites.length;
  const memberLabel = total === 1 ? '1 member' : `${total} members`;
  if (pending === 0) return memberLabel;
  return `${memberLabel} · ${pending} pending`;
}

function formatExpiresIn(expiresAt: number): string {
  const ms = expiresAt - Date.now();
  if (ms <= 0) return 'expired';
  const days = Math.round(ms / (24 * 60 * 60 * 1000));
  if (days >= 1) return `expires in ${days}d`;
  const hours = Math.round(ms / (60 * 60 * 1000));
  if (hours >= 1) return `expires in ${hours}h`;
  return 'expires soon';
}

function formatRelativeShort(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  const m = Math.round(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}
