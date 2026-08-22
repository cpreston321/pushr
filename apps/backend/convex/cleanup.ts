import { v } from 'convex/values';
import { internalMutation } from './_generated/server';
import { internal } from './_generated/api';
// region: tier-features
import { TIER_LIMITS, getEffectiveTier, type Tier } from './tiers';
// endregion: tier-features

/**
 * Scheduled cleanup of stale rows. Wired up in convex/crons.ts.
 *
 * Each sweep reads the oldest batch of rows, deletes those past their
 * retention cutoff, and self-reschedules if the whole batch was stale
 * (implying more stale rows may remain). If any row in the batch is
 * still within retention, we're done — the rest of the table is newer.
 *
 * Batches are small enough to fit comfortably inside a single mutation
 * transaction; the scheduler pattern handles unbounded backlogs.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

// Notification retention is tier-aware (Free: 7 days, Pro: 90 days — see
// `TIER_LIMITS.historyDays`). MIN bounds the early-break: a row younger
// than the shortest tier window is fresh for every tier. MAX bounds the
// "stale regardless of tier" fast path so we can skip the userTiers
// lookup for rows that are obviously past retention.
const MIN_NOTIFICATION_RETAIN_MS = 7 * DAY_MS;
const MAX_NOTIFICATION_RETAIN_MS = 90 * DAY_MS;

// Live Activities — ActivityKit activities don't run for weeks; drop shadow
// rows after 14 days regardless of end state.
const LIVE_ACTIVITY_RETAIN_MS = 14 * DAY_MS;

// Devices marked invalid (DeviceNotRegistered) get purged after 30 days.
// Active devices are never touched here.
const INVALID_DEVICE_RETAIN_MS = 30 * DAY_MS;

// Resolved invites (accepted / declined / canceled) and invites whose
// `expiresAt` has lapsed get purged 30 days after the terminal event. Pending,
// unexpired invites are kept indefinitely.
const INVITE_RETAIN_MS = 30 * DAY_MS;

/**
 * How long a `/notify` idempotency key stays honoured. Past this a retry with
 * the same key creates a new notification — the standard trade for not keeping
 * every key ever issued.
 */
const IDEMPOTENCY_RETAIN_MS = DAY_MS;

// region: tier-features
// RevenueCat events are an audit log; keep ~6 months for debugging /
// duplicate-event detection, then drop the raw payload.
const IAP_EVENT_RETAIN_MS = 180 * DAY_MS;
// endregion: tier-features

// region: tier-features
// Usage counters keep ~13 months so the dashboard can show a 12-month
// trailing view with one month of padding.
const USAGE_COUNTER_RETAIN_MONTHS = 13;
// endregion: tier-features

const BATCH_SIZE = 100;

export const sweepNotifications = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const minFreshFloor = now - MIN_NOTIFICATION_RETAIN_MS;
    const alwaysStaleCutoff = now - MAX_NOTIFICATION_RETAIN_MS;
    const batch = await ctx.db.query('notifications').take(BATCH_SIZE);
    // region: tier-features
    // Cache tier per owner so a batch with many notifications from the same
    // user costs one userTiers read instead of one per row.
    const tierCache = new Map<string, Tier>();
    async function retentionMsFor(ownerId: string): Promise<number> {
      let tier = tierCache.get(ownerId);
      if (tier === undefined) {
        tier = await getEffectiveTier(ctx, ownerId);
        tierCache.set(ownerId, tier);
      }
      return TIER_LIMITS[tier].historyDays * DAY_MS;
    }
    // endregion: tier-features
    let deleted = 0;
    let allStale = true;
    for (const n of batch) {
      // Rows are returned oldest-first; once we hit one fresh for every tier,
      // nothing further could be stale.
      if (n.createdAt >= minFreshFloor) {
        allStale = false;
        break;
      }
      let stale = n.createdAt < alwaysStaleCutoff;
      // region: tier-features
      if (!stale) {
        stale = n.createdAt < now - (await retentionMsFor(n.ownerId));
      }
      // endregion: tier-features
      if (!stale) continue;
      const deliveries = await ctx.db
        .query('deliveries')
        .withIndex('by_notification', (q) => q.eq('notificationId', n._id))
        .collect();
      for (const d of deliveries) await ctx.db.delete(d._id);
      const actionEvents = await ctx.db
        .query('actionEvents')
        .withIndex('by_notification', (q) => q.eq('notificationId', n._id))
        .collect();
      for (const e of actionEvents) await ctx.db.delete(e._id);
      await ctx.db.delete(n._id);
      deleted++;
    }
    // Reschedule only when the whole batch was stale AND we deleted at least
    // one row. If a batch is entirely "stale-for-pro-but-pro-user", deleted
    // is 0 — bailing keeps us from re-fetching the same prefix forever.
    if (allStale && deleted > 0 && batch.length === BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, internal.cleanup.sweepNotifications, {});
    }
    return deleted;
  }
});

