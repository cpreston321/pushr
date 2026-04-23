import { v, ConvexError } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { hashToken } from "./lib/tokens";
import {
  getEffectiveTier,
  getMonthlyUsage,
  incrementMonthlyUsage,
  quotaExceeded,
  TIER_LIMITS,
} from "./tiers";

const liveActivityValidator = v.object({
  action: v.union(
    v.literal("start"),
    v.literal("update"),
    v.literal("end"),
  ),
  activityId: v.string(),
  state: v.object({
    title: v.optional(v.string()),
    status: v.optional(v.string()),
    progress: v.optional(v.number()),
    icon: v.optional(v.string()),
  }),
  attributes: v.optional(
    v.object({
      name: v.optional(v.string()),
      logoUrl: v.optional(v.string()),
    }),
  ),
  staleDate: v.optional(v.number()),
  relevanceScore: v.optional(v.number()),
});

/**
 * Validator for one entry in notifications.actions. Mirrored from the
 * schema so /notify can accept it without parsing indirection.
 */
const actionValidator = v.union(
  v.object({
    kind: v.literal("open_url"),
    id: v.string(),
    label: v.string(),
    url: v.string(),
    destructive: v.optional(v.boolean()),
  }),
  v.object({
    kind: v.literal("callback"),
    id: v.string(),
    label: v.string(),
    callbackUrl: v.string(),
    destructive: v.optional(v.boolean()),
    authRequired: v.optional(v.boolean()),
  }),
  v.object({
    kind: v.literal("reply"),
    id: v.string(),
    label: v.string(),
    callbackUrl: v.string(),
    placeholder: v.optional(v.string()),
  }),
);

/**
 * Called by the /notify HTTP endpoint. Authenticates the bearer token by
 * hash, inserts a notifications row, and returns both the row id and
 * ownerId so the HTTP action can schedule delivery.
 */
export const ingest = internalMutation({
  args: {
    token: v.string(),
    title: v.string(),
    body: v.string(),
    priority: v.optional(v.number()),
    url: v.optional(v.string()),
    data: v.optional(v.any()),
    image: v.optional(v.string()),
    action: v.optional(v.object({ label: v.string(), url: v.string() })),
    actions: v.optional(v.array(actionValidator)),
    ack: v.optional(
      v.object({
        timeoutSec: v.number(),
        maxAttempts: v.number(),
      }),
    ),
    liveActivity: v.optional(liveActivityValidator),
    webhookProvider: v.optional(v.string()),
    webhookEventType: v.optional(v.string()),
  },
  returns: v.object({
    notificationId: v.id("notifications"),
    ownerId: v.string(),
    ack: v.optional(
      v.object({
        timeoutSec: v.number(),
        maxAttempts: v.number(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const tokenHash = await hashToken(args.token);
    const app = await ctx.db
      .query("sourceApps")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
      .first();
    if (!app || app.revokedAt) {
      throw new ConvexError({ code: "INVALID_TOKEN", message: "Invalid or revoked token" });
    }
    if (!app.enabled) {
      throw new ConvexError({ code: "APP_DISABLED", message: "Source app is disabled" });
    }

    // Tier enforcement: check quota BEFORE writing the notification row so we
    // don't clutter the feed with rows we refused to deliver.
    const tier = await getEffectiveTier(ctx, app.ownerId);
    const limit = TIER_LIMITS[tier].pushesPerMonth;
    const current = await getMonthlyUsage(ctx, app.ownerId);
    if (current >= limit) {
      throw quotaExceeded(tier, current, limit);
    }
    await incrementMonthlyUsage(ctx, app.ownerId);

    await ctx.db.patch(app._id, { lastUsedAt: Date.now() });

    const notificationId = await ctx.db.insert("notifications", {
      ownerId: app.ownerId,
      sourceAppId: app._id,
      title: args.title,
      body: args.body,
      priority: args.priority,
      url: args.url,
      data: args.data,
      image: args.image,
      action: args.action,
      actions: args.actions,
      liveActivity: args.liveActivity,
      createdAt: Date.now(),
      attemptedDeviceCount: 0,
      successDeviceCount: 0,
      ack: args.ack
        ? {
            timeoutSec: args.ack.timeoutSec,
            maxAttempts: args.ack.maxAttempts,
            attempts: 0,
          }
        : undefined,
      webhookProvider: args.webhookProvider,
      webhookEventType: args.webhookEventType,
    });

    // Shadow the live-activity lifecycle server-side for observability.
    if (args.liveActivity) {
      const la = args.liveActivity;
      const existing = await ctx.db
        .query("liveActivities")
        .withIndex("by_owner_activity", (q) =>
          q.eq("ownerId", app.ownerId).eq("activityId", la.activityId),
        )
        .unique();
      const now = Date.now();
      if (existing) {
        await ctx.db.patch(existing._id, {
          lastUpdateAt: now,
          lastState: la.state,
          lastAttributes: la.attributes ?? existing.lastAttributes,
          endedAt: la.action === "end" ? now : existing.endedAt,
        });
      } else if (la.action === "start") {
        await ctx.db.insert("liveActivities", {
          ownerId: app.ownerId,
          sourceAppId: app._id,
          activityId: la.activityId,
          startedAt: now,
          lastUpdateAt: now,
          lastState: la.state,
          lastAttributes: la.attributes,
        });
      }
      // `update`/`end` for an unknown activityId: ignore — the device either
      // never saw the start or already ended it. Payload still flows through
      // to the push so the device can decide what to do.
    }

    return { notificationId, ownerId: app.ownerId, ack: args.ack };
  },
});

/**
 * Internal: resolve a bearer token to its sourceApp's webhookSecret (if any).
 * Used by the /hooks dispatcher to verify signed webhooks BEFORE ingesting.
 * Returns null if the token is invalid — the caller is expected to still
 * call ingest (which throws INVALID_TOKEN) to surface a consistent error.
 */
export const webhookSecretForToken = internalQuery({
  args: { token: v.string() },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, args) => {
    const tokenHash = await hashToken(args.token);
    const app = await ctx.db
      .query("sourceApps")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
      .first();
    if (!app || app.revokedAt) return null;
    return app.webhookSecret ?? null;
  },
});
