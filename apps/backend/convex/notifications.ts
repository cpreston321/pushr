import { v, ConvexError } from 'convex/values';
import { query, mutation, internalMutation, type MutationCtx } from './_generated/server';
import { internal } from './_generated/api';
import { requireAuth } from './lib/auth';
import { getSourceAppRole, listAccessibleSourceApps } from './lib/sharing';
// region: tier-features
import {
  getEffectiveTier,
  getMonthlyUsage,
  incrementMonthlyUsage,
  quotaExceeded,
  TIER_LIMITS
} from './tiers';
// endregion: tier-features
import type { Id } from './_generated/dataModel';

/**
 * Feed for the mobile app. Newest first. Includes notifications from apps
 * the user owns AND apps shared with them.
 *
 * Implementation: merge per-source-app queries via `by_sourceApp_created`
 * since `notifications.ownerId` is the bill-paying owner, not the viewer.
 * Each query is bounded by `limit` to keep total reads bounded by
 * `limit × accessible-app-count` (small in practice).
 */
export const listMine = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const limit = Math.min(args.limit ?? 100, 500);
    const accessible = await listAccessibleSourceApps(ctx, userId);
    if (accessible.length === 0) return [];

    const perApp = await Promise.all(
      accessible.map(({ app }) =>
        ctx.db
          .query('notifications')
          .withIndex('by_sourceApp_created', (q) => q.eq('sourceAppId', app._id))
          .order('desc')
          .take(limit)
      )
    );
    const rows = perApp
      .flat()
      .toSorted((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);

    const apps = accessible.map(({ app }) => app);
    const appMap = new Map(apps.map((a) => [a._id, a]));
    // Resolve each distinct logo URL once.
    const logoUrlCache = new Map<string, string | null>();
    for (const app of apps) {
      if (app.logoStorageId && !logoUrlCache.has(app.logoStorageId)) {
        logoUrlCache.set(app.logoStorageId, await ctx.storage.getUrl(app.logoStorageId));
      }
    }
    return rows.map((r) => {
      const app = appMap.get(r.sourceAppId);
      return {
        ...r,
        sourceAppName: app?.name ?? 'unknown',
        sourceAppLogoUrl: app?.logoStorageId ? (logoUrlCache.get(app.logoStorageId) ?? null) : null
      };
    });
  }
});

export const markRead = mutation({
  args: {
    id: v.id('notifications'),
    // Optional: the device that surfaced this notification, recorded on
    // the row when it also acknowledges an ack-required notification.
    deviceId: v.optional(v.id('devices'))
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const row = await ctx.db.get(args.id);
    if (!row) throw new ConvexError('Notification not found');
    const access = await getSourceAppRole(ctx, row.sourceAppId, userId);
    if (!access) throw new ConvexError('Notification not found');
    const now = Date.now();
    const patch: {
      readAt?: number;
      acknowledgedAt?: number;
      acknowledgedByDeviceId?: Id<'devices'>;
    } = {};
    if (!row.readAt) patch.readAt = now;
    // Tapping a row counts as an acknowledgement — this is what stops the
    // escalation loop for ack-required notifications.
    if (row.ack && !row.acknowledgedAt) {
      patch.acknowledgedAt = now;
      if (args.deviceId) patch.acknowledgedByDeviceId = args.deviceId;
    }
    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(args.id, patch);
    }
  }
});

export const markAllRead = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    const accessible = await listAccessibleSourceApps(ctx, userId);
    const now = Date.now();
    let total = 0;
    for (const { app } of accessible) {
      const unread = await ctx.db
        .query('notifications')
        .withIndex('by_sourceApp_created', (q) => q.eq('sourceAppId', app._id))
        .filter((q) => q.eq(q.field('readAt'), undefined))
        .take(500);
      for (const n of unread) {
        await ctx.db.patch(n._id, { readAt: now });
      }
      total += unread.length;
    }
    return total;
  }
});

// Cascade-delete a notification's per-device delivery rows and action events,
// then the notification itself. Direct callers (deleteOne / clearAll) need
// this because the daily cleanup cron is the only other code path that knows
// to chase the children.
async function deleteNotificationCascade(ctx: MutationCtx, id: Id<'notifications'>) {
  const deliveries = await ctx.db
    .query('deliveries')
    .withIndex('by_notification', (q) => q.eq('notificationId', id))
    .collect();
  for (const d of deliveries) await ctx.db.delete(d._id);
  const events = await ctx.db
    .query('actionEvents')
    .withIndex('by_notification', (q) => q.eq('notificationId', id))
    .collect();
  for (const e of events) await ctx.db.delete(e._id);
  await ctx.db.delete(id);
}

