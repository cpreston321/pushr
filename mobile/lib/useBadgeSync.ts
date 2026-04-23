import { useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { authClient } from "./auth-client";
import { setBadge } from "./push";

/**
 * Mirrors the unread-notification count onto the iOS app-icon badge while
 * the user is signed in. Skipped when the session is missing so we don't run
 * an authed query during the logged-out state.
 */
export function useBadgeSync(): void {
  const { data } = authClient().useSession();
  const signedIn = !!data?.session;
  const items = useQuery(
    api.notifications.listMine,
    signedIn ? { limit: 100 } : "skip",
  );

  useEffect(() => {
    if (!signedIn) {
      void setBadge(0);
      return;
    }
    if (items === undefined) return;
    const unread = items.filter((n) => !n.readAt).length;
    void setBadge(unread);
  }, [items, signedIn]);
}
