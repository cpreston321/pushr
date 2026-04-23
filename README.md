# pushr

Personal push-notification hub. Any project POSTs a notification to a Convex HTTP endpoint with a bearer token; the iOS app receives it via APNs (Expo Push).

## Architecture

```
Source apps ──POST /notify──> Convex ──Expo Push──> iOS devices
(peptide, …)    Bearer token   (schema + auth)      (APNs)
```

- **Backend**: Convex (`convex/`) — schema, HTTP endpoint, Expo Push action, Better Auth for users.
- **Mobile**: Expo app (`mobile/`) — login, live feed, device + source-app management.

## Quickstart

```bash
bun install
bunx convex dev   # first run prompts to create a deployment
```

Then in another terminal:

```bash
cd mobile
bun install
bun run start
```

### Development build (needed for real push delivery)

Expo Go's push support is limited on iOS and removed on Android since SDK 53.
Create a dev client to actually receive notifications on a physical device:

```bash
cd mobile
bun run ios:dev   # prebuild + expo run:ios; needs Xcode installed
```

The generated `ios/` and `android/` folders are gitignored — treat them as
ephemeral build output. Re-run `ios:dev` whenever `app.json` native config
changes (plugins, bundled sound files, etc).

## Sending a notification

```bash
curl -X POST "$PUSHR_URL/notify" \
  -H "Authorization: Bearer $PUSHR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Hello","body":"from peptide","priority":"high","url":"https://peptide.com/admin"}'
```

`priority` is optional. It accepts either:

- a string — `"low"`, `"normal"`, or `"high"`
- a number — `1`–`10` (Gotify-compatible; `>= 7` delivers as high priority)

High-priority pushes wake the device and surface as banners. Everything else
delivers at default priority.

### Live Activities (iOS 16.2+)

Drive lockscreen and Dynamic Island progress from `/notify`:

```json
{
  "title": "Deploy #42",
  "body": "Building",
  "liveActivity": {
    "action": "start",
    "activityId": "deploy-42",
    "attributes": { "name": "ci.example.com" },
    "state": {
      "title": "Deploy #42",
      "status": "Running tests",
      "progress": 0.35,
      "icon": "hammer.fill"
    }
  }
}
```

`action` is `start` | `update` | `end`. `activityId` is yours to choose and
must be reused for updates. See [docs/LIVE_ACTIVITIES.md](docs/LIVE_ACTIVITIES.md)
for the Xcode one-time setup and the field-by-field contract.

### Interactive actions

Ship up to 4 action buttons with each notification. Three kinds:

```json
{
  "title": "Staging deploy ready",
  "body": "Merge main → staging?",
  "actions": [
    { "kind": "callback", "id": "approve", "label": "Approve",
      "callbackUrl": "https://ci.example.com/deploy/42/approve" },
    { "kind": "callback", "id": "reject", "label": "Reject",
      "callbackUrl": "https://ci.example.com/deploy/42/reject",
      "destructive": true },
    { "kind": "open_url", "id": "logs", "label": "View logs",
      "url": "https://ci.example.com/deploy/42" },
    { "kind": "reply", "id": "comment", "label": "Reply",
      "callbackUrl": "https://ci.example.com/deploy/42/comment",
      "placeholder": "Add a note…" }
  ]
}
```

| kind       | behavior                                                                 |
| ---------- | ------------------------------------------------------------------------ |
| `open_url` | Opens the URL when tapped. Also recorded as an event.                    |
| `callback` | POSTs to `callbackUrl`. Result (HTTP status) stored on the action event. |
| `reply`    | iOS inline text reply. POSTs `{ reply, ... }` to `callbackUrl`.           |

**Callback request** (`POST` to your `callbackUrl`):

```
POST /your/endpoint
Content-Type: application/json
User-Agent: pushr/1.0
X-Pushr-Source: pushr
X-Pushr-Notification: <notificationId>
X-Pushr-Action: <action.id>
X-Pushr-Signature: sha256=<hex>   ← only when webhookSecret is set

{
  "notificationId": "...",
  "actionId": "approve",
  "respondedAt": 1712160000000,
  "reply": "LGTM"   // only for kind=reply
}
```

`X-Pushr-Signature` is `HMAC-SHA256(body, sourceApp.webhookSecret)`. Verify it
with the same secret you used for inbound webhooks:

```ts
const mac = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
const ok = timingSafeEqual(`sha256=${mac}`, req.headers["x-pushr-signature"]);
```

**Lockscreen label caveat.** iOS requires notification categories to be
pre-registered, so the on-device **lockscreen** shows generic labels
("Action 1", "Action 2", "Reply"). The **mobile feed** renders the real
labels and is where users normally respond. Custom lockscreen labels are on
the roadmap; they need an iOS Notification Service Extension to rewrite
`categoryIdentifier` at delivery time.

### Ack-or-escalate

Pass an `ack` object to turn a notification into an on-call-style alarm that
re-pushes at high priority (ignoring quiet hours and source-app mutes) until
the user taps it:

```json
{
  "title": "DB disk > 90%",
  "body": "homelab/prod",
  "priority": "high",
  "ack": { "timeoutSec": 60, "maxAttempts": 5 }
}
```

- `timeoutSec` — seconds between re-pushes. `10`–`86400`.
- `maxAttempts` — number of re-pushes after the initial send. `1`–`20`.

Tapping the notification in the feed (or opening its URL) acknowledges it and
stops the escalation loop. Notifications still awaiting an ack are listed at
the top of the feed with a "ack needed" badge.

## Webhook adapters

Forward provider webhooks straight to pushr without writing glue code.

```
POST /hooks/github?token=$PUSHR_TOKEN
POST /hooks/sentry?token=$PUSHR_TOKEN
POST /hooks/grafana?token=$PUSHR_TOKEN
```

Either put the token in an `Authorization: Bearer …` header (if the provider
lets you customize one) or append `?token=…` to the URL.

### GitHub

Paste `$PUSHR_URL/hooks/github?token=$PUSHR_TOKEN` into your repo/org
webhook settings. Select "application/json" and the events you care about
(push, pull_request, issues, release, workflow_run, check_run,
deployment_status).

**Signature verification.** If you set a webhook secret in GitHub,
configure the same secret on the source app and pushr will verify
`X-Hub-Signature-256` on every request. From the Convex dashboard:

```
sourceApps.setWebhookConfig  id=<sourceAppId>
                              provider="github"
                              secret="<your-github-webhook-secret>"
```

Pass `secret: null` to clear.

### Sentry

Add an Internal Integration (or legacy plugin webhook) pointing at
`/hooks/sentry?token=…`. Severity maps to pushr priority:

| sentry level | priority |
| --- | --- |
| debug | 2 |
| info | 4 |
| warning | 6 |
| error | 8 |
| fatal | 9 |

### Grafana

In your contact point → Webhook → URL `/hooks/grafana?token=…`. The adapter
collapses the alert batch into a single push titled
`<ruleName> (<n> firing)`. Severity (from `commonLabels.severity`) maps to
pushr priority the same way Sentry levels do.

## Per-device delivery tracking

Every outbound push creates a row in the `deliveries` table, one per device.
Rows transition `pending` → `queued` → `delivered` / `failed` / `invalid` as
Expo reports tickets and, 15 minutes later, receipts (which is the only
reliable signal of APNs/FCM delivery).

Query per-device status for a notification from the mobile client:

```ts
const rows = useQuery(api.deliveries.listForNotification, {
  notificationId,
});
```

## Source app tokens

Create a token from the mobile app's **Apps** tab (shown once, store it safely — only the hash is kept server-side).

## Env vars

See `.env.example`.
