/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ack from "../ack.js";
import type * as actions from "../actions.js";
import type * as apns from "../apns.js";
import type * as apnsHelpers from "../apnsHelpers.js";
import type * as auth from "../auth.js";
import type * as betterAuth_auth from "../betterAuth/auth.js";
import type * as cleanup from "../cleanup.js";
import type * as crons from "../crons.js";
import type * as deliveries from "../deliveries.js";
import type * as devices from "../devices.js";
import type * as expoPush from "../expoPush.js";
import type * as expoPushHelpers from "../expoPushHelpers.js";
import type * as expoReceipts from "../expoReceipts.js";
import type * as hooks_github from "../hooks/github.js";
import type * as hooks_grafana from "../hooks/grafana.js";
import type * as hooks_sentry from "../hooks/sentry.js";
import type * as hooks_types from "../hooks/types.js";
import type * as hooks_verifySignature from "../hooks/verifySignature.js";
import type * as http from "../http.js";
import type * as lib_actionsLayout from "../lib/actionsLayout.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_sharing from "../lib/sharing.js";
import type * as lib_tokens from "../lib/tokens.js";
import type * as lib_workpools from "../lib/workpools.js";
import type * as liveActivities from "../liveActivities.js";
import type * as notifications from "../notifications.js";
import type * as notifyInternal from "../notifyInternal.js";
import type * as seed from "../seed.js";
import type * as sharing from "../sharing.js";
import type * as sourceApps from "../sourceApps.js";
import type * as tiers from "../tiers.js";
import type * as userPrefs from "../userPrefs.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  ack: typeof ack;
  actions: typeof actions;
  apns: typeof apns;
  apnsHelpers: typeof apnsHelpers;
  auth: typeof auth;
  "betterAuth/auth": typeof betterAuth_auth;
  cleanup: typeof cleanup;
  crons: typeof crons;
  deliveries: typeof deliveries;
  devices: typeof devices;
  expoPush: typeof expoPush;
  expoPushHelpers: typeof expoPushHelpers;
  expoReceipts: typeof expoReceipts;
  "hooks/github": typeof hooks_github;
  "hooks/grafana": typeof hooks_grafana;
  "hooks/sentry": typeof hooks_sentry;
  "hooks/types": typeof hooks_types;
  "hooks/verifySignature": typeof hooks_verifySignature;
  http: typeof http;
  "lib/actionsLayout": typeof lib_actionsLayout;
  "lib/auth": typeof lib_auth;
  "lib/sharing": typeof lib_sharing;
  "lib/tokens": typeof lib_tokens;
  "lib/workpools": typeof lib_workpools;
  liveActivities: typeof liveActivities;
  notifications: typeof notifications;
  notifyInternal: typeof notifyInternal;
  seed: typeof seed;
  sharing: typeof sharing;
  sourceApps: typeof sourceApps;
  tiers: typeof tiers;
  userPrefs: typeof userPrefs;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
  pushPool: import("@convex-dev/workpool/_generated/component.js").ComponentApi<"pushPool">;
};
