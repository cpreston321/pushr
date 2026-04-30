// region: tier-features — entire file removed by scripts/publish-public.sh
/**
 * In-app purchase / RevenueCat plumbing.
 *
 * The webhook handler in convex/http.ts normalizes RevenueCat events and
 * calls `applyEvent`, which:
 *   1. Deduplicates by `eventId` (RevenueCat retries on non-2xx).
 *   2. Logs the raw payload to `iapEvents`.
 *   3. Updates `userTiers` for grant-style events.
 *
 * Informational events (CANCELLATION, EXPIRATION, BILLING_ISSUE, …) are
 * recorded but don't touch `proUntil` — `getEffectiveTier` already returns
 * "free" once `proUntil < Date.now()`.
 */

import { v, ConvexError } from "convex/values";
import { action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAuth } from "./lib/auth";

/**
 * Event types that grant or extend pro access. Anything not in this set is
 * treated as informational. Names match RevenueCat webhook v2 event types.
 */
const GRANT_EVENTS = new Set<string>([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "PRODUCT_CHANGE",
  "UNCANCELLATION",
  "NON_RENEWING_PURCHASE",
  "SUBSCRIPTION_EXTENDED",
  "TEMPORARY_ENTITLEMENT_GRANT",
]);

export const applyEvent = internalMutation({
  args: {
    eventId: v.string(),
    eventType: v.string(),
    ownerId: v.string(),
    productId: v.optional(v.string()),
    originalTransactionId: v.optional(v.string()),
    /** Subscription expiration in ms-epoch. Undefined ≈ lifetime / non-renewing. */
    expirationAtMs: v.optional(v.number()),
    eventTimestampMs: v.number(),
    payload: v.any(),
  },
  returns: v.object({
    applied: v.boolean(),
    duplicate: v.boolean(),
    grant: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const dup = await ctx.db
      .query("iapEvents")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .unique();
    if (dup) {
      return { applied: false, duplicate: true, grant: false };
    }

    await ctx.db.insert("iapEvents", {
      eventId: args.eventId,
      ownerId: args.ownerId,
      eventType: args.eventType,
      productId: args.productId,
      expirationAtMs: args.expirationAtMs,
      payload: args.payload,
      receivedAt: Date.now(),
    });

    const tier = await ctx.db
      .query("userTiers")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
      .unique();

    const grant = GRANT_EVENTS.has(args.eventType);

    if (grant) {
      // Never shorten an existing proUntil — out-of-order webhook delivery
      // (rare but possible) shouldn't downgrade an active subscriber.
      const nextProUntil =
        args.expirationAtMs === undefined
          ? tier?.proUntil
          : tier?.proUntil === undefined
            ? args.expirationAtMs
            : Math.max(tier.proUntil, args.expirationAtMs);

      const baseUpdate = {
        tier: "pro" as const,
        proUntil: nextProUntil,
        externalId: args.ownerId,
        productId: args.productId ?? tier?.productId,
        originalTransactionId:
          args.originalTransactionId ?? tier?.originalTransactionId,
        lastEventId: args.eventId,
        lastEventAt: args.eventTimestampMs,
        updatedAt: Date.now(),
      };

      if (tier) {
        await ctx.db.patch(tier._id, baseUpdate);
      } else {
        await ctx.db.insert("userTiers", {
          ownerId: args.ownerId,
          ...baseUpdate,
        });
      }
      return { applied: true, duplicate: false, grant: true };
    }

    // Informational event — record provenance, leave tier/proUntil alone.
    if (tier) {
      await ctx.db.patch(tier._id, {
        lastEventId: args.eventId,
        lastEventAt: args.eventTimestampMs,
        updatedAt: Date.now(),
      });
    }
    return { applied: true, duplicate: false, grant: false };
  },
});

/**
 * Cold-start reconcile.
 *
 * Asks RevenueCat (server-side, REST API v2) for the authenticated user's
 * active entitlements and ensures `userTiers` reflects them. Only ever
 * EXTENDS access — natural `proUntil` expiry handles downgrades, so a
 * stale RC response can never accidentally revoke a paying user.
 *
 * Mobile calls this on app start (and after a successful purchase) so a
 * dropped webhook or new-device install doesn't strand a paying user on
 * the free tier.
 *
 * Required env on the Convex deployment:
 *   REVENUECAT_REST_API_KEY  — a v2 secret API key with read scope on
 *                              customers (v1 keys are NOT accepted by v2).
 *   REVENUECAT_PROJECT_ID    — the project id from app.revenuecat.com.
 *   REVENUECAT_PRO_ENTITLEMENT_ID (optional) — internal entitlement id
 *     (e.g. "entla1b2c3…"). If unset we treat ANY active entitlement as
 *     pro, which is the right default while pushr ships a single tier.
 */
export const reconcile = action({
  args: {},
  returns: v.object({
    tier: v.union(v.literal("free"), v.literal("pro")),
    proUntil: v.union(v.null(), v.number()),
    source: v.literal("reconcile"),
  }),
  handler: async (ctx) => {
    const ownerId = await requireAuth(ctx);
    const apiKey = process.env.REVENUECAT_REST_API_KEY;
    const projectId = process.env.REVENUECAT_PROJECT_ID;
    if (!apiKey) {
      throw new ConvexError("REVENUECAT_REST_API_KEY not set on deployment");
    }
    if (!projectId) {
      throw new ConvexError("REVENUECAT_PROJECT_ID not set on deployment");
    }
    const proEntitlementId = process.env.REVENUECAT_PRO_ENTITLEMENT_ID;

    const url =
      `https://api.revenuecat.com/v2/projects/${encodeURIComponent(projectId)}` +
      `/customers/${encodeURIComponent(ownerId)}/active_entitlements`;
    const res = await fetch(url, {
      headers: {
        authorization: `Bearer ${apiKey}`,
        accept: "application/json",
      },
    });
    if (!res.ok) {
      // 404 means RC has never seen this user — that's fine, they're free.
      if (res.status === 404) {
        return { tier: "free" as const, proUntil: null, source: "reconcile" as const };
      }
      throw new ConvexError(`RevenueCat reconcile failed: HTTP ${res.status}`);
    }

    type ActiveEntitlement = {
      object: "customer.active_entitlement";
      entitlement_id: string;
      expires_at?: number | null;
    };
    const payload = (await res.json()) as {
      object?: "list";
      items?: ActiveEntitlement[];
    };
    const items = payload.items ?? [];
    const matching = proEntitlementId
      ? items.filter((it) => it.entitlement_id === proEntitlementId)
      : items;
    if (matching.length === 0) {
      return { tier: "free" as const, proUntil: null, source: "reconcile" as const };
    }

    // Pick the latest expiration across matching entitlements; null/undefined
    // means lifetime / non-renewing — treat as the longest possible window.
    let expirationAtMs: number | undefined = undefined;
    let lifetime = false;
    for (const it of matching) {
      if (it.expires_at === null || it.expires_at === undefined) {
        lifetime = true;
        break;
      }
      if (expirationAtMs === undefined || it.expires_at > expirationAtMs) {
        expirationAtMs = it.expires_at;
      }
    }
    if (lifetime) expirationAtMs = undefined;

    // If RC says all matching are expired, don't grant. getEffectiveTier
    // handles natural downgrade once Convex's own proUntil passes.
    if (
      !lifetime &&
      expirationAtMs !== undefined &&
      expirationAtMs < Date.now()
    ) {
      return { tier: "free" as const, proUntil: null, source: "reconcile" as const };
    }

    await ctx.runMutation(internal.iap.setFromReconcile, {
      ownerId,
      productId: undefined,
      expirationAtMs,
    });
    return {
      tier: "pro" as const,
      proUntil: expirationAtMs ?? null,
      source: "reconcile" as const,
    };
  },
});

/**
 * Internal helper used by `reconcile`. Mirrors the upsert logic in
 * `applyEvent` but skips the `iapEvents` audit (no event id available)
 * and never shortens an existing window.
 */
export const setFromReconcile = internalMutation({
  args: {
    ownerId: v.string(),
    productId: v.optional(v.string()),
    expirationAtMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const tier = await ctx.db
      .query("userTiers")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
      .unique();

    const nextProUntil =
      args.expirationAtMs === undefined
        ? tier?.proUntil
        : tier?.proUntil === undefined
          ? args.expirationAtMs
          : Math.max(tier.proUntil, args.expirationAtMs);

    const baseUpdate = {
      tier: "pro" as const,
      proUntil: nextProUntil,
      externalId: args.ownerId,
      productId: args.productId ?? tier?.productId,
      updatedAt: Date.now(),
    };

    if (tier) {
      await ctx.db.patch(tier._id, baseUpdate);
    } else {
      await ctx.db.insert("userTiers", {
        ownerId: args.ownerId,
        ...baseUpdate,
      });
    }
  },
});
// endregion: tier-features
