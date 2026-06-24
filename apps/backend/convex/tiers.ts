import { v, ConvexError } from 'convex/values';
import { mutation, query, internalMutation, internalQuery } from './_generated/server';
import type { QueryCtx, MutationCtx } from './_generated/server';
import { requireAuth, requireAuthIdentity } from './lib/auth';

/**
 * pushr subscription tiers. Centralizes limits + helpers so /notify,
 * sourceApps.create, retention cron, and UI all read from one source.
 */

export type Tier = 'free' | 'pro';

export const TIER_LIMITS = {
  free: {
    pushesPerMonth: 100,
    sourceApps: 1,
    historyDays: 7,
    // Max number of other users you can share each source app with — counts
    // accepted members + outstanding pending invites combined.
    sharedUsersPerApp: 1
  },
  pro: {
    pushesPerMonth: 10_000,
    sourceApps: Number.POSITIVE_INFINITY,
    historyDays: 90,
    sharedUsersPerApp: Number.POSITIVE_INFINITY
  }
} as const;

/** UTC "YYYY-MM" bucket for the current month. */
export function currentYearMonth(now = Date.now()): string {
  const d = new Date(now);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Admin accounts that get permanent Pro. Configured via the `ADMIN_EMAILS`
 * Convex env var (comma-separated, case-insensitive), e.g.
 *   npx convex env set ADMIN_EMAILS admin@pushr.sh
 */
function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null): boolean {
  if (!email) return false;
  return adminEmails().includes(email.toLowerCase());
}

/** Resolve a user's effective tier, honoring `proUntil` expiration. */
export async function getEffectiveTier(
  ctx: QueryCtx | MutationCtx,
  ownerId: string
): Promise<Tier> {
  const row = await ctx.db
    .query('userTiers')
    .withIndex('by_owner', (q) => q.eq('ownerId', ownerId))
    .unique();
  if (!row) return 'free';
  if (row.tier === 'pro') {
    if (row.proUntil === undefined || row.proUntil > Date.now()) {
      return 'pro';
    }
  }
  return 'free';
}

/** Current-month push count for a user. */
export async function getMonthlyUsage(
  ctx: QueryCtx | MutationCtx,
  ownerId: string
): Promise<number> {
  const yearMonth = currentYearMonth();
  const row = await ctx.db
    .query('usageCounters')
    .withIndex('by_owner_month', (q) => q.eq('ownerId', ownerId).eq('yearMonth', yearMonth))
    .unique();
  return row?.count ?? 0;
}

/**
 * Atomically bump the push counter. Returns the post-increment count.
 * Called by /notify immediately after we accept a message.
 */
export async function incrementMonthlyUsage(ctx: MutationCtx, ownerId: string): Promise<number> {
  const yearMonth = currentYearMonth();
  const existing = await ctx.db
    .query('usageCounters')
    .withIndex('by_owner_month', (q) => q.eq('ownerId', ownerId).eq('yearMonth', yearMonth))
    .unique();
  if (existing) {
    const next = existing.count + 1;
    await ctx.db.patch(existing._id, { count: next });
    return next;
  }
  await ctx.db.insert('usageCounters', { ownerId, yearMonth, count: 1 });
  return 1;
}

/**
 * Public query: the caller's tier + this-month usage. Drives the Settings
 * plan section and quota banners in the UI.
 */
export const getMyPlan = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireAuth(ctx);
    const tier = await getEffectiveTier(ctx, ownerId);
    const limits = TIER_LIMITS[tier];
    const pushesThisMonth = await getMonthlyUsage(ctx, ownerId);
    const sourceAppCount = (
      await ctx.db
        .query('sourceApps')
        .withIndex('by_owner', (q) => q.eq('ownerId', ownerId))
        .collect()
    ).filter((a) => !a.revokedAt).length;
    const row = await ctx.db
      .query('userTiers')
      .withIndex('by_owner', (q) => q.eq('ownerId', ownerId))
      .unique();
    return {
      tier,
      pushesPerMonth: limits.pushesPerMonth,
      pushesThisMonth,
      sourceAppLimit: Number.isFinite(limits.sourceApps) ? limits.sourceApps : null,
      sourceAppCount,
      sharedUsersPerAppLimit: Number.isFinite(limits.sharedUsersPerApp)
        ? limits.sharedUsersPerApp
        : null,
      historyDays: limits.historyDays,
      proUntil: row?.proUntil ?? null
    };
  }
});

