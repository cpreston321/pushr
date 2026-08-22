import { router } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "convex/react";
import { api } from "@pushr/backend/_generated/api";
import { authClient } from "@/lib/auth-client";
import {
  ScreenHeader,
  ScreenBody,
  ScreenShell,
} from "@/components/ScreenHeader";
import { ScreenTransition } from "@/components/ScreenTransition";
import { Card } from "@/components/Card";
import { IconTile } from "@/components/IconTile";
import { SectionLabel } from "@/components/Chip";
import { currentServerLabel } from "@/lib/backend";
import { ListSection } from "@/components/ListSection";
import { ListRow } from "@/components/ListRow";
import { useProState, ProBadge } from "@/components/Pro";
import {
  useTheme,
  useThemePreferences,
  spacing,
  type,
  radius,
  ACCENT_PRESETS,
  ACCENT_ORDER,
  type AccentKey,
} from "@/lib/theme";
import { SymbolView, type SFSymbol } from "expo-symbols";
import { haptic } from "@/lib/haptics";
import { showActionSheet } from "@/lib/actionSheet";

export default function Settings() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { data } = authClient().useSession();
  const user = data?.user;

  async function signOut() {
    showActionSheet({
      title: "Sign out?",
      options: [
        {
          label: "Sign out",
          destructive: true,
          onPress: async () => {
            haptic.warning();
            await authClient().signOut();
          },
        },
      ],
    });
  }

  return (
    <ScreenTransition>
      <ScreenShell>
      <ScreenHeader
        eyebrow={user?.email ?? undefined}
        title={user?.name ?? "Settings"}
      />
      <ScreenBody>
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{
            paddingBottom: Math.max(120, insets.bottom),
          }}
        >
          <View>
            <SectionLabel>Plan</SectionLabel>
            <PlanCard />
          </View>

          <View>
            <SectionLabel>Appearance</SectionLabel>
            <AppearanceCard isDark={isDark} />
          </View>

          <ListSection header="Account">
            <TintedRow
              icon="key.fill"
              title="Change password"
              tint={colors.accent}
              onPress={() => {
                haptic.selection();
                router.push("/change-password");
              }}
            />
            <TintedRow
              icon="sparkles"
              title="Replay onboarding"
              tint={colors.accent}
              onPress={() => {
                haptic.selection();
                router.push("/onboarding");
              }}
            />
          </ListSection>

          <ListSection header="More">
            <TintedRow
              icon="bell.badge.fill"
              title="Notification sounds"
              tint={colors.accent}
              onPress={() => {
                haptic.selection();
                router.push("/(tabs)/settings/sounds");
              }}
            />
            <TintedRow
              icon="server.rack"
              title="Advanced"
              trailing={currentServerLabel()}
              tint={colors.accent}
              onPress={() => {
                haptic.selection();
                router.push("/(tabs)/settings/advanced");
              }}
            />
          </ListSection>

          {/* Headerless, so it needs the section rhythm the `SectionLabel`
              above each other group supplies — otherwise sign out reads as
              another row of "More". */}
          <ListSection style={{ marginTop: spacing.xl }}>
            <TintedRow
              icon="rectangle.portrait.and.arrow.right"
              title="Sign out"
              tint={colors.destructive}
              destructive
              onPress={signOut}
            />
          </ListSection>

          <View style={{ alignItems: "center", marginTop: spacing.xl }}>
            <Text style={{ ...type.footnote, color: colors.tertiaryLabel }}>
              pushr · v1.0.0
            </Text>
          </View>
        </ScrollView>
      </ScreenBody>
      </ScreenShell>
    </ScreenTransition>
  );
}

