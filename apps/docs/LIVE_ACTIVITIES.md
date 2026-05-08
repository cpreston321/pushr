# Live Activities

pushr can drive iOS Live Activities (lockscreen + Dynamic Island) for
long-running operations like deploys, builds, or order tracking.

The model is **locally-controlled**: the app receives a regular push, reads
`data.liveActivity` from the payload, and calls ActivityKit on-device to
start/update/end the activity. No APNs p8 key is required for this MVP. A
future upgrade can add push-to-start / push-to-update tokens for activities
that live beyond the app's runtime.

## API

`POST /notify` accepts a new optional field:

```jsonc
{
  "title": "Deploy #42",
  "body": "Building on staging",
  "priority": "normal",
  "liveActivity": {
    "action": "start",             // "start" | "update" | "end"
    "activityId": "deploy-42",     // caller-provided; reused for update/end
    "attributes": {                 // only consumed on "start" — immutable after
      "name": "ci.example.com",
      "logoUrl": "https://..."
    },
    "state": {                      // mutable ContentState rendered by the widget
      "title": "Deploy #42",
      "status": "Running tests",
      "progress": 0.35,             // 0..1; omit for indeterminate
      "icon": "hammer.fill"         // SF Symbol name
    },
    "staleDate": 1712200000000,     // optional: ms-epoch when iOS should gray out
    "relevanceScore": 0.8           // optional: 0..1 priority among lockscreen activities
  }
}
```

```json
{
  "title": "Deploy #42",
  "body": "Building on staging",
  "priority": "normal",
  "liveActivity": {
    "action": "start",
    "activityId": "deploy-42",
    "attributes": {
      "name": "ci.example.com",
      "logoUrl": "https://..."
    },
    "state": {
      "title": "Deploy #42",
      "status": "Running tests",
      "progress": 0.35,
      "icon": "hammer.fill"
    },
    "staleDate": 1712200000000,
    "relevanceScore": 0.8
  }
}
```

Subsequent updates:

```json
{
  "title": "Deploy #42",
  "body": "Deployed successfully",
  "liveActivity": {
    "action": "update",
    "activityId": "deploy-42",
    "state": {
      "title": "Deploy #42",
      "status": "Deploying to staging",
      "progress": 0.85
    }
  }
}
```

End the activity when done:

```json
{
  "title": "Deploy #42",
  "body": "Shipped 🎉",
  "liveActivity": {
    "action": "end",
    "activityId": "deploy-42",
    "state": { "title": "Deploy #42", "status": "Complete", "progress": 1.0 }
  }
}
```

## Xcode targets (automated via `@bacons/apple-targets`)

Both extension targets are recreated on every `expo prebuild` from the
contents of `mobile/targets/`:

```
mobile/targets/
  PushrActivityExtension/        ← Widget Extension (lockscreen + Dynamic Island)
    expo-target.config.json
    Info.plist
    PushrActivityAttributes.swift
    PushrActivityWidget.swift
  PushrNotificationService/      ← Notification Service Extension
    expo-target.config.json
    Info.plist
    NotificationService.swift
```

`@bacons/apple-targets` (registered as a plugin in `app.json`) reads each
subdirectory, generates the matching Xcode target, and wires its sources
into the build. After a `bun run ios:dev` (which runs `prebuild --clean`
under the hood) both targets are present and configured automatically — no
manual Xcode steps required.

If you change source files, just re-run `bun run ios:dev` (or
`expo prebuild --platform ios --clean`).

> **Shared `PushrActivityAttributes.swift`.** ActivityKit needs the same
> attributes type compiled into both the main app and the widget. Because
> the two targets are independent compile units, the file exists in two
> places: `mobile/modules/live-activity/ios/` (compiled into the main app
> via Expo module autolinking) and
> `mobile/targets/PushrActivityExtension/` (compiled into the widget).
> Keep both copies byte-identical — there's a sync note in each file.

## Server-driven via APNs (push-to-start)

Live Activities can start/update/end even when the app is terminated. pushr
sends payloads directly to APNs with `apns-push-type: liveactivity` and uses
two token types reported by the device:

1. **Push-to-start token** — one per device. Needed to create an activity
   when the app is not running (iOS 17.2+).
2. **Per-activity update token** — one per running activity. Needed to
   update / end an activity once started.

