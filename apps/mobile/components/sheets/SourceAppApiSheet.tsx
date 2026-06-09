import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { useMutation, useQuery } from "convex/react";
import { SymbolView } from "expo-symbols";
import { api } from "@pushr/backend/_generated/api";
import type { Id } from "@pushr/backend/_generated/dataModel";
import { SheetHeader } from "@/components/SheetHeader";
import { useSheetNav } from "@/components/sheets/SheetNavigator";
import { SourceAppForwarderAddFrame } from "@/components/sheets/ForwarderAddSheet";
import {
  curlExample,
  DetailRow,
  DetailSection,
  isWebhookProviderId,
  WEBHOOK_PROVIDER_ORDER,
  WEBHOOK_PROVIDERS,
  type AppRow,
  type WebhookProviderId,
} from "@/components/source-app/shared";
import { useIsPro } from "@/components/Pro";
import { DiscordLogo, SlackLogo } from "@/components/source-app/BrandLogo";
import { useTheme, spacing, radius, type } from "@/lib/theme";
import { haptic } from "@/lib/haptics";
import { showActionSheet } from "@/lib/actionSheet";
import { promptText } from "@/lib/prompt";
import { recallToken, rememberToken } from "@/lib/tokenStore";

type PriorityFilter = "all" | "normal_high" | "high_only";
const PRIORITY_LABELS: Record<PriorityFilter, string> = {
  all: "All pushes",
  normal_high: "Normal & high priority",
  high_only: "High priority only",
};

export function SourceAppApiFrame({ appId }: { appId: Id<"sourceApps"> }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const nav = useSheetNav();
  return (
    <View style={{ flex: 1, backgroundColor: colors.sheet }}>
      <SheetHeader title="API & token" onClose={nav.pop} variant="back" />
      <ScrollView
        contentContainerStyle={{
          paddingTop: spacing.md,
          paddingHorizontal: spacing.lg,
          paddingBottom: insets.bottom + spacing.xxl * 2,
          gap: spacing.lg,
        }}
      >
        <Body appId={appId} onDismissSheet={nav.dismissSheet} />
      </ScrollView>
    </View>
  );
}

