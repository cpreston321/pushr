import { v, ConvexError } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAuth } from "./lib/auth";
import {
  getSourceAppRole,
  listAccessibleSourceApps,
  requireSourceAppRole,
} from "./lib/sharing";
import { generateToken, hashToken, tokenDisplayPrefix } from "./lib/tokens";
// region: tier-features
import { getEffectiveTier, TIER_LIMITS } from "./tiers";
// endregion: tier-features
import type { Doc } from "./_generated/dataModel";

/**
 * Decorate a source-app document for the mobile UI: resolve the logo URL,
 * stamp on the caller's role, and (for owners only) attach the per-provider
 * webhook signing configs. Non-owners get an empty `webhookConfigs` array
 * so the UI can render without conditional shape checks.
 */
async function decorateApp(
  ctx: Parameters<typeof getSourceAppRole>[0],
  app: Doc<"sourceApps">,
  role: "owner" | "editor" | "viewer",
) {
  const logoUrl = app.logoStorageId
    ? await ctx.storage.getUrl(app.logoStorageId)
    : null;
  const webhookConfigs =
    role === "owner"
      ? (
          await ctx.db
            .query("webhookConfigs")
            .withIndex("by_app", (q) => q.eq("sourceAppId", app._id))
            .collect()
        ).map((c) => ({ provider: c.provider, secret: c.secret }))
      : [];
  return {
    ...app,
    logoUrl,
    role,
    webhookConfigs,
  };
}

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    const accessible = await listAccessibleSourceApps(ctx, userId);
    const sorted = accessible.sort(
      (a, b) => b.app.createdAt - a.app.createdAt,
    );
    return await Promise.all(
      sorted.map(({ app, role }) => decorateApp(ctx, app, role)),
    );
  },
});

/**
 * Single app for the detail screen. Returns null if the caller has no
 * access (so the UI can render a friendly "not found"). Does not throw.
 */
export const getById = query({
  args: { id: v.id("sourceApps") },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const access = await getSourceAppRole(ctx, args.id, userId);
    if (!access) return null;
    return await decorateApp(ctx, access.app, access.role);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    logoStorageId: v.optional(v.id("_storage")),
  },
  returns: v.object({
    id: v.id("sourceApps"),
    token: v.string(),
  }),
  handler: async (ctx, args) => {
    const ownerId = await requireAuth(ctx);
    if (args.name.trim().length === 0) {
      throw new ConvexError("Name is required");
    }

    // region: tier-features
    // Tier enforcement: free tier is limited to N non-revoked source apps.
    // Only counts apps the caller owns — shared apps don't count against
    // their quota.
    const tier = await getEffectiveTier(ctx, ownerId);
    const limit = TIER_LIMITS[tier].sourceApps;
    if (Number.isFinite(limit)) {
      const existing = await ctx.db
        .query("sourceApps")
        .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
        .collect();
      const active = existing.filter((a) => !a.revokedAt).length;
      if (active >= limit) {
        throw new ConvexError({
          code: "SOURCE_APP_LIMIT",
          message: `Your plan allows ${limit} source app${limit === 1 ? "" : "s"}. Upgrade to Pro for unlimited apps.`,
          tier,
          limit,
        });
      }
    }
    // endregion: tier-features

    const token = generateToken();
    const tokenHash = await hashToken(token);
    const tokenPrefix = tokenDisplayPrefix(token);
    const id = await ctx.db.insert("sourceApps", {
      ownerId,
      name: args.name.trim(),
      description: args.description?.trim() || undefined,
      tokenHash,
      tokenPrefix,
      enabled: true,
      createdAt: Date.now(),
      logoStorageId: args.logoStorageId,
    });
    return { id, token };
  },
});

export const setEnabled = mutation({
  args: { id: v.id("sourceApps"), enabled: v.boolean() },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    await requireSourceAppRole(ctx, args.id, userId, "editor");
    await ctx.db.patch(args.id, { enabled: args.enabled });
  },
});

/**
 * Mute a source app until `until` (ms since epoch). Pass `null` to clear.
 * Muted apps still accept pushes into the feed but Expo delivery is skipped.
 */
