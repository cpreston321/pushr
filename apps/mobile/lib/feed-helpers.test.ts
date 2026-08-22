import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import {
  entryTimestamp,
  feedBucket,
  formatRelative,
  groupFeedItems,
  type FeedEntry,
  type FeedItem
} from './feed-helpers';

/**
 * Helper to fabricate a FeedItem-shaped object. Tests only care about the
 * fields read by `groupFeedItems` (`liveActivity.activityId`) so we cast
 * past the rest of the schema. `_id` is loosened to plain `string` because
 * Convex's branded `Id<'notifications'>` rejects test fixture literals.
 */
function makeItem(partial: { _id: string } & Partial<Omit<FeedItem, '_id'>>): FeedItem {
  return partial as unknown as FeedItem;
}

describe('groupFeedItems', () => {
  it('returns [] when items is undefined', () => {
    expect(groupFeedItems(undefined)).toEqual([]);
  });

  it('returns [] when items is an empty list', () => {
    expect(groupFeedItems([])).toEqual([]);
  });

  it('wraps non-liveActivity items as singles in arrival order', () => {
    const a = makeItem({ _id: 'a' });
    const b = makeItem({ _id: 'b' });
    const out = groupFeedItems([a, b]);
    expect(out).toEqual([
      { kind: 'single', item: a },
      { kind: 'single', item: b }
    ]);
  });

  it('collapses consecutive liveActivity items sharing an activityId', () => {
    const newest = makeItem({
      _id: 'n3',
      liveActivity: { activityId: 'deploy-1' }
    } as Partial<FeedItem> & Pick<FeedItem, '_id'>);
    const middle = makeItem({
      _id: 'n2',
      liveActivity: { activityId: 'deploy-1' }
    } as Partial<FeedItem> & Pick<FeedItem, '_id'>);
    const oldest = makeItem({
      _id: 'n1',
      liveActivity: { activityId: 'deploy-1' }
    } as Partial<FeedItem> & Pick<FeedItem, '_id'>);

    // Items arrive newest-first.
    const out = groupFeedItems([newest, middle, oldest]);
    expect(out).toHaveLength(1);
    const entry = out[0];
    if (entry.kind !== 'group') throw new Error('expected group');
    expect(entry.activityId).toBe('deploy-1');
    expect(entry.latest._id).toBe('n3');
    expect(entry.all.map((i) => i._id)).toEqual(['n3', 'n2', 'n1']);
  });

  it('keeps separate groups for different activityIds and interleaves with singles', () => {
    const da = makeItem({
      _id: 'da-2',
      liveActivity: { activityId: 'deploy-a' }
    } as Partial<FeedItem> & Pick<FeedItem, '_id'>);
    const single = makeItem({ _id: 'x1' });
    const db = makeItem({
      _id: 'db-1',
      liveActivity: { activityId: 'deploy-b' }
    } as Partial<FeedItem> & Pick<FeedItem, '_id'>);
    const da2 = makeItem({
      _id: 'da-1',
      liveActivity: { activityId: 'deploy-a' }
    } as Partial<FeedItem> & Pick<FeedItem, '_id'>);

    const out = groupFeedItems([da, single, db, da2]);
    expect(out).toHaveLength(3);
    expect(out[0].kind).toBe('group');
    expect(out[1].kind).toBe('single');
    expect(out[2].kind).toBe('group');
    if (out[0].kind === 'group') {
      expect(out[0].all.map((i) => i._id)).toEqual(['da-2', 'da-1']);
    }
    if (out[2].kind === 'group') {
      expect(out[2].all.map((i) => i._id)).toEqual(['db-1']);
    }
  });
});

