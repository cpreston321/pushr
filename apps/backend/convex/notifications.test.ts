import { convexTest } from 'convex-test';
import { test, expect, describe } from 'vitest';
import schema from './schema';
import { api } from './_generated/api';

// `convex-test` autoloads function modules via `import.meta.glob`. We hand
// it the full set explicitly because the repo's monorepo layout
// (apps/backend/convex/...) doesn't match the library's default
// "<repo>/convex sibling to node_modules" assumption. The negation
// pattern excludes test files themselves so they don't try to recurse.
const modules = import.meta.glob([
  './**/*.ts',
  './**/*.tsx',
  '!./**/*.test.ts',
  '!./**/*.test.tsx'
]);

/**
 * Foundational tests for the notifications feed.
 *
 * `convex-test` runs the actual function code against an in-memory
 * implementation of the Convex runtime, including auth identities. We
 * scope tests to behaviour observable through the public API — auth
 * gating, empty-state semantics, ownership scoping — rather than internal
 * helpers.
 */

/** First page of the feed, for tests that just want "what's in the feed". */
const firstPage = { paginationOpts: { numItems: 50, cursor: null } };

describe('notifications.listMine', () => {
  test('rejects unauthenticated callers', async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.notifications.listMine, firstPage)).rejects.toThrow(
      /Not authenticated/
    );
  });

  test('returns an empty list for a user with no source apps', async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: 'user_alice' });
    const result = await asUser.query(api.notifications.listMine, firstPage);
    expect(result.page).toEqual([]);
    expect(result.isDone).toBe(true);
  });

  test('pages through the merged feed in creation order', async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: 'user_alice' });
    // Two apps interleaved in time — the feed is a merge across both, so
    // paging has to respect the global order, not each app's.
    await t.run(async (ctx) => {
      const apps = await Promise.all(
        ['alpha', 'beta'].map((name) =>
          ctx.db.insert('sourceApps', {
            ownerId: 'user_alice',
            name,
            tokenHash: `hash_${name}`,
            tokenPrefix: `pshr_${name}`,
            enabled: true,
            createdAt: 1
          })
        )
      );
      for (let i = 0; i < 6; i++) {
        await ctx.db.insert('notifications', {
          ownerId: 'user_alice',
          sourceAppId: apps[i % 2],
          title: `n${i}`,
          body: 'b',
          createdAt: i + 1,
          attemptedDeviceCount: 0,
          successDeviceCount: 0
        });
      }
    });

    const page1 = await asUser.query(api.notifications.listMine, {
      paginationOpts: { numItems: 4, cursor: null }
    });
    expect(page1.page.map((n) => n.title)).toEqual(['n5', 'n4', 'n3', 'n2']);
    expect(page1.isDone).toBe(false);

    const page2 = await asUser.query(api.notifications.listMine, {
      paginationOpts: { numItems: 4, cursor: page1.continueCursor }
    });
    // Continues where page 1 stopped — no repeats, no gaps across the merge.
    expect(page2.page.map((n) => n.title)).toEqual(['n1', 'n0']);
    expect(page2.isDone).toBe(true);
  });

  test('decorates rows with their source app', async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: 'user_alice' });
    await t.run(async (ctx) => {
      const appId = await ctx.db.insert('sourceApps', {
        ownerId: 'user_alice',
        name: 'alerts',
        tokenHash: 'h',
        tokenPrefix: 'p',
        enabled: true,
        createdAt: 1,
        logoColor: '#123456'
      });
      await ctx.db.insert('notifications', {
        ownerId: 'user_alice',
        sourceAppId: appId,
        title: 'hi',
        body: 'b',
        createdAt: 1,
        attemptedDeviceCount: 0,
        successDeviceCount: 0
      });
    });
    const result = await asUser.query(api.notifications.listMine, firstPage);
    expect(result.page[0]).toMatchObject({
      sourceAppName: 'alerts',
      sourceAppLogoColor: '#123456',
      sourceAppLogoUrl: null
    });
  });
});

describe('sourceApps.listMine', () => {
  test('rejects unauthenticated callers', async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.sourceApps.listMine, {})).rejects.toThrow(/Not authenticated/);
  });

  test('returns an empty list for a user with no source apps', async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: 'user_alice' });
    const result = await asUser.query(api.sourceApps.listMine, {});
    expect(result).toEqual([]);
  });
});

