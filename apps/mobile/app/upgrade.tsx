import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withTiming
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { useAction, useConvexAuth, useMutation, useQuery } from 'convex/react';
import { api } from '@pushr/backend/_generated/api';
import { Button } from '@/components/Button';
import { DrawerHeader } from '@/components/DrawerHeader';
import { useIsSelfHosted } from '@/components/Pro';
import { useTheme, spacing, radius, type } from '@/lib/theme';
import { haptic } from '@/lib/haptics';
import { authClient } from '@/lib/backend';
import { pickPackages, useRevenueCat } from '@/lib/revenuecat';

type BillingCycle = 'monthly' | 'yearly';

const HERO_BG = '#0A0F16';

const PERKS: { icon: SFSymbol; title: string; body: string }[] = [
  {
    icon: 'bolt.fill',
    title: '10,000 pushes / month',
    body: '100× the free cap. Enough for busy homelabs and CI fleets.'
  },
  {
    icon: 'square.stack.3d.up.fill',
    title: 'Unlimited source apps',
    body: 'One token per project or service, no friction.'
  },
  {
    icon: 'photo.fill',
    title: 'Rich pushes',
    body: 'Image attachments, action buttons, scheduled delivery.'
  },
  {
    icon: 'clock.arrow.circlepath',
    title: '90-day history',
    body: 'Scroll back through three months of your feed, searchable.'
  },
  {
    icon: 'moon.zzz.fill',
    title: 'Quiet hours',
    body: 'Per-app silent windows that still land in the feed.'
  }
];

