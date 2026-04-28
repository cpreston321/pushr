import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * pushr schema.
 *
 * Users live in the Better Auth component (not mirrored here). We reference
 * them by their BA subject id (string) via `ownerId`. Everything in pushr is
 * per-user: your devices, your source apps, your notification feed.
 */
export default defineSchema({
  /**
   * A source app is a project/service that can POST notifications into pushr
   * on behalf of a user (e.g. "peptide", "homelab", "ci"). Each has its own
   * bearer token. We store only the sha256 hash.
   */
  sourceApps: defineTable({
    ownerId: v.string(), // BA user subject
    name: v.string(),
    description: v.optional(v.string()),
    tokenHash: v.string(), // sha256(token)
    tokenPrefix: v.string(), // "pshr_abcd1234" — safe to display
    logoStorageId: v.optional(v.id("_storage")),
    enabled: v.boolean(),
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    // Timestamp (ms since epoch) until which pushes from this source app are
    // suppressed — notifications still land in the feed but don't wake the
    // device. `undefined` or a past time means not muted.
    mutedUntil: v.optional(v.number()),
    // Quiet hours: minutes-since-midnight (0-1439) in the user's local time.
    // When the current time falls in the window, priority is downgraded to
    // "default" and sound is silenced. If start === end, no quiet hours.
    // Windows may wrap past midnight (e.g. start=1320 → end=480 covers 22:00-08:00).
    quietStart: v.optional(v.number()),
    quietEnd: v.optional(v.number()),
    // Optional HMAC secret used by webhook adapters (e.g. GitHub's
    // X-Hub-Signature-256). Stored in plaintext because we need to compute
    // signatures with it. `undefined` means the adapter relies purely on
    // bearer-token auth.
    webhookSecret: v.optional(v.string()),
    // Declared provider for /hooks/:provider routing. Currently informational
    // — the HTTP route itself names the provider and bearer token identifies
    // the app. Stored so the UI can label the app.
    webhookProvider: v.optional(v.string()),
  })
    .index("by_owner", ["ownerId"])
    .index("by_tokenHash", ["tokenHash"]),

  /**
   * A device is a physical iOS/Android device registered to receive pushes.
   * `expoPushToken` is what we send to via the Expo Push API.
   */
  devices: defineTable({
    ownerId: v.string(),
    expoPushToken: v.string(),
    platform: v.union(v.literal("ios"), v.literal("android"), v.literal("web")),
    name: v.optional(v.string()), // user-editable label, e.g. "Christian's iPhone"
    model: v.optional(v.string()), // device model string from Expo
    osVersion: v.optional(v.string()),
    appVersion: v.optional(v.string()),
    enabled: v.boolean(),
    lastSeenAt: v.number(),
    createdAt: v.number(),
    // Set if Expo returns DeviceNotRegistered so we stop trying
    invalidatedAt: v.optional(v.number()),
    // APNs push-to-start token for PushrActivityAttributes. Used to start
    // Live Activities when the app is terminated — see convex/apns.ts.
    // Reported by the mobile client after enrolling
    // `Activity<PushrActivityAttributes>.pushToStartTokenUpdates`.
    liveActivityPushToStartToken: v.optional(v.string()),
    liveActivityPushToStartAt: v.optional(v.number()),
  })
    .index("by_owner", ["ownerId"])
    .index("by_token", ["expoPushToken"]),

  /**
   * Subscription tier per user. No row = default "free".
   */
  userTiers: defineTable({
    ownerId: v.string(),
    tier: v.union(v.literal("free"), v.literal("pro")),
    // ms-epoch until which pro access is active. Undefined for free users
    // and for lifetime grants.
    proUntil: v.optional(v.number()),
    updatedAt: v.number(),
    // External subscription id (e.g. RevenueCat app_user_id / product id) —
    // populated once billing is wired up.
    externalId: v.optional(v.string()),
  }).index("by_owner", ["ownerId"]),

  /**
   * Monthly push counter per user. Keyed by (ownerId, yearMonth) where
   * yearMonth is "YYYY-MM" in UTC. Incremented on every successful /notify
   * ingest and read to enforce tier limits.
   */
  usageCounters: defineTable({
    ownerId: v.string(),
    yearMonth: v.string(),
    count: v.number(),
  }).index("by_owner_month", ["ownerId", "yearMonth"]),

  /**
   * Per-user delivery preferences. One row per BA user subject.
   *
   * Each priority bucket stores the Expo `sound` value to include on outbound
   * push messages. Semantics:
   *   undefined → field missing, delivery falls back to `"default"`
   *   null      → silent (no sound)
   *   "default" → iOS system default alert sound
   *   "x.caf"   → a custom sound file bundled via expo-notifications
   */
  userPrefs: defineTable({
    ownerId: v.string(),
    soundLow: v.optional(v.union(v.null(), v.string())),
    soundNormal: v.optional(v.union(v.null(), v.string())),
    soundHigh: v.optional(v.union(v.null(), v.string())),
  }).index("by_owner", ["ownerId"]),

  /**
   * Notification history — every inbound notification, successful or not.
   * Mobile app shows this as the live feed.
   */
  notifications: defineTable({
    ownerId: v.string(),
    sourceAppId: v.id("sourceApps"),
    title: v.string(),
    body: v.string(),
    priority: v.optional(v.number()), // 1-10, maps to Expo low/default/high
    url: v.optional(v.string()),
    data: v.optional(v.any()), // arbitrary payload passed through to the device
    /** URL of an image to attach (rendered as a thumbnail on the banner) */
    image: v.optional(v.string()),
    /**
     * Single server-defined action button. Kept for backwards compatibility
     * with /notify's original `action` field; new callers should send the
     * richer `actions` array below. If both are set, `actions` wins.
     */
    action: v.optional(
      v.object({
        label: v.string(),
        url: v.string(),
      }),
    ),
    /**
     * Rich interactive actions (up to 4). iOS lockscreen shows generic
     * "Action 1"/"Reply" labels because categories must be pre-registered;
     * the mobile feed renders the real labels. Each action has a stable
     * `id` echoed back when the user interacts.
     */
    actions: v.optional(
      v.array(
        v.union(
          v.object({
            kind: v.literal("open_url"),
            id: v.string(),
            label: v.string(),
            url: v.string(),
            destructive: v.optional(v.boolean()),
          }),
          v.object({
            kind: v.literal("callback"),
            id: v.string(),
            label: v.string(),
            callbackUrl: v.string(),
            destructive: v.optional(v.boolean()),
            // If true, iOS requires device unlock before the action fires.
            authRequired: v.optional(v.boolean()),
          }),
          v.object({
            kind: v.literal("reply"),
            id: v.string(),
            label: v.string(),
            callbackUrl: v.string(),
            placeholder: v.optional(v.string()),
          }),
        ),
      ),
    ),
    createdAt: v.number(),
    // Delivery tracking (aggregate; see `deliveries` table for per-device rows)
    attemptedDeviceCount: v.number(),
    successDeviceCount: v.number(),
    failureMessages: v.optional(v.array(v.string())),
    readAt: v.optional(v.number()),
    // Ack-or-escalate. When `ack` is set the backend will re-push at high
    // priority every `timeoutSec` until the user acknowledges (by tapping
    // the notification, which sets `acknowledgedAt`) or `maxAttempts`
    // re-pushes have been sent.
    ack: v.optional(
      v.object({
        timeoutSec: v.number(),
        maxAttempts: v.number(),
        attempts: v.number(),
      }),
    ),
    acknowledgedAt: v.optional(v.number()),
    acknowledgedByDeviceId: v.optional(v.id("devices")),
    // Webhook provenance for notifications ingested via /hooks/:provider.
    webhookProvider: v.optional(v.string()),
    webhookEventType: v.optional(v.string()),

    /**
     * iOS Live Activity control. When present, the mobile app starts /
     * updates / ends an ActivityKit activity on receipt in addition to
     * showing the banner. `state` matches PushrActivityAttributes.ContentState
     * (see mobile/modules/live-activity/ios). `attributes` is only consumed
     * on `start` — it's the immutable part of the activity.
     */
    liveActivity: v.optional(
      v.object({
        action: v.union(
          v.literal("start"),
          v.literal("update"),
          v.literal("end"),
        ),
        // Caller-provided stable id — reused on update/end.
        activityId: v.string(),
        state: v.object({
          title: v.optional(v.string()),
          status: v.optional(v.string()),
          progress: v.optional(v.number()), // 0..1
          icon: v.optional(v.string()), // SF Symbol name
        }),
        attributes: v.optional(
          v.object({
            name: v.optional(v.string()),
            logoUrl: v.optional(v.string()),
          }),
        ),
        // ms-epoch when iOS should treat the activity as stale.
        staleDate: v.optional(v.number()),
        // 0..1 — higher shows more prominently on the lockscreen when several
        // activities are live.
        relevanceScore: v.optional(v.number()),
      }),
    ),
  })
    .index("by_owner_created", ["ownerId", "createdAt"])
    .index("by_sourceApp_created", ["sourceAppId", "createdAt"]),

  /**
   * Per-device delivery record. One row per (notification × device) the
   * backend attempted to reach. Lifecycle:
   *
   *   pending    — row inserted, request not yet sent to Expo
   *   queued     — Expo accepted the message (ticket id recorded)
   *   delivered  — Expo receipt confirmed APNs/FCM delivery
   *   failed     — Expo rejected the message OR the receipt came back error
   *   invalid    — DeviceNotRegistered; device disabled
   *
   * A notification's aggregate success counter reflects `queued` (i.e. Expo
   * accepted it). `delivered` is populated asynchronously by the receipts
   * poller ~15 min later.
   */
  deliveries: defineTable({
    notificationId: v.id("notifications"),
    deviceId: v.id("devices"),
    ownerId: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("queued"),
      v.literal("delivered"),
      v.literal("failed"),
      v.literal("invalid"),
    ),
    expoTicketId: v.optional(v.string()),
    errorCode: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    attempts: v.number(),
    firstAttemptAt: v.number(),
    lastAttemptAt: v.number(),
    // ms-epoch of the eventual Expo receipt (delivered/failed terminal state)
    finalizedAt: v.optional(v.number()),
  })
    .index("by_notification", ["notificationId"])
    .index("by_owner", ["ownerId"])
    .index("by_ticket", ["expoTicketId"]),

  /**
   * Record of every action button tap (or text reply) the user made on a
   * notification. For `callback`/`reply` kinds we also track the outbound
   * HTTP call to the source-app's callbackUrl (status code or error).
   */
  actionEvents: defineTable({
    notificationId: v.id("notifications"),
    ownerId: v.string(),
    actionId: v.string(), // user-provided action.id
    actionKind: v.union(
      v.literal("open_url"),
      v.literal("callback"),
      v.literal("reply"),
    ),
    deviceId: v.optional(v.id("devices")),
    reply: v.optional(v.string()),
    // Callback delivery tracking (for kind: callback | reply)
    callbackStatus: v.optional(v.number()),
    callbackError: v.optional(v.string()),
    callbackAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_notification", ["notificationId"])
    .index("by_owner", ["ownerId"]),

  /**
   * Server-side shadow of ActivityKit Live Activities. We don't drive the
   * activity ourselves (ActivityKit runs on-device) — this table just
   * records that we asked the device to start/update/end an activity, for
   * observability in the feed and per-source analytics.
   */
  liveActivities: defineTable({
    ownerId: v.string(),
    sourceAppId: v.id("sourceApps"),
    // Caller-provided id reused across start/update/end.
    activityId: v.string(),
    startedAt: v.number(),
    lastUpdateAt: v.number(),
    endedAt: v.optional(v.number()),
    // Most recent state the server asked the device to render. Useful
    // debugging surface when an activity is stuck.
    lastState: v.optional(v.any()),
    lastAttributes: v.optional(v.any()),
    // ActivityKit-assigned UUID for this activity, reported by the device
    // after `Activity.request`. Used to correlate update-token callbacks.
    nativeActivityId: v.optional(v.string()),
    // Per-activity APNs update token (iOS 16.2+). Required to push updates
    // and ends once the activity is running. Reported by the device via
    // `activity.pushTokenUpdates` after the push-to-start handshake.
    pushUpdateToken: v.optional(v.string()),
    pushUpdateTokenAt: v.optional(v.number()),
    // Which device originally started the activity — for observability and
    // because update tokens are per-device.
    deviceId: v.optional(v.id("devices")),
  })
    .index("by_owner_activity", ["ownerId", "activityId"])
    .index("by_owner_started", ["ownerId", "startedAt"])
    .index("by_native_activity_id", ["nativeActivityId"]),
});
