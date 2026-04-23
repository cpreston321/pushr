"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  categoryForActions,
  layoutActions,
  type NotifAction,
} from "./lib/actionsLayout";

type ExpoMessage = {
  to: string;
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
  priority?: "default" | "normal" | "high";
  // iOS accepts "default", null, or the filename of a sound bundled in the app
  // binary (e.g. "chime.caf"). Android sounds are managed via notification
  // channels and this field is largely ignored.
  sound?: string | null;
  channelId?: string;
  badge?: number;
  richContent?: { image?: string };
  // iOS: the notification category id — maps to the actions the mobile app
  // registers with `Notifications.setNotificationCategoryAsync`.
  categoryId?: string;
};

const CATEGORY_ID = "pushr.default";
const ACTION_CATEGORY_ID = "pushr.action";

type ExpoTicket =
  | { status: "ok"; id: string }
  | {
      status: "error";
      message: string;
      details?: { error?: string; expoPushToken?: string };
    };

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

// Wait this long after sending before polling Expo for delivery receipts.
// Expo recommends >= 15 minutes; receipts are retained for a day.
const RECEIPTS_DELAY_MS = 15 * 60 * 1000;

/**
 * Deliver one pushr notification to every enabled device of the owner.
 * Called from the /notify HTTP endpoint via the push workpool so delivery
 * retries don't block the HTTP response.
 *
 * `opts.forceHighPriority` is used by the ack-or-escalate re-push path:
 * when true, delivery ignores quiet hours and the user's priority-bucket
 * sound mapping, sending as high-priority with default sound. The
 * notification row's `priority` is not mutated.
 */
