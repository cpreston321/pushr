import { convexTest } from 'convex-test';
import { test, expect, describe } from 'vitest';
import schema from './schema';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';

const modules = import.meta.glob([
  './**/*.ts',
  './**/*.tsx',
  '!./**/*.test.ts',
  '!./**/*.test.tsx'
]);

/**
 * `/notify` replay guard. These drive `notifyInternal.ingest` directly — the
 * HTTP layer above it only translates the header and skips scheduling, while
 * the guarantee itself (one notification, no double quota spend) lives here.
 */
describe('notify idempotency', () => {
  const TOKEN = 'pshr_test_token';

  async function seedApp(t: ReturnType<typeof convexTest>) {
    // The token is matched by hash, so store the hash the same way ingest does.
    const { sha256Hex } = await import('./lib/tokens');
    const tokenHash = await sha256Hex(TOKEN);
    return await t.run(async (ctx) =>
      ctx.db.insert('sourceApps', {
        ownerId: 'user_alice',
        name: 'ci',
        tokenHash,
        tokenPrefix: 'pshr_test',
        enabled: true,
        createdAt: 1
      })
    );
  }

  const send = (
    t: ReturnType<typeof convexTest>,
    overrides: Record<string, unknown> = {}
  ) =>
    t.mutation(internal.notifyInternal.ingest, {
      token: TOKEN,
      title: 'Deploy finished',
      body: 'main → production',
      ...overrides
    } as any);

  test('a retry with the same key returns the original id and writes nothing new', async () => {
    const t = convexTest(schema, modules);
    await seedApp(t);

    const first = await send(t, { idempotencyKey: 'run-42' });
    expect(first.replayed).toBeUndefined();

    const second = await send(t, { idempotencyKey: 'run-42' });
    expect(second.replayed).toBe(true);
    expect(second.notificationId).toBe(first.notificationId);

    const rows = await t.run(async (ctx) => ctx.db.query('notifications').collect());
    expect(rows).toHaveLength(1);
  });

  test('a replay does not spend quota', async () => {
    const t = convexTest(schema, modules);
    await seedApp(t);
    await send(t, { idempotencyKey: 'run-42' });
    const afterFirst = await t.run(async (ctx) => ctx.db.query('usageCounters').collect());
    const usedAfterFirst = afterFirst.map((c) => c.count);
    // Guard against the assertion below passing vacuously on an empty table.
    expect(usedAfterFirst).toEqual([1]);

    await send(t, { idempotencyKey: 'run-42' });
    const afterReplay = await t.run(async (ctx) => ctx.db.query('usageCounters').collect());
    expect(afterReplay.map((c) => c.count)).toEqual(usedAfterFirst);
  });

  test('reusing a key with a different payload is rejected', async () => {
    const t = convexTest(schema, modules);
    await seedApp(t);
    await send(t, { idempotencyKey: 'run-42' });

    await expect(
      send(t, { idempotencyKey: 'run-42', body: 'something else entirely' })
    ).rejects.toThrow(/already used with a different payload/);
  });

  test('different keys produce different notifications', async () => {
    const t = convexTest(schema, modules);
    await seedApp(t);
    const a = await send(t, { idempotencyKey: 'run-42' });
    const b = await send(t, { idempotencyKey: 'run-43' });
    expect(b.notificationId).not.toBe(a.notificationId);
    const rows = await t.run(async (ctx) => ctx.db.query('notifications').collect());
    expect(rows).toHaveLength(2);
  });

  test('no key means no guard — same payload twice is two notifications', async () => {
    const t = convexTest(schema, modules);
    await seedApp(t);
    await send(t);
    await send(t);
    const rows = await t.run(async (ctx) => ctx.db.query('notifications').collect());
    expect(rows).toHaveLength(2);
  });

  test('keys are scoped per source app', async () => {
    const t = convexTest(schema, modules);
    await seedApp(t);
    const otherToken = 'pshr_other_token';
    const { sha256Hex } = await import('./lib/tokens');
    await t.run(async (ctx) =>
      ctx.db.insert('sourceApps', {
        ownerId: 'user_bob',
        name: 'bob ci',
        tokenHash: await sha256Hex(otherToken),
        tokenPrefix: 'pshr_othe',
        enabled: true,
        createdAt: 1
      })
    );

    const mine = await send(t, { idempotencyKey: 'shared-key' });
    const theirs = await t.mutation(internal.notifyInternal.ingest, {
      token: otherToken,
      title: 'Deploy finished',
      body: 'main → production',
      idempotencyKey: 'shared-key'
    } as any);

    expect(theirs.replayed).toBeUndefined();
    expect(theirs.notificationId).not.toBe(mine.notificationId);
  });

  test('the replay echoes the original deliverAt, not the retry’s', async () => {
    const t = convexTest(schema, modules);
    await seedApp(t);
    const at = 1893456000000; // fixed future timestamp
    await send(t, { idempotencyKey: 'scheduled', deliverAt: at });
    const replay = await send(t, { idempotencyKey: 'scheduled', deliverAt: at });
    expect(replay.scheduledFor).toBe(at);
  });
});

