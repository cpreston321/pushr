import { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { authClient, backendConfig, resetBackend, saveBackend } from '@/lib/backend';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { DrawerSurface } from '@/components/Sheet';
import { SheetContainer } from '@/components/SheetContainer';
import { SheetHeader } from '@/components/SheetHeader';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { useTheme, spacing, type } from '@/lib/theme';
import { haptic } from '@/lib/haptics';

/**
 * Custom deployments aren't shipped yet. Rather than render the form as four
 * dead controls — the tallest, busiest block in the sheet, none of it
 * pressable — the section shows the pitch and its "Coming Soon" badge, and the
 * form below waits behind this flag. Flip it to ship: the wiring (test, save,
 * sign out, restart prompt) is all here and live.
 */
const CUSTOM_DEPLOYMENT_ENABLED: boolean = false;

type TestState =
  | { kind: 'idle' }
  | { kind: 'testing' }
  | { kind: 'ok' }
  | { kind: 'fail'; reason: string };

/**
 * formSheet route for swapping the Convex backend. Reached from Settings →
 * Advanced and from the login screen. Replaces the imperative
 * `ServerConfigDrawer` ref API. Dismiss via swipe down / grabber.
 */
export default function ServerConfigScreen() {
  return (
    <DrawerSurface>
      <SheetHeader title="Server" />
      <SheetContainer
        scrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: spacing.md, gap: spacing.lg }}
      >
        <Body />
      </SheetContainer>
    </DrawerSurface>
  );
}

