import { useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { SymbolView, type SFSymbol } from "expo-symbols";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button } from "@/components/Button";
import { useTheme, spacing, radius, type } from "@/lib/theme";
import { haptic } from "@/lib/haptics";

type BillingCycle = "monthly" | "yearly";

const HERO_BG = "#0A0F16";

const PERKS: { icon: SFSymbol; title: string; body: string }[] = [
  {
    icon: "bolt.fill",
    title: "10,000 pushes / month",
    body: "100× the free cap. Enough for busy homelabs and CI fleets.",
  },
  {
    icon: "square.stack.3d.up.fill",
    title: "Unlimited source apps",
    body: "One token per project or service, no friction.",
  },
  {
    icon: "photo.fill",
    title: "Rich pushes",
    body: "Image attachments, action buttons, scheduled delivery.",
  },
  {
    icon: "clock.arrow.circlepath",
    title: "90-day history",
    body: "Scroll back through three months of your feed, searchable.",
  },
  {
    icon: "moon.zzz.fill",
    title: "Quiet hours",
    body: "Per-app silent windows that still land in the feed.",
  },
];

export default function Upgrade() {
  const { colors, tintBg } = useTheme();
  const insets = useSafeAreaInsets();
  const plan = useQuery(api.tiers.getMyPlan);
  const grantPro = useMutation(api.tiers.grantProToMe);
  const downgrade = useMutation(api.tiers.downgradeMe);
  const [cycle, setCycle] = useState<BillingCycle>("yearly");

  const isPro = plan?.tier === "pro";

  async function fakeUpgrade() {
    haptic.success();
    await grantPro({ days: 30 });
    Alert.alert(
      "Pro granted (dev mode)",
      "30-day trial added to your account. Replace this with RevenueCat before shipping.",
    );
    router.back();
  }

  async function fakeCancel() {
    haptic.warning();
    Alert.alert("Downgrade?", "Return to the free tier?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Downgrade",
        style: "destructive",
        onPress: async () => {
          await downgrade({});
          router.back();
        },
      },
    ]);
  }

  const price =
    cycle === "yearly"
      ? { headline: "$29", caption: "per year · $2.42/mo" }
      : { headline: "$3.99", caption: "per month" };

  return (
    <View style={{ flex: 1, backgroundColor: colors.grouped }}>
      {/* Close button overlays the hero */}
      <Pressable
        accessibilityLabel="Close"
        accessibilityRole="button"
        onPress={() => {
          haptic.light();
          router.back();
        }}
        hitSlop={10}
        style={({ pressed }) => ({
          position: "absolute",
          top: insets.top + spacing.sm,
          right: spacing.md,
          zIndex: 10,
          width: 32,
          height: 32,
          borderRadius: 16,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: pressed
            ? "rgba(255,255,255,0.25)"
            : "rgba(255,255,255,0.12)",
        })}
      >
        <SymbolView name="xmark" size={14} tintColor="#FFFFFF" />
      </Pressable>

      <ScrollView
        style={{ flex: 1 }}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{ paddingBottom: spacing.md }}
      >
        <Hero insetTop={insets.top} accent={colors.accent} />

        <View style={{ paddingHorizontal: spacing.xl, gap: spacing.lg, marginTop: -24 }}>
          <View
            style={{
              backgroundColor: colors.cell,
              borderRadius: 20,
              borderCurve: "continuous",
              paddingVertical: spacing.md,
              paddingHorizontal: spacing.lg,
              gap: spacing.md,
              boxShadow: "0px 6px 14px rgba(0, 0, 0, 0.18)",
            }}
          >
            {PERKS.map((p) => (
              <View
                key={p.title}
                style={{
                  flexDirection: "row",
                  gap: spacing.md,
                  alignItems: "center",
                }}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: tintBg(colors.accent),
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <SymbolView name={p.icon} size={18} tintColor={colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      ...type.subhead,
                      color: colors.label,
                      fontWeight: "600",
                    }}
                  >
                    {p.title}
                  </Text>
                  <Text
                    style={{
                      ...type.caption1,
                      color: colors.secondaryLabel,
                      marginTop: 1,
                    }}
                  >
                    {p.body}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          {!isPro && (
            <View style={{ alignItems: "center", gap: spacing.sm }}>
              <CycleToggle cycle={cycle} onChange={setCycle} />
              <View style={{ alignItems: "center" }}>
                <Text
                  style={{ ...type.largeTitle, color: colors.label, fontSize: 40 }}
                >
                  {price.headline}
                </Text>
                <Text
                  style={{ ...type.footnote, color: colors.secondaryLabel }}
                >
                  {price.caption}
                </Text>
              </View>
              {cycle === "yearly" && (
                <View
                  style={{
                    backgroundColor: tintBg(colors.success),
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 10,
                  }}
                >
                  <Text
                    style={{
                      ...type.caption1,
                      color: colors.success,
                      fontWeight: "700",
                    }}
                  >
                    SAVE 40%
                  </Text>
                </View>
              )}
            </View>
          )}

          {isPro && (
            <View
              style={{
                padding: spacing.md,
                borderRadius: radius.md,
                borderCurve: "continuous",
                backgroundColor: tintBg(colors.success, "18"),
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.sm,
              }}
            >
              <SymbolView
                name="checkmark.circle.fill"
                size={20}
                tintColor={colors.success}
              />
              <Text
                style={{
                  ...type.footnote,
                  color: colors.success,
                  fontWeight: "600",
                  flex: 1,
                }}
              >
                You're on Pro
                {plan?.proUntil
                  ? ` until ${new Date(plan.proUntil).toLocaleDateString()}`
                  : ""}
                .
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      <View
        style={{
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.md,
          paddingBottom: Math.max(insets.bottom, spacing.md),
          gap: spacing.xs,
          backgroundColor: colors.background,
        }}
      >
        {isPro ? (
          <Button
            title="Downgrade to free"
            variant="secondary"
            onPress={fakeCancel}
          />
        ) : (
          <Button title="Start 7-day free trial" onPress={fakeUpgrade} />
        )}
        <Text
          style={{
            ...type.caption2,
            color: colors.tertiaryLabel,
            textAlign: "center",
          }}
        >
          {isPro
            ? "Cancel anytime."
            : "7 days free, then " +
              (cycle === "yearly" ? "$29/year" : "$3.99/mo") +
              ". Cancel anytime. Self-hosted pushr stays free forever."}
        </Text>
      </View>
    </View>
  );
}

function Hero({ insetTop, accent }: { insetTop: number; accent: string }) {
  return (
    <View
      style={{
        backgroundColor: HERO_BG,
        paddingTop: insetTop + spacing.xxl,
        paddingBottom: spacing.xxl + spacing.lg,
        paddingHorizontal: spacing.xl,
        overflow: "hidden",
      }}
    >
      <Svg
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
        preserveAspectRatio="none"
        viewBox="0 0 100 100"
      >
        <Defs>
          <RadialGradient
            id="upgrade-bloom"
            cx="50"
            cy="20"
            rx="85"
            ry="90"
            fx="50"
            fy="20"
            gradientUnits="userSpaceOnUse"
          >
            <Stop offset="0" stopColor={accent} stopOpacity={0.7} />
            <Stop offset="0.5" stopColor={accent} stopOpacity={0.2} />
            <Stop offset="1" stopColor={accent} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" fill="url(#upgrade-bloom)" />
      </Svg>
      <LinearGradient
        pointerEvents="none"
        colors={["rgba(10,15,22,0)", "rgba(10,15,22,0.4)", HERO_BG]}
        locations={[0.5, 0.85, 1]}
        style={StyleSheet.absoluteFillObject}
      />

      <View style={{ alignItems: "center", gap: spacing.sm }}>
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 36,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(255,255,255,0.1)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.15)",
          }}
        >
          <SymbolView name="sparkles" size={36} tintColor="#FFFFFF" />
        </View>
        <Text
          style={{
            fontSize: 34,
            lineHeight: 40,
            fontWeight: "700",
            color: "#FFFFFF",
            letterSpacing: 0.35,
            textAlign: "center",
          }}
        >
          pushr{" "}
          <Text style={{ color: accent }}>Pro</Text>
        </Text>
        <Text
          style={{
            ...type.subhead,
            color: "rgba(255,255,255,0.7)",
            textAlign: "center",
            maxWidth: 300,
          }}
        >
          Everything you need to push with power. Self-hosting stays free forever.
        </Text>
      </View>
    </View>
  );
}

function CycleToggle({
  cycle,
  onChange,
}: {
  cycle: BillingCycle;
  onChange: (c: BillingCycle) => void;
}) {
  const { colors, isDark } = useTheme();
  const activeBg = isDark ? "#3A3A3C" : "#FFFFFF";
  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: colors.fill,
        borderRadius: 999,
        padding: 3,
      }}
    >
      {(["monthly", "yearly"] as const).map((c) => {
        const active = cycle === c;
        return (
          <Pressable
            key={c}
            onPress={() => {
              if (process.env.EXPO_OS === "ios") haptic.selection();
              onChange(c);
            }}
            style={{
              paddingHorizontal: 20,
              paddingVertical: 8,
              borderRadius: 999,
              backgroundColor: active ? activeBg : "transparent",
              boxShadow: active ? "0px 2px 4px rgba(0, 0, 0, 0.12)" : undefined,
            }}
          >
            <Text
              style={{
                ...type.footnote,
                fontWeight: active ? "700" : "500",
                color: active ? colors.label : colors.secondaryLabel,
              }}
            >
              {c === "monthly" ? "Monthly" : "Yearly"}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
