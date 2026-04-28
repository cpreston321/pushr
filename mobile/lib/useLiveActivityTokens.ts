import { useEffect, useRef } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { LiveActivity } from "../modules/live-activity";

type UpdateTokenCache = {
  activityId: string;
  nativeActivityId: string;
  token: string;
};

/**
 * Reports ActivityKit push-to-start and per-activity update tokens to the
 * pushr backend so it can drive Live Activities via APNs direct-push.
 *
 * Mount once (from the root layout inside the Convex provider). `deviceId`
 * may be undefined early in the app lifecycle — we cache the most recent
 * token and flush it once the id arrives, so we never drop a token on the
 * devices-query race.
 */
export function useLiveActivityTokens(
  deviceId: Id<"devices"> | undefined,
): void {
  const registerStart = useMutation(
    api.devices.registerLiveActivityPushToStartToken,
  );
  const registerUpdate = useMutation(api.liveActivities.registerUpdateToken);

  // Buffers for tokens that arrived before we knew the deviceId. We also
  // remember the last registered token so we don't spam the backend with
  // duplicates when re-renders replay the subscribe effect.
  const pendingStartToken = useRef<string | null>(null);
  const lastRegisteredStart = useRef<string | null>(null);
  const pendingUpdateTokens = useRef<Map<string, UpdateTokenCache>>(new Map());
  const lastRegisteredUpdate = useRef<Map<string, string>>(new Map());

  // Subscribe to events exactly once.
  useEffect(() => {
    if (!LiveActivity.isAvailable()) return;
    void LiveActivity.enablePushUpdates();

    // Backfill from the native cache so a JS reload doesn't drop tokens
    // the observer captured before the new listener was attached.
    void LiveActivity.getLastPushToStartToken().then((token) => {
      if (token) {
        // One-line diagnostic so we can compare against what the backend
        // actually sent to APNs. Remove once push-to-start is stable.
        console.log("[la] cached p2s token:", token.slice(-12));
        pendingStartToken.current = token;
        flushStart();
      }
    });
    void LiveActivity.getActivityUpdateTokens().then((tokens) => {
      for (const t of tokens) {
        pendingUpdateTokens.current.set(t.activityId, t);
      }
      if (tokens.length > 0) flushUpdates();
    });

    const startSub = LiveActivity.onPushToStartToken((e) => {
      console.log("[la] fresh p2s token:", e.token.slice(-12));
      pendingStartToken.current = e.token;
      flushStart();
    });

    const updateSub = LiveActivity.onActivityUpdateToken((e) => {
      console.log(
        "[la] fresh update token:",
        e.activityId,
        "token=",
        e.token.slice(-12),
      );
      pendingUpdateTokens.current.set(e.activityId, {
        activityId: e.activityId,
        nativeActivityId: e.nativeActivityId,
        token: e.token,
      });
      flushUpdates();
    });

    return () => {
      startSub.remove();
      updateSub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Flush whenever a fresh deviceId becomes available.
  useEffect(() => {
    flushStart();
    flushUpdates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId]);

  function flushStart() {
    const token = pendingStartToken.current;
    if (!deviceId || !token) return;
    if (lastRegisteredStart.current === token) return;
    void registerStart({ deviceId, token })
      .then(() => {
        lastRegisteredStart.current = token;
      })
      .catch(() => {
        // Retry on next flush trigger.
      });
  }

  function flushUpdates() {
    if (!deviceId) {
      if (pendingUpdateTokens.current.size > 0) {
        console.log(
          "[la] update tokens waiting on deviceId; queued=",
          pendingUpdateTokens.current.size,
        );
      }
      return;
    }
    for (const cached of pendingUpdateTokens.current.values()) {
      if (lastRegisteredUpdate.current.get(cached.activityId) === cached.token) {
        continue;
      }
      console.log(
        "[la] registering update token:",
        cached.activityId,
        "token=",
        cached.token.slice(-12),
      );
      void registerUpdate({
        activityId: cached.activityId,
        nativeActivityId: cached.nativeActivityId,
        pushUpdateToken: cached.token,
        deviceId,
      })
        .then(() => {
          console.log("[la] registered update token:", cached.activityId);
          lastRegisteredUpdate.current.set(cached.activityId, cached.token);
        })
        .catch((err) => {
          console.log(
            "[la] register update token failed:",
            cached.activityId,
            String(err),
          );
        });
    }
  }
}
