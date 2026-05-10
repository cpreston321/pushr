import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The widget-data facade is platform-conditional: on iOS it talks to the
 * native module; on every other runtime (Android, web, Node, vitest) it
 * resolves to a quiet no-op so callers never have to branch.
 *
 * Vitest runs in a Node-like edge runtime where `Platform.OS !== "ios"`,
 * so loading the module gives us the no-op variant for free. That's
 * exactly the surface we want to lock down — the contract tests don't
 * pretend the native module is loaded; they assert the fallback shape.
 */

beforeEach(() => {
  vi.resetModules();
});

describe('WidgetData (no-op fallback)', () => {
  // expo-modules-core reaches into the React Native bridge at import time,
  // which we don't have. Mocking it lets the facade module load cleanly
  // in a Node-style test runtime; `requireOptionalNativeModule` returning
  // `null` is exactly what happens on non-iOS platforms in real life.
  beforeEach(() => {
    vi.doMock('react-native', () => ({ Platform: { OS: 'android' } }));
    vi.doMock('expo-modules-core', () => ({
      requireOptionalNativeModule: () => null
    }));
  });

  it('isAvailable() returns false outside iOS', async () => {
    const { WidgetData } = await import('./index');
    expect(WidgetData.isAvailable()).toBe(false);
  });

  it('setSnapshot resolves false instead of throwing when native is absent', async () => {
    const { WidgetData } = await import('./index');
    const ok = await WidgetData.setSnapshot({
      updatedAt: Date.now(),
      accent: '#0A84FF',
      sourceApps: [],
      unread: []
    });
    expect(ok).toBe(false);
  });

  it('reload resolves false when native is absent', async () => {
    const { WidgetData } = await import('./index');
    expect(await WidgetData.reload()).toBe(false);
  });

  it('clear resolves false when native is absent', async () => {
    const { WidgetData } = await import('./index');
    expect(await WidgetData.clear()).toBe(false);
  });
});

describe('WidgetData (native module present, errors swallowed)', () => {
  it('setSnapshot returns false instead of throwing when the native call rejects', async () => {
    vi.doMock('react-native', () => ({ Platform: { OS: 'ios' } }));
    vi.doMock('expo-modules-core', () => ({
      requireOptionalNativeModule: () => ({
        setSnapshot: vi.fn().mockRejectedValue(new Error('boom')),
        reload: vi.fn().mockRejectedValue(new Error('boom')),
        clear: vi.fn().mockRejectedValue(new Error('boom'))
      })
    }));
    const { WidgetData } = await import('./index');
    expect(WidgetData.isAvailable()).toBe(true);
    expect(
      await WidgetData.setSnapshot({
        updatedAt: 1,
        accent: '#fff',
        sourceApps: [],
        unread: []
      })
    ).toBe(false);
    expect(await WidgetData.reload()).toBe(false);
    expect(await WidgetData.clear()).toBe(false);
  });

  it('setSnapshot forwards the snapshot verbatim to the native module', async () => {
    const setSnapshot = vi.fn().mockResolvedValue(true);
    vi.doMock('react-native', () => ({ Platform: { OS: 'ios' } }));
    vi.doMock('expo-modules-core', () => ({
      requireOptionalNativeModule: () => ({
        setSnapshot,
        reload: vi.fn(),
        clear: vi.fn()
      })
    }));
    const { WidgetData } = await import('./index');
    const snap = {
      updatedAt: 42,
      accent: '#0A84FF',
      sourceApps: [{ id: 'a', name: 'Test', logoUrl: null }],
      unread: [
        {
          id: 'n1',
          sourceAppId: 'a',
          title: 't',
          body: 'b',
          createdAt: 100,
          url: null,
          appUrl: null
        }
      ]
    };
    expect(await WidgetData.setSnapshot(snap)).toBe(true);
    expect(setSnapshot).toHaveBeenCalledExactlyOnceWith(snap);
  });
});