export const deleteOne = mutation({
  args: { id: v.id('notifications') },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const row = await ctx.db.get(args.id);
    if (!row) throw new ConvexError('Notification not found');
    // Only the source-app owner can delete — members would otherwise be
    // able to wipe a notification from every other member's feed.
    if (row.ownerId !== userId) {
      throw new ConvexError('Only the app owner can delete notifications');
    }
    await deleteNotificationCascade(ctx, args.id);
  }
});

/**
 * Clear the feed. Only deletes notifications from apps the caller owns —
 * shared apps stay visible because clearing them would affect other members.
 */
export const clearAll = mutation({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireAuth(ctx);
    let deleted = 0;
    while (true) {
      const batch = await ctx.db
        .query('notifications')
        .withIndex('by_owner_created', (q) => q.eq('ownerId', ownerId))
        .take(200);
      if (batch.length === 0) break;
      for (const n of batch) {
        await deleteNotificationCascade(ctx, n._id);
      }
      deleted += batch.length;
      if (batch.length < 200) break;
    }
    return deleted;
  }
});

export const unreadCount = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    const accessible = await listAccessibleSourceApps(ctx, userId);
    let total = 0;
    for (const { app } of accessible) {
      const unread = await ctx.db
        .query('notifications')
        .withIndex('by_sourceApp_created', (q) => q.eq('sourceAppId', app._id))
        .filter((q) => q.eq(q.field('readAt'), undefined))
        .take(500);
      total += unread.length;
    }
    return total;
  }
});

/**
 * Send a test push from one of the caller's source apps to their own devices.
 * Mirrors the /notify pipeline (quota check, notifications row, scheduled
 * delivery) but skips the bearer-token step since the caller is already
 * authenticated. Counts against the bill-paying owner's monthly quota the
 * same way an HTTP /notify call would.
 */
export const sendTest = mutation({
  args: { sourceAppId: v.id('sourceApps') },
  returns: v.object({ id: v.id('notifications') }),
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const access = await getSourceAppRole(ctx, args.sourceAppId, userId);
    if (!access || (access.role !== 'owner' && access.role !== 'editor')) {
      throw new ConvexError('Only owners and editors can send test pushes');
    }
    const app = access.app;
    if (!app.enabled) {
      throw new ConvexError('Source app is disabled — re-enable it first');
    }

    // region: tier-features
    // Quota enforcement: counts against the bill-paying owner's monthly
    // allowance, mirroring the HTTP /notify path. Stripped from the public
    // build so self-hosters get unlimited sends with no billing surface.
    const tier = await getEffectiveTier(ctx, app.ownerId);
    const limit = TIER_LIMITS[tier].pushesPerMonth;
    const current = await getMonthlyUsage(ctx, app.ownerId);
    if (current >= limit) {
      throw quotaExceeded(tier, current, limit);
    }
    await incrementMonthlyUsage(ctx, app.ownerId);
    // endregion: tier-features
    await ctx.db.patch(app._id, { lastUsedAt: Date.now() });

    const notificationId = await ctx.db.insert('notifications', {
      ownerId: app.ownerId,
      sourceAppId: app._id,
      title: `Test push from ${app.name}`,
      body: "If you're seeing this on your phone, pushr is working.",
      priority: 5,
      createdAt: Date.now(),
      attemptedDeviceCount: 0,
      successDeviceCount: 0
    });
    await ctx.scheduler.runAfter(0, internal.expoPush.deliver, {
      notificationId
    });
    return { id: notificationId };
  }
});

/**
 * Internal: record delivery outcome after Expo Push responds.
 */
export const recordDelivery = internalMutation({
  args: {
    id: v.id('notifications'),
    attemptedDeviceCount: v.number(),
    successDeviceCount: v.number(),
    failureMessages: v.optional(v.array(v.string()))
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      attemptedDeviceCount: args.attemptedDeviceCount,
      successDeviceCount: args.successDeviceCount,
      failureMessages: args.failureMessages
    });
  }
});