/**
 * Write-set shape of `/notify` ingest. These pin the two changes made after
 * `convex insights` flagged `usageCounters` as an OCC hotspot: the counter is
 * read once per push rather than twice, and `lastUsedAt` is coalesced instead
 * of written on every single push.
 */
describe('notify ingest write set', () => {
  const TOKEN = 'pshr_test_token';

  async function seedApp(t: ReturnType<typeof convexTest>, lastUsedAt?: number) {
    const { sha256Hex } = await import('./lib/tokens');
    const tokenHash = await sha256Hex(TOKEN);
    return await t.run(async (ctx) =>
      ctx.db.insert('sourceApps', {
        ownerId: 'user_alice',
        name: 'ci',
        tokenHash,
        tokenPrefix: 'pshr_test',
        enabled: true,
        createdAt: 1,
        lastUsedAt
      })
    );
  }

  const send = (t: ReturnType<typeof convexTest>) =>
    t.mutation(internal.notifyInternal.ingest, {
      token: TOKEN,
      title: 'Deploy finished',
      body: 'main → production'
    } as any);

  test('a burst of pushes leaves lastUsedAt alone after the first write', async () => {
    const t = convexTest(schema, modules);
    const appId = await seedApp(t);

    await send(t);
    const first = await t.run(async (ctx) => (await ctx.db.get(appId))?.lastUsedAt);
    expect(first).toBeTypeOf('number');

    await send(t);
    await send(t);
    const after = await t.run(async (ctx) => (await ctx.db.get(appId))?.lastUsedAt);
    // Same timestamp: the follow-up pushes didn't touch the app document, so
    // they didn't invalidate every subscription that reads source apps.
    expect(after).toBe(first);
  });

  test('a stale lastUsedAt is refreshed', async () => {
    const t = convexTest(schema, modules);
    const stale = Date.now() - 10 * 60_000;
    const appId = await seedApp(t, stale);

    await send(t);
    const after = await t.run(async (ctx) => (await ctx.db.get(appId))?.lastUsedAt);
    expect(after).toBeGreaterThan(stale);
  });

  test('every accepted push still counts against the monthly quota', async () => {
    const t = convexTest(schema, modules);
    await seedApp(t);
    await send(t);
    await send(t);
    await send(t);
    const counters = await t.run(async (ctx) => ctx.db.query('usageCounters').collect());
    expect(counters.map((c) => c.count)).toEqual([3]);
  });

  test('the quota still throws at the limit, without writing', async () => {
    const t = convexTest(schema, modules);
    await seedApp(t);
    // Free tier's monthly cap, parked right at the boundary.
    const { TIER_LIMITS } = await import('./tiers');
    const limit = TIER_LIMITS.free.pushesPerMonth;
    await t.run(async (ctx) => {
      const now = new Date();
      const yearMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
      await ctx.db.insert('usageCounters', {
        ownerId: 'user_alice',
        yearMonth,
        count: limit
      });
    });

    await expect(send(t)).rejects.toThrow(/quota exceeded/i);
    const rows = await t.run(async (ctx) => ctx.db.query('notifications').collect());
    expect(rows).toHaveLength(0);
    const counters = await t.run(async (ctx) => ctx.db.query('usageCounters').collect());
    expect(counters.map((c) => c.count)).toEqual([limit]);
  });
});
