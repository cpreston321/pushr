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
  const items = useQuery(api.notifications.listMine, isAuthenticated ? { limit: 100 } : 'skip');

  useEffect(() => {
    if (!isAuthenticated) {
      void setBadge(0);
      return;
    }
    if (items === undefined) return;
    const unread = items.filter((n) => !n.readAt).length;
    void setBadge(unread);
  }, [items, isAuthenticated]);
}
