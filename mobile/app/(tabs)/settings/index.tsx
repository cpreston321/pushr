import { router } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { ScreenHeader, ScreenBody } from "@/components/ScreenHeader";
import { ScreenTransition } from "@/components/ScreenTransition";
import { currentServerLabel } from "@/lib/backend";
import { ListSection } from "@/components/ListSection";
import { ListRow } from "@/components/ListRow";
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
import { SOUNDS, soundLabel } from "@/lib/sounds";

type SoundKey = "soundLow" | "soundNormal" | "soundHigh";

export default function Settings() {
  const { colors, isDark } = useTheme();
  const { data } = authClient().useSession();
  const user = data?.user;
  const prefs = useQuery(api.userPrefs.getMine);
  const updatePrefs = useMutation(api.userPrefs.update);

  function pickSound(key: SoundKey, title: string) {
    haptic.light();
    showActionSheet({
      title,
      message:
        "Choose the sound played when a notification of this priority arrives.",
      options: SOUNDS.map((s) => ({
        label:
          soundLabel(prefs?.[key] ?? "default") === s.label
            ? `✓ ${s.label}`
            : s.label,
        onPress: () => {
          haptic.success();
          updatePrefs({ [key]: s.value });
        },
      })),
    });
  }

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
    <ScreenTransition style={{ backgroundColor: colors.background }}>
      <ScreenHeader
        eyebrow={user?.email ?? undefined}
        title={user?.name ?? "Settings"}
      />
      <ScreenBody>
        <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
          <SectionHeader label="Plan" />
          <PlanCard />

          <SectionHeader label="Appearance" />
          <AppearanceCard isDark={isDark} />

          <SectionHeader label="Sounds" />
          <ListSection footer="Pick the sound each priority plays on arrival. Custom sounds beyond Default and Silent require a dev build.">
            <SoundRow
              title="Low priority"
              subtitle={'priority ≤ 4  /  "low"'}
              icon="bell.slash"
              tint={colors.secondaryLabel}
              value={prefs ? soundLabel(prefs.soundLow) : "—"}
              onPress={() => pickSound("soundLow", "Low-priority sound")}
            />
            <SoundRow
              title="Normal"
              subtitle={'priority 5–6  /  "normal"'}
              icon="bell"
              tint={colors.accent}
              value={prefs ? soundLabel(prefs.soundNormal) : "—"}
              onPress={() => pickSound("soundNormal", "Normal-priority sound")}
            />
            <SoundRow
              title="High priority"
              subtitle={'priority ≥ 7  /  "high"'}
              icon="bell.badge.fill"
              tint={colors.destructive}
              value={prefs ? soundLabel(prefs.soundHigh) : "—"}
              onPress={() => pickSound("soundHigh", "High-priority sound")}
            />
          </ListSection>

          <SectionHeader label="Server" />
          <ListSection footer="Self-hosting? Point pushr at your own Convex deployment. Changing the server signs you out and requires an app restart.">
            <TintedRow
              icon="server.rack"
              title="Backend"
              trailing={currentServerLabel()}
              tint={colors.accent}
              onPress={() => router.push("/server-config")}
            />
          </ListSection>

          <SectionHeader label="Account" />
          <ListSection>
            <TintedRow
              icon="envelope.fill"
              title="Email"
              trailing={user?.email ?? ""}
              tint={colors.accent}
            />
            <TintedRow
              icon="calendar"
              title="Member since"
              trailing={
                user?.createdAt
                  ? new Date(user.createdAt).toLocaleDateString()
                  : "—"
              }
              tint={colors.accent}
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
            <TintedRow
              icon="rectangle.portrait.and.arrow.right"
              title="Sign out"
              tint={colors.destructive}
              destructive
              onPress={signOut}
            />
          </ListSection>

          <View style={{ alignItems: "center", paddingTop: spacing.xl }}>
            <Text style={{ ...type.footnote, color: colors.tertiaryLabel }}>
              pushr · v1.0.0
            </Text>
          </View>
        </ScrollView>
      </ScreenBody>
    </ScreenTransition>
  );
}

function SectionHeader({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <Text
      style={{
        ...type.footnote,
        color: colors.secondaryLabel,
        textTransform: "uppercase",
        letterSpacing: 0.5,
        marginHorizontal: spacing.xl,
        marginTop: spacing.xl,
        marginBottom: spacing.sm,
      }}
    >
      {label}
    </Text>
  );
}