function Body({
  appId,
  onDismissSheet,
}: {
  appId: Id<"sourceApps">;
  onDismissSheet: () => void;
}) {
  const { colors, tintBg } = useTheme();
  const apps = useQuery(api.sourceApps.listMine) as AppRow[] | undefined;
  const app = apps?.find((a) => a._id === appId);
  const rotateToken = useMutation(api.sourceApps.rotateToken);
  const setProviderWebhookSecret = useMutation(
    api.sourceApps.setProviderWebhookSecret,
  );
  const [rotating, setRotating] = useState(false);
  const [savingFor, setSavingFor] = useState<WebhookProviderId | null>(null);

  if (apps === undefined) {
    return (
      <View style={{ paddingTop: spacing.xxl, alignItems: "center" }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!app || app.role !== "owner") {
    return (
      <View style={{ paddingTop: spacing.xxl, alignItems: "center" }}>
        <Text style={{ ...type.body, color: colors.secondaryLabel }}>
          Owner access required.
        </Text>
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
      title: existing
        ? `Update ${meta.label} signing secret`
        : `Set ${meta.label} signing secret`,
      message: meta.configHint
        ? `Paste the secret from ${meta.configHint}. We'll verify ${meta.signatureHeader} on every delivery to ${meta.hookPath}.`
        : `We'll verify ${meta.signatureHeader} on every delivery to ${meta.hookPath}.`,
      placeholder: "Paste signing secret",
      contentType: "password",
      confirmLabel: "Save",
    });
    if (!value) return;
    setSavingFor(providerId);
    try {
      await setProviderWebhookSecret({
        id: app._id,
        provider: providerId,
        secret: value,
      });
      haptic.success();
    } catch (err: any) {
      haptic.error();
      Alert.alert(
        `Couldn't save ${meta.label} secret`,
        err?.data?.message ?? err?.message ?? "Please try again.",
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
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            setSavingFor(providerId);
            try {
              await setProviderWebhookSecret({
                id: app._id,
                provider: providerId,
                secret: null,
              });
              haptic.success();
            } catch (err: any) {
              haptic.error();
              Alert.alert(
                `Couldn't clear ${meta.label} secret`,
                err?.data?.message ?? err?.message ?? "Please try again.",
              );
            } finally {
              setSavingFor(null);
            }
          },
        },
      ],
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
          {
            label: "Update signing secret",
            onPress: () => setSecretFor(providerId),
          },
          {
            label: "Clear signing secret",
            destructive: true,
            onPress: () => clearSecretFor(providerId),
          },
        ],
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
        "Token not on this device",
        "We only cache the token on the device it was created on. To use it elsewhere, regenerate the token.",
      );
      return;
    }
    await Clipboard.setStringAsync(token);
    haptic.success();
  }

  async function handleRotate() {
    if (!app || rotating) return;
    Alert.alert(
      "Regenerate token?",
      `Any caller still using the current token for ${app.name} will stop working immediately. The notification feed history is preserved.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Regenerate",
          style: "destructive",
          onPress: async () => {
            setRotating(true);
            try {
              const { token } = await rotateToken({ id: app._id });
              haptic.success();
              await rememberToken(app._id, token);
              // Close this sheet, then push the one-time token reveal.
              // token-reveal is a fullscreen formSheet, so the detail sheet
              // (if still open underneath) is hidden behind it.
              onDismissSheet();
              setTimeout(
                () =>
                  router.push({
                    pathname: "/token-reveal" as never,
                    params: { id: app._id, name: app.name, token },
                  }),
                200,
              );
            } catch (err: any) {
              haptic.error();
              Alert.alert(
                "Couldn't regenerate token",
                err?.data?.message ?? err?.message ?? "Please try again.",
              );
            } finally {
              setRotating(false);
            }
          },
        },
      ],
    );
  }

  return (
    <View style={{ gap: spacing.xs }}>
      <Text
        style={{
          ...type.footnote,
          color: colors.secondaryLabel,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          paddingHorizontal: spacing.sm,
        }}
      >
        Bearer token
      </Text>

      <Pressable
        onPress={copyTokenPrefix}
        style={({ pressed }) => ({
          backgroundColor: colors.cell,
          borderRadius: radius.lg,
          borderCurve: "continuous",
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.md,
          opacity: pressed ? 0.7 : 1,
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
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <SymbolView name="key.fill" size={18} tintColor={colors.accent} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            style={{
              ...type.footnote,
              color: colors.secondaryLabel,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            Prefix
          </Text>
          <Text
            selectable
            numberOfLines={1}
            style={{ ...type.body, color: colors.label, fontFamily: "Menlo" }}
          >
            {app.tokenPrefix}
            <Text style={{ color: colors.secondaryLabel }}>…</Text>
          </Text>
        </View>
        <SymbolView
          name="doc.on.doc"
          size={16}
          tintColor={colors.secondaryLabel}
        />
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
            title={rotating ? "Regenerating…" : "Regenerate token"}
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
                    ? "arrow.triangle.2.circlepath"
                    : !meta.signs
                      ? "info.circle"
                      : isSet
                        ? "lock.shield.fill"
                        : "lock.open.fill"
                }
                tint={
                  !meta.signs
                    ? colors.secondaryLabel
                    : isSet
                      ? colors.success
                      : colors.accent
                }
                title={meta.label}
                subtitle={saving ? "Saving…" : subtitle}
                onPress={
                  meta.signs && !saving ? () => tapProvider(providerId) : undefined
                }
                chevron={meta.signs && !saving}
                badge={isSet ? "ON" : undefined}
              />
            );
          })}
        </DetailSection>
      </View>

      <View style={{ marginTop: spacing.sm }}>
        <ForwardersSection sourceAppId={app._id} />
      </View>
    </View>
  );
}

function ForwardersSection({ sourceAppId }: { sourceAppId: Id<"sourceApps"> }) {
  const { colors } = useTheme();
  const isPro = useIsPro();
  const nav = useSheetNav();
  const forwarders = useQuery(
    api.forwarders.listForApp,
    isPro ? { sourceAppId } : "skip",
  );
  const updateForwarder = useMutation(api.forwarders.update);
  const removeForwarder = useMutation(api.forwarders.remove);
  const testForwarder = useMutation(api.forwarders.test);

  if (!isPro) {
    return (
      <DetailSection title="Outbound forwarding">
        <DetailRow
          icon="lock.fill"
          tint={colors.accent}
          title="Forward to Slack & Discord"
          subtitle="Mirror pushes into channels. Available on Pro."
          onPress={() => router.push("/upgrade")}
          chevron
          badge="PRO"
        />
      </DetailSection>
    );
  }

  function startAdd() {
    haptic.light();
    nav.push({
      id: `forwarder-add-${sourceAppId}`,
      node: <SourceAppForwarderAddFrame sourceAppId={sourceAppId} />,
    });
  }

  function tapForwarder(f: NonNullable<typeof forwarders>[number]) {
    haptic.light();
    showActionSheet({
      title:
        f.label || (f.kind === "slack" ? "Slack forwarder" : "Discord forwarder"),
      message: f.lastError ? `Last error: ${f.lastError}` : undefined,
      options: [
        {
          label: f.enabled ? "Disable" : "Enable",
          onPress: async () => {
            try {
              await updateForwarder({ id: f._id, enabled: !f.enabled });
              haptic.success();
            } catch (err: any) {
              haptic.error();
              Alert.alert(
                "Couldn't update",
                err?.data?.message ?? err?.message ?? "Please try again.",
              );
            }
          },
        },
        {
          label: "Send test message",
          onPress: async () => {
            try {
              await testForwarder({ id: f._id });
              haptic.success();
              Alert.alert(
                "Test sent",
                "pushr posted a test message — check the destination channel.",
              );
            } catch (err: any) {
              haptic.error();
              Alert.alert(
                "Couldn't send test",
                err?.data?.message ?? err?.message ?? "Please try again.",
              );
            }
          },
        },
        {
          label: "Change priority filter",
          onPress: () => {
            showActionSheet({
              title: "Which pushes should forward?",
              options: (["all", "normal_high", "high_only"] as PriorityFilter[]).map(
                (p) => ({
                  label: `${p === f.priorityFilter ? "✓ " : ""}${PRIORITY_LABELS[p]}`,
                  onPress: async () => {
                    try {
                      await updateForwarder({
                        id: f._id,
                        priorityFilter: p,
                      });
                      haptic.success();
                    } catch (err: any) {
                      haptic.error();
                    }
                  },
                }),
              ),
            });
          },
        },
        {
          label: "Rename",
          onPress: async () => {
            const next = await promptText({
              title: "Rename forwarder",
              defaultValue: f.label ?? "",
              placeholder: "e.g. #alerts",
              allowEmpty: true,
            } as never);
            if (next === null) return;
            try {
              await updateForwarder({ id: f._id, label: next });
              haptic.success();
            } catch (err: any) {
              haptic.error();
            }
          },
        },
        {
          label: "Remove forwarder",
          destructive: true,
          onPress: () => {
            Alert.alert(
              "Remove forwarder?",
              `Pushes from this app will stop being forwarded to ${
                f.kind === "slack" ? "Slack" : "Discord"
              }.`,
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Remove",
                  style: "destructive",
                  onPress: async () => {
                    haptic.warning();
                    await removeForwarder({ id: f._id });
                  },
                },
              ],
            );
          },
        },
      ],
    });
  }

  const rows: React.ReactNode[] = [];
  for (const f of forwarders ?? []) {
    const kindLabel = f.kind === "slack" ? "Slack" : "Discord";
    const filterLabel = PRIORITY_LABELS[f.priorityFilter as PriorityFilter];
    const subtitleParts: string[] = f.enabled ? [filterLabel] : ["Disabled"];
    if (f.lastError) subtitleParts.push(`⚠ ${f.lastError}`);

    const brand =
      f.kind === "slack" ? <SlackLogo size={32} /> : <DiscordLogo size={32} />;
    const leading = (
      <View style={{ opacity: f.enabled ? 1 : 0.45 }}>{brand}</View>
    );

    rows.push(
      <DetailRow
        key={f._id}
        leading={leading}
        tint={
          !f.enabled
            ? colors.secondaryLabel
            : f.lastError
              ? colors.warning
              : colors.accent
        }
        title={f.label?.trim() || `${kindLabel} channel`}
        subtitle={subtitleParts.join(" · ")}
        onPress={() => tapForwarder(f)}
        chevron
        trailing={
          <ForwarderStatusDot
            enabled={f.enabled}
            errored={!!f.lastError}
            colors={colors}
          />
        }
      />,
    );
  }
  rows.push(
    <DetailRow
      key="__add__"
      icon="plus"
      tint={colors.accent}
      title="Add forwarder"
      subtitle="Mirror pushes into a Slack or Discord channel"
      onPress={startAdd}
      chevron
    />,
  );

  return <DetailSection title="Outbound forwarding">{rows}</DetailSection>;
}

function ForwarderStatusDot({
  enabled,
  errored,
  colors,
}: {
  enabled: boolean;
  errored: boolean;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  const color = !enabled
    ? colors.tertiaryLabel
    : errored
      ? colors.destructive
      : colors.success;
  return (
    <View
      style={{
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: color,
      }}
    />
  );
}
