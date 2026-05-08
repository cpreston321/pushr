import { forwardRef, useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";
import { SymbolView, type SFSymbol } from "expo-symbols";
import {
  authClient,
  backendConfig,
  resetBackend,
  saveBackend,
} from "@/lib/backend";
import { Input } from "@/components/Input";
import { Button } from "@/components/Button";
import { Drawer, useDrawer, type DrawerRef } from "@/components/Drawer";
import { DrawerHeader } from "@/components/DrawerHeader";
import { useTheme, spacing, type, radius } from "@/lib/theme";
import { haptic } from "@/lib/haptics";

type TestState =
  | { kind: "idle" }
  | { kind: "testing" }
  | { kind: "ok" }
  | { kind: "fail"; reason: string };

export const ServerConfigDrawer = forwardRef<DrawerRef>(
  function ServerConfigDrawer(_props, ref) {
    return (
      <Drawer ref={ref} header={<HeaderShell />}>
        <ScrollView
          contentContainerStyle={{
            padding: spacing.lg,
            paddingTop: spacing.md,
            gap: spacing.lg,
            paddingBottom: 60,
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          <ServerConfigBody />
        </ScrollView>
      </Drawer>
    );
  },
);

function HeaderShell() {
  const { dismiss } = useDrawer();
  return <DrawerHeader title="Server" onClose={() => dismiss()} />;
}

function ServerConfigBody() {
  const { colors } = useTheme();
  const { dismiss } = useDrawer();

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

  function onChangeUrls(nextConvex: string, nextSite: string) {
    setConvexUrl(nextConvex);
    setSiteUrl(nextSite);
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
      const healthRes = await fetch(`${su.replace(/\/$/, "")}/healthz`);
      if (!healthRes.ok) throw new Error(`Site URL returned ${healthRes.status}`);
      const body = (await healthRes.json().catch(() => null)) as {
        ok?: boolean;
      } | null;
      if (!body?.ok) {
        throw new Error(
          "Site URL responded, but /healthz didn't return { ok: true } — is this really a pushr deployment?",
        );
      }
      const pingRes = await fetch(cu.replace(/\/$/, ""));
      if (pingRes.status >= 500) {
        throw new Error(`Convex URL returned ${pingRes.status}`);
      }
      haptic.success();
      setTest({ kind: "ok" });
    } catch (err: any) {
      haptic.error();
      setTest({ kind: "fail", reason: err?.message ?? "Unknown error" });
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
      await dismiss();
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
      await dismiss();
      Alert.alert(
        "Switched to pushr cloud",
        "Quit and reopen the app to apply the change.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
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

        <TestPanel state={test} />
      </Section>
    </>
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
