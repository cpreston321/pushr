import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useMutation, useQuery } from 'convex/react';
import { SymbolView } from 'expo-symbols';
import { api } from '@pushr/backend/_generated/api';
import type { Id } from '@pushr/backend/_generated/dataModel';
import { SheetContainer } from '@/components/SheetContainer';
import { SheetHeader } from '@/components/SheetHeader';
import {
  curlExample,
  DetailRow,
  DetailSection,
  isWebhookProviderId,
  WEBHOOK_PROVIDER_ORDER,
  WEBHOOK_PROVIDERS,
  type AppRow,
  type WebhookProviderId
} from '@/components/source-app/shared';
import { useTheme, spacing, radius, type } from '@/lib/theme';
import { haptic } from '@/lib/haptics';
import { showActionSheet } from '@/lib/actionSheet';
import { promptText } from '@/lib/prompt';
import { recallToken, rememberToken } from '@/lib/tokenStore';

/**
 * formSheet — owner-only API & token management. After a token rotation
 * we `dismissAll()` to close both this sheet and the detail sheet, then
 * push `/token-reveal` so the user can copy the freshly-minted bearer.
 */
export default function SourceAppApiScreen() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ id?: string }>();
  const appId = params.id as Id<'sourceApps'> | undefined;

  return (
    <View style={{ flex: 1, backgroundColor: colors.sheet }}>
      <SheetHeader title="API & token" />
      <SheetContainer scrollView contentContainerStyle={{ paddingTop: spacing.md, gap: spacing.lg }}>
        {appId ? <Body appId={appId} /> : null}
      </SheetContainer>
    </View>
  );
}

function Body({ appId }: { appId: Id<'sourceApps'> }) {
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
      await setProviderWebhookSecret({ id: app._id, provider: providerId, secret: value });
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
              await setProviderWebhookSecret({ id: app._id, provider: providerId, secret: null });
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
    if (!meta.signs) return;
    haptic.light();
    if (configsByProvider.has(providerId)) {
      showActionSheet({
        title: `${meta.label} webhook`,
        options: [
          { label: 'Update signing secret', onPress: () => setSecretFor(providerId) },
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
              await rememberToken(app._id, token);
              // Close both this sheet and the detail sheet sitting under it,
              // then push the one-time token reveal.
              router.dismissAll();
              setTimeout(
                () =>
                  router.push({
                    pathname: '/token-reveal' as never,
                    params: { id: app._id, name: app.name, token }
                  }),
                200
              );
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
            style={{ ...type.body, color: colors.label, fontFamily: 'Menlo' }}
          >
            {app.tokenPrefix}
            <Text style={{ color: colors.secondaryLabel }}>…</Text>
          </Text>
        </View>
        <SymbolView name="doc.on.doc" size={16} tintColor={colors.secondaryLabel} />
      </Pressable>

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
