import { convexTest } from 'convex-test';
import { test, expect, describe } from 'vitest';
import schema from './schema';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';

const modules = import.meta.glob([
  './**/*.ts',
  './**/*.tsx',
  '!./**/*.test.ts',
  '!./**/*.test.tsx'
]);

/**
 * The once-only guarantee for interactive actions.
 *
 * `invoke` itself POSTs to the source app, so these exercise the claim/settle
 * mutations underneath it — that pair is where "at most one callback" is
 * actually decided, and it's testable without a network.
 */
describe('actions claim/settle', () => {
  async function seed(t: ReturnType<typeof convexTest>) {
    return await t.run(async (ctx) => {
      const sourceAppId = await ctx.db.insert('sourceApps', {
        ownerId: 'user_alice',
        name: 'billing',
        tokenHash: 'hash',
        tokenPrefix: 'pshr_x',
        enabled: true,
        createdAt: 1
      });
      const notificationId = await ctx.db.insert('notifications', {
        ownerId: 'user_alice',
        sourceAppId,
        title: 'New order',
        body: '$482.58 due',
        createdAt: 1,
        attemptedDeviceCount: 0,
        successDeviceCount: 0,
        actions: [
          {
            kind: 'callback' as const,
            id: 'confirm',
            label: 'Confirm payment',
            callbackUrl: 'https://example.test/hook'
          }
        ]
      });
      return { sourceAppId, notificationId };
    });
  }

  const claim = (
    t: ReturnType<typeof convexTest>,
    notificationId: Id<'notifications'>,
    kind: 'callback' | 'open_url' = 'callback',
    actionId = 'confirm'
  ) =>
    t.mutation(internal.actions.claimEventInternal, {
      notificationId,
      ownerId: 'user_alice',
      actionId,
      actionKind: kind
    });

  test('a second tap on a settled action is refused, not re-sent', async () => {
    const t = convexTest(schema, modules);
    const { notificationId } = await seed(t);

    const first = await claim(t, notificationId);
    expect(first.status).toBe('claimed');
    if (first.status !== 'claimed') throw new Error('unreachable');

    await t.mutation(internal.actions.settleEventInternal, {
      id: first.eventId,
      callbackStatus: 200
    });

    const second = await claim(t, notificationId);
    expect(second.status).toBe('done');

    // Exactly one event, so exactly one callback was ever POSTed.
    const events = await t.run(async (ctx) => ctx.db.query('actionEvents').collect());
    expect(events).toHaveLength(1);
  });

  test('the settled outcome is mirrored onto the notification for the feed', async () => {
    const t = convexTest(schema, modules);
    const { notificationId } = await seed(t);
    const first = await claim(t, notificationId);
    if (first.status !== 'claimed') throw new Error('unreachable');

    await t.mutation(internal.actions.settleEventInternal, {
      id: first.eventId,
      callbackStatus: 200
    });

    const results = await t.run(async (ctx) => (await ctx.db.get(notificationId))?.actionResults);
    expect(results).toEqual([
      {
        actionId: 'confirm',
        kind: 'callback',
        by: 'user_alice',
        at: expect.any(Number),
        ok: true,
        detail: 'Sent'
      }
    ]);
  });

  test('a tap while one is in flight is told to wait, and sends nothing', async () => {
    const t = convexTest(schema, modules);
    const { notificationId } = await seed(t);
    await claim(t, notificationId);

    // No settle in between — the first claim is still unsettled.
    expect((await claim(t, notificationId)).status).toBe('pending');
    const events = await t.run(async (ctx) => ctx.db.query('actionEvents').collect());
    expect(events).toHaveLength(1);
  });

  test('a failed callback stays retryable', async () => {
    const t = convexTest(schema, modules);
    const { notificationId } = await seed(t);
    const first = await claim(t, notificationId);
    if (first.status !== 'claimed') throw new Error('unreachable');

    await t.mutation(internal.actions.settleEventInternal, {
      id: first.eventId,
      callbackStatus: 502,
      callbackError: 'HTTP 502'
    });

    // A transient failure must not brick the button.
    expect((await claim(t, notificationId)).status).toBe('claimed');
    const results = await t.run(async (ctx) => (await ctx.db.get(notificationId))?.actionResults);
    expect(results?.[0]).toMatchObject({ ok: false, detail: 'HTTP 502' });
  });

  test('a retry that succeeds replaces the failure', async () => {
    const t = convexTest(schema, modules);
    const { notificationId } = await seed(t);
    const first = await claim(t, notificationId);
    if (first.status !== 'claimed') throw new Error('unreachable');
    await t.mutation(internal.actions.settleEventInternal, {
      id: first.eventId,
      callbackStatus: 502,
      callbackError: 'HTTP 502'
    });

    const retry = await claim(t, notificationId);
    if (retry.status !== 'claimed') throw new Error('unreachable');
    await t.mutation(internal.actions.settleEventInternal, {
      id: retry.eventId,
      callbackStatus: 200
    });

    const results = await t.run(async (ctx) => (await ctx.db.get(notificationId))?.actionResults);
    expect(results).toHaveLength(1);
    expect(results?.[0]).toMatchObject({ ok: true, detail: 'Sent' });
  });

  test('open_url is repeatable — a link that was tapped still opens', async () => {
    const t = convexTest(schema, modules);
    const { notificationId } = await seed(t);
    expect((await claim(t, notificationId, 'open_url', 'view')).status).toBe('claimed');
    expect((await claim(t, notificationId, 'open_url', 'view')).status).toBe('claimed');
  });

  test('a different action on the same notification is unaffected', async () => {
    const t = convexTest(schema, modules);
    const { notificationId } = await seed(t);
    const first = await claim(t, notificationId);
    if (first.status !== 'claimed') throw new Error('unreachable');
    await t.mutation(internal.actions.settleEventInternal, {
      id: first.eventId,
      callbackStatus: 200
    });

    expect((await claim(t, notificationId, 'callback', 'decline')).status).toBe('claimed');
  });
});

