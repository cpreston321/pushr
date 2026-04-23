import { v, ConvexError } from "convex/values";
import { query, internalMutation, internalQuery } from "./_generated/server";
import { requireAuth } from "./lib/auth";
import type { Id, Doc } from "./_generated/dataModel";

/**
 * Per-device delivery rows. Inserted up-front when a notification is about
 * to be sent, then updated once Expo returns a ticket, then finalized by
 * the receipts poller.
 *
 * See schema.ts for the status lifecycle.
 */

/**
 * Bulk-insert `pending` rows for every device we're about to push to.
 * Returns the inserted row ids in the same order as the input devices so the
 * caller can correlate them with Expo ticket responses.
 */
export const insertPending = internalMutation({
  args: {
    notificationId: v.id("notifications"),
    ownerId: v.string(),
    deviceIds: v.array(v.id("devices")),
  },
  returns: v.array(v.id("deliveries")),
  handler: async (ctx, args) => {
    const now = Date.now();
    const ids: Id<"deliveries">[] = [];
    for (const deviceId of args.deviceIds) {
      const id = await ctx.db.insert("deliveries", {
        notificationId: args.notificationId,
        deviceId,
        ownerId: args.ownerId,
        status: "pending",
        attempts: 1,
        firstAttemptAt: now,
        lastAttemptAt: now,
      });
      ids.push(id);
    }
    return ids;
  },
});

/**
 * Apply Expo ticket outcomes to previously-inserted delivery rows.
 * `outcomes[i]` corresponds to `deliveryIds[i]` in order.
 */
export const applyTicketOutcomes = internalMutation({
  args: {
    outcomes: v.array(
      v.object({
        deliveryId: v.id("deliveries"),
        status: v.union(
          v.literal("queued"),
          v.literal("failed"),
          v.literal("invalid"),
        ),
        expoTicketId: v.optional(v.string()),
        errorCode: v.optional(v.string()),
        errorMessage: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const o of args.outcomes) {
      const patch: Partial<Doc<"deliveries">> = {
        status: o.status,
        expoTicketId: o.expoTicketId,
        errorCode: o.errorCode,
        errorMessage: o.errorMessage,
        lastAttemptAt: now,
      };
      if (o.status !== "queued") patch.finalizedAt = now;
      await ctx.db.patch(o.deliveryId, patch);
    }
  },
});

/**
 * Apply Expo receipt outcomes. Receipts are fetched ~15 min after send to
 * distinguish actually-delivered from accepted-but-dropped-by-APNs.
 */
export const applyReceiptOutcomes = internalMutation({
  args: {
    outcomes: v.array(
      v.object({
        deliveryId: v.id("deliveries"),
        status: v.union(
          v.literal("delivered"),
          v.literal("failed"),
          v.literal("invalid"),
        ),
        errorCode: v.optional(v.string()),
        errorMessage: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const o of args.outcomes) {
      await ctx.db.patch(o.deliveryId, {
        status: o.status,
        errorCode: o.errorCode,
        errorMessage: o.errorMessage,
        finalizedAt: now,
      });
    }
  },
});

/**
 * Internal: list `queued` deliveries for a notification, for the receipts
 * poller to batch-fetch.
 */
export const queuedForNotification = internalQuery({
  args: { notificationId: v.id("notifications") },
  returns: v.array(
    v.object({
      deliveryId: v.id("deliveries"),
      deviceId: v.id("devices"),
      expoTicketId: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("deliveries")
      .withIndex("by_notification", (q) =>
        q.eq("notificationId", args.notificationId),
      )
      .collect();
    return rows
      .filter((r) => r.status === "queued" && r.expoTicketId !== undefined)
      .map((r) => ({
        deliveryId: r._id,
        deviceId: r.deviceId,
        expoTicketId: r.expoTicketId!,
      }));
  },
});

/**
 * Public: list per-device delivery rows for one notification the caller owns.
 * Used by the mobile UI's notification-detail view.
 */
export const listForNotification = query({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, args) => {
    const ownerId = await requireAuth(ctx);
    const notif = await ctx.db.get(args.notificationId);
    if (!notif || notif.ownerId !== ownerId) {
      throw new ConvexError("Notification not found");
    }
    const rows = await ctx.db
      .query("deliveries")
      .withIndex("by_notification", (q) =>
        q.eq("notificationId", args.notificationId),
      )
      .collect();
    const deviceCache = new Map<Id<"devices">, Doc<"devices"> | null>();
    const out = [];
    for (const r of rows) {
      let device = deviceCache.get(r.deviceId);
      if (device === undefined) {
        device = await ctx.db.get(r.deviceId);
        deviceCache.set(r.deviceId, device);
      }
      out.push({
        ...r,
        deviceName: device?.name ?? null,
        devicePlatform: device?.platform ?? null,
        deviceModel: device?.model ?? null,
      });
    }
    out.sort((a, b) => a.firstAttemptAt - b.firstAttemptAt);
    return out;
  },
});
