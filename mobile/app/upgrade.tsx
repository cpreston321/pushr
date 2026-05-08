import { useMemo, useState } from "react";
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
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button } from "@/components/Button";
import { DrawerHeader } from "@/components/DrawerHeader";
import { useTheme, spacing, radius, type } from "@/lib/theme";
import { haptic } from "@/lib/haptics";
import { authClient } from "@/lib/backend";
import { pickPackages, useRevenueCat } from "@/lib/revenuecat";

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
  const reconcile = useAction(api.iap.reconcile);
  const [cycle, setCycle] = useState<BillingCycle>("yearly");
  const [busy, setBusy] = useState(false);

  const session = authClient().useSession();
  const userId = session.data?.user?.id;
  const rc = useRevenueCat(userId);
  const offerings = rc.status.kind === "ready" ? rc.status.offerings : null;
  const { monthly, yearly } = useMemo(() => pickPackages(offerings), [offerings]);
  const activePackage = cycle === "yearly" ? yearly : monthly;

  // Three operating modes:
  //   - unconfigured: no RC API key in env → dev grant fallback
  //   - loading: RC is fetching customer info / offerings → skeleton UI
  //   - ready: prices come from the App Store offering, never hardcoded
  const rcUnconfigured = rc.status.kind === "unconfigured";
  const pricesLoading = !rcUnconfigured && !activePackage;

  const isPro = plan?.tier === "pro";

  async function startUpgrade() {
    if (busy) return;
    setBusy(true);
    try {
      if (rcUnconfigured) {
        // Self-hosters / dev builds without an RC key: grant 30-day Pro so the
        // flow stays exercisable. Real builds always have the env key set.
        haptic.success();
        await grantPro({ days: 30 });
        Alert.alert(
          "Pro granted (dev mode)",
          "RevenueCat isn't configured — falling back to a 30-day dev grant.",
        );
        router.back();
        return;
      }
      if (!activePackage) {
        haptic.warning();
        Alert.alert(
          "Pricing unavailable",
          "Couldn't load App Store pricing. Check your connection and try again.",
        );
        return;
      }
      await rc.purchase(activePackage);
      haptic.success();
      // Reconcile immediately so the server-side tier reflects the purchase
      // even if the webhook is delayed. The Convex `getMyPlan` subscription
      // re-runs automatically once userTiers updates.
      try {
        await reconcile({});
      } catch {
        // Webhook will catch up; not fatal.
      }
      router.back();
    } catch (err) {
      // RevenueCat surfaces user cancellation via { userCancelled: true } on
      // the rejection — quietly bail without an alert.
      if ((err as { userCancelled?: boolean }).userCancelled) {
        haptic.light();
        return;
      }
      haptic.warning();
      Alert.alert("Purchase failed", (err as Error).message ?? "Try again later.");
    } finally {
      setBusy(false);
    }
  }

  async function restorePurchases() {
    if (busy) return;
    setBusy(true);
    try {
      if (rcUnconfigured) {
        Alert.alert("Not configured", "Sign in via the App Store on a real device to restore purchases.");
        return;
      }
      await rc.restorePurchases();
      try {
        await reconcile({});
      } catch {
        /* webhook fallback */
      }
      haptic.success();
      Alert.alert("Restored", "Your subscription has been re-linked to this device.");
    } catch (err) {
      Alert.alert("Restore failed", (err as Error).message ?? "Try again later.");
    } finally {
      setBusy(false);
    }
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

  // Prices come straight from the App Store offering — no hardcoded fallbacks
  // that could mismatch regional pricing or drift when prices change. While RC
  // is still fetching, the price block renders a skeleton.
  const price = activePackage
    ? {
        headline: activePackage.product.priceString,
        caption:
          cycle === "yearly"
            ? `${activePackage.product.priceString} per year`
            : `${activePackage.product.priceString} per month`,
      }
    : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.grouped }}>
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
                accessible
                accessibilityLabel={`${p.title}. ${p.body}`}
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
              <View style={{ alignItems: "center", minHeight: 64, justifyContent: "center" }}>
                {price ? (
                  <>
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
                  </>
                ) : pricesLoading ? (
                  <PriceSkeleton tint={colors.fill} />
                ) : (
                  <Text style={{ ...type.footnote, color: colors.secondaryLabel }}>
                    Pricing unavailable
                  </Text>
                )}
              </View>
              {cycle === "yearly" && price && (
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
          <>
            <Button
              title={
                busy
                  ? "Working…"
                  : pricesLoading
                    ? "Loading prices…"
                    : "Start 7-day free trial"
              }
              onPress={startUpgrade}
              disabled={busy || pricesLoading}
            />
            <Pressable
              onPress={restorePurchases}
              hitSlop={8}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Restore purchases"
              accessibilityHint="Re-links a previously purchased subscription"
              accessibilityState={{ disabled: busy }}
              style={{ alignSelf: "center", paddingVertical: 4 }}
            >
              <Text
                style={{
                  ...type.caption1,
                  color: colors.accent,
                  fontWeight: "600",
                }}
              >
                Restore purchases
              </Text>
            </Pressable>
          </>
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
            : price
              ? `7 days free, then ${price.caption}. Cancel anytime. Self-hosted pushr stays free forever.`
              : "Cancel anytime. Self-hosted pushr stays free forever."}
        </Text>
      </View>

      <DrawerHeader
        title="pushr Pro"
        floating
        safeAreaTop={insets.top}
        hideTitle
      />
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

function PriceSkeleton({ tint }: { tint: string }) {
  return (
    <View style={{ alignItems: "center", gap: 6 }}>
      <View
        style={{
          width: 96,
          height: 40,
          borderRadius: 8,
          backgroundColor: tint,
        }}
      />
      <View
        style={{
          width: 120,
          height: 12,
          borderRadius: 6,
          backgroundColor: tint,
        }}
      />
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
            accessibilityRole="button"
            accessibilityLabel={c === "monthly" ? "Monthly billing" : "Yearly billing"}
            accessibilityState={{ selected: active }}
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
