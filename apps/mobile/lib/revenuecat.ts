import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type MakePurchaseResult,
  type PurchasesOfferings,
  type PurchasesPackage
} from 'react-native-purchases';

/**
 * RevenueCat client wiring for pushr.
 *
 * The SDK is configured exactly once per process with the user's Better Auth
 * subject as the RevenueCat `appUserID` — this is what lets the server-side
 * webhook + reconcile path find the right `userTiers` row.
 *
 * If `EXPO_PUBLIC_REVENUECAT_IOS_KEY` (or the Android equivalent) is missing
 * the hook returns `{ kind: "unconfigured" }` so dev builds without billing
 * configured stay usable instead of crashing.
 */

const ENTITLEMENT_PRO = 'pro';

const apiKey: string | undefined =
  Platform.OS === 'ios'
    ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY
    : Platform.OS === 'android'
      ? process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY
      : undefined;

let configured = false;
let configuredFor: string | null = null;

async function ensureConfigured(ownerId: string): Promise<boolean> {
  if (!apiKey) return false;
  if (!configured) {
    if (__DEV__) await Purchases.setLogLevel(LOG_LEVEL.WARN);
    Purchases.configure({ apiKey, appUserID: ownerId });
    configured = true;
    configuredFor = ownerId;
    return true;
  }
  if (configuredFor !== ownerId) {
    await Purchases.logIn(ownerId);
    configuredFor = ownerId;
  }
  return true;
}

const isPro = (info: CustomerInfo): boolean => Boolean(info.entitlements.active[ENTITLEMENT_PRO]);

export type RcStatus =
  | { kind: 'loading' }
  | { kind: 'unconfigured'; reason: 'no-api-key' | 'error'; error?: Error }
  | {
      kind: 'ready';
      isPro: boolean;
      customerInfo: CustomerInfo;
      offerings: PurchasesOfferings | null;
    };

export interface RcContext {
  status: RcStatus;
  /** Buy a package; throws on failure. Caller should check `userCancelled`. */
  purchase: (pkg: PurchasesPackage) => Promise<MakePurchaseResult>;
  /** Re-link App Store / Play Store purchases to the current appUserID. */
  restorePurchases: () => Promise<CustomerInfo>;
  /** Force a fresh customerInfo + offerings fetch. */
  refresh: () => Promise<void>;
}

/**
 * Hook that boots RevenueCat for the given ownerId and exposes purchase /
 * restore / refresh. Pass `undefined` while auth is still resolving.
 */
export function useRevenueCat(ownerId: string | undefined): RcContext {
  const [status, setStatus] = useState<RcStatus>({ kind: 'loading' });

  const applyInfo = useCallback((info: CustomerInfo, offerings: PurchasesOfferings | null) => {
    setStatus({
      kind: 'ready',
      isPro: isPro(info),
      customerInfo: info,
      offerings
    });
  }, []);

  const refresh = useCallback(async () => {
    if (!apiKey || !configured) return;
    const [info, offerings] = await Promise.all([
      Purchases.getCustomerInfo(),
      Purchases.getOfferings().catch(() => null)
    ]);
    applyInfo(info, offerings);
  }, [applyInfo]);

  useEffect(() => {
    if (!ownerId) return;
    let cancelled = false;
    let listener: ((info: CustomerInfo) => void) | null = null;

    (async () => {
      const ok = await ensureConfigured(ownerId);
      if (!ok) {
        if (!cancelled) {
          setStatus({ kind: 'unconfigured', reason: 'no-api-key' });
        }
        return;
      }
      try {
        const [info, offerings] = await Promise.all([
          Purchases.getCustomerInfo(),
          Purchases.getOfferings().catch(() => null)
        ]);
        if (cancelled) return;
        applyInfo(info, offerings);
        listener = (next: CustomerInfo) => {
          if (cancelled) return;
          setStatus((s) => ({
            kind: 'ready',
            isPro: isPro(next),
            customerInfo: next,
            offerings: s.kind === 'ready' ? s.offerings : null
          }));
        };
        Purchases.addCustomerInfoUpdateListener(listener);
      } catch (err) {
        if (cancelled) return;
        setStatus({
          kind: 'unconfigured',
          reason: 'error',
          error: err instanceof Error ? err : new Error(String(err))
        });
      }
    })();

    return () => {
      cancelled = true;
      if (listener) Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, [ownerId, applyInfo]);

  const purchase = useCallback(
    async (pkg: PurchasesPackage) => {
      const result = await Purchases.purchasePackage(pkg);
      // Optimistically reflect the new entitlement; the server-side webhook
      // (and a follow-up reconcile call by the caller) will agree shortly.
      applyInfo(result.customerInfo, status.kind === 'ready' ? status.offerings : null);
      return result;
    },
    [applyInfo, status]
  );

  const restorePurchases = useCallback(async () => {
    const info = await Purchases.restorePurchases();
    applyInfo(info, status.kind === 'ready' ? status.offerings : null);
    return info;
  }, [applyInfo, status]);

  return { status, purchase, restorePurchases, refresh };
}

/**
 * Pick a sensible default monthly + yearly package out of the current offering.
 * Matches the ids RevenueCat ships out of the box; falls back to the first
 * two packages if a project uses custom identifiers.
 */
export function pickPackages(offerings: PurchasesOfferings | null): {
  monthly: PurchasesPackage | null;
  yearly: PurchasesPackage | null;
} {
  const current = offerings?.current ?? null;
  if (!current) return { monthly: null, yearly: null };
  const monthly =
    current.monthly ?? current.availablePackages.find((p) => /month/i.test(p.identifier)) ?? null;
  const yearly =
    current.annual ??
    current.availablePackages.find((p) => /year|annual/i.test(p.identifier)) ??
    null;
  return { monthly, yearly };
}