The mobile client enrolls for both streams on startup
(`useLiveActivityTokens`) and calls `devices.registerLiveActivityPushToStartToken`
and `liveActivities.registerUpdateToken` as tokens arrive. The server side
picks them up in `convex/apns.ts` (Node action using HTTP/2 + ES256 JWT).

### Required environment variables

Set these on the Convex deployment (`bunx convex env set <KEY> <VALUE>`):

| Name | Value |
| --- | --- |
| `APNS_AUTH_KEY` | Full contents of your `.p8` file, including `-----BEGIN PRIVATE KEY-----` headers. Put the literal file contents; newline-escaping (`\n`) is also accepted. |
| `APNS_KEY_ID` | 10-character key id from Apple Developer → Keys. |
| `APNS_TEAM_ID` | 10-character Team ID (Apple Developer → Membership). |
| `APNS_BUNDLE_ID` | Main app bundle id (e.g. `dev.cpreston.pushr`). Live-activity topic is derived as `${APNS_BUNDLE_ID}.push-type.liveactivity`. |
| `APNS_ENVIRONMENT` | `production` for TestFlight/App Store builds, `sandbox` for Xcode-installed debug builds. Defaults to `sandbox`. |

Example `convex env set` for the auth key (reads from a local p8):

```bash
bunx convex env set APNS_AUTH_KEY -- "$(cat ~/Downloads/AuthKey_ABC1234567.p8)"
bunx convex env set APNS_KEY_ID ABC1234567
bunx convex env set APNS_TEAM_ID 39MSHURBYT
bunx convex env set APNS_BUNDLE_ID dev.cpreston.pushr
bunx convex env set APNS_ENVIRONMENT sandbox
```

### Behavior when tokens are missing

- Missing `APNS_AUTH_KEY`: `apns.dispatch` logs a warning and no-ops. Regular
  notifications still flow via Expo Push; only the Live Activity lifecycle
  is disabled.
- No push-to-start token registered for the owner: `start` actions log a
  warning and do nothing. The device has to run once with the
  `useLiveActivityTokens` hook mounted to enroll.
- No update token for an activity: `update`/`end` actions log and no-op.
  The device likely crashed or ended the activity locally.

## Behavior notes

- **ContentState shape** is fixed (`title`, `status`, `progress`, `icon`).
  If you need more fields, add them to:
  1. `convex/schema.ts` (`liveActivity.state`)
  2. `convex/notifyInternal.ts` (`liveActivityValidator`)
  3. `convex/http.ts` (`parseLiveActivity`)
  4. `mobile/modules/live-activity/index.ts` (`ContentState`)
  5. `mobile/modules/live-activity/ios/PushrActivityAttributes.swift`
     (`ContentState` struct)
  6. `mobile/modules/live-activity/ios/PushrActivityWidget.swift`
     (the SwiftUI views)
- **Stale state.** iOS renders stale activities in a grayed-out style. If
  you're polling an external system, send `staleDate` ~2× your expected
  update interval as a watchdog.
- **Dismissal policy.** The `end` action accepts `"default"` (stays on the
  lockscreen for ~4 hours), `"immediate"` (removed now), or
  `{ after: ms }` (removed after the given delay). Defaults to
  `"default"`.
- **No activity on receipt?** The activity will only start if the app is
  in foreground or recently backgrounded (iOS typically gives apps ~5s
  to process a push in the background). A fully-terminated app cannot
  receive the push and start an activity. To support that, wire up
  `PushToStartTokenUpdates` in the module and send an APNs
  `push-type: liveactivity` frame from pushr — not implemented yet.

## Testing end-to-end

`scripts/test-live-activity.sh` walks an activity through start → two updates
→ end. Set `PUSHR_URL` and `PUSHR_TOKEN`, launch the app into the
foreground, then:

```bash
scripts/test-live-activity.sh                      # full lifecycle with 5s steps
scripts/test-live-activity.sh start --progress 0.1
scripts/test-live-activity.sh update --progress 0.6 --status "Halfway"
scripts/test-live-activity.sh end
```

Override `ACT_ID=my-id` to reuse a single activity across multiple invocations;
override `STEP_DELAY=2` for faster walkthroughs. Non-202 responses dump the
Convex error body to stderr.

## Tracking

The `liveActivities` table shadows each start/update/end:

```ts
// Convex dashboard
db.query("liveActivities")
  .withIndex("by_owner_started", q => q.eq("ownerId", ownerId))
  .order("desc")
  .take(20)
```

`lastState` / `lastAttributes` let you debug stuck activities without the
device.