function AppearanceCard({ isDark }: { isDark: boolean }) {
  const { colors } = useTheme();
  const { mode, setMode, accentKey, setAccent } = useThemePreferences();

  return (
    <View
      style={{
        marginHorizontal: spacing.lg,
        backgroundColor: colors.cell,
        borderRadius: radius.lg,
        borderCurve: "continuous",
        overflow: "hidden",
      }}
    >
      <View
        style={{
          flexDirection: "row",
          padding: spacing.md,
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
          height: 0.5,
          backgroundColor: colors.separator,
          marginHorizontal: spacing.md,
        }}
      />

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
        }}
      >
        <Text style={{ ...type.body, color: colors.label }}>Theme</Text>
        <View style={{ flexDirection: "row", gap: spacing.md }}>
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
    </View>
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
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        aspectRatio: 1.0,
        borderRadius: radius.md,
        borderCurve: "continuous",
        backgroundColor: selected ? colors.accent + "22" : colors.fill,
        borderWidth: selected ? 1.5 : 0,
        borderColor: selected ? colors.accent : "transparent",
        alignItems: "center",
        justifyContent: "center",
        gap: spacing.xs,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <SymbolView
        name={icon}
        size={28}
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
    <Pressable onPress={onPress} hitSlop={6}>
      <View
        style={{
          width: 26,
          height: 26,
          borderRadius: 13,
          borderWidth: selected ? 2 : 0,
          borderColor: color,
          padding: selected ? 3 : 0,
        }}
      >
        <View
          style={{
            flex: 1,
            borderRadius: 999,
            backgroundColor: color,
          }}
        />
      </View>
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
          <Text style={{ ...type.body, color: colors.secondaryLabel }}>
            {trailing}
          </Text>
        ) : undefined
      }
      leading={
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: tint + "22",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <SymbolView name={icon} size={18} tintColor={tint} />
        </View>
      }
    />
  );
}

function SoundRow({
  icon,
  title,
  subtitle,
  tint,
  value,
  onPress,
}: {
  icon: SFSymbol;
  title: string;
  subtitle: string;
  tint: string;
  value: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <ListRow
      title={title}
      subtitle={subtitle}
      chevron
      onPress={onPress}
      trailing={
        <Text style={{ ...type.body, color: colors.secondaryLabel }}>
          {value}
        </Text>
      }
      leading={
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: tint + "22",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <SymbolView name={icon} size={18} tintColor={tint} />
        </View>
      }
    />
  );
}

function PlanCard() {
  const { colors } = useTheme();
  const plan = useQuery(api.tiers.getMyPlan);

  const pct =
    plan && plan.pushesPerMonth > 0
      ? Math.min(1, plan.pushesThisMonth / plan.pushesPerMonth)
      : 0;
  const isPro = plan?.tier === "pro";
  const tint = isPro ? colors.accent : colors.secondaryLabel;

  return (
    <Pressable
      onPress={() => {
        haptic.selection();
        router.push("/upgrade");
      }}
      style={({ pressed }) => ({
        marginHorizontal: spacing.lg,
        backgroundColor: pressed ? colors.cellHighlight : colors.cell,
        borderRadius: radius.lg,
        borderCurve: "continuous",
        padding: spacing.lg,
        gap: spacing.md,
      })}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: tint + "22",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <SymbolView
            name={isPro ? "sparkles" : "person.fill"}
            size={20}
            tintColor={tint}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ ...type.headline, color: colors.label }}>
            {isPro ? "pushr Pro" : "Free plan"}
          </Text>
          <Text style={{ ...type.footnote, color: colors.secondaryLabel, marginTop: 1 }}>
            {plan
              ? isPro
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
            <Text style={{ ...type.footnote, color: colors.secondaryLabel }}>
              Pushes this month
            </Text>
            <Text style={{ ...type.footnote, color: colors.label, fontWeight: "600" }}>
              {plan.pushesThisMonth.toLocaleString()} /{" "}
              {plan.pushesPerMonth.toLocaleString()}
            </Text>
          </View>
          <View
            style={{
              height: 6,
              borderRadius: 3,
              backgroundColor: colors.fill,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                width: `${pct * 100}%`,
                height: "100%",
                backgroundColor:
                  pct >= 1
                    ? colors.destructive
                    : pct >= 0.8
                      ? colors.warning
                      : colors.accent,
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
    </Pressable>
  );
}
