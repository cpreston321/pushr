import { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { SymbolView, type SFSymbol } from "expo-symbols";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { useRevenueCat } from "@/lib/revenuecat";
import { presentRcPaywall } from "@/lib/rcPaywall";
import { useTheme, spacing, radius, type } from "@/lib/theme";
import { haptic } from "@/lib/haptics";

/**
 * Single canonical surface for everything Pro-related, backed by RevenueCat
 * + Convex's `getMyPlan`. Any page that needs to gate, badge, or upsell
 * should reach for one of these instead of rolling its own.
 */

/** Returns true if the current user has the Pro entitlement (via RC) or
 *  a Convex-side grant (server-issued, e.g. dev grant). */
export function useIsPro(): boolean {
  const session = authClient().useSession();
  const userId = session.data?.user?.id;
  const { isAuthenticated } = useConvexAuth();
  const rc = useRevenueCat(userId);
  const plan = useQuery(api.tiers.getMyPlan, isAuthenticated ? {} : "skip");
  if (rc.status.kind === "ready" && rc.status.isPro) return true;
  return plan?.tier === "pro";
}

/** Hook flavour that returns the resolved plan + isPro flag. */
export function useProState() {
  const session = authClient().useSession();
  const userId = session.data?.user?.id;
  const { isAuthenticated } = useConvexAuth();
  const rc = useRevenueCat(userId);
  const plan = useQuery(api.tiers.getMyPlan, isAuthenticated ? {} : "skip");
  const isPro =
    (rc.status.kind === "ready" && rc.status.isPro) || plan?.tier === "pro";
  return { isPro: !!isPro, plan, rc };
}

/** Open the upgrade flow. Tries RevenueCat's native paywall first
 *  (when `react-native-purchases-ui` is wired up) and falls back to the
 *  in-house `/upgrade` screen. Centralised so call sites never branch. */
export async function openUpgrade(): Promise<void> {
  haptic.selection();
  const handled = await presentRcPaywall().catch(() => false);
  if (!handled) router.push("/upgrade");
}

/**
 * Small accent-tinted "PRO" pill. Use inline next to feature labels.
 */
export function ProBadge({
  size = "sm",
  label = "PRO",
}: {
  size?: "sm" | "md";
  label?: string;
}) {
  const { colors } = useTheme();
  const padH = size === "md" ? 8 : 6;
  const padV = size === "md" ? 3 : 1;
  const fontSize = size === "md" ? 11 : 10;
  return (
    <View
      style={{
        paddingHorizontal: padH,
        paddingVertical: padV,
        borderRadius: radius.xs,
        backgroundColor: colors.accent,
      }}
    >
      <Text
        style={{
          fontSize,
          fontWeight: "700",
          color: colors.accentContrast,
          letterSpacing: 0.5,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

/**
 * Full-width upsell card for inline placement on a settings/detail screen.
 * Hidden when the user is already Pro.
 */
export function ProUpsellCard({
  title = "Unlock pushr Pro",
  body = "Unlimited source apps, rich pushes, quiet hours, and 90-day history.",
  cta = "See plans",
}: {
  title?: string;
  body?: string;
  cta?: string;
}) {
  const { colors, tintBg } = useTheme();
  const { isPro } = useProState();
  if (isPro) return null;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={openUpgrade}
      style={({ pressed }) => ({
        marginHorizontal: spacing.lg,
        backgroundColor: pressed ? colors.cellHighlight : colors.cell,
        borderRadius: radius.lg,
        borderCurve: "continuous",
        padding: spacing.lg,
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
      })}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: radius.xl,
          backgroundColor: tintBg(colors.accent),
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <SymbolView name="sparkles" size={20} tintColor={colors.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.xs,
          }}
        >
          <Text
            style={{ ...type.headline, color: colors.label }}
            numberOfLines={1}
          >
            {title}
          </Text>
          <ProBadge />
        </View>
        <Text
          style={{
            ...type.footnote,
            color: colors.secondaryLabel,
            marginTop: 2,
          }}
        >
          {body}
        </Text>
      </View>
      <Text
        style={{ ...type.footnote, color: colors.accent, fontWeight: "600" }}
      >
        {cta}
      </Text>
    </Pressable>
  );
}

/**
 * Wraps a feature row. When the user is Pro, renders children unchanged.
 * When not Pro, renders a tappable locked row that routes to /upgrade.
 *
 * The locked treatment shows a small icon + title + PRO badge in a row that
 * matches the iOS list-row look, so it slots cleanly into existing
 * `<DetailSection>` / `<ListSection>` containers.
 */
export function ProGate({
  feature,
  icon,
  children,
}: {
  feature: string;
  icon?: SFSymbol;
  children: ReactNode;
}) {
  const { colors, tintBg } = useTheme();
  const { isPro } = useProState();
  if (isPro) return <>{children}</>;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={openUpgrade}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.md,
        gap: spacing.md,
        minHeight: 56,
        backgroundColor: pressed ? colors.cellHighlight : "transparent",
      })}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: radius.lg,
          backgroundColor: tintBg(colors.accent),
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <SymbolView
          name={icon ?? "lock.fill"}
          size={18}
          tintColor={colors.accent}
        />
      </View>
      <View style={{ flex: 1 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.xs,
          }}
        >
          <Text style={{ ...type.body, color: colors.label }}>{feature}</Text>
          <ProBadge />
        </View>
        <Text
          style={{
            ...type.footnote,
            color: colors.secondaryLabel,
            marginTop: 1,
          }}
        >
          Tap to upgrade
        </Text>
      </View>
      <SymbolView
        name="chevron.right"
        size={14}
        tintColor={colors.tertiaryLabel}
      />
    </Pressable>
  );
}
