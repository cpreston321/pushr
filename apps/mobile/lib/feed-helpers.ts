import type { FunctionReturnType } from 'convex/server';
import { api } from '@pushr/backend/_generated/api';

export type FeedItem = FunctionReturnType<typeof api.notifications.listMine>['page'][number];

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

/** Timestamp a feed entry sorts by — a group sorts by its most recent event. */
export function entryTimestamp(entry: FeedEntry): number {
  return entry.kind === 'group' ? entry.latest.createdAt : entry.item.createdAt;
}

/**
 * Age buckets the feed is divided into. Ordered newest → oldest, and the feed
 * itself is newest-first, so an entry's bucket index only ever increases as you
 * scroll. That's what keeps each heading appearing exactly once.
 */
export const FEED_BUCKETS = ['New', 'Yesterday', 'Previous 7 days', 'Earlier'] as const;

export type FeedBucket = (typeof FEED_BUCKETS)[number];

/**
 * Which age bucket a timestamp falls into, by calendar day rather than elapsed
 * hours — something sent at 11pm should read "Yesterday" the next morning, not
 * "New" for another 23 hours.
 */
export function feedBucket(ts: number, now: number = Date.now()): FeedBucket {
  const startOfDay = (t: number) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const dayMs = 24 * 60 * 60 * 1000;
  // Round rather than floor: a DST transition between the two dates shifts the
  // span by an hour, which would otherwise tip the division to the wrong day.
  const daysBack = Math.round((startOfDay(now) - startOfDay(ts)) / dayMs);

  // `<= 0` also absorbs a clock-skewed future timestamp as current.
  if (daysBack <= 0) return 'New';
  if (daysBack === 1) return 'Yesterday';
  if (daysBack <= 6) return 'Previous 7 days';
  return 'Earlier';
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