export const setMute = mutation({
  args: {
    id: v.id("sourceApps"),
    until: v.union(v.null(), v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    await requireSourceAppRole(ctx, args.id, userId, "editor");
    await ctx.db.patch(args.id, {
      mutedUntil: args.until ?? undefined,
    });
  },
});

export const setQuietHours = mutation({
  args: {
    id: v.id("sourceApps"),
    // minutes since midnight (0-1439), or null to clear
    start: v.union(v.null(), v.number()),
    end: v.union(v.null(), v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const { app } = await requireSourceAppRole(ctx, args.id, userId, "editor");
    // region: tier-features
    // Allow clearing on any tier so downgraded users can remove a leftover
    // window, but require Pro to set a non-null window. Pro is checked
    // against the source app's billed owner, not the editor making the change.
    const clearing = args.start === null && args.end === null;
    if (!clearing) {
      const tier = await getEffectiveTier(ctx, app.ownerId);
      if (tier !== "pro") {
        throw new ConvexError({
          code: "PRO_REQUIRED",
          message: "Quiet hours is a Pro feature.",
        });
      }
    }
    // endregion: tier-features
    void app; // referenced inside the stripped block; keep handler input alive
    const valid = (n: number | null) =>
      n === null || (Number.isInteger(n) && n >= 0 && n < 1440);
    if (!valid(args.start) || !valid(args.end)) {
      throw new ConvexError("Quiet hours must be integers between 0 and 1439");
    }
    await ctx.db.patch(args.id, {
      quietStart: args.start ?? undefined,
      quietEnd: args.end ?? undefined,
    });
  },
});

export const rename = mutation({
  args: {
    id: v.id("sourceApps"),
    name: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    await requireSourceAppRole(ctx, args.id, userId, "editor");
    await ctx.db.patch(args.id, {
      name: args.name.trim(),
      description: args.description?.trim() || undefined,
    });
  },
});

/**
 * Set or clear the inbound HMAC signing secret for ONE provider on a source
 * app. Pass `secret: null` to clear that provider's row. Other providers
 * already configured on the same app are unaffected — a single source app
 * can have entries for github, sentry, etc., each with its own key.
 *
 * Owner-only.
 */
export const setProviderWebhookSecret = mutation({
  args: {
    id: v.id("sourceApps"),
    provider: v.string(),
    secret: v.union(v.null(), v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    await requireSourceAppRole(ctx, args.id, userId, "owner");
    const provider = args.provider.trim();
    if (!provider) throw new ConvexError("Provider is required");
    const trimmed = args.secret?.trim();
    const existing = await ctx.db
      .query("webhookConfigs")
      .withIndex("by_app_provider", (q) =>
        q.eq("sourceAppId", args.id).eq("provider", provider),
      )
      .unique();
    if (!trimmed || trimmed.length === 0) {
      if (existing) await ctx.db.delete(existing._id);
      return;
    }
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { secret: trimmed, updatedAt: now });
    } else {
      await ctx.db.insert("webhookConfigs", {
        sourceAppId: args.id,
        provider,
        secret: trimmed,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});

/**
 * Rotate the bearer token for a source app. Owner only — sensitive: any
 * caller still using the old token immediately stops working. Returns the
 * fresh token, which is the only chance to capture it (we only persist a
 * hash). The notification feed history and configuration are preserved.
 */
export const rotateToken = mutation({
  args: { id: v.id("sourceApps") },
  returns: v.object({ token: v.string() }),
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const { app } = await requireSourceAppRole(ctx, args.id, userId, "owner");
    if (app.revokedAt) {
      throw new ConvexError("Cannot rotate a revoked app — create a new one");
    }
    const token = generateToken();
    const tokenHash = await hashToken(token);
    const tokenPrefix = tokenDisplayPrefix(token);
    await ctx.db.patch(args.id, { tokenHash, tokenPrefix });
    return { token };
  },
});

/**
 * Hard-delete a source app and every record tied to it: members, invites,
 * notifications + their deliveries + actionEvents, live activities, the
 * uploaded logo, and finally the sourceApps row itself.
 *
 * Two-phase to fit unbounded data within Convex's per-mutation transaction
 * limit:
 *   1. This public mutation deletes the bounded data (members/invites/logo)
 *      and marks `revokedAt` so the app immediately disappears from
 *      `listAccessibleSourceApps` (and therefore the feed/UI).
 *   2. `internal.sourceApps.sweepDeletedAppData` runs in the background,
 *      deleting batches of notifications + dependent rows, self-rescheduling
 *      until everything is gone — at which point it deletes the sourceApps
 *      row itself.
 *
 * Owner-only. Idempotent on repeat calls only until phase 1 commits — once
 * `revokedAt` is set, `requireSourceAppRole` returns "not found" so a retry
 * surfaces as a benign error to the caller.
 */
export const deleteApp = mutation({
  args: { id: v.id("sourceApps") },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const { app } = await requireSourceAppRole(ctx, args.id, userId, "owner");

    // Bounded synchronous deletes — sharedUsersLimit caps both members and
    // invites, so these are small enough to handle in one transaction.
    const members = await ctx.db
      .query("sourceAppMembers")
      .withIndex("by_app", (q) => q.eq("sourceAppId", app._id))
      .collect();
    for (const m of members) await ctx.db.delete(m._id);

    const invites = await ctx.db
      .query("sourceAppInvites")
      .withIndex("by_app", (q) => q.eq("sourceAppId", app._id))
      .collect();
    for (const i of invites) await ctx.db.delete(i._id);

    // Webhook signing configs — at most a handful per app (one per supported
    // provider), bounded enough to handle synchronously.
    const configs = await ctx.db
      .query("webhookConfigs")
      .withIndex("by_app", (q) => q.eq("sourceAppId", app._id))
      .collect();
    for (const c of configs) await ctx.db.delete(c._id);

    if (app.logoStorageId) {
      try {
        await ctx.storage.delete(app.logoStorageId);
      } catch {
        // Already gone — ignore.
      }
    }

    // Hide the app from every UI surface immediately. The row itself stays
    // around until the sweep finishes deleting all dependent data, then the
    // sweep deletes this row too.
    await ctx.db.patch(app._id, {
      revokedAt: Date.now(),
      enabled: false,
    });

    await ctx.scheduler.runAfter(
      0,
      internal.sourceApps.sweepDeletedAppData,
      { appId: app._id },
    );
  },
});

const SWEEP_BATCH = 50;

/**
 * Internal cascade sweep for `deleteApp`. One batch per fire; self-reschedules
 * while there's work left, then deletes the sourceApps row itself.
 *
 * Safe to run on a non-existent app — completes as a no-op.
 */
export const sweepDeletedAppData = internalMutation({
  args: { appId: v.id("sourceApps") },
  handler: async (ctx, { appId }) => {
    let workDone = 0;

    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_sourceApp_created", (q) => q.eq("sourceAppId", appId))
      .take(SWEEP_BATCH);
    for (const n of notifications) {
      const deliveries = await ctx.db
        .query("deliveries")
        .withIndex("by_notification", (q) => q.eq("notificationId", n._id))
        .collect();
      for (const d of deliveries) await ctx.db.delete(d._id);
      const events = await ctx.db
        .query("actionEvents")
        .withIndex("by_notification", (q) => q.eq("notificationId", n._id))
        .collect();
      for (const e of events) await ctx.db.delete(e._id);
      await ctx.db.delete(n._id);
      workDone++;
    }

    const activities = await ctx.db
      .query("liveActivities")
      .withIndex("by_sourceApp", (q) => q.eq("sourceAppId", appId))
      .take(SWEEP_BATCH);
    for (const a of activities) {
      await ctx.db.delete(a._id);
      workDone++;
    }

    if (workDone > 0) {
      await ctx.scheduler.runAfter(
        0,
        internal.sourceApps.sweepDeletedAppData,
        { appId },
      );
      return;
    }

    // No dependent data left — finally delete the sourceApps row itself.
    const app = await ctx.db.get(appId);
    if (app) await ctx.db.delete(appId);
  },
});

/**
 * Returns a single-use upload URL the mobile client POSTs the logo bytes to.
 * After upload completes, call `setLogo` with the returned storageId.
 */
export const generateLogoUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const setLogo = mutation({
  args: {
    id: v.id("sourceApps"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const { app } = await requireSourceAppRole(ctx, args.id, userId, "editor");
    // Replace any previous logo to avoid orphaned blobs.
    if (app.logoStorageId && app.logoStorageId !== args.storageId) {
      try {
        await ctx.storage.delete(app.logoStorageId);
      } catch {
        // Already gone — ignore.
      }
    }
    await ctx.db.patch(args.id, { logoStorageId: args.storageId });
  },
});

export const removeLogo = mutation({
  args: { id: v.id("sourceApps") },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const { app } = await requireSourceAppRole(ctx, args.id, userId, "editor");
    if (app.logoStorageId) {
      try {
        await ctx.storage.delete(app.logoStorageId);
      } catch {
        // Already gone — ignore.
      }
    }
    await ctx.db.patch(args.id, { logoStorageId: undefined });
  },
});