function Body() {
  const { colors } = useTheme();

  const current = (() => {
    try {
      return backendConfig();
    } catch {
      return null;
    }
  })();
  const [convexUrl, setConvexUrl] = useState(current?.custom ? current.convexUrl : '');
  const [siteUrl, setSiteUrl] = useState(current?.custom ? current.siteUrl : '');
  const [test, setTest] = useState<TestState>({ kind: 'idle' });
  const [busy, setBusy] = useState(false);
  const onPushrCloud = !!current && !current.custom;

  function onChangeUrls(nextConvex: string, nextSite: string) {
    setConvexUrl(nextConvex);
    setSiteUrl(nextSite);
    if (test.kind !== 'idle') setTest({ kind: 'idle' });
  }

  async function runTest() {
    const cu = convexUrl.trim();
    const su = siteUrl.trim();
    if (!/^https?:\/\//.test(cu) || !/^https?:\/\//.test(su)) {
      setTest({
        kind: 'fail',
        reason: 'Both URLs must start with https:// (or http://).'
      });
      haptic.error();
      return;
    }
    setTest({ kind: 'testing' });
    try {
      const healthRes = await fetch(`${su.replace(/\/$/, '')}/healthz`);
      if (!healthRes.ok) throw new Error(`Site URL returned ${healthRes.status}`);
      const body = (await healthRes.json().catch(() => null)) as {
        ok?: boolean;
      } | null;
      if (!body?.ok) {
        throw new Error(
          "Site URL responded, but /healthz didn't return { ok: true } — is this really a pushr deployment?"
        );
      }
      const pingRes = await fetch(cu.replace(/\/$/, ''));
      if (pingRes.status >= 500) {
        throw new Error(`Convex URL returned ${pingRes.status}`);
      }
      haptic.success();
      setTest({ kind: 'ok' });
    } catch (err: any) {
      haptic.error();
      setTest({ kind: 'fail', reason: err?.message ?? 'Unknown error' });
    }
  }

  async function saveCustom() {
    if (test.kind !== 'ok') return;
    setBusy(true);
    try {
      await saveBackend(convexUrl.trim(), siteUrl.trim());
      await authClient()
        .signOut()
        .catch(() => {});
      haptic.success();
      router.back();
      Alert.alert('Server updated', 'Quit and reopen the app to connect to the new backend.');
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
      router.back();
      Alert.alert('Switched to pushr cloud', 'Quit and reopen the app to apply the change.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Text style={{ ...type.subhead, color: colors.secondaryLabel }}>
        Choose which Convex deployment this app talks to.
      </Text>

      <Section title="pushr cloud">
        <Text style={{ ...type.footnote, color: colors.secondaryLabel }}>
          The hosted deployment maintained by the project author. Easiest — no setup needed.
        </Text>
        {onPushrCloud ? (
          // A state, not an action — a disabled button invites a press that
          // can't happen, so this says it as status instead.
          <Chip
            label="Currently in use"
            variant="tint"
            color={colors.success}
            leading={
              <SymbolView
                name="checkmark.circle.fill"
                size={13}
                tintColor={colors.success}
              />
            }
          />
        ) : (
          <Button
            title="Use pushr cloud"
            variant="secondary"
            onPress={useDefault}
            loading={busy && !convexUrl}
          />
        )}
      </Section>

      <Section title="Custom Convex Deployment" badge="Coming Soon">
        <Text style={{ ...type.footnote, color: colors.secondaryLabel }}>
          Point at your own Convex deployment. Both URLs come from the Convex dashboard — .cloud for
          the client, .site for auth.
        </Text>
        {CUSTOM_DEPLOYMENT_ENABLED && (
          <>
            <Input
              label="Convex URL"
              placeholder="https://example-name-123.convex.cloud"
              value={convexUrl}
              onChangeText={(v) => onChangeUrls(v, siteUrl)}
              autoCapitalize="none"
              keyboardType="url"
            />
            <Input
              label="Site URL"
              placeholder="https://example-name-123.convex.site"
              value={siteUrl}
              onChangeText={(v) => onChangeUrls(convexUrl, v)}
              autoCapitalize="none"
              keyboardType="url"
            />

            {/* Stacked, not side by side: at half the sheet's width these
                labels wrap onto two lines. */}
            <View style={{ gap: spacing.sm }}>
              <Button
                title="Test connection"
                variant="secondary"
                onPress={runTest}
                loading={test.kind === 'testing'}
                disabled={busy || !convexUrl.trim() || !siteUrl.trim()}
              />
              <Button
                title="Save & sign out"
                onPress={saveCustom}
                loading={busy && !!convexUrl}
                disabled={test.kind !== 'ok'}
              />
            </View>

            <TestPanel state={test} />
          </>
        )}
      </Section>
    </>
  );
}

function Section({
  title,
  badge,
  children
}: {
  title: string;
  badge?: string;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <Card style={{ gap: spacing.md }}>
      <View style={{ gap: spacing.sm }}>
        {/* Badge above rather than beside: sharing the line forced the title to
            wrap, which left the chip floating against a ragged two-line
            heading. On its own row the title gets the full width. */}
        {badge && <Chip label={badge} size="sm" variant="ghost" />}
        <Text style={{ ...type.title3, fontSize: 19, color: colors.strongLabel }}>{title}</Text>
      </View>
      {children}
    </Card>
  );
}

function TestPanel({ state }: { state: TestState }) {
  const { colors } = useTheme();
  if (state.kind === 'idle') return null;

  const cfg: { icon: SFSymbol; tint: string; label: string; detail?: string } =
    state.kind === 'testing'
      ? {
          icon: 'arrow.clockwise',
          tint: colors.accent,
          label: 'Testing…',
          detail: 'Reaching /healthz and pinging the Convex URL.'
        }
      : state.kind === 'ok'
        ? {
            icon: 'checkmark.circle.fill',
            tint: colors.success,
            label: 'Connection OK',
            detail:
              "Both URLs responded. Ready to save — you'll be signed out and asked to restart."
          }
        : {
            icon: 'exclamationmark.triangle.fill',
            tint: colors.destructive,
            label: "Couldn't connect",
            detail: state.reason
          };

  return (
    <Card
      tint={cfg.tint}
      padding={spacing.md}
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: spacing.md
      }}
    >
      <SymbolView name={cfg.icon} size={18} tintColor={cfg.tint} />
      <View style={{ flex: 1 }}>
        <Text style={{ ...type.footnote, color: cfg.tint, fontWeight: '600' }}>{cfg.label}</Text>
        {cfg.detail && (
          <Text
            style={{
              ...type.caption1,
              color: colors.secondaryLabel,
              marginTop: 2
            }}
          >
            {cfg.detail}
          </Text>
        )}
      </View>
    </Card>
  );
}