export default function Upgrade() {
  const { colors, tintBg } = useTheme();
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useConvexAuth();
  const plan = useQuery(api.tiers.getMyPlan, isAuthenticated ? {} : 'skip');
  const grantPro = useMutation(api.tiers.grantProToMe);
  const downgrade = useMutation(api.tiers.downgradeMe);
  const reconcile = useAction(api.iap.reconcile);
  const [cycle, setCycle] = useState<BillingCycle>('yearly');
  const [busy, setBusy] = useState(false);

  const session = authClient().useSession();
  const userId = session.data?.user?.id;
  const rc = useRevenueCat(userId);
  const offerings = rc.status.kind === 'ready' ? rc.status.offerings : null;
  const { monthly, yearly } = useMemo(() => pickPackages(offerings), [offerings]);
  const activePackage = cycle === 'yearly' ? yearly : monthly;

  // Three operating modes:
  //   - unconfigured: no RC API key in env → dev grant fallback
  //   - loading: RC is fetching customer info / offerings → skeleton UI
  //   - ready: prices come from the App Store offering, never hardcoded
  const rcUnconfigured = rc.status.kind === 'unconfigured';
  const pricesLoading = !rcUnconfigured && !activePackage;

  // Self-hosters get Pro automatically — no paywall. Detected client-side
  // from `backendConfig().custom`: if the user has saved a custom Convex
  // deployment via Server Config, they own the infrastructure and all
  // gated features unlock.
  const selfHosted = useIsSelfHosted();
  const isPro = selfHosted || plan?.tier === 'pro';

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
          'Pro granted (dev mode)',
          "RevenueCat isn't configured — falling back to a 30-day dev grant."
        );
        router.back();
        return;
      }
      if (!activePackage) {
        haptic.warning();
        Alert.alert(
          'Pricing unavailable',
          "Couldn't load App Store pricing. Check your connection and try again."
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
      Alert.alert('Purchase failed', (err as Error).message ?? 'Try again later.');
    } finally {
      setBusy(false);
    }
  }

  async function restorePurchases() {
    if (busy) return;
    setBusy(true);
    try {
      if (rcUnconfigured) {
        Alert.alert(
          'Not configured',
          'Sign in via the App Store on a real device to restore purchases.'
        );
        return;
      }
      await rc.restorePurchases();
      try {
        await reconcile({});
      } catch {
        /* webhook fallback */
      }
      haptic.success();
      Alert.alert('Restored', 'Your subscription has been re-linked to this device.');
    } catch (err) {
      Alert.alert('Restore failed', (err as Error).message ?? 'Try again later.');
    } finally {
      setBusy(false);
    }
  }

  async function fakeCancel() {
    haptic.warning();
    Alert.alert('Downgrade?', 'Return to the free tier?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Downgrade',
        style: 'destructive',
        onPress: async () => {
          await downgrade({});
          router.back();
        }
      }
    ]);
  }

  // Prices come straight from the App Store offering — no hardcoded fallbacks
  // that could mismatch regional pricing or drift when prices change. While RC
  // is still fetching, the price block renders a skeleton.
  const price = activePackage
    ? {
        headline: activePackage.product.priceString,
        caption:
          cycle === 'yearly'
            ? `${activePackage.product.priceString} per year`
            : `${activePackage.product.priceString} per month`
      }
    : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.grouped }}>
      <View style={{ flex: 1 }}>
        <Hero insetTop={insets.top} accent={colors.accent} />

        <View
          style={{
            flex: 1,
            paddingHorizontal: spacing.xl,
            gap: spacing.md,
            marginTop: -20,
            justifyContent: 'space-between',
            paddingBottom: spacing.sm
          }}
        >
          <View
            style={{
              backgroundColor: colors.cell,
              borderRadius: radius.xl,
              borderCurve: 'continuous',
              paddingVertical: spacing.sm + 2,
              paddingHorizontal: spacing.md,
              gap: spacing.sm,
              boxShadow: '0px 6px 14px rgba(0, 0, 0, 0.18)'
            }}
          >
            {PERKS.map((p) => (
              <View
                key={p.title}
                accessible
                accessibilityLabel={`${p.title}. ${p.body}`}
                style={{
                  flexDirection: 'row',
                  gap: spacing.sm,
                  alignItems: 'center'
                }}
              >
                <View
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 15,
                    backgroundColor: tintBg(colors.accent),
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <SymbolView name={p.icon} size={15} tintColor={colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      ...type.footnote,
                      color: colors.label,
                      fontWeight: '600'
                    }}
                  >
                    {p.title}
                  </Text>
                  <Text
                    style={{
                      ...type.caption2,
                      color: colors.secondaryLabel,
                      marginTop: 1
                    }}
                    numberOfLines={2}
                  >
                    {p.body}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          {selfHosted ? (
            <View
              style={{
                padding: spacing.lg,
                borderRadius: radius.lg,
                borderCurve: 'continuous',
                backgroundColor: tintBg(colors.success, '18'),
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md
              }}
            >
              <SymbolView name="server.rack" size={22} tintColor={colors.success} />
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    ...type.footnote,
                    color: colors.success,
                    fontWeight: '700'
                  }}
                >
                  Self-hosted — everything unlocked
                </Text>
                <Text
                  style={{
                    ...type.caption1,
                    color: colors.secondaryLabel,
                    marginTop: 2
                  }}
                >
                  You're running pushr on your own Convex deployment. All Pro
                  features are active, no subscription required.
                </Text>
              </View>
            </View>
          ) : !isPro ? (
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <PricingCard
                label="Monthly"
                price={monthly?.product.priceString ?? null}
                period="/month"
                active={cycle === 'monthly'}
                onPress={() => {
                  haptic.selection();
                  setCycle('monthly');
                }}
                loading={pricesLoading && !monthly}
              />
              <PricingCard
                label="Yearly"
                price={yearly?.product.priceString ?? null}
                period="/year"
                secondary={
                  yearly
                    ? `${perMonthEquiv(yearly.product.priceString)}/month`
                    : undefined
                }
                badge="SAVE 40%"
                active={cycle === 'yearly'}
                onPress={() => {
                  haptic.selection();
                  setCycle('yearly');
                }}
                loading={pricesLoading && !yearly}
              />
            </View>
          ) : (
            <View
              style={{
                padding: spacing.md,
                borderRadius: radius.md,
                borderCurve: 'continuous',
                backgroundColor: tintBg(colors.success, '18'),
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.sm
              }}
            >
              <SymbolView name="checkmark.circle.fill" size={20} tintColor={colors.success} />
              <Text
                style={{
                  ...type.footnote,
                  color: colors.success,
                  fontWeight: '600',
                  flex: 1
                }}
              >
                You're on Pro
                {plan?.proUntil ? ` until ${new Date(plan.proUntil).toLocaleDateString()}` : ''}.
              </Text>
            </View>
          )}
        </View>
      </View>

      <View
        style={{
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.sm,
          paddingBottom: Math.max(insets.bottom, spacing.md),
          gap: 4,
          backgroundColor: colors.background
        }}
      >
        {selfHosted ? (
          <Button title="Close" variant="secondary" onPress={() => router.back()} />
        ) : isPro ? (
          <Button title="Downgrade to free" variant="secondary" onPress={fakeCancel} />
        ) : (
          <>
            <Button
              title={
                busy ? 'Working…' : pricesLoading ? 'Loading prices…' : 'Start 7-day free trial'
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
              style={{ alignSelf: 'center', paddingVertical: 4 }}
            >
              <Text
                style={{
                  ...type.caption1,
                  color: colors.accent,
                  fontWeight: '600'
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
            textAlign: 'center'
          }}
        >
          {selfHosted
            ? 'Thanks for self-hosting pushr.'
            : isPro
              ? 'Cancel anytime.'
              : price
                ? `7 days free, then ${price.caption}. Cancel anytime. Self-hosted pushr stays free forever.`
                : 'Cancel anytime. Self-hosted pushr stays free forever.'}
        </Text>
      </View>

      <DrawerHeader
        title="pushr Pro"
        floating
        safeAreaTop={insets.top}
        hideTitle
        closeAlign="right"
      />
    </View>
  );
}

const AnimatedRadialGradient = Animated.createAnimatedComponent(RadialGradient);

function Hero({ insetTop, accent }: { insetTop: number; accent: string }) {
  // Slowly drift the radial bloom's center on a sin/cos curve so the hero
  // feels alive without being distracting. ~14s round trip, infinite.
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(
      withTiming(1, { duration: 14000, easing: Easing.inOut(Easing.sin) }),
      -1,
      true
    );
  }, [t]);

  const bloomProps = useAnimatedProps(() => {
    const phase = t.value * 2 * Math.PI;
    return {
      cx: 50 + Math.sin(phase) * 22,
      cy: 22 + Math.cos(phase * 0.7) * 10,
      fx: 50 + Math.sin(phase) * 22,
      fy: 22 + Math.cos(phase * 0.7) * 10
    };
  });

  return (
    <View
      style={{
        backgroundColor: HERO_BG,
        paddingTop: insetTop + spacing.lg,
        paddingBottom: spacing.lg + spacing.md,
        paddingHorizontal: spacing.xl,
        overflow: 'hidden'
      }}
    >
      <Svg
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
        preserveAspectRatio="none"
        viewBox="0 0 100 100"
      >
        <Defs>
          <AnimatedRadialGradient
            id="upgrade-bloom"
            rx="85"
            ry="90"
            gradientUnits="userSpaceOnUse"
            animatedProps={bloomProps}
          >
            <Stop offset="0" stopColor={accent} stopOpacity={0.7} />
            <Stop offset="0.5" stopColor={accent} stopOpacity={0.2} />
            <Stop offset="1" stopColor={accent} stopOpacity={0} />
          </AnimatedRadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" fill="url(#upgrade-bloom)" />
      </Svg>
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(10,15,22,0)', 'rgba(10,15,22,0.4)', HERO_BG]}
        locations={[0.5, 0.85, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View style={{ alignItems: 'center', gap: spacing.xs }}>
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(255,255,255,0.1)',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.15)'
          }}
        >
          <SymbolView name="sparkles" size={28} tintColor="#FFFFFF" />
        </View>
        <Text
          style={{
            fontSize: 28,
            lineHeight: 34,
            fontWeight: '700',
            color: '#FFFFFF',
            letterSpacing: 0.3,
            textAlign: 'center'
          }}
        >
          pushr <Text style={{ color: accent }}>Pro</Text>
        </Text>
        <Text
          style={{
            ...type.footnote,
            color: 'rgba(255,255,255,0.7)',
            textAlign: 'center',
            maxWidth: 280
          }}
        >
          Everything you need to push with power. Self-hosting stays free forever.
        </Text>
      </View>
    </View>
  );
}