function AppearanceCard({ isDark }: { isDark: boolean }) {
  const { colors, ov } = useTheme();
  const { mode, setMode, accentKey, setAccent } = useThemePreferences();

  return (
    <Card padding={spacing.md + 2} style={{ marginHorizontal: spacing.lg }}>
      <View
        style={{
          flexDirection: "row",
          gap: spacing.sm,
        }}
      >
        <ModeCard
          label="System"
          icon="iphone"
          selected={mode === "system"}
          onPress={() => {
            haptic.selection();
            setMode("system");
          }}
        />
        <ModeCard
          label="Light"
          icon="sun.max.fill"
          selected={mode === "light"}
          onPress={() => {
            haptic.selection();
            setMode("light");
          }}
        />
        <ModeCard
          label="Dark"
          icon="moon.fill"
          selected={mode === "dark"}
          onPress={() => {
            haptic.selection();
            setMode("dark");
          }}
        />
      </View>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: spacing.md + 2,
          paddingTop: spacing.md + 2,
          borderTopWidth: 1,
          borderTopColor: ov(0.06),
        }}
      >
        <Text
          style={{ ...type.callout, fontWeight: "500", color: colors.label }}
        >
          Accent
        </Text>
        <View style={{ flexDirection: "row", gap: 11 }}>
          {ACCENT_ORDER.map((key) => (
            <AccentDot
              key={key}
              value={key}
              selected={accentKey === key}
              isDark={isDark}
              onPress={() => {
                haptic.selection();
                setAccent(key);
              }}
            />
          ))}
        </View>
      </View>
    </Card>
  );
}

