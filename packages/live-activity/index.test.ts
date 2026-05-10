import { describe, it, expect, vi, beforeEach } from 'vitest';

beforeEach(() => {
  vi.resetModules();
});

describe('LiveActivity (no-op fallback)', () => {
  beforeEach(() => {
    vi.doMock('react-native', () => ({ Platform: { OS: 'android' } }));
    vi.doMock('expo-modules-core', () => ({
      requireOptionalNativeModule: () => null
    }));
  });

  it('isAvailable() returns false outside iOS', async () => {
    const { LiveActivity } = await import('./index');
    expect(LiveActivity.isAvailable()).toBe(false);
  });

  it('start/update/end resolve { ok: false } with a reason', async () => {
    const { LiveActivity } = await import('./index');
    const expected = { ok: false, reason: 'native module not available' };
    await expect(LiveActivity.start({ activityId: 'x', state: {} })).resolves.toEqual(expected);
    await expect(LiveActivity.update({ activityId: 'x', state: {} })).resolves.toEqual(expected);
    await expect(LiveActivity.end({ activityId: 'x' })).resolves.toEqual(expected);
  });

  it('listActive / getLastPushToStartToken / getActivityUpdateTokens return safe empties', async () => {
    const { LiveActivity } = await import('./index');
    expect(await LiveActivity.listActive()).toEqual([]);
    expect(await LiveActivity.getLastPushToStartToken()).toBeNull();
    expect(await LiveActivity.getActivityUpdateTokens()).toEqual([]);
  });

  it('subscribe handlers return a removable subscription that no-ops', async () => {
    const { LiveActivity } = await import('./index');
    const subStart = LiveActivity.onPushToStartToken(() => {});
    const subUpdate = LiveActivity.onActivityUpdateToken(() => {});
    expect(typeof subStart.remove).toBe('function');
    expect(typeof subUpdate.remove).toBe('function');
    // remove() shouldn't throw when there's nothing wired up.
    expect(() => subStart.remove()).not.toThrow();
    expect(() => subUpdate.remove()).not.toThrow();
  });

  it('areActivitiesEnabled / enablePushUpdates fall back to false', async () => {
    const { LiveActivity } = await import('./index');
    expect(await LiveActivity.areActivitiesEnabled()).toBe(false);
    expect(await LiveActivity.enablePushUpdates()).toBe(false);
  });
});

describe('LiveActivity (native present, errors swallowed)', () => {
  it('areActivitiesEnabled returns false on native rejection', async () => {
    vi.doMock('react-native', () => ({ Platform: { OS: 'ios' } }));
    vi.doMock('expo-modules-core', () => ({
      requireOptionalNativeModule: () => ({
        areActivitiesEnabled: vi.fn().mockRejectedValue(new Error('boom')),
        listActive: vi.fn().mockRejectedValue(new Error('boom')),
        getLastPushToStartToken: vi.fn().mockRejectedValue(new Error('boom')),
        getActivityUpdateTokens: vi.fn().mockRejectedValue(new Error('boom')),
        enablePushUpdates: vi.fn().mockRejectedValue(new Error('boom')),
        addListener: vi.fn()
      })
    }));
    const { LiveActivity } = await import('./index');
    expect(LiveActivity.isAvailable()).toBe(true);
    expect(await LiveActivity.areActivitiesEnabled()).toBe(false);
    expect(await LiveActivity.listActive()).toEqual([]);
    expect(await LiveActivity.getLastPushToStartToken()).toBeNull();
    expect(await LiveActivity.getActivityUpdateTokens()).toEqual([]);
    expect(await LiveActivity.enablePushUpdates()).toBe(false);
  });

  it('start/update/end forward to the native module verbatim', async () => {
    const start = vi.fn().mockResolvedValue({ ok: true });
    const update = vi.fn().mockResolvedValue({ ok: true });
    const end = vi.fn().mockResolvedValue({ ok: true });
    vi.doMock('react-native', () => ({ Platform: { OS: 'ios' } }));
    vi.doMock('expo-modules-core', () => ({
      requireOptionalNativeModule: () => ({
        start,
        update,
        end,
        addListener: vi.fn()
      })
    }));
    const { LiveActivity } = await import('./index');
    await LiveActivity.start({
      activityId: 'deploy-1',
      state: { title: 'Build' }
    });
    await LiveActivity.update({
      activityId: 'deploy-1',
      state: { progress: 0.5 }
    });
    await LiveActivity.end({ activityId: 'deploy-1' });
    expect(start).toHaveBeenCalledExactlyOnceWith({
      activityId: 'deploy-1',
      state: { title: 'Build' }
    });
    expect(update).toHaveBeenCalledExactlyOnceWith({
      activityId: 'deploy-1',
      state: { progress: 0.5 }
    });
    expect(end).toHaveBeenCalledExactlyOnceWith({ activityId: 'deploy-1' });
  });
});
