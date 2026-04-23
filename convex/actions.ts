import { v, ConvexError } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAuth } from "./lib/auth";
import { resolveActionIdentifier, type NotifAction } from "./lib/actionsLayout";
import type { Id, Doc } from "./_generated/dataModel";

/**
 * Interactive notification actions.
 *
 * `invoke` is the mobile app's entrypoint for reporting an action tap:
 *   - `open_url`  → recorded, mobile also opens the URL via Linking.
 *   - `callback`  → recorded, pushr POSTs {notificationId, actionId,
 *                    respondedAt} to the source app's callbackUrl with an
 *                    HMAC-SHA256 signature (X-Pushr-Signature).
 *   - `reply`     → same as callback, plus { reply: <userText> } in body.
 *
 * The HMAC uses the source app's `webhookSecret` (same one used for
 * signed inbound webhooks). No secret set = unsigned POST.
 */

const CALLBACK_TIMEOUT_MS = 10_000;

/**
 * Public action called by the mobile notification response listener.
 */
export const invoke = action({
  args: {
    notificationId: v.id("notifications"),
    actionIdentifier: v.string(), // "act_1" | "act_2" | "reply" | raw action id
    reply: v.optional(v.string()),
    deviceId: v.optional(v.id("devices")),
  },
  returns: v.object({
    ok: v.boolean(),
    kind: v.optional(
      v.union(
        v.literal("open_url"),
        v.literal("callback"),
        v.literal("reply"),
      ),
    ),
    url: v.optional(v.string()),
    callbackStatus: v.optional(v.number()),
    callbackError: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const resolved: {
      action: NotifAction | null;
      webhookSecret: string | null;
      ownerId: string;
    } = await ctx.runQuery(internal.actions.resolveForInvoke, {
      notificationId: args.notificationId,
      actionIdentifier: args.actionIdentifier,
    });
    if (!resolved.action) {
      return { ok: false };
    }
    const act = resolved.action;

    const eventId: Id<"actionEvents"> = await ctx.runMutation(
      internal.actions.recordEventInternal,
      {
        notificationId: args.notificationId,
        ownerId: resolved.ownerId,
        actionId: act.id,
        actionKind: act.kind,
        deviceId: args.deviceId,
        reply: args.reply,
      },
    );

    if (act.kind === "open_url") {
      return { ok: true, kind: "open_url" as const, url: act.url };
    }

    // callback or reply — POST to source app's callback URL.
    const body = JSON.stringify({
      notificationId: args.notificationId,
      actionId: act.id,
      respondedAt: Date.now(),
      ...(act.kind === "reply" && args.reply !== undefined
        ? { reply: args.reply }
        : {}),
    });
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "pushr/1.0",
      "X-Pushr-Source": "pushr",
      "X-Pushr-Notification": String(args.notificationId),
      "X-Pushr-Action": act.id,
    };
    if (resolved.webhookSecret) {
      headers["X-Pushr-Signature"] = `sha256=${await hmacHex(
        body,
        resolved.webhookSecret,
      )}`;
    }

    let callbackStatus: number | undefined;
    let callbackError: string | undefined;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        CALLBACK_TIMEOUT_MS,
      );
      const res = await fetch(act.callbackUrl, {
        method: "POST",
        headers,
        body,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      callbackStatus = res.status;
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        callbackError = text.slice(0, 500) || `HTTP ${res.status}`;
      }
    } catch (err) {
      callbackError = err instanceof Error ? err.message : String(err);
    }

    await ctx.runMutation(internal.actions.updateEventCallbackInternal, {
      id: eventId,
      callbackStatus,
      callbackError,
    });

    return {
      ok: callbackStatus !== undefined && callbackStatus < 400,
      kind: act.kind,
      callbackStatus,
      callbackError,
    };
  },
});

/**
 * Internal: resolve action identifier → action definition, plus the
 * source-app's webhookSecret for signing.
 */
export const resolveForInvoke = internalQuery({
  args: {
    notificationId: v.id("notifications"),
    actionIdentifier: v.string(),
  },
  handler: async (ctx, args) => {
    const notif = await ctx.db.get(args.notificationId);
    if (!notif) {
      throw new ConvexError("Notification not found");
    }
    let action: NotifAction | null = null;
    if (notif.actions && notif.actions.length > 0) {
      action = resolveActionIdentifier(
        notif.actions as NotifAction[],
        args.actionIdentifier,
      );
      // Also accept a raw user-provided id for programmatic callers that
      // don't know about the act_N mapping.
      if (!action) {
        const exact = (notif.actions as NotifAction[]).find(
          (a) => a.id === args.actionIdentifier,
        );
        if (exact) action = exact;
      }
    } else if (notif.action && args.actionIdentifier === "open_action_url") {
      // Back-compat: the legacy single-action category.
      action = {
        kind: "open_url",
        id: "legacy_action",
        label: notif.action.label,
        url: notif.action.url,
      };
    }

    let webhookSecret: string | null = null;
    if (action && (action.kind === "callback" || action.kind === "reply")) {
      const app = await ctx.db.get(notif.sourceAppId);
      webhookSecret = app?.webhookSecret ?? null;
    }
    return { action, webhookSecret, ownerId: notif.ownerId };
  },
});

export const recordEventInternal = internalMutation({
  args: {
    notificationId: v.id("notifications"),
    ownerId: v.string(),
    actionId: v.string(),
    actionKind: v.union(
      v.literal("open_url"),
      v.literal("callback"),
      v.literal("reply"),
    ),
    deviceId: v.optional(v.id("devices")),
    reply: v.optional(v.string()),
  },
  returns: v.id("actionEvents"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("actionEvents", {
      notificationId: args.notificationId,
      ownerId: args.ownerId,
      actionId: args.actionId,
      actionKind: args.actionKind,
      deviceId: args.deviceId,
      reply: args.reply,
      createdAt: Date.now(),
    });
  },
});

export const updateEventCallbackInternal = internalMutation({
  args: {
    id: v.id("actionEvents"),
    callbackStatus: v.optional(v.number()),
    callbackError: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      callbackStatus: args.callbackStatus,
      callbackError: args.callbackError,
      callbackAt: Date.now(),
    });
  },
});

/**
 * Public: action history for a notification the caller owns.
 */
export const listForNotification = query({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, args) => {
    const ownerId = await requireAuth(ctx);
    const notif = await ctx.db.get(args.notificationId);
    if (!notif || notif.ownerId !== ownerId) {
      throw new ConvexError("Notification not found");
    }
    const rows: Doc<"actionEvents">[] = await ctx.db
      .query("actionEvents")
      .withIndex("by_notification", (q) =>
        q.eq("notificationId", args.notificationId),
      )
      .collect();
    rows.sort((a, b) => a.createdAt - b.createdAt);
    return rows;
  },
});

async function hmacHex(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(body),
  );
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type { NotifAction };
