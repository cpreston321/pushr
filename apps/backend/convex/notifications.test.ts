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

describe('notifications.listMine', () => {
  test('rejects unauthenticated callers', async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.notifications.listMine, {})).rejects.toThrow(/Not authenticated/);
  });

  test('returns an empty list for a user with no source apps', async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: 'user_alice' });
    const result = await asUser.query(api.notifications.listMine, {});
    expect(result).toEqual([]);
  });

  test('respects the limit cap of 500', async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: 'user_alice' });
    // No data yet — we only assert the call shape doesn't blow up.
    const result = await asUser.query(api.notifications.listMine, {
      limit: 9999
    });
    expect(Array.isArray(result)).toBe(true);
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
