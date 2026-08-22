import { useEffect } from 'react';
import { useConvexAuth, useQuery } from 'convex/react';
import { api } from '@pushr/backend/_generated/api';
import { setBadge } from './push';

/**
 * Mirrors the unread-notification count onto the iOS app-icon badge while
 * the user is signed in. Gates on `useConvexAuth().isAuthenticated` rather
 * than better-auth's local session so we don't fire authed queries during
 * the brief window after a password change / token rotation when the local
 * session looks valid but Convex's verifier hasn't accepted the new JWT.
 */
export function useBadgeSync(): void {
  const { isAuthenticated } = useConvexAuth();
  // Counted server-side off the `by_sourceApp_read` index. Pulling 100 feed
  // rows to count the unread ones in JS read the whole prefix of every
  // accessible app for a single number.
  const unread = useQuery(api.notifications.unreadCount, isAuthenticated ? {} : 'skip');

  useEffect(() => {
    if (!isAuthenticated) {
      void setBadge(0);
      return;
    }
    if (unread === undefined) return;
    void setBadge(unread);
  }, [unread, isAuthenticated]);
}
