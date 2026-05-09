import { useQuery } from "convex/react";
import { useEffect, useRef } from "react";
import { api } from "../../convex/_generated/api";
import { WidgetData, type WidgetSnapshot } from "pushr-widget-data";
import { useTheme } from "@/lib/theme";

/**
 * Maximum unread items to keep in the App Group snapshot. The widget itself
 * only ever shows 1–3 of these — the rest exist so the user's source-app
 * filter can survive a quiet period without producing an empty widget.
 */
const SNAPSHOT_LIMIT = 50;

/**
 * Pushes the latest snapshot of source apps + unread notifications into the
 * App Group store the Home Screen widget reads from. Re-runs whenever
 * either Convex query updates — Convex de-dupes identical subscriptions,
 * so mounting this alongside the feed screen is essentially free.
 *
 * Mount once, near the auth boundary, so the snapshot stays warm whenever
 * the app is open. The Notification Service Extension also writes to the
 * same store, so the widget stays fresh even with the app closed; this
 * hook just guarantees a full reconciliation whenever the user is using
 * the app.
 */
export function useSyncWidget() {
  const items = useQuery(api.notifications.listMine, { limit: SNAPSHOT_LIMIT });
  const sourceApps = useQuery(api.sourceApps.listMine, {});
  const { colors } = useTheme();
  const lastJSONRef = useRef<string | null>(null);

  useEffect(() => {
    if (!WidgetData.isAvailable()) return;
    if (items === undefined || sourceApps === undefined) return;

    const snapshot: WidgetSnapshot = {
      updatedAt: Date.now(),
      accent: colors.accent,
      sourceApps: sourceApps.map((a) => ({
        id: a._id as unknown as string,
        name: a.name,
        logoUrl: a.logoUrl ?? null,
      })),
      unread: items
        .filter((n) => !n.readAt)
        .map((n) => ({
          id: n._id as unknown as string,
          sourceAppId: n.sourceAppId as unknown as string,
          title: n.title ?? "",
          body: n.body ?? "",
          createdAt: n.createdAt,
          url: n.url ?? null,
          appUrl: n.appUrl ?? null,
        })),
    };

    // Only push when something the widget would actually render has
    // changed. Avoids a WidgetCenter reload on every websocket tick.
    const json = JSON.stringify({
      accent: snapshot.accent,
      sourceApps: snapshot.sourceApps,
      unread: snapshot.unread,
    });
    if (json === lastJSONRef.current) return;
    lastJSONRef.current = json;

    void WidgetData.setSnapshot(snapshot);
  }, [items, sourceApps, colors.accent]);
}
