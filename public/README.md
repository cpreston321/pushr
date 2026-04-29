# pushr-backend

Self-hostable [Convex](https://convex.dev) backend for pushr — a personal
push-notification hub. Any project POSTs a notification to an HTTP endpoint
with a bearer token; the pushr iOS app delivers it via APNs (Expo Push).

This repo is the open-source backend half. The mobile client is closed-source
but ships with a runtime "Custom server" setting so you can point it at the
Convex deployment you spin up here.

```
Source apps ──POST /notify──> Convex (this repo) ──Expo Push──> iOS devices
(your scripts)   Bearer token   (schema + auth)                   (APNs)
```

## What you get

- Auth (email + password) via [Better Auth](https://better-auth.com).
- Source-app tokens — one bearer token per project, scoped to your account.
- HTTP endpoints — `/notify`, `/hooks/{github,sentry,grafana}`, `/healthz`.
- Per-device delivery tracking, ack-or-escalate, quiet hours, scheduled
  delivery, action buttons, optional iOS Live Activities.
- **No quotas, no billing surface.** Unlimited pushes / source apps /
  sharing / history out of the box. (`tiers.ts` is a permissive stub —
  swap in real enforcement if you ever need it.)

## Quickstart

### 1. Install + create your Convex deployment

```bash
bun install
bun run dev          # alias for `bunx convex dev`
```

The first `bun run dev` walks you through creating a Convex account and a
new deployment, then pushes the schema and all functions in `convex/` up to
it. Leave it running while you finish setup — every subsequent file change
re-pushes automatically.

Convex writes `CONVEX_DEPLOYMENT`, `CONVEX_URL`, and `CONVEX_SITE_URL` into
`.env.local`. Those identify your instance.

> **Just want a one-shot push?** `bun run push` (= `convex dev --once`)
> deploys the current schema + functions to your dev deployment without
> watching. `bun run deploy` does the same against your **production**
> deployment — use it from CI or after pulling updates from upstream.

### 2. Set the required Convex-side env vars

These live in your Convex deployment, not in `.env.local`:

```bash
bunx convex env set BETTER_AUTH_SECRET "$(openssl rand -hex 32)"
bunx convex env set SITE_URL "https://<your-deployment>.convex.site"
```

(Optional) enable Live Activities by setting the `APNS_*` vars — see
[`.env.example`](./.env.example) for the full list. You don't need them
for regular pushes.

### 3. Seed an admin user

```bash
bun run seed                                                    # admin@pushr.sh / admin1234 (change immediately)
bun run seed --email you@example.com --password "<your-password>"
```

### 4. Point the mobile app at your instance

Your Convex URL is what the mobile app needs:

```
Convex URL:  https://<your-deployment>.convex.cloud
Site URL:    https://<your-deployment>.convex.site
```

In the pushr mobile app, open **Settings → Server**, paste those two URLs,
sign out, and sign back in with the seed account.

## Pushing schema + function updates

Every push of `convex/` to your deployment is a single command:

| When                                  | Command                                   |
| ------------------------------------- | ----------------------------------------- |
| Active development (watch + push)     | `bun run dev`                             |
| One-off push to your dev deployment   | `bun run push`                            |
| Push to your production deployment    | `bun run deploy`                          |

Convex pushes the schema atomically alongside the functions — there's no
separate "migrate" step. If a schema change is incompatible with existing
data, the push fails with a clear error and rolls back. See
[Convex schema docs](https://docs.convex.dev/database/schemas) for the
backwards-compatibility rules.

## Sending a notification

```bash
curl -X POST "$PUSHR_URL/notify" \
  -H "Authorization: Bearer $PUSHR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Hello","body":"from my server","priority":"high"}'
```

`$PUSHR_URL` is your `.convex.site` host. `$PUSHR_TOKEN` is a source-app
token — create one from the **Apps** tab in the mobile client (shown once,
store it safely; only the hash is kept server-side).

The full HTTP contract — every field of `/notify`, the webhook adapters,
action buttons, ack-or-escalate, scheduled delivery, Live Activities,
response codes, callback signatures — is documented in **[API.md](./API.md)**.

## Webhook adapters

Forward provider webhooks straight to pushr without writing glue code:

```
POST /hooks/github?token=$PUSHR_TOKEN
POST /hooks/sentry?token=$PUSHR_TOKEN
POST /hooks/grafana?token=$PUSHR_TOKEN
```

Either put the token in an `Authorization: Bearer …` header (if the provider
supports custom headers) or append `?token=…` to the URL. GitHub adapters
verify `X-Hub-Signature-256` if you've set a webhook secret on the source
app.

Adapters live in [`convex/hooks/`](./convex/hooks) — adding a new provider
is one file (normalize provider payload → `NormalizedNotification`).

## Deploying to production

```bash
bunx convex deploy
```

Run `bunx convex env set …` again for your prod deployment to copy over
secrets. Convex deployments are independent — dev and prod do not share env.

## Live Activities (optional)

To drive iOS Live Activities (lockscreen + Dynamic Island progress):

1. Generate an APNs `.p8` auth key in
   [Apple Developer → Keys](https://developer.apple.com/account/resources/authkeys/list)
   with "Apple Push Notifications service (APNs)" enabled.
2. Set the four `APNS_*` env vars (see `.env.example`).
3. Pass a `liveActivity` object in your `/notify` payload:

```json
{
  "title": "Deploy #42",
  "body": "Building",
  "liveActivity": {
    "action": "start",
    "activityId": "deploy-42",
    "attributes": { "name": "ci.example.com" },
    "state": { "title": "Deploy #42", "status": "Running tests", "progress": 0.35 }
  }
}
```

Without `APNS_*` set, the field is silently ignored and regular pushes still
deliver normally.

## License

MIT — see [LICENSE](./LICENSE).
