import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAuth } from "./lib/auth";

/**
 * Live Activity registration surface used by the mobile client.
 *
 * Push-to-start tokens live on `devices` (one per enrolled device). The
 * per-activity update token lives here on `liveActivities` — it's reported
 * by the device after `Activity.request(...)` returns.
 *
 * Server-initiated start/update/end lifecycle happens in convex/apns.ts.
 */

/**
 * Report the ActivityKit-assigned id + per-activity push update token
 * after the device has started the activity. The activity row is normally
 * created up-front by notifyInternal.ingest when /notify fires an action
 * with `liveActivity.action: "start"`, so we expect it to exist.
 */
export const registerUpdateToken = mutation({
  args: {
    activityId: v.string(),
    nativeActivityId: v.string(),
    pushUpdateToken: v.string(),
    deviceId: v.id("devices"),
  },
  handler: async (ctx, args) => {
    const ownerId = await requireAuth(ctx);
    const row = await ctx.db
      .query("liveActivities")
      .withIndex("by_owner_activity", (q) =>
        q.eq("ownerId", ownerId).eq("activityId", args.activityId),
      )
      .unique();
    if (!row) {
      // The activity row doesn't exist yet — this can happen if the device
      // started an activity locally (e.g. from a debug button) before the
      // server recorded it. Create a stub so future updates work.
      const device = await ctx.db.get(args.deviceId);
      if (!device || device.ownerId !== ownerId) {
        throw new ConvexError("Device not found");
      }
      // We don't have a sourceAppId here — leave it unset via a sentinel
      // lookup isn't possible, so require the row to exist in normal flows.
      // For the "local start without server row" case we still want a row
      // so APNs updates can find a token: point at the user's first app.
      const anyApp = await ctx.db
        .query("sourceApps")
        .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
        .first();
      if (!anyApp) {
        throw new ConvexError(
          "No source app found for owner — create one before starting activities",
        );
      }
      await ctx.db.insert("liveActivities", {
        ownerId,
        sourceAppId: anyApp._id,
        activityId: args.activityId,
        startedAt: Date.now(),
        lastUpdateAt: Date.now(),
        nativeActivityId: args.nativeActivityId,
        pushUpdateToken: args.pushUpdateToken,
        pushUpdateTokenAt: Date.now(),
        deviceId: args.deviceId,
      });
      return;
    }
    await ctx.db.patch(row._id, {
      nativeActivityId: args.nativeActivityId,
      pushUpdateToken: args.pushUpdateToken,
      pushUpdateTokenAt: Date.now(),
      deviceId: args.deviceId,
    });
  },
});

/**
 * List active (not-yet-ended) activities for the signed-in user. Useful for
 * a debug screen; mobile app can display current activity state.
 */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireAuth(ctx);
    const rows = await ctx.db
      .query("liveActivities")
      .withIndex("by_owner_started", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .take(50);
    return rows;
  },
});
