import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

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

// Notifications (and their deliveries + actionEvents) kept for 30 days.
const NOTIFICATION_RETAIN_MS = 30 * DAY_MS;

// Live Activities — ActivityKit activities don't run for weeks; drop shadow
// rows after 14 days regardless of end state.
const LIVE_ACTIVITY_RETAIN_MS = 14 * DAY_MS;

// Devices marked invalid (DeviceNotRegistered) get purged after 30 days.
// Active devices are never touched here.
const INVALID_DEVICE_RETAIN_MS = 30 * DAY_MS;

// Usage counters keep ~13 months so the dashboard can show a 12-month
// trailing view with one month of padding.
const USAGE_COUNTER_RETAIN_MONTHS = 13;

const BATCH_SIZE = 100;

export const sweepNotifications = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - NOTIFICATION_RETAIN_MS;
    const batch = await ctx.db.query("notifications").take(BATCH_SIZE);
    let deleted = 0;
    for (const n of batch) {
      if (n.createdAt >= cutoff) break;
      const deliveries = await ctx.db
        .query("deliveries")
        .withIndex("by_notification", (q) => q.eq("notificationId", n._id))
        .collect();
      for (const d of deliveries) await ctx.db.delete(d._id);
      const actionEvents = await ctx.db
        .query("actionEvents")
        .withIndex("by_notification", (q) => q.eq("notificationId", n._id))
        .collect();
      for (const e of actionEvents) await ctx.db.delete(e._id);
      await ctx.db.delete(n._id);
      deleted++;
    }
    if (deleted === BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, internal.cleanup.sweepNotifications, {});
    }
    return deleted;
  },
});

export const sweepLiveActivities = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - LIVE_ACTIVITY_RETAIN_MS;
    const batch = await ctx.db.query("liveActivities").take(BATCH_SIZE);
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
  },
});

export const sweepInvalidDevices = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - INVALID_DEVICE_RETAIN_MS;
    // No index on invalidatedAt — we scan oldest-first and keep going as long
    // as we're finding ancient rows. Active devices are skipped in-place.
    const batch = await ctx.db.query("devices").take(BATCH_SIZE);
    let scanned = 0;
    for (const d of batch) {
      scanned++;
      if (d.invalidatedAt !== undefined && d.invalidatedAt < cutoff) {
        await ctx.db.delete(d._id);
      }
    }
    if (scanned === BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, internal.cleanup.sweepInvalidDevices, {});
    }
    return scanned;
  },
});

export const sweepUsageCounters = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = new Date();
    // Cutoff = first of the month N months ago. Anything strictly older gets
    // dropped. yearMonth is "YYYY-MM" — lexicographic comparison works.
    const cutoffDate = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth() - USAGE_COUNTER_RETAIN_MONTHS,
        1,
      ),
    );
    const cutoffYm = `${cutoffDate.getUTCFullYear()}-${String(
      cutoffDate.getUTCMonth() + 1,
    ).padStart(2, "0")}`;
    const batch = await ctx.db.query("usageCounters").take(BATCH_SIZE);
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
  },
});

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
    await ctx.scheduler.runAfter(0, internal.cleanup.sweepUsageCounters, {});
  },
});

/** Manual trigger validators — usable from the Convex dashboard. */
export const runAllManual = internalMutation({
  args: { confirm: v.literal(true) },
  handler: async (ctx) => {
    await ctx.scheduler.runAfter(0, internal.cleanup.runAll, {});
  },
});