/**
 * Live Activity update tokens on a *shared* app.
 *
 * The row belongs to the app's bill-payer, but the device reporting the token
 * belongs to whichever member is running the activity. `apns.dispatch` resolves
 * the row from the notification's owner, so the member's token has to land on
 * the owner's row — not a second one.
 */
describe('liveActivities.registerUpdateToken', () => {
  async function seedSharedActivity(t: ReturnType<typeof convexTest>) {
    return await t.run(async (ctx) => {
      const sourceAppId = await ctx.db.insert('sourceApps', {
        ownerId: 'user_owner',
        name: 'deploys',
        tokenHash: 'hash',
        tokenPrefix: 'pshr_x',
        enabled: true,
        createdAt: 1
      });
      await ctx.db.insert('sourceAppMembers', {
        sourceAppId,
        userId: 'user_member',
        role: 'editor',
        invitedBy: 'user_owner',
        acceptedAt: 2
      });
      // The row the server writes when /notify starts the activity.
      const rowId = await ctx.db.insert('liveActivities', {
        ownerId: 'user_owner',
        sourceAppId,
        activityId: 'deploy-42',
        startedAt: 1,
        lastUpdateAt: 1
      });
      const deviceId = await ctx.db.insert('devices', {
        ownerId: 'user_member',
        expoPushToken: 'ExponentPushToken[member]',
        platform: 'ios',
        enabled: true,
        lastSeenAt: 1,
        createdAt: 1
      });
      return { sourceAppId, rowId, deviceId };
    });
  }

  test("a member's token lands on the owner's row, not a duplicate", async () => {
    const t = convexTest(schema, modules);
    const { rowId, deviceId } = await seedSharedActivity(t);

    await t.withIdentity({ subject: 'user_member' }).mutation(
      api.liveActivities.registerUpdateToken,
      {
        activityId: 'deploy-42',
        nativeActivityId: 'native-uuid',
        pushUpdateToken: 'tok_member',
        deviceId
      }
    );

    const rows = await t.run(async (ctx) => ctx.db.query('liveActivities').collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]._id).toBe(rowId);
    expect(rows[0]).toMatchObject({
      // Still the bill-payer's row — that's who `apns.dispatch` looks it up by.
      ownerId: 'user_owner',
      pushUpdateToken: 'tok_member',
      nativeActivityId: 'native-uuid'
    });
  });

  test('the owner-scoped lookup dispatch uses now finds the token', async () => {
    const t = convexTest(schema, modules);
    const { deviceId } = await seedSharedActivity(t);
    await t.withIdentity({ subject: 'user_member' }).mutation(
      api.liveActivities.registerUpdateToken,
      {
        activityId: 'deploy-42',
        nativeActivityId: 'native-uuid',
        pushUpdateToken: 'tok_member',
        deviceId
      }
    );

    // Mirrors `apnsHelpers.getActivityByOwner`: notification owner + activityId.
    const found = await t.run(async (ctx) =>
      ctx.db
        .query('liveActivities')
        .withIndex('by_owner_activity', (q) =>
          q.eq('ownerId', 'user_owner').eq('activityId', 'deploy-42')
        )
        .unique()
    );
    expect(found?.pushUpdateToken).toBe('tok_member');
  });

  test('a stranger cannot claim an activity they have no access to', async () => {
    const t = convexTest(schema, modules);
    await seedSharedActivity(t);
    const strangerDevice = await t.run(async (ctx) => {
      await ctx.db.insert('sourceApps', {
        ownerId: 'user_mallory',
        name: 'mallory app',
        tokenHash: 'h2',
        tokenPrefix: 'pshr_m',
        enabled: true,
        createdAt: 1
      });
      return await ctx.db.insert('devices', {
        ownerId: 'user_mallory',
        expoPushToken: 'ExponentPushToken[mallory]',
        platform: 'ios',
        enabled: true,
        lastSeenAt: 1,
        createdAt: 1
      });
    });

    await t.withIdentity({ subject: 'user_mallory' }).mutation(
      api.liveActivities.registerUpdateToken,
      {
        activityId: 'deploy-42',
        nativeActivityId: 'native-mallory',
        pushUpdateToken: 'tok_mallory',
        deviceId: strangerDevice
      }
    );

    // Their token goes to their own stub row; the shared one is untouched.
    const shared = await t.run(async (ctx) =>
      ctx.db
        .query('liveActivities')
        .withIndex('by_owner_activity', (q) =>
          q.eq('ownerId', 'user_owner').eq('activityId', 'deploy-42')
        )
        .unique()
    );
    expect(shared?.pushUpdateToken).toBeUndefined();
  });
});