export const deliver = internalAction({
  args: {
    notificationId: v.id("notifications"),
    forceHighPriority: v.optional(v.boolean()),
  },
  handler: async (ctx, { notificationId, forceHighPriority }) => {
    const notif = await ctx.runQuery(internal.expoPushHelpers.getNotification, {
      id: notificationId,
    });
    if (!notif) return;

    const muted = await ctx.runQuery(internal.expoPushHelpers.isSourceAppMuted, {
      id: notif.sourceAppId,
    });
    if (muted) {
      await ctx.runMutation(internal.notifications.recordDelivery, {
        id: notificationId,
        attemptedDeviceCount: 0,
        successDeviceCount: 0,
        failureMessages: ["source app muted"],
      });
      return;
    }

    const devices = await ctx.runQuery(internal.expoPushHelpers.activeDevicesForOwner, {
      ownerId: notif.ownerId,
    });
    if (devices.length === 0) {
      await ctx.runMutation(internal.notifications.recordDelivery, {
        id: notificationId,
        attemptedDeviceCount: 0,
        successDeviceCount: 0,
      });
      return;
    }

    const appInfo = await ctx.runQuery(internal.expoPushHelpers.getSourceAppInfo, {
      id: notif.sourceAppId,
    });
    // Escalation re-pushes must break through quiet hours — that's the whole
    // point of an un-acked alarm.
    const quiet = forceHighPriority
      ? false
      : isInQuietHours(appInfo?.quietStart, appInfo?.quietEnd);

    const priority = forceHighPriority
      ? "high"
      : quiet
        ? "default"
        : mapPriority(notif.priority);
    const { sound: rawSound } = await ctx.runQuery(
      internal.userPrefs.soundForDelivery,
      { ownerId: notif.ownerId, priority: notif.priority },
    );
    const sound = forceHighPriority ? "default" : quiet ? null : rawSound;
    const logoUrl = appInfo?.logoUrl ?? null;
    const sourceAppName = appInfo?.name ?? "unknown";
    const richActions = (notif.actions ?? undefined) as NotifAction[] | undefined;
    const categoryId = richActions
      ? categoryForActions(richActions)
      : notif.action
        ? ACTION_CATEGORY_ID
        : CATEGORY_ID;
    // Slots carry the ios identifier assignment (act_1/act_2/reply) so the
    // mobile response listener can map back to the user-provided action.
    const actionSlots = richActions
      ? layoutActions(richActions).map((s) => ({
          identifier: s.identifier,
          action: s.action,
        }))
      : undefined;
    const data = {
      ...(notif.data ?? {}),
      notificationId,
      sourceAppId: notif.sourceAppId,
      sourceAppName,
      url: notif.url,
      logoUrl,
      contentImage: notif.image,
      action: notif.action,
      actions: actionSlots,
      ackRequired: notif.ack !== undefined && notif.acknowledgedAt === undefined,
      liveActivity: notif.liveActivity,
    };

    // Insert per-device delivery rows BEFORE hitting Expo so we can correlate
    // each ticket back to a device. `deliveryIds[i]` maps to `devices[i]`.
    const deliveryIds: Id<"deliveries">[] = await ctx.runMutation(
      internal.deliveries.insertPending,
      {
        notificationId,
        ownerId: notif.ownerId,
        deviceIds: devices.map((d) => d._id),
      },
    );

    // `richContent.image` is what Expo uses to flip `mutable-content: 1` in
    // the APNs payload, which is what invokes our NSE (for sender avatars).
    // So we always set it — but the NSE ignores this field and only attaches
    // the separate `data.contentImage` field if the caller explicitly passed
    // `image` to /notify. Result: NSE always runs, attachment only shows
    // when requested.
    const richImage = notif.image ?? logoUrl;
    const messages: ExpoMessage[] = devices.map((d) => ({
      to: d.expoPushToken,
      title: notif.title,
      body: notif.body,
      data,
      priority,
      sound,
      channelId: "default",
      categoryId,
      richContent: richImage ? { image: richImage } : undefined,
    }));

    const tickets = await sendToExpo(messages);

    let success = 0;
    const failures: string[] = [];
    const invalidDeviceIds: Id<"devices">[] = [];
    const outcomes: Array<{
      deliveryId: Id<"deliveries">;
      status: "queued" | "failed" | "invalid";
      expoTicketId?: string;
      errorCode?: string;
      errorMessage?: string;
    }> = [];

    tickets.forEach((ticket, i) => {
      const device = devices[i];
      const deliveryId = deliveryIds[i];
      if (ticket.status === "ok") {
        success += 1;
        outcomes.push({
          deliveryId,
          status: "queued",
          expoTicketId: ticket.id,
        });
        return;
      }
      failures.push(`${device.expoPushToken.slice(0, 20)}…: ${ticket.message}`);
      const invalid = ticket.details?.error === "DeviceNotRegistered";
      if (invalid) invalidDeviceIds.push(device._id);
      outcomes.push({
        deliveryId,
        status: invalid ? "invalid" : "failed",
        errorCode: ticket.details?.error,
        errorMessage: ticket.message,
      });
    });

    await ctx.runMutation(internal.deliveries.applyTicketOutcomes, { outcomes });

    for (const id of invalidDeviceIds) {
      await ctx.runMutation(internal.devices.markInvalid, { id });
    }

    await ctx.runMutation(internal.notifications.recordDelivery, {
      id: notificationId,
      attemptedDeviceCount: devices.length,
      successDeviceCount: success,
      failureMessages: failures.length > 0 ? failures : undefined,
    });

    // Schedule receipts poll so we can finalize delivered/failed statuses.
    // Only bother if at least one ticket was accepted.
    if (success > 0) {
      await ctx.scheduler.runAfter(
        RECEIPTS_DELAY_MS,
        internal.expoReceipts.checkForNotification,
        { notificationId },
      );
    }
  },
});

/**
 * Is the current UTC time inside the quiet-hours window defined by
 * [quietStart, quietEnd) in minutes-since-midnight? Window may wrap past
 * midnight when start > end.
 */
function isInQuietHours(
  quietStart: number | undefined,
  quietEnd: number | undefined,
): boolean {
  if (quietStart === undefined || quietEnd === undefined) return false;
  if (quietStart === quietEnd) return false;
  const now = new Date();
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes();
  if (quietStart < quietEnd) {
    return mins >= quietStart && mins < quietEnd;
  }
  return mins >= quietStart || mins < quietEnd;
}

function mapPriority(p: number | undefined): "default" | "high" {
  if (p === undefined) return "default";
  return p >= 7 ? "high" : "default";
}

async function sendToExpo(messages: ExpoMessage[]): Promise<ExpoTicket[]> {
  if (messages.length === 0) return [];
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept-Encoding": "gzip, deflate",
    Accept: "application/json",
  };
  if (process.env.EXPO_ACCESS_TOKEN) {
    headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
  }

  // Expo accepts up to 100 messages per request
  const out: ExpoTicket[] = [];
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(chunk),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Expo push failed: ${res.status} ${text}`);
    }
    const json = (await res.json()) as { data: ExpoTicket[] };
    out.push(...json.data);
  }
  return out;
}