describe('formatRelative', () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-09T12:00:00Z'));
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it('renders <60s as seconds', () => {
    expect(formatRelative(Date.now() - 5_000)).toBe('5s');
    expect(formatRelative(Date.now() - 59_000)).toBe('59s');
  });

  it('renders <60m as minutes', () => {
    expect(formatRelative(Date.now() - 90_000)).toBe('2m');
    expect(formatRelative(Date.now() - 30 * 60_000)).toBe('30m');
  });

  it('renders <24h as hours', () => {
    expect(formatRelative(Date.now() - 2 * 60 * 60_000)).toBe('2h');
    expect(formatRelative(Date.now() - 23 * 60 * 60_000)).toBe('23h');
  });

  it('renders >=24h as days', () => {
    expect(formatRelative(Date.now() - 24 * 60 * 60_000)).toBe('1d');
    expect(formatRelative(Date.now() - 7 * 24 * 60 * 60_000)).toBe('7d');
  });
});

describe('feedBucket', () => {
  // A mid-morning "now" so day arithmetic isn't sitting on a boundary.
  const now = new Date('2026-05-09T10:00:00').getTime();
  const at = (iso: string) => new Date(iso).getTime();

  it('buckets anything since midnight today as New', () => {
    expect(feedBucket(now, now)).toBe('New');
    expect(feedBucket(at('2026-05-09T00:00:00'), now)).toBe('New');
    expect(feedBucket(at('2026-05-09T09:59:59'), now)).toBe('New');
  });

  it('buckets by calendar day, not elapsed hours', () => {
    // 11 hours old, but it landed yesterday — so it must not read as New.
    expect(feedBucket(at('2026-05-08T23:00:00'), now)).toBe('Yesterday');
    expect(feedBucket(at('2026-05-08T00:00:00'), now)).toBe('Yesterday');
  });

  it('buckets 2–7 days back as Previous 7 days', () => {
    expect(feedBucket(at('2026-05-07T12:00:00'), now)).toBe('Previous 7 days');
    expect(feedBucket(at('2026-05-03T00:00:00'), now)).toBe('Previous 7 days');
  });

  it('buckets anything older as Earlier', () => {
    expect(feedBucket(at('2026-05-02T23:59:59'), now)).toBe('Earlier');
    expect(feedBucket(at('2025-11-01T12:00:00'), now)).toBe('Earlier');
  });

  it('treats a clock-skewed future timestamp as New', () => {
    expect(feedBucket(now + 60_000, now)).toBe('New');
  });

  it('never revisits a bucket walking a newest-first feed', () => {
    // The property the section headings depend on: because the feed is sorted
    // newest-first, bucket indices only ever move forward — so each heading is
    // emitted exactly once. Read state used to drive this and broke it, since
    // read/unread alternates freely down the list.
    const timestamps = [
      at('2026-05-09T09:00:00'),
      at('2026-05-09T01:00:00'),
      at('2026-05-08T22:00:00'),
      at('2026-05-06T10:00:00'),
      at('2026-05-04T10:00:00'),
      at('2026-04-01T10:00:00')
    ];
    const order = ['New', 'Yesterday', 'Previous 7 days', 'Earlier'];
    const seen = timestamps.map((t) => order.indexOf(feedBucket(t, now)));
    expect(seen).toEqual([...seen].sort((a, b) => a - b));

    const headings = timestamps
      .map((t) => feedBucket(t, now))
      .filter((b, i, all) => i === 0 || b !== all[i - 1]);
    expect(headings).toEqual([...new Set(headings)]);
    expect(headings).toEqual(['New', 'Yesterday', 'Previous 7 days', 'Earlier']);
  });
});

describe('entryTimestamp', () => {
  it("reads a single entry's own timestamp", () => {
    const entry: FeedEntry = {
      kind: 'single',
      item: makeItem({ _id: 'a', createdAt: 1234 })
    };
    expect(entryTimestamp(entry)).toBe(1234);
  });

  it("reads a group's most recent event", () => {
    const latest = makeItem({ _id: 'b-2', createdAt: 9000 });
    const entry: FeedEntry = {
      kind: 'group',
      activityId: 'b',
      latest,
      all: [latest, makeItem({ _id: 'b-1', createdAt: 1000 })]
    };
    expect(entryTimestamp(entry)).toBe(9000);
  });
});