/**
 * Development-only: grant pro to the current user. Ship with a real billing
 * integration (RevenueCat webhook) before launch; for now this exists so the
 * plumbing is testable end-to-end.
 */
export const grantProToMe = mutation({
  args: { days: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const ownerId = await requireAuth(ctx);
    const proUntil =
      args.days !== undefined ? Date.now() + args.days * 24 * 60 * 60 * 1000 : undefined;
    const existing = await ctx.db
      .query('userTiers')
      .withIndex('by_owner', (q) => q.eq('ownerId', ownerId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        tier: 'pro',
        proUntil,
        updatedAt: Date.now()
      });
    } else {
      await ctx.db.insert('userTiers', {
        ownerId,
        tier: 'pro',
        proUntil,
        updatedAt: Date.now()
      });
    }
  }
});

/**
 * Idempotently reconcile the caller's plan. Today this grants permanent Pro
 * (no expiry) to accounts whose email is in `ADMIN_EMAILS`. Safe for any user
 * to call — non-admins are a no-op. The mobile app calls this once per cold
 * start so the admin's `userTiers` row stays Pro-for-life, which makes every
 * tier check (UI, /notify quota, source-app limits) honor it since they all
 * resolve through `getEffectiveTier`.
 */
export const syncMyPlan = mutation({
  args: {},
  returns: v.object({ admin: v.boolean() }),
  handler: async (ctx) => {
    const { userId, email } = await requireAuthIdentity(ctx);
    if (!isAdminEmail(email)) {
      return { admin: false };
    }
    const existing = await ctx.db
      .query('userTiers')
      .withIndex('by_owner', (q) => q.eq('ownerId', userId))
      .unique();
    // Permanent Pro = tier 'pro' with no `proUntil`. Only write when the row
    // isn't already in that state, to avoid needless mutations on every boot.
    if (existing) {
      if (existing.tier !== 'pro' || existing.proUntil !== undefined) {
        await ctx.db.patch(existing._id, {
          tier: 'pro',
          proUntil: undefined,
          updatedAt: Date.now()
        });
      }
    } else {
      await ctx.db.insert('userTiers', {
        ownerId: userId,
        tier: 'pro',
        proUntil: undefined,
        updatedAt: Date.now()
      });
    }
    return { admin: true };
  }
});

export const downgradeMe = mutation({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireAuth(ctx);
    const existing = await ctx.db
      .query('userTiers')
      .withIndex('by_owner', (q) => q.eq('ownerId', ownerId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        tier: 'free',
        proUntil: undefined,
        updatedAt: Date.now()
      });
    }
  }
});

/** Internal: used by /notify to check + bump usage in one transaction. */
export const checkAndIncrementUsage = internalMutation({
  args: { ownerId: v.string() },
  returns: v.object({
    allowed: v.boolean(),
    tier: v.union(v.literal('free'), v.literal('pro')),
    count: v.number(),
    limit: v.number()
  }),
  handler: async (ctx, args) => {
    const tier = await getEffectiveTier(ctx, args.ownerId);
    const limit = TIER_LIMITS[tier].pushesPerMonth;
    const current = await getMonthlyUsage(ctx, args.ownerId);
    if (current >= limit) {
      return { allowed: false, tier, count: current, limit };
    }
    const next = await incrementMonthlyUsage(ctx, args.ownerId);
    return { allowed: true, tier, count: next, limit };
  }
});

/** Internal: read-only tier + limits for sourceApps.create. */
export const getTierForOwner = internalQuery({
  args: { ownerId: v.string() },
  returns: v.object({
    tier: v.union(v.literal('free'), v.literal('pro')),
    sourceAppLimit: v.number()
  }),
  handler: async (ctx, args) => {
    const tier = await getEffectiveTier(ctx, args.ownerId);
    const limit = TIER_LIMITS[tier].sourceApps;
    return {
      tier,
      sourceAppLimit: Number.isFinite(limit) ? limit : Number.MAX_SAFE_INTEGER
    };
  }
});

/** Convenience thrown by enforcement checks. */
export function quotaExceeded(
  tier: Tier,
  count: number,
  limit: number
): ConvexError<{ code: string; message: string; tier: Tier; count: number; limit: number }> {
  return new ConvexError({
    code: 'QUOTA_EXCEEDED',
    message: `Monthly push quota exceeded (${count}/${limit}). Upgrade to Pro for a higher limit.`,
    tier,
    count,
    limit
  });
}
