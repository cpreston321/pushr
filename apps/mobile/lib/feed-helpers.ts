import type { FunctionReturnType } from 'convex/server';
import { api } from '@pushr/backend/_generated/api';

export type FeedItem = FunctionReturnType<typeof api.notifications.listMine>[number];

export type FeedEntry =
  | { kind: 'single'; item: FeedItem }
  | {
      kind: 'group';
      activityId: string;
      latest: FeedItem;
      all: FeedItem[];
    };

/**
 * Collapse consecutive `liveActivity` notifications that share the same
 * `activityId` into a single group. Items arrive newest-first, so
 * `latest` is the head of each group and `all` is every event (start +
 * updates + end) for that activity in reverse chronological order.
 */
export function groupFeedItems(items?: FeedItem[]): FeedEntry[] {
  if (!items) return [];
  const out: FeedEntry[] = [];
  const indexByActivity = new Map<string, number>();
  for (const item of items) {
    const activityId = item.liveActivity?.activityId;
    if (!activityId) {
      out.push({ kind: 'single', item });
      continue;
    }
    const existingIdx = indexByActivity.get(activityId);
    if (existingIdx !== undefined) {
      const existing = out[existingIdx];
      if (existing.kind === 'group') {
        existing.all.push(item);
      }
      continue;
    }
    out.push({ kind: 'group', activityId, latest: item, all: [item] });
    indexByActivity.set(activityId, out.length - 1);
  }
  return out;
}

/**
 * Compact "time-since" formatter. Granularity steps up at the natural
 * cliffs (60s → minutes, 60m → hours, 24h → days). Always rounds, so
 * a 31-second-old item reads "1m" instead of "0m".
 */
export function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  return `${d}d`;
}
