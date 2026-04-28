import { v, ConvexError } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { requireAuth } from "./lib/auth";
import {
  getSourceAppRole,
  listAccessibleSourceApps,
} from "./lib/sharing";
import type { Id } from "./_generated/dataModel";

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
          .query("notifications")
          .withIndex("by_sourceApp_created", (q) =>
            q.eq("sourceAppId", app._id),
          )
          .order("desc")
          .take(limit),
      ),
    );
    const rows = perApp
      .flat()
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);

    const apps = accessible.map(({ app }) => app);
    const appMap = new Map(apps.map((a) => [a._id, a]));
    // Resolve each distinct logo URL once.
    const logoUrlCache = new Map<string, string | null>();
    for (const app of apps) {
      if (app.logoStorageId && !logoUrlCache.has(app.logoStorageId)) {
        logoUrlCache.set(
          app.logoStorageId,
          await ctx.storage.getUrl(app.logoStorageId),
        );
      }
    }
    return rows.map((r) => {
      const app = appMap.get(r.sourceAppId);
      return {
        ...r,
        sourceAppName: app?.name ?? "unknown",
        sourceAppLogoUrl: app?.logoStorageId
          ? (logoUrlCache.get(app.logoStorageId) ?? null)
          : null,
      };
    });
  },
});

export const markRead = mutation({
  args: {
    id: v.id("notifications"),
    // Optional: the device that surfaced this notification, recorded on
    // the row when it also acknowledges an ack-required notification.
    deviceId: v.optional(v.id("devices")),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const row = await ctx.db.get(args.id);
    if (!row) throw new ConvexError("Notification not found");
    const access = await getSourceAppRole(ctx, row.sourceAppId, userId);
    if (!access) throw new ConvexError("Notification not found");
    const now = Date.now();
    const patch: {
      readAt?: number;
      acknowledgedAt?: number;
      acknowledgedByDeviceId?: Id<"devices">;
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
  },
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
        .query("notifications")
        .withIndex("by_sourceApp_created", (q) =>
          q.eq("sourceAppId", app._id),
        )
        .filter((q) => q.eq(q.field("readAt"), undefined))
        .take(500);
      for (const n of unread) {
        await ctx.db.patch(n._id, { readAt: now });
      }
      total += unread.length;
    }
    return total;
  },
});

export const deleteOne = mutation({
  args: { id: v.id("notifications") },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const row = await ctx.db.get(args.id);
    if (!row) throw new ConvexError("Notification not found");
    // Only the source-app owner can delete — members would otherwise be
    // able to wipe a notification from every other member's feed.
    if (row.ownerId !== userId) {
      throw new ConvexError("Only the app owner can delete notifications");
    }
    await ctx.db.delete(args.id);
  },
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
        .query("notifications")
        .withIndex("by_owner_created", (q) => q.eq("ownerId", ownerId))
        .take(200);
      if (batch.length === 0) break;
      for (const n of batch) {
        await ctx.db.delete(n._id);
      }
      deleted += batch.length;
      if (batch.length < 200) break;
    }
    return deleted;
  },
});

export const unreadCount = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    const accessible = await listAccessibleSourceApps(ctx, userId);
    let total = 0;
    for (const { app } of accessible) {
      const unread = await ctx.db
        .query("notifications")
        .withIndex("by_sourceApp_created", (q) =>
          q.eq("sourceAppId", app._id),
        )
        .filter((q) => q.eq(q.field("readAt"), undefined))
        .take(500);
      total += unread.length;
    }
    return total;
  },
});

/**
 * Internal: record delivery outcome after Expo Push responds.
 */
export const recordDelivery = internalMutation({
  args: {
    id: v.id("notifications"),
    attemptedDeviceCount: v.number(),
    successDeviceCount: v.number(),
    failureMessages: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      attemptedDeviceCount: args.attemptedDeviceCount,
      successDeviceCount: args.successDeviceCount,
      failureMessages: args.failureMessages,
    });
  },
});
