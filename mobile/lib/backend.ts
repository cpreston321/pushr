import * as SecureStore from "expo-secure-store";
import { ConvexReactClient } from "convex/react";
import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import { convexClient as convexAuthPlugin } from "@convex-dev/better-auth/client/plugins";

/**
 * Runtime-configurable backend. The compiled app ships with the default
 * "pushr cloud" URLs baked in via `.env`, but a self-hoster can override them
 * at runtime by saving a custom deployment URL + site URL to SecureStore.
 *
 * Clients are constructed once during app boot (`initBackend`) and accessed
 * via `convex()` / `authClient()` getters everywhere else.
 */

export type BackendConfig = {
  convexUrl: string;
  siteUrl: string;
  /** true if the user has overridden the bundled defaults */
  custom: boolean;
};

const KEY_CONVEX_URL = "pushr.backend.convexUrl";
const KEY_SITE_URL = "pushr.backend.siteUrl";

const DEFAULT_CONVEX_URL = process.env.EXPO_PUBLIC_CONVEX_URL;
const DEFAULT_SITE_URL = process.env.EXPO_PUBLIC_CONVEX_SITE_URL;

if (!DEFAULT_CONVEX_URL || !DEFAULT_SITE_URL) {
  throw new Error(
    "EXPO_PUBLIC_CONVEX_URL / EXPO_PUBLIC_CONVEX_SITE_URL not set — copy .env.example to .env and fill in the pushr cloud defaults",
  );
}

let _convex: ConvexReactClient | null = null;
let _auth: ReturnType<typeof createAuthClient> | null = null;
let _config: BackendConfig | null = null;

export async function initBackend(): Promise<BackendConfig> {
  const [stored, storedSite] = await Promise.all([
    SecureStore.getItemAsync(KEY_CONVEX_URL),
    SecureStore.getItemAsync(KEY_SITE_URL),
  ]);
  const convexUrl = stored ?? DEFAULT_CONVEX_URL!;
  const siteUrl = storedSite ?? DEFAULT_SITE_URL!;
  const custom = !!(stored || storedSite);

  _config = { convexUrl, siteUrl, custom };
  _convex = new ConvexReactClient(convexUrl, { unsavedChangesWarning: false });
  _auth = createAuthClient({
    baseURL: siteUrl,
    plugins: [
      expoClient({ scheme: "pushr", storagePrefix: "pushr", storage: SecureStore }),
      convexAuthPlugin(),
    ],
  });
  return _config;
}

export function backendConfig(): BackendConfig {
  if (!_config) throw new Error("Backend not initialized — call initBackend() first");
  return _config;
}

export function convex(): ConvexReactClient {
  if (!_convex) throw new Error("Convex client not initialized");
  return _convex;
}

export function authClient() {
  if (!_auth) throw new Error("Auth client not initialized");
  return _auth;
}

export const defaults = {
  convexUrl: DEFAULT_CONVEX_URL!,
  siteUrl: DEFAULT_SITE_URL!,
};

/**
 * Persist a custom backend. Caller should sign the user out and restart the
 * app — swapping the Convex URL mid-session isn't supported.
 */
export async function saveBackend(convexUrl: string, siteUrl: string): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(KEY_CONVEX_URL, convexUrl),
    SecureStore.setItemAsync(KEY_SITE_URL, siteUrl),
  ]);
}

export async function resetBackend(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(KEY_CONVEX_URL),
    SecureStore.deleteItemAsync(KEY_SITE_URL),
  ]);
}

/** Human-readable label for the currently active backend. Safe to call
 * before initBackend — returns "—" until the backend is initialized. */
export function currentServerLabel(): string {
  try {
    const { convexUrl, custom } = backendConfig();
    if (!custom) return "pushr cloud";
    try {
      return new URL(convexUrl).host;
    } catch {
      return "custom";
    }
  } catch {
    return "—";
  }
}
