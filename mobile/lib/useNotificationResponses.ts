import { useEffect } from "react";
import { Linking } from "react-native";
import * as Notifications from "expo-notifications";
import { useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { NotifAction } from "../../convex/lib/actionsLayout";
import { LiveActivity } from "../modules/live-activity";

type LiveActivityPayload = {
  action: "start" | "update" | "end";
  activityId: string;
  state: {
    title?: string;
    status?: string;
    progress?: number;
    icon?: string;
  };
  attributes?: { name?: string; logoUrl?: string };
  staleDate?: number;
  relevanceScore?: number;
};

/**
 * Dispatch a received notification's `data.liveActivity` payload into
 * ActivityKit. Quiet no-op when the native module isn't loaded (Android,
 * Expo Go, iOS < 16.2) so the listener can call this unconditionally.
 */
async function applyLiveActivity(la: LiveActivityPayload): Promise<void> {
  if (!LiveActivity.isAvailable()) return;
  try {
    if (la.action === "start") {
      await LiveActivity.start({
        activityId: la.activityId,
        attributes: la.attributes,
        state: la.state,
        staleDate: la.staleDate,
        relevanceScore: la.relevanceScore,
      });
    } else if (la.action === "update") {
      await LiveActivity.update({
        activityId: la.activityId,
        state: la.state,
        staleDate: la.staleDate,
        relevanceScore: la.relevanceScore,
      });
    } else if (la.action === "end") {
      await LiveActivity.end({
        activityId: la.activityId,
        state: la.state,
      });
    }
  } catch {
    // Swallow — Live Activity failures shouldn't crash the response handler.
  }
}

type ActionSlot = { identifier: string; action: NotifAction };

/**
 * Subscribe to notification action responses and dispatch them.
 *
 * Identifier dispatch:
 *   - "mark_read" / DEFAULT → mark notification read.
 *   - "open_link" / legacy "open_action_url" → open data.url / data.action.url.
 *   - "act_N" / "reply" → look up the slot in data.actions and call
 *     api.actions.invoke. For `open_url` we also open the URL locally so the
 *     user doesn't have to wait for the round-trip.
 *
 * Meant to be mounted once from the root layout inside the Convex provider.
 */
export function useNotificationResponses(): void {
  const markRead = useMutation(api.notifications.markRead);
  const invoke = useAction(api.actions.invoke);

  useEffect(() => {
    // Fires when a push arrives on-device (foreground and background).
    // We use this to drive Live Activity start/update/end — those are
    // side-effects of receiving the push, not of the user tapping it.
    const received = Notifications.addNotificationReceivedListener((n) => {
      const data = n.request.content.data as
        | { liveActivity?: LiveActivityPayload }
        | undefined;
      if (data?.liveActivity) void applyLiveActivity(data.liveActivity);
    });

    const sub = Notifications.addNotificationResponseReceivedListener((res) => {
      const data = res.notification.request.content.data as
        | {
            notificationId?: string;
            url?: string;
            action?: { label: string; url: string };
            actions?: ActionSlot[];
          }
        | undefined;
      const notificationId = data?.notificationId as
        | Id<"notifications">
        | undefined;
      const identifier = res.actionIdentifier;

      if (identifier === "mark_read") {
        if (notificationId) void markRead({ id: notificationId });
        return;
      }
      if (identifier === "open_link" && data?.url) {
        void Linking.openURL(data.url).catch(() => {});
        if (notificationId) void markRead({ id: notificationId });
        return;
      }
      if (identifier === "open_action_url" && data?.action?.url) {
        void Linking.openURL(data.action.url).catch(() => {});
        if (notificationId) void markRead({ id: notificationId });
        return;
      }

      // New rich-action dispatch: act_1..act_4 | reply
      if (
        notificationId &&
        (identifier === "reply" || /^act_[1-4]$/.test(identifier))
      ) {
        const slot = data?.actions?.find((s) => s.identifier === identifier);
        // Open the URL locally for snappy UX; the backend invoke call only
        // records the event for this kind.
        if (slot?.action.kind === "open_url") {
          void Linking.openURL(slot.action.url).catch(() => {});
        }
        void invoke({
          notificationId,
          actionIdentifier: identifier,
          reply:
            typeof (res as unknown as { userText?: string }).userText === "string"
              ? (res as unknown as { userText?: string }).userText
              : undefined,
        }).catch(() => {});
        void markRead({ id: notificationId });
        return;
      }

      // Default tap opens the app; mark the underlying notification read.
      if (
        identifier === Notifications.DEFAULT_ACTION_IDENTIFIER &&
        notificationId
      ) {
        void markRead({ id: notificationId });
      }
    });
    return () => {
      sub.remove();
      received.remove();
    };
  }, [markRead, invoke]);
}
