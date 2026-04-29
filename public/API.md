# pushr HTTP API

Every endpoint lives at your Convex deployment's site URL —
`https://<your-deployment>.convex.site` — and is referenced below as
`$PUSHR_URL`. Every authenticated endpoint takes a source-app bearer token
(`pshr_…`) created from the mobile app's **Apps** tab and referenced as
`$PUSHR_TOKEN`.

## Endpoints at a glance

| Method | Path                  | Purpose                                              | Auth                                |
| ------ | --------------------- | ---------------------------------------------------- | ----------------------------------- |
| POST   | `/notify`             | Send a notification                                  | `Authorization: Bearer $PUSHR_TOKEN` |
| POST   | `/hooks/github`       | GitHub webhook adapter                               | Bearer **or** `?token=`             |
| POST   | `/hooks/sentry`       | Sentry webhook adapter                               | Bearer **or** `?token=`             |
| POST   | `/hooks/grafana`      | Grafana webhook adapter                              | Bearer **or** `?token=`             |
| GET    | `/healthz`            | Health check                                         | none                                |

---

## `POST /notify`

Sends one notification to every device the source app's owner has
registered (and to every accepted member's devices, if the app is shared).

### Request

```
POST /notify
Authorization: Bearer pshr_…
Content-Type: application/json
```

#### Required fields

| Field   | Type   | Notes                                                                |
| ------- | ------ | -------------------------------------------------------------------- |
| `title` | string | Banner title.                                                        |
| `body`  | string | Banner body. **Or** `message` (Gotify-compatible alias).             |

#### Optional fields

| Field           | Type                       | Notes                                                                                                                                                                                                                                            |
| --------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `priority`      | number 1–10 \| string      | `1`–`6` and `"low"`/`"normal"` deliver at default priority. `7`–`10` and `"high"` wake the device with a high-priority push. Defaults to normal.                                                                                                |
| `url`           | string                     | Tapping the banner opens this URL.                                                                                                                                                                                                               |
| `data`          | object                     | Arbitrary JSON delivered alongside the push (forwarded to the app's notification handler).                                                                                                                                                       |
| `image`         | string                     | URL of an image to attach as a banner thumbnail.                                                                                                                                                                                                 |
| `action`        | object                     | Single action button (legacy). `{ label: string, url: string }`. Replaced by `actions` if both are set.                                                                                                                                          |
| `actions`       | array (max 4)              | Rich interactive actions — see [Action buttons](#action-buttons).                                                                                                                                                                                |
| `ack`           | object                     | Ack-or-escalate alarm — see [Ack-or-escalate](#ack-or-escalate).                                                                                                                                                                                  |
| `liveActivity`  | object                     | Drive an iOS Live Activity — see [Live Activities](#live-activities).                                                                                                                                                                            |
| `deliverAt`     | number (ms-epoch)          | Schedule the push for a future time. Must be ≥ now − 60 s.                                                                                                                                                                                       |

### Response

```json
{ "id": "j97...", "scheduledFor": null }
```

Status codes:

| Code | Body                                                                                              | When                                            |
| ---- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 202  | `{ id, scheduledFor }`                                                                            | Accepted. `scheduledFor` is the `deliverAt` ms-epoch (or `null`). |
| 400  | `{ error: "<reason>" }`                                                                           | Validation error (missing fields, bad shape).   |
| 401  | `{ error: "Invalid token" }` / `"Missing bearer token"`                                           | Bad or absent token.                            |
| 403  | `{ error: "Source app disabled" }`                                                                | Token is valid but the app was disabled.        |
| 500  | `{ error: "<message>" }`                                                                          | Unexpected server error.                        |

### Minimal example

```bash
curl -X POST "$PUSHR_URL/notify" \
  -H "Authorization: Bearer $PUSHR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Build succeeded",
    "body":  "ci.example.com / main → staging"
  }'
```

### Priority

```bash
# Wake the device — banner + sound:
-d '{"title":"DB disk > 90%","body":"prod","priority":"high"}'

# Numeric (Gotify-style 1-10):
-d '{"title":"FYI","body":"nightly backups complete","priority":4}'
```

`priority >= 7` always delivers as high priority, ignoring quiet hours
unless they're explicitly configured per-app.

### Open URL on tap

```bash
-d '{
  "title": "PR #42 merged",
  "body":  "from peptide",
  "url":   "https://github.com/owner/repo/pull/42"
}'
```

### Image attachment

```bash
-d '{
  "title": "New deploy",
  "body":  "Build #382 passed",
  "image": "https://ci.example.com/badges/build-382.png"
}'
```

### Action buttons

Up to **4 actions**. Three kinds:

```jsonc
{
  "title": "Staging deploy ready",
  "body":  "Merge main → staging?",
  "actions": [
    { "kind": "callback", "id": "approve", "label": "Approve",
      "callbackUrl": "https://ci.example.com/deploy/42/approve" },

    { "kind": "callback", "id": "reject",  "label": "Reject",
      "callbackUrl": "https://ci.example.com/deploy/42/reject",
      "destructive": true },

    { "kind": "open_url", "id": "logs",    "label": "View logs",
      "url": "https://ci.example.com/deploy/42" },

    { "kind": "reply",    "id": "comment", "label": "Reply",
      "callbackUrl": "https://ci.example.com/deploy/42/comment",
      "placeholder": "Add a note…" }
  ]
}
```

| `kind`     | Behavior                                                                                              |
| ---------- | ----------------------------------------------------------------------------------------------------- |
| `open_url` | Opens `url` when tapped. Recorded as an event server-side.                                            |
| `callback` | POSTs to `callbackUrl`. HTTP status stored on the action event. Optional `authRequired` to lock-gate. |
| `reply`    | iOS inline text reply. POSTs `{ reply, ... }` to `callbackUrl`. Optional `placeholder`.               |

#### Callback request shape

When the user taps a `callback` or `reply` action, pushr POSTs to your
`callbackUrl`:

```
POST /your/endpoint
Content-Type: application/json
User-Agent: pushr/1.0
X-Pushr-Source: pushr
X-Pushr-Notification: <notificationId>
X-Pushr-Action: <action.id>
X-Pushr-Signature: sha256=<hex>     ← only if the source app has webhookSecret set

{
  "notificationId": "...",
  "actionId":       "approve",
  "respondedAt":    1712160000000,
  "reply":          "LGTM"          ← only for kind=reply
}
```

`X-Pushr-Signature` is `HMAC-SHA256(rawBody, sourceApp.webhookSecret)`.
Verify with timing-safe equality:

```ts
const mac = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
const ok  = timingSafeEqual(`sha256=${mac}`, headers["x-pushr-signature"]);
```

#### Caveat: lockscreen labels

iOS requires notification categories to be pre-registered, so the
**lockscreen** banner shows generic labels (`Action 1`, `Action 2`,
`Reply`). The **mobile feed** renders the real labels you sent and is
where users normally respond.

### Ack-or-escalate

Turn a notification into an on-call-style alarm that re-pushes at high
priority — ignoring quiet hours and source-app mutes — until the user
taps it.

```jsonc
{
  "title":    "DB disk > 90%",
  "body":     "homelab/prod",
  "priority": "high",
  "ack": {
    "timeoutSec":  60,        // 10–86400, seconds between re-pushes
    "maxAttempts": 5          // 1–20, total re-pushes after the initial send
  }
}
```

Tapping the notification (or opening its `url`) acknowledges it and stops
the loop. Un-acked notifications are listed at the top of the feed with an
"ack needed" badge.

### Scheduled delivery

```jsonc
{
  "title":     "Standup",
  "body":      "Time to gather",
  "deliverAt": 1714435200000   // ms-epoch
}
```

Returns `202 { id, scheduledFor }` immediately; delivery happens at the
target time via the Convex scheduler.

### Live Activities

Drive iOS lockscreen / Dynamic Island progress indicators. Three actions:
`start` / `update` / `end`, all keyed by your own `activityId`.

```jsonc
{
  "title": "Deploy #42",
  "body":  "Building",
  "liveActivity": {
    "action":     "start",                    // start | update | end
    "activityId": "deploy-42",                // caller-chosen, reused for update/end
    "attributes": { "name": "ci.example.com" }, // immutable, only on start
    "state": {                                  // mutable ContentState
      "title":    "Deploy #42",
      "status":   "Running tests",
      "progress": 0.35,                         // 0..1, omit for indeterminate
      "icon":     "hammer.fill"                 // SF Symbol name
    },
    "staleDate":      1712200000000,            // ms-epoch (optional)
    "relevanceScore": 0.8                       // 0..1 (optional)
  }
}
```

Update:

```json
{
  "title": "Deploy #42",
  "body":  "Deploying to staging",
  "liveActivity": {
    "action":     "update",
    "activityId": "deploy-42",
    "state":      { "title": "Deploy #42", "status": "Deploying", "progress": 0.85 }
  }
}
```

End:

```json
{
  "title": "Deploy #42",
  "body":  "Shipped 🎉",
  "liveActivity": {
    "action":     "end",
    "activityId": "deploy-42",
    "state":      { "title": "Deploy #42", "status": "Complete", "progress": 1.0 }
  }
}
```

`start` requires the device to have registered a push-to-start token (the
mobile client does this on first launch). `update`/`end` can fire even if
the app is terminated. Set the `APNS_*` environment variables on your
Convex deployment to enable this end-to-end (see `.env.example`).

If `APNS_AUTH_KEY` isn't configured, the `liveActivity` field is silently
ignored and the regular push still delivers normally.

### Gotify-style fallback

If you're migrating from Gotify, pushr accepts the alternate field names
without code changes:

```bash
curl -X POST "$PUSHR_URL/notify" \
  -H "Authorization: Bearer $PUSHR_TOKEN" \
  -d '{
    "title":    "Backup failed",
    "message":  "exit 2",
    "priority": 8,
    "extras":   { "client::notification": { "click": { "url": "https://homelab.lan" } } }
  }'
```

`message` maps to `body`; `extras["client::notification"].click.url` maps
to `url`.

---

## Webhook adapters

Forward provider webhooks straight to pushr without writing glue code.
Adapters normalize the provider payload into the same internal shape and
flow through the same delivery / quota / ack plumbing.

```
POST /hooks/github?token=$PUSHR_TOKEN
POST /hooks/sentry?token=$PUSHR_TOKEN
POST /hooks/grafana?token=$PUSHR_TOKEN
```

Auth: either `Authorization: Bearer $PUSHR_TOKEN` (when the provider lets
you customize headers) or `?token=$PUSHR_TOKEN` in the query string.

### GitHub

Paste `$PUSHR_URL/hooks/github?token=$PUSHR_TOKEN` into your repo or org
webhook settings. Content type **application/json**. Subscribe to events
you care about:

| Event             | Title                                  | Priority |
| ----------------- | -------------------------------------- | -------- |
| `push`            | "{repo} — N commits to {branch}"       | normal   |
| `pull_request`    | "PR #N: {title}"                       | normal   |
| `issues`          | "Issue #N: {title}"                    | normal   |
| `release`         | "{repo} released {tag_name}"           | normal   |
| `workflow_run`    | "{name} {conclusion}"                  | high if `conclusion == "failure"` |
| `check_run`       | similar to workflow_run                | high on failure |
| `deployment_status` | "{environment} {state}"              | high on `failure` |

Set a webhook secret in GitHub and on the source app to verify
`X-Hub-Signature-256` server-side:

From the Convex dashboard:
```
sourceApps.setWebhookConfig
  id=<sourceAppId>
  provider="github"
  secret="<your-github-webhook-secret>"
```
Pass `secret: null` to clear.

### Sentry

Add an Internal Integration (or legacy plugin webhook) at
`/hooks/sentry?token=…`. Severity maps to pushr priority:

| Sentry level | pushr priority |
| ------------ | -------------- |
| debug        | 2              |
| info         | 4              |
| warning      | 6              |
| error        | 8              |
| fatal        | 9              |

### Grafana

Contact point → Webhook → URL `$PUSHR_URL/hooks/grafana?token=…`. The
adapter collapses the alert batch into one push titled
`<ruleName> (<n> firing)`. `commonLabels.severity` maps to priority the
same way Sentry levels do.

### Adapter response

| Code | Body                          | When                                                      |
| ---- | ----------------------------- | --------------------------------------------------------- |
| 202  | `{ id, scheduledFor: null }`  | Adapter normalized the event and the push was queued.    |
| 200  | `{ ignored: true, provider }` | The adapter chose to ignore this event (e.g. GitHub `ping`). |
| 401  | `{ error: "Invalid signature" }` | GitHub HMAC verification failed (only when `webhookSecret` is set). |
| 401 / 400 / 429 / 500 | (same as `/notify`)  |                                                           |

---

## `GET /healthz`

```
GET /healthz
```

```json
{ "ok": true }
```

Use this from a monitor to check that your deployment is reachable.

---

## Source-app token format

Tokens always start with `pshr_` followed by a base64url payload. They're
shown **once** at creation time in the mobile app's **Apps** tab — the
server only stores the `sha256(token)` hash. Revoking an app rotates the
hash and immediately invalidates the token.

`tokenPrefix` (e.g. `pshr_abcd1234`) is safe to display in logs and CI
config; the full token is not.

---

## Rate limits and quotas

The public build has no quota or tier surface. Unlimited pushes, source
apps, sharing, and 90-day notification history out of the box. The only
ceiling is Convex's per-deployment function rate, which kicks in long
before personal-scale usage hits it.

Tier / billing logic, the `userTiers` and `usageCounters` tables, and
every quota gate were stripped at publish time — they live in the
upstream private repo (the "enterprise" build) for multi-tenant SaaS use.