/**
 * Compact per-cycle pricing card. Two of these sit side-by-side in place of
 * the old toggle + single-price layout. Active card gets an accent ring;
 * Yearly card carries a `SAVE 40%` chip absolute-positioned top-right.
 */
function PricingCard({
  label,
  price,
  period,
  secondary,
  badge,
  active,
  loading,
  onPress
}: {
  label: string;
  price: string | null;
  period: string;
  secondary?: string;
  badge?: string;
  active: boolean;
  loading?: boolean;
  onPress: () => void;
}) {
  const { colors, tintBg } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label} ${price ?? ''}`}
      accessibilityState={{ selected: active }}
      style={({ pressed }) => ({
        flex: 1,
        backgroundColor: colors.cell,
        borderRadius: radius.lg,
        borderCurve: 'continuous',
        borderWidth: 1.5,
        borderColor: active ? colors.accent : 'transparent',
        padding: spacing.md,
        gap: 2,
        opacity: pressed ? 0.85 : 1
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={{ ...type.footnote, color: colors.label, fontWeight: '600' }}>{label}</Text>
        {badge && (
          <View
            style={{
              backgroundColor: tintBg(colors.success),
              paddingHorizontal: 6,
              paddingVertical: 2,
              borderRadius: radius.xs
            }}
          >
            <Text
              style={{
                ...type.caption2,
                color: colors.success,
                fontWeight: '700',
                letterSpacing: 0.3
              }}
            >
              {badge}
            </Text>
          </View>
        )}
      </View>
      {loading || !price ? (
        <View
          style={{
            width: 72,
            height: 22,
            borderRadius: 4,
            backgroundColor: colors.fill,
            marginTop: 2
          }}
        />
      ) : (
        <Text
          style={{
            ...type.title3,
            color: colors.label,
            fontWeight: '700',
            fontVariant: ['tabular-nums']
          }}
          numberOfLines={1}
        >
          {price}
          <Text style={{ ...type.caption1, color: colors.secondaryLabel, fontWeight: '500' }}>
            {' '}
            {period}
          </Text>
        </Text>
      )}
      {secondary && !loading && (
        <Text style={{ ...type.caption1, color: colors.tertiaryLabel }} numberOfLines={1}>
          {secondary}
        </Text>
      )}
    </Pressable>
  );
}

/**
 * Compute the monthly equivalent from a yearly priceString by parsing out
 * the currency symbol + number, dividing by 12, and reassembling. Falls
 * back to the original string if the format is unrecognized.
 */
function perMonthEquiv(yearlyPriceString: string): string {
  const match = yearlyPriceString.match(/^(\D*)([\d,.]+)(\D*)$/);
  if (!match) return yearlyPriceString;
  const [, prefix, num, suffix] = match;
  const normalized = num.replace(/,/g, '');
  const value = parseFloat(normalized);
  if (!isFinite(value)) return yearlyPriceString;
  const per = value / 12;
  return `${prefix}${per.toFixed(2)}${suffix}`;
}
