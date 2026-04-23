import { ConvexError } from "convex/values";
import type { QueryCtx, MutationCtx, ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

/**
 * Return the Better Auth user subject (stable user id) or null.
 * This is what we use as `userId` in pushr — we don't mirror users into a
 * separate table, the BA component holds the source of truth.
 */
export async function getAuthUserId(
  ctx: Pick<QueryCtx | MutationCtx | ActionCtx, "auth">,
): Promise<string | null> {
  const identity = await ctx.auth.getUserIdentity();
  return identity?.subject ?? null;
}

export async function requireAuth(
  ctx: Pick<QueryCtx | MutationCtx | ActionCtx, "auth">,
): Promise<string> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError("Not authenticated");
  return userId;
}

export type PushrUserId = string;

// Re-exports for type unification across files
export type { Id };
