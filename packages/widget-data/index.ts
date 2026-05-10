import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

/**
 * JS facade for the App Group bridge that feeds the Home Screen widget.
 *
 * The native side writes a single JSON blob into a shared UserDefaults
 * (App Group `group.dev.cpreston.pushr`) and then asks WidgetKit to reload
 * its timelines. The widget target reads that same blob.
 *
 * Keep `WidgetSnapshot` in sync with the `Snapshot` Swift struct in the
 * widget target — both decode the same JSON shape.
 */

export type WidgetSourceApp = {
  id: string;
  name: string;
  logoUrl: string | null;
};

export type WidgetNotification = {
  id: string;
  sourceAppId: string;
  title: string;
  body: string;
  createdAt: number; // ms epoch
  url: string | null;
  appUrl: string | null;
};

export type WidgetSnapshot = {
  /** ms epoch the snapshot was written. Lets the widget show "as of" hints. */
  updatedAt: number;
  /** Hex accent color (#RRGGBB) — matches the user's selected app accent. */
  accent: string;
  sourceApps: WidgetSourceApp[];
  /** Unread notifications, newest first. Cap to ~50 in callers. */
  unread: WidgetNotification[];
};

type NativeModule = {
  setSnapshot(snapshot: WidgetSnapshot): Promise<boolean>;
  reload(): Promise<boolean>;
  clear(): Promise<boolean>;
};

const native =
  Platform.OS === 'ios' ? requireOptionalNativeModule<NativeModule>('PushrWidgetData') : null;

export const WidgetData = {
  isAvailable(): boolean {
    return native !== null;
  },
  async setSnapshot(snapshot: WidgetSnapshot): Promise<boolean> {
    if (!native) return false;
    try {
      return await native.setSnapshot(snapshot);
    } catch {
      return false;
    }
  },
  async reload(): Promise<boolean> {
    if (!native) return false;
    try {
      return await native.reload();
    } catch {
      return false;
    }
  },
  async clear(): Promise<boolean> {
    if (!native) return false;
    try {
      return await native.clear();
    } catch {
      return false;
    }
  }
};