export const sweepLiveActivities = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - LIVE_ACTIVITY_RETAIN_MS;
    const batch = await ctx.db.query('liveActivities').take(BATCH_SIZE);
    let deleted = 0;
    for (const row of batch) {
      if (row.startedAt >= cutoff) break;
      await ctx.db.delete(row._id);
      deleted++;
    }
    if (deleted === BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, internal.cleanup.sweepLiveActivities, {});
    }
    return deleted;
  }
});

export const sweepInvalidDevices = internalMutation({
  args: { cursor: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const cutoff = Date.now() - INVALID_DEVICE_RETAIN_MS;
    // No index on invalidatedAt — walk the whole table via `_creationTime`
    // cursor, deleting invalidated devices past retention as we go. Active
    // devices are skipped in-place. Cursor prevents an infinite reschedule
    // on a prefix of all-active rows.
    const q = ctx.db.query('devices');
    const stream =
      args.cursor !== undefined
        ? q.filter((c) => c.gt(c.field('_creationTime'), args.cursor!))
        : q;
    const batch = await stream.take(BATCH_SIZE);
    for (const d of batch) {
      if (d.invalidatedAt !== undefined && d.invalidatedAt < cutoff) {
        await ctx.db.delete(d._id);
      }
    }
    if (batch.length === BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, internal.cleanup.sweepInvalidDevices, {
        cursor: batch[batch.length - 1]._creationTime
      });
    }
    return batch.length;
  }
});

/**
 * Sweep deliveries / actionEvents whose parent notification no longer exists.
 * Before notifications.ts was patched to cascade, direct deletes (deleteOne,
 * clearAll) left children behind — this catches the historical backlog and
 * any future drift from a missed cascade.
 *
 * Walks the table via `_creationTime` cursor so non-orphan-heavy regions
 * don't trap us in an infinite reschedule on the same prefix.
 */
export const sweepOrphanDeliveries = internalMutation({
  args: { cursor: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const q = ctx.db.query('deliveries');
    const stream =
      args.cursor !== undefined
        ? q.filter((c) => c.gt(c.field('_creationTime'), args.cursor!))
        : q;
    const batch = await stream.take(BATCH_SIZE);
    let deleted = 0;
    for (const d of batch) {
      const parent = await ctx.db.get(d.notificationId);
      if (parent === null) {
        await ctx.db.delete(d._id);
        deleted++;
      }
    }
    if (batch.length === BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, internal.cleanup.sweepOrphanDeliveries, {
        cursor: batch[batch.length - 1]._creationTime
      });
    }
    return deleted;
  }
});

export const sweepOrphanActionEvents = internalMutation({
  args: { cursor: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const q = ctx.db.query('actionEvents');
    const stream =
      args.cursor !== undefined
        ? q.filter((c) => c.gt(c.field('_creationTime'), args.cursor!))
        : q;
    const batch = await stream.take(BATCH_SIZE);
    let deleted = 0;
    for (const e of batch) {
      const parent = await ctx.db.get(e.notificationId);
      if (parent === null) {
        await ctx.db.delete(e._id);
        deleted++;
      }
    }
    if (batch.length === BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, internal.cleanup.sweepOrphanActionEvents, {
        cursor: batch[batch.length - 1]._creationTime
      });
    }
    return deleted;
  }
});

/**
 * `/notify` replay guards. 24h is the conventional window: long enough to
 * cover a retrying cron or webhook receiver, short enough that the table
 * doesn't grow with every push forever.
 */
export const sweepIdempotencyKeys = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - IDEMPOTENCY_RETAIN_MS;
    const batch = await ctx.db.query('idempotencyKeys').take(BATCH_SIZE);
    let deleted = 0;
    let allStale = true;
    for (const row of batch) {
      if (row.createdAt >= cutoff) {
        allStale = false;
        continue;
      }
      await ctx.db.delete(row._id);
      deleted++;
    }
    if (allStale && deleted > 0 && batch.length === BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, internal.cleanup.sweepIdempotencyKeys, {});
    }
    return deleted;
  }
});