describe('notifications.markAllRead / clearAll', () => {
  test('markAllRead reports 0 affected for users with no notifications', async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: 'user_alice' });
    const affected = await asUser.mutation(api.notifications.markAllRead, {});
    expect(affected).toBe(0);
  });

  test('clearAll reports 0 affected for users with no notifications', async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: 'user_alice' });
    const affected = await asUser.mutation(api.notifications.clearAll, {});
    expect(affected).toBe(0);
  });
});

describe('notifications.clearAll scoping', () => {
  /**
   * Seeds two owned apps with one notification each and returns their ids.
   * Inserted directly rather than through `/notify` so the test stays about
   * clearing, not about ingest.
   */
  async function seedTwoApps(t: ReturnType<typeof convexTest>, ownerId: string) {
    return await t.run(async (ctx) => {
      const ids: Record<string, string> = {};
      for (const name of ['alpha', 'beta']) {
        const appId = await ctx.db.insert('sourceApps', {
          ownerId,
          name,
          tokenHash: `hash_${name}`,
          tokenPrefix: `pshr_${name}`,
          enabled: true,
          createdAt: 1
        });
        await ctx.db.insert('notifications', {
          ownerId,
          sourceAppId: appId,
          title: `${name} title`,
          body: `${name} body`,
          createdAt: 1,
          attemptedDeviceCount: 0,
          successDeviceCount: 0
        });
        ids[name] = appId;
      }
      return ids;
    });
  }

  test('clears only the named app when given a sourceAppId', async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: 'user_alice' });
    const ids = await seedTwoApps(t, 'user_alice');

    const deleted = await asUser.mutation(api.notifications.clearAll, {
      sourceAppId: ids.alpha as any
    });
    expect(deleted).toBe(1);

    const remaining = await asUser.query(api.notifications.listMine, firstPage);
    expect(remaining.page.map((n) => n.title)).toEqual(['beta title']);
  });

  test('clears every owned app when no sourceAppId is given', async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: 'user_alice' });
    await seedTwoApps(t, 'user_alice');

    const deleted = await asUser.mutation(api.notifications.clearAll, {});
    expect(deleted).toBe(2);
    expect((await asUser.query(api.notifications.listMine, firstPage)).page).toEqual([]);
  });

  test("leaves another owner's notifications alone when scoped to their app", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedTwoApps(t, 'user_bob');
    const asMallory = t.withIdentity({ subject: 'user_mallory' });

    const deleted = await asMallory.mutation(api.notifications.clearAll, {
      sourceAppId: ids.alpha as any
    });
    expect(deleted).toBe(0);

    const bobsFeed = await t
      .withIdentity({ subject: 'user_bob' })
      .query(api.notifications.listMine, firstPage);
    expect(bobsFeed.page).toHaveLength(2);
  });
});

describe('notifications.markAllRead scoping', () => {
  async function seedUnread(t: ReturnType<typeof convexTest>, ownerId: string) {
    return await t.run(async (ctx) => {
      const ids: Record<string, string> = {};
      for (const name of ['alpha', 'beta']) {
        const appId = await ctx.db.insert('sourceApps', {
          ownerId,
          name,
          tokenHash: `hash_${name}`,
          tokenPrefix: `pshr_${name}`,
          enabled: true,
          createdAt: 1
        });
        await ctx.db.insert('notifications', {
          ownerId,
          sourceAppId: appId,
          title: `${name} title`,
          body: `${name} body`,
          createdAt: 1,
          attemptedDeviceCount: 0,
          successDeviceCount: 0
        });
        ids[name] = appId;
      }
      return ids;
    });
  }

  test('marks only the named app read when given a sourceAppId', async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: 'user_alice' });
    const ids = await seedUnread(t, 'user_alice');

    const affected = await asUser.mutation(api.notifications.markAllRead, {
      sourceAppId: ids.alpha as any
    });
    expect(affected).toBe(1);

    const feed = await asUser.query(api.notifications.listMine, firstPage);
    const unread = feed.page.filter((n) => n.readAt === undefined).map((n) => n.title);
    expect(unread).toEqual(['beta title']);
  });

  test('marks every accessible app read when no sourceAppId is given', async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: 'user_alice' });
    await seedUnread(t, 'user_alice');

    expect(await asUser.mutation(api.notifications.markAllRead, {})).toBe(2);
    const feed = await asUser.query(api.notifications.listMine, firstPage);
    expect(feed.page.every((n) => n.readAt !== undefined)).toBe(true);
  });

  test('marks nothing for an app the caller cannot see', async () => {
    const t = convexTest(schema, modules);
    const ids = await seedUnread(t, 'user_bob');
    const asMallory = t.withIdentity({ subject: 'user_mallory' });

    const affected = await asMallory.mutation(api.notifications.markAllRead, {
      sourceAppId: ids.alpha as any
    });
    expect(affected).toBe(0);
  });
});