function ModeCard({
  label,
  icon,
  selected,
  onPress,
}: {
  label: string;
  icon: SFSymbol;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors, ov, tint } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label} appearance`}
      accessibilityState={{ selected }}
      style={({ pressed }) => ({
        flex: 1,
        paddingVertical: spacing.lg - 2,
        borderRadius: radius.button,
        borderCurve: "continuous",
        backgroundColor: selected ? tint(0.18) : ov(0.05),
        borderWidth: 1,
        borderColor: selected ? tint(0.55) : ov(0.05),
        alignItems: "center",
        justifyContent: "center",
        gap: spacing.sm,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <SymbolView
        name={icon}
        size={22}
        tintColor={selected ? colors.accent : colors.secondaryLabel}
      />
      <Text
        style={{
          ...type.footnote,
          fontWeight: "600",
          color: selected ? colors.accent : colors.secondaryLabel,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function AccentDot({
  value,
  selected,
  isDark,
  onPress,
}: {
  value: AccentKey;
  selected: boolean;
  isDark: boolean;
  onPress: () => void;
}) {
  const color = ACCENT_PRESETS[value][isDark ? "dark" : "light"];
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={`${value} accent`}
      accessibilityState={{ selected }}
    >
      {/* Selection reads as a ring floating clear of the swatch — the card
          color shows through the gap, so the dot stays a full circle. */}
      <View
        style={{
          width: 30,
          height: 30,
          borderRadius: 15,
          backgroundColor: color,
          ...(selected
            ? {
                shadowColor: color,
                shadowOpacity: 0.55,
                shadowRadius: 7,
                shadowOffset: { width: 0, height: 0 },
                borderWidth: 2,
                borderColor: color,
                transform: [{ scale: 1.06 }],
              }
            : null),
        }}
      />
    </Pressable>
  );
}

function TintedRow({
  icon,
  title,
  trailing,
  tint,
  destructive,
  onPress,
}: {
  icon: SFSymbol;
  title: string;
  trailing?: string;
  tint: string;
  destructive?: boolean;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <ListRow
      title={title}
      destructive={destructive}
      onPress={onPress}
      chevron={!!onPress && !trailing}
      trailing={
        trailing ? (
          <Text style={{ ...type.callout, color: colors.secondaryLabel }}>
            {trailing}
          </Text>
        ) : undefined
      }
      leading={<IconTile icon={icon} size={38} color={tint} />}
    />
  );
}

function PlanCard() {
  const { colors, ov } = useTheme();
  const { plan, isPro, selfHosted } = useProState();

  const pct =
    plan && plan.pushesPerMonth > 0
      ? Math.min(1, plan.pushesThisMonth / plan.pushesPerMonth)
      : 0;
  // A paid or unlocked plan is worth lighting up; a free one shouldn't
  // masquerade as the hero of the screen.
  const unlocked = isPro || selfHosted;
  const tint = unlocked ? colors.accent : colors.secondaryLabel;
  const meterColor =
    pct >= 1 ? colors.destructive : pct >= 0.8 ? colors.warning : colors.accent;

  return (
    <Pressable
      onPress={() => {
        haptic.selection();
        router.push("/upgrade");
      }}
      accessibilityRole="button"
      accessibilityLabel="Plan and usage"
      style={({ pressed }) => ({ opacity: pressed ? 0.72 : 1 })}
    >
    <Card
      tint={unlocked ? colors.accent : null}
      strength={0.15}
      style={{ marginHorizontal: spacing.lg, gap: spacing.md }}
    >
      <View
        style={{ flexDirection: "row", alignItems: "center", gap: 13 }}
      >
        <IconTile
          icon={selfHosted ? "server.rack" : isPro ? "sparkles" : "person.fill"}
          size={44}
          color={tint}
          variant={unlocked ? "solid" : "wash"}
        />
        <View style={{ flex: 1 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.xs,
            }}
          >
            <Text style={{ ...type.title3, fontSize: 18, color: colors.strongLabel }}>
              {selfHosted ? "Self-hosted" : isPro ? "pushr" : "Free plan"}
            </Text>
            {isPro && !selfHosted && <ProBadge />}
            {selfHosted && <ProBadge label="UNLOCKED" />}
          </View>
          <Text
            style={{
              ...type.footnote,
              color: colors.secondaryLabel,
              marginTop: 1,
            }}
          >
            {plan
              ? selfHosted
                ? "All Pro features active. No subscription required."
                : isPro
                  ? plan.proUntil
                    ? `Active until ${new Date(plan.proUntil).toLocaleDateString()}`
                    : "Active"
                  : "Upgrade for unlimited source apps and rich pushes"
              : "Loading plan…"}
          </Text>
        </View>
        <SymbolView
          name="chevron.right"
          size={14}
          tintColor={colors.tertiaryLabel}
        />
      </View>

      {plan && (
        <View style={{ gap: spacing.xs }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "baseline",
            }}
          >
            <Text style={{ ...type.subhead, color: colors.secondaryLabel }}>
              Pushes this month
            </Text>
            <Text
              style={{
                ...type.subhead,
                color: colors.strongLabel,
                fontWeight: "700",
                fontVariant: ["tabular-nums"],
              }}
            >
              {plan.pushesThisMonth.toLocaleString()} /{" "}
              {plan.pushesPerMonth.toLocaleString()}
            </Text>
          </View>
          <View
            style={{
              height: 6,
              borderRadius: radius.pill,
              backgroundColor: ov(0.1),
              overflow: "hidden",
              marginTop: spacing.xs,
            }}
          >
            <View
              style={{
                // Always show a sliver once anything has been sent, so "1 of
                // 10,000" doesn't render as a visually empty bar.
                width: `${pct > 0 ? Math.max(2, pct * 100) : 0}%`,
                height: "100%",
                borderRadius: radius.pill,
                backgroundColor: meterColor,
              }}
            />
          </View>
          <Text style={{ ...type.caption1, color: colors.tertiaryLabel }}>
            {plan.sourceAppLimit === null
              ? `${plan.sourceAppCount} source app${plan.sourceAppCount === 1 ? "" : "s"} · unlimited`
              : `${plan.sourceAppCount} / ${plan.sourceAppLimit} source app${plan.sourceAppLimit === 1 ? "" : "s"}`}
            {" · "}
            {plan.historyDays}-day history
          </Text>
        </View>
      )}
    </Card>
    </Pressable>
  );
}
