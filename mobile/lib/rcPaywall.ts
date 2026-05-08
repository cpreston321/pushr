/**
 * Optional bridge to RevenueCat's prebuilt paywall (`react-native-purchases-ui`).
 *
 * We don't ship a hard dependency on `react-native-purchases-ui` — it requires
 * a native rebuild (and a paywall configured in the RC dashboard) to render
 * anything. Until those are in place, calls to `presentRcPaywall()` return
 * `false` and callers fall back to the in-house `app/upgrade.tsx` screen.
 *
 * To enable:
 *   1. `bun add react-native-purchases-ui`
 *   2. `bun run ios:dev` (prebuild + rebuild)
 *   3. Configure a paywall for the "pro" entitlement in the RevenueCat dashboard.
 *   4. Replace the body of `presentRcPaywall` below with:
 *        const RevenueCatUI = await import("react-native-purchases-ui");
 *        const result = await RevenueCatUI.default.presentPaywallIfNeeded({
 *          requiredEntitlementIdentifier: "pro",
 *        });
 *        return result === "PURCHASED" || result === "RESTORED";
 */
export async function presentRcPaywall(): Promise<boolean> {
  return false;
}