/**
 * Unread counting via the `by_sourceApp_read` index.
 *
 * `readAt` is optional, so these pin the assumption the index rests on: a row
 * that never had the field and a row whose field was cleared both live in the
 * `undefined` bucket, and neither needs a backfill. If that were wrong, the
 * badge would silently under-count instead of failing.
 */
describe('unread counting', () => {
  async function seedFeed(t: ReturnType<typeof convexTest>) {
    return await t.run(async (ctx) => {
      const sourceAppId = await ctx.db.insert('sourceApps', {
        ownerId: 'user_alice',
        name: 'alerts',
        tokenHash: 'hash',
        tokenPrefix: 'pshr_a',
        enabled: true,
        createdAt: 1
      });
      const base = {
        ownerId: 'user_alice',
        sourceAppId,
        body: 'b',
        attemptedDeviceCount: 0,
        successDeviceCount: 0
      };
      // Never read — the field is absent entirely.
      await ctx.db.insert('notifications', { ...base, title: 'unread-1', createdAt: 1 });
      await ctx.db.insert('notifications', { ...base, title: 'unread-2', createdAt: 2 });
      // Read — the field is set.
      await ctx.db.insert('notifications', {
        ...base,
        title: 'read-1',
        createdAt: 3,
        readAt: 99
      });
      // Read, then un-read: the patch clears the field back to undefined.
      const toggled = await ctx.db.insert('notifications', {
        ...base,
        title: 'toggled',
        createdAt: 4,
        readAt: 99
      });
      await ctx.db.patch(toggled, { readAt: undefined });
      return sourceAppId;
    });
  }

  test('the index returns exactly the rows with no readAt', async () => {
    const t = convexTest(schema, modules);
    const sourceAppId = await seedFeed(t);

    const unread = await t.run(async (ctx) =>
      ctx.db
        .query('notifications')
        .withIndex('by_sourceApp_read', (q) =>
          q.eq('sourceAppId', sourceAppId).eq('readAt', undefined)
        )
        .collect()
    );
    expect(unread.map((n) => n.title).sort()).toEqual(['toggled', 'unread-1', 'unread-2']);
  });

  test('unreadCount agrees with the index', async () => {
    const t = convexTest(schema, modules);
    await seedFeed(t);
    const asUser = t.withIdentity({ subject: 'user_alice' });
    expect(await asUser.query(api.notifications.unreadCount, {})).toBe(3);
  });

  test('markAllRead empties the unread bucket', async () => {
    const t = convexTest(schema, modules);
    const sourceAppId = await seedFeed(t);
    const asUser = t.withIdentity({ subject: 'user_alice' });

    expect(await asUser.mutation(api.notifications.markAllRead, {})).toBe(3);
    expect(await asUser.query(api.notifications.unreadCount, {})).toBe(0);

    const stillUnread = await t.run(async (ctx) =>
      ctx.db
        .query('notifications')
        .withIndex('by_sourceApp_read', (q) =>
          q.eq('sourceAppId', sourceAppId).eq('readAt', undefined)
        )
        .collect()
    );
    expect(stillUnread).toHaveLength(0);
  });

  test('un-reading a row puts it back in the unread bucket', async () => {
    const t = convexTest(schema, modules);
    await seedFeed(t);
    const asUser = t.withIdentity({ subject: 'user_alice' });
    await asUser.mutation(api.notifications.markAllRead, {});

    const anyRow = await t.run(async (ctx) =>
      ctx.db.query('notifications').withIndex('by_sourceApp_created').first()
    );
    await asUser.mutation(api.notifications.setRead, { id: anyRow!._id, read: false });

    expect(await asUser.query(api.notifications.unreadCount, {})).toBe(1);
  });
});
