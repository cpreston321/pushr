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

## One-time Xcode setup

The Expo config plugin adds `NSSupportsLiveActivities = true` to the main
app automatically. The **Widget Extension target** (which owns the
lockscreen / Dynamic Island UI) still needs to be created once in Xcode —
running `expo run:ios` will not create it for you.

Steps:

1. `cd mobile && bun install && bun run ios:dev` — this regenerates the
   `ios/` project and pulls the native module into the main app.
2. Open `mobile/ios/pushr.xcworkspace` in Xcode.
3. **File → New → Target → Widget Extension**. Name it
   `PushrActivityExtension`. Bundle id should be
   `dev.cpreston.pushr.PushrActivityExtension` (matches the main app id
   with a suffix). Language: Swift. **Uncheck "Include Configuration
   Intent"**. **Check "Include Live Activity"**.
4. Xcode will create stub files (`PushrActivityExtension.swift` or
   similar). Delete them.
5. Right-click the Widget Extension group → **Add Files to "pushr"…**.
   Select these files from `mobile/modules/live-activity/ios/`:
   - `PushrActivityWidget.swift` → target: `PushrActivityExtension` only
   - `PushrActivityAttributes.swift` → target: `PushrActivityExtension`
     **AND** the main app target (it's shared)
6. Target settings → **General → Minimum Deployments → iOS 16.2**.
7. Target settings → **Build Settings → Swift Language Version → Swift 5**.
8. Target settings → **Info.plist**: Xcode's stub already covers the
   required keys. If it doesn't, the contents of
   `mobile/modules/live-activity/ios/PushrActivityExtensionInfo.plist`
   can be pasted in.
9. Build and run on a real device or iOS 16.2+ simulator. Live Activities
   do not render in Expo Go.

If you'd rather automate this, swap `plugin.js` for one that uses
`withXcodeProject` + the `xcode` npm package to add the target on
`prebuild`. Keep the manual steps documented either way — pbxproj munging
is fragile and users end up here when it breaks.

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
