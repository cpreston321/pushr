import {
  requireOptionalNativeModule,
  type EventSubscription,
} from "expo-modules-core";
import { Platform } from "react-native";

/**
 * JS facade for the native Live Activity module. The native side is iOS-only
 * (ActivityKit); on Android / web / Expo Go the module is absent and every
 * call becomes a quiet no-op so the rest of the app still runs.
 *
 * The shape of `ContentState` and `Attributes` must stay in sync with
 * ios/PushrActivityAttributes.swift. Keep this file and that one synced
 * when you add new fields.
 */

export type ContentState = {
  title?: string;
  status?: string;
  progress?: number; // 0..1
  icon?: string; // SF Symbol name
};

export type Attributes = {
  name?: string;
  logoUrl?: string;
};

export type StartOptions = {
  activityId: string;
  attributes?: Attributes;
  state: ContentState;
  staleDate?: number;
  relevanceScore?: number;
};

export type UpdateOptions = {
  activityId: string;
  state: ContentState;
  staleDate?: number;
  relevanceScore?: number;
};

export type EndOptions = {
  activityId: string;
  state?: ContentState;
  /** How to dismiss: default | immediate | after(ms) */
  dismissalPolicy?: "default" | "immediate" | { after: number };
};

export type PushToStartTokenEvent = { token: string };
export type ActivityUpdateTokenEvent = {
  activityId: string;
  nativeActivityId: string;
  token: string;
};

type NativeEvents = {
  onPushToStartToken: (e: PushToStartTokenEvent) => void;
  onActivityUpdateToken: (e: ActivityUpdateTokenEvent) => void;
};

type NativeModule = {
  areActivitiesEnabled(): Promise<boolean>;
  enablePushUpdates(): Promise<boolean>;
  start(options: StartOptions): Promise<{ ok: boolean; reason?: string; nativeId?: string }>;
  update(options: UpdateOptions): Promise<{ ok: boolean; reason?: string }>;
  end(options: EndOptions): Promise<{ ok: boolean; reason?: string }>;
  listActive(): Promise<string[]>;
  getLastPushToStartToken(): Promise<string | null>;
  getActivityUpdateTokens(): Promise<
    Array<{ activityId: string; nativeActivityId: string; token: string }>
  >;
  addListener<E extends keyof NativeEvents>(
    eventName: E,
    listener: NativeEvents[E],
  ): EventSubscription;
};

const native =
  Platform.OS === "ios"
    ? requireOptionalNativeModule<NativeModule>("PushrActivity")
    : null;

const disabled = async (reason: string) => ({ ok: false, reason });

export const LiveActivity = {
  isAvailable(): boolean {
    return native !== null;
  },
  async areActivitiesEnabled(): Promise<boolean> {
    if (!native) return false;
    try {
      return await native.areActivitiesEnabled();
    } catch {
      return false;
    }
  },
  async start(options: StartOptions) {
    if (!native) return disabled("native module not available");
    return native.start(options);
  },
  async update(options: UpdateOptions) {
    if (!native) return disabled("native module not available");
    return native.update(options);
  },
  async end(options: EndOptions) {
    if (!native) return disabled("native module not available");
    return native.end(options);
  },
  async listActive(): Promise<string[]> {
    if (!native) return [];
    try {
      return await native.listActive();
    } catch {
      return [];
    }
  },
  /**
   * Kick off the ActivityKit token streams so the JS layer can forward
   * tokens to the backend. Safe to call repeatedly — the native side
   * de-dupes. Returns true if observers were (or already are) running.
   */
  async enablePushUpdates(): Promise<boolean> {
    if (!native) return false;
    try {
      return await native.enablePushUpdates();
    } catch {
      return false;
    }
  },
  onPushToStartToken(
    handler: (e: PushToStartTokenEvent) => void,
  ): EventSubscription {
    if (!native) return { remove() {} } as EventSubscription;
    return native.addListener("onPushToStartToken", handler);
  },
  onActivityUpdateToken(
    handler: (e: ActivityUpdateTokenEvent) => void,
  ): EventSubscription {
    if (!native) return { remove() {} } as EventSubscription;
    return native.addListener("onActivityUpdateToken", handler);
  },
  async getLastPushToStartToken(): Promise<string | null> {
    if (!native) return null;
    try {
      return await native.getLastPushToStartToken();
    } catch {
      return null;
    }
  },
  async getActivityUpdateTokens(): Promise<ActivityUpdateTokenEvent[]> {
    if (!native) return [];
    try {
      return await native.getActivityUpdateTokens();
    } catch {
      return [];
    }
  },
};
