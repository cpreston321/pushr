import { useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { SymbolView, type SFSymbol } from "expo-symbols";
import {
  authClient,
  backendConfig,
  defaults,
  resetBackend,
  saveBackend,
} from "@/lib/backend";
import { Input } from "@/components/Input";
import { Button } from "@/components/Button";
import { useTheme, spacing, type, radius } from "@/lib/theme";
import { haptic } from "@/lib/haptics";

type TestState =
  | { kind: "idle" }
  | { kind: "testing" }
  | { kind: "ok" }
  | { kind: "fail"; reason: string };

/**
 * Picker for the Convex deployment that powers this app. Lives as a route so
 * it presents as a native iOS sheet that slides up from the bottom.
 */
export default function ServerConfig() {
  const { colors } = useTheme();
  const current = (() => {
    try {
      return backendConfig();
    } catch {
      return null;
    }
  })();
  const [convexUrl, setConvexUrl] = useState(
    current?.custom ? current.convexUrl : "",
  );
  const [siteUrl, setSiteUrl] = useState(
    current?.custom ? current.siteUrl : "",
  );
  const [test, setTest] = useState<TestState>({ kind: "idle" });
  const [busy, setBusy] = useState(false);

  function close() {
    router.back();
  }

  function onChangeUrls(nextConvex: string, nextSite: string) {
    setConvexUrl(nextConvex);
    setSiteUrl(nextSite);
    // any edit invalidates previous test result
    if (test.kind !== "idle") setTest({ kind: "idle" });
  }

  async function runTest() {
    const cu = convexUrl.trim();
    const su = siteUrl.trim();
    if (!/^https?:\/\//.test(cu) || !/^https?:\/\//.test(su)) {
      setTest({
        kind: "fail",
        reason: "Both URLs must start with https:// (or http://).",
      });
      haptic.error();
      return;
    }
    setTest({ kind: "testing" });
    try {
      // Site URL is pushr's HTTP endpoint — must have /healthz from our http.ts.
      const healthRes = await fetch(`${su.replace(/\/$/, "")}/healthz`, {
        method: "GET",
      });
      if (!healthRes.ok) {
        throw new Error(`Site URL returned ${healthRes.status}`);
      }
      const body = (await healthRes.json().catch(() => null)) as {
        ok?: boolean;
      } | null;
      if (!body?.ok) {
        throw new Error(
          "Site URL responded, but /healthz didn't return { ok: true } — is this really a pushr deployment?",
        );
      }
      // Convex URL — just verify TLS + DNS are sane. Convex returns 404 on "/"
      // so we treat anything under 500 as "reachable".
      const pingRes = await fetch(cu.replace(/\/$/, ""), { method: "GET" });
      if (pingRes.status >= 500) {
        throw new Error(`Convex URL returned ${pingRes.status}`);
      }
      haptic.success();
      setTest({ kind: "ok" });
    } catch (err: any) {
      haptic.error();
      setTest({
        kind: "fail",
        reason: err?.message ?? "Unknown error",
      });
    }
  }

  async function saveCustom() {
    if (test.kind !== "ok") return;
    setBusy(true);
    try {
      await saveBackend(convexUrl.trim(), siteUrl.trim());
      await authClient()
        .signOut()
        .catch(() => {});
      haptic.success();
      close();
      Alert.alert(
        "Server updated",
        "Quit and reopen the app to connect to the new backend.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function useDefault() {
    setBusy(true);
    try {
      await resetBackend();
      await authClient()
        .signOut()
        .catch(() => {});
      haptic.success();
      close();
      Alert.alert(
        "Switched to pushr cloud",
        "Quit and reopen the app to apply the change.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.sheet }}
      contentInsetAdjustmentBehavior="never"
      contentContainerStyle={{
        padding: spacing.lg,
        paddingTop: spacing.xl,
        gap: spacing.lg,
        paddingBottom: 60,
      }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
    >
          <View style={{ gap: spacing.xs, marginBottom: spacing.xs }}>
            <Text style={{ ...type.title2, color: colors.label }}>Backend</Text>
            <Text style={{ ...type.subhead, color: colors.secondaryLabel }}>
              Choose which Convex deployment this app talks to.
            </Text>
          </View>

          <Section title="pushr cloud">
            <Text style={{ ...type.footnote, color: colors.secondaryLabel }}>
              The hosted deployment maintained by the project author. Easiest —
              no setup needed.
            </Text>
            <Button
              title={
                current && !current.custom
                  ? "Currently in use"
                  : "Use pushr cloud"
              }
              variant="secondary"
              onPress={useDefault}
              loading={busy && !convexUrl}
              disabled={!!(current && !current.custom)}
            />
          </Section>

          <Section title="Custom Convex Deployment" badge="Coming Soon">
            <Text style={{ ...type.footnote, color: colors.secondaryLabel }}>
              Point at your own Convex deployment. Both URLs come from the
              Convex dashboard — .cloud for the client, .site for auth.
            </Text>
            <Input
              label="Convex URL"
              placeholder="https://example-name-123.convex.cloud"
              value={convexUrl}
              onChangeText={(v) => onChangeUrls(v, siteUrl)}
              autoCapitalize="none"
              keyboardType="url"
              editable={false}
            />
            <Input
              label="Site URL"
              placeholder="https://example-name-123.convex.site"
              value={siteUrl}
              onChangeText={(v) => onChangeUrls(convexUrl, v)}
              autoCapitalize="none"
              keyboardType="url"
              editable={false}
            />

            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Button
                  title="Test connection"
                  variant="secondary"
                  onPress={runTest}
                  disabled
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button title="Save & sign out" onPress={saveCustom} disabled />
              </View>
            </View>
          </Section>
    </ScrollView>
  );
}

function Section({
  title,
  badge,
  children,
}: {
  title: string;
  badge?: string;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.cell,
        borderRadius: radius.lg,
        borderCurve: "continuous",
        padding: spacing.lg,
        gap: spacing.md,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.sm,
        }}
      >
        <Text style={{ ...type.headline, color: colors.label }}>{title}</Text>
        {badge && (
          <View
            style={{
              paddingHorizontal: spacing.sm,
              paddingVertical: 2,
              borderRadius: radius.sm,
              borderCurve: "continuous",
              backgroundColor: colors.fill,
            }}
          >
            <Text
              style={{
                ...type.caption2,
                color: colors.secondaryLabel,
                fontWeight: "600",
                textTransform: "uppercase",
              }}
            >
              {badge}
            </Text>
          </View>
        )}
      </View>
      {children}
    </View>
  );
}

function TestPanel({ state }: { state: TestState }) {
  const { colors, tintBg } = useTheme();
  if (state.kind === "idle") return null;

  const cfg: { icon: SFSymbol; tint: string; label: string; detail?: string } =
    state.kind === "testing"
      ? {
          icon: "arrow.clockwise",
          tint: colors.accent,
          label: "Testing…",
          detail: "Reaching /healthz and pinging the Convex URL.",
        }
      : state.kind === "ok"
        ? {
            icon: "checkmark.circle.fill",
            tint: colors.success,
            label: "Connection OK",
            detail:
              "Both URLs responded. Ready to save — you'll be signed out and asked to restart.",
          }
        : {
            icon: "exclamationmark.triangle.fill",
            tint: colors.destructive,
            label: "Couldn't connect",
            detail: state.reason,
          };

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: spacing.sm,
        padding: spacing.md,
        borderRadius: radius.md,
        borderCurve: "continuous",
        backgroundColor: tintBg(cfg.tint, "18"),
      }}
    >
      <SymbolView name={cfg.icon} size={18} tintColor={cfg.tint} />
      <View style={{ flex: 1 }}>
        <Text style={{ ...type.footnote, color: cfg.tint, fontWeight: "600" }}>
          {cfg.label}
        </Text>
        {cfg.detail && (
          <Text
            style={{
              ...type.caption1,
              color: colors.secondaryLabel,
              marginTop: 2,
            }}
          >
            {cfg.detail}
          </Text>
        )}
      </View>
    </View>
  );
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "custom";
  }
}