export const sweepInvites = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const cutoff = now - INVITE_RETAIN_MS;
    const batch = await ctx.db.query('sourceAppInvites').take(BATCH_SIZE);
    let deleted = 0;
    let allStale = true;
    for (const invite of batch) {
      // Any deletable invite must have been created at least INVITE_RETAIN_MS
      // ago (the terminal event can't precede creation). Once we hit a fresh
      // row, nothing later in the table can qualify either.
      if (invite._creationTime >= cutoff) {
        allStale = false;
        break;
      }
      const terminalAt =
        invite.acceptedAt ??
        invite.declinedAt ??
        invite.canceledAt ??
        (invite.expiresAt < now ? invite.expiresAt : undefined);
      if (terminalAt === undefined || terminalAt >= cutoff) continue;
      await ctx.db.delete(invite._id);
      deleted++;
    }
    if (allStale && deleted > 0 && batch.length === BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, internal.cleanup.sweepInvites, {});
    await ctx.scheduler.runAfter(0, internal.cleanup.sweepIdempotencyKeys, {});
    }
    return deleted;
  }
});

// region: tier-features
export const sweepIapEvents = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - IAP_EVENT_RETAIN_MS;
    const batch = await ctx.db.query('iapEvents').take(BATCH_SIZE);
    let deleted = 0;
    for (const row of batch) {
      if (row.receivedAt >= cutoff) break;
      await ctx.db.delete(row._id);
      deleted++;
    }
    if (deleted === BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, internal.cleanup.sweepIapEvents, {});
    }
    return deleted;
  }
});

export const sweepUsageCounters = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = new Date();
    // Cutoff = first of the month N months ago. Anything strictly older gets
    // dropped. yearMonth is "YYYY-MM" — lexicographic comparison works.
    const cutoffDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - USAGE_COUNTER_RETAIN_MONTHS, 1)
    );
    const cutoffYm = `${cutoffDate.getUTCFullYear()}-${String(
      cutoffDate.getUTCMonth() + 1
    ).padStart(2, '0')}`;
    const batch = await ctx.db.query('usageCounters').take(BATCH_SIZE);
    let deleted = 0;
    for (const row of batch) {
      if (row.yearMonth < cutoffYm) {
        await ctx.db.delete(row._id);
        deleted++;
      }
    }
    if (deleted === BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, internal.cleanup.sweepUsageCounters, {});
    }
    return deleted;
  }
});
// endregion: tier-features

/**
 * Entry point kicked off by the cron. Fires each sweep; they self-reschedule
 * if there's more to do.
 */
export const runAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    await ctx.scheduler.runAfter(0, internal.cleanup.sweepNotifications, {});
    await ctx.scheduler.runAfter(0, internal.cleanup.sweepLiveActivities, {});
    await ctx.scheduler.runAfter(0, internal.cleanup.sweepInvalidDevices, {});
    await ctx.scheduler.runAfter(0, internal.cleanup.sweepInvites, {});
    await ctx.scheduler.runAfter(0, internal.cleanup.sweepIdempotencyKeys, {});
    // region: tier-features
    await ctx.scheduler.runAfter(0, internal.cleanup.sweepUsageCounters, {});
    await ctx.scheduler.runAfter(0, internal.cleanup.sweepIapEvents, {});
    // endregion: tier-features
  }
});

/**
 * Weekly orphan sweep. Both sweeps walk their entire table via
 * `_creationTime` cursor — one `db.get` per row — so they're meaningfully
 * more expensive than the daily sweeps as the tables grow. Now that
 * `notifications.deleteOne` / `clearAll` and `sourceApps.deleteApp` all
 * cascade correctly, the only source of new orphans would be a regression,
 * so weekly is plenty.
 */
export const runOrphanSweeps = internalMutation({
  args: {},
  handler: async (ctx) => {
    await ctx.scheduler.runAfter(0, internal.cleanup.sweepOrphanDeliveries, {});
    await ctx.scheduler.runAfter(0, internal.cleanup.sweepOrphanActionEvents, {});
  }
});

/** Manual trigger validators — usable from the Convex dashboard. */
export const runAllManual = internalMutation({
  args: { confirm: v.literal(true) },
  handler: async (ctx) => {
    await ctx.scheduler.runAfter(0, internal.cleanup.runAll, {});
    await ctx.scheduler.runAfter(0, internal.cleanup.runOrphanSweeps, {});
  }
});
