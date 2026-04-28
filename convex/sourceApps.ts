import { v, ConvexError } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireAuth } from "./lib/auth";
import {
  getSourceAppRole,
  listAccessibleSourceApps,
  requireSourceAppRole,
} from "./lib/sharing";
import { generateToken, hashToken, tokenDisplayPrefix } from "./lib/tokens";
import { getEffectiveTier, TIER_LIMITS } from "./tiers";
import type { Doc } from "./_generated/dataModel";

/**
 * Decorate a source-app document for the mobile UI: resolve the logo URL
 * and stamp on the caller's role. Hides the webhook secret from non-owners.
 */
async function decorateApp(
  ctx: Parameters<typeof getSourceAppRole>[0],
  app: Doc<"sourceApps">,
  role: "owner" | "editor" | "viewer",
) {
  const logoUrl = app.logoStorageId
    ? await ctx.storage.getUrl(app.logoStorageId)
    : null;
  const { webhookSecret, ...rest } = app;
  return {
    ...rest,
    webhookSecret: role === "owner" ? webhookSecret : undefined,
    logoUrl,
    role,
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
 * Set or clear the webhook HMAC secret for a source app.
 * Declares the provider at the same time so the Apps tab can label it.
 * Pass `secret: null` to clear.
 */
export const setWebhookConfig = mutation({
  args: {
    id: v.id("sourceApps"),
    provider: v.optional(v.string()),
    secret: v.union(v.null(), v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    // Webhook secret is sensitive — owner only.
    await requireSourceAppRole(ctx, args.id, userId, "owner");
    const trimmed = args.secret?.trim();
    await ctx.db.patch(args.id, {
      webhookSecret: trimmed && trimmed.length > 0 ? trimmed : undefined,
      webhookProvider: args.provider?.trim() || undefined,
    });
  },
});

export const revoke = mutation({
  args: { id: v.id("sourceApps") },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    await requireSourceAppRole(ctx, args.id, userId, "owner");
    await ctx.db.patch(args.id, {
      revokedAt: Date.now(),
      enabled: false,
    });
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
