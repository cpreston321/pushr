# Passkeys (future work)

pushr's authentication currently runs on Better Auth with email + password.
Adding passkeys (WebAuthn / platform authenticator) is straightforward server-side
but requires domain + native infrastructure that isn't in place yet. This doc
captures the full requirements so a future PR can pick it up cleanly.

## Why it's blocked today

iOS passkeys require a **custom domain you control** with an
`apple-app-site-association` file served at
`https://<domain>/.well-known/apple-app-site-association`.

Convex's `*.convex.site` subdomain can't host AASA files (Convex would have to
route `/.well-known/*` to you, and the Team ID / bundle ID inside the AASA
file must match pushr's, not Convex's). You need a real domain.

## What needs to ship together

| Layer | Change |
| --- | --- |
| Domain | Register and point a domain (e.g. `pushr.sh`) at a host you control. |
| AASA | Serve an `apple-app-site-association` JSON file at `/.well-known/apple-app-site-association` with `webcredentials` + `applinks` entries listing `TEAMID.dev.cpreston.pushr`. |
| Android (optional) | Host `/.well-known/assetlinks.json` with the app package + SHA256 fingerprint. |
| Convex | Add the `passkey()` plugin to `convex/betterAuth/auth.ts`, configured with `rpID = <domain>` and `rpName = "pushr"`. Run `npx convex codegen` after. |
| Mobile client | Add `passkeyClient()` to `mobile/lib/auth-client.ts`'s plugins array. |
| Native dep | `bun add react-native-passkey` (or the Expo config plugin equivalent). Expo prebuild will link the native module. |
| Entitlements | Add to `mobile/ios/pushr/pushr.entitlements`: `com.apple.developer.associated-domains` → `["applinks:<domain>", "webcredentials:<domain>"]`. |
| UI | Add "Sign in with passkey" to `mobile/app/(auth)/login.tsx` and "Enroll a passkey" in Settings (post-login). |
| Testing | Real device + TestFlight or dev-build with the entitlement. Simulators can't use the secure enclave for passkey attestation. |

## AASA file example

```json
{
  "applinks": {
    "details": [
      { "appIDs": ["39MSHURBYT.dev.cpreston.pushr"], "components": [{ "/": "*" }] }
    ]
  },
  "webcredentials": {
    "apps": ["39MSHURBYT.dev.cpreston.pushr"]
  }
}
```

Content type MUST be `application/json`. HTTPS required. No redirect.

## Server plugin sketch

```ts
// convex/betterAuth/auth.ts
import { passkey } from "better-auth/plugins/passkey";

plugins: [
  convex({ ... }),
  passkey({
    rpID: "pushr.sh",
    rpName: "pushr",
    origin: ["https://pushr.sh"],
  }),
],
```

## Client plugin sketch

```ts
// mobile/lib/auth-client.ts
import { passkeyClient } from "better-auth/client/plugins";

plugins: [
  expoClient({ ... }),
  convexClient(),
  passkeyClient(),
]
```

## UI calls

```ts
// sign in
await authClient.signIn.passkey();

// enroll after sign-in
await authClient.passkey.addPasskey();
```

## Gotchas

- AASA file is cached by Apple CDN for ~48h after first fetch. Test on a fresh
  device or bump the app version.
- The `rpID` must match the domain exactly (no subdomain wildcards).
- On iOS 17+, the credential picker prompts via QR code if no passkey exists
  for the relying party — verify the enrollment flow works before assuming
  sign-in is broken.
- The user's Apple ID must have iCloud Keychain enabled to sync passkeys
  across devices.

## Open questions

- Do we self-host the AASA file or put it behind Cloudflare in front of the
  Convex site? Either works.
- Should we keep email + password as a fallback permanently, or passkey-only
  after onboarding?
- Android equivalent (Credential Manager) — same backend, different native
  dep and assetlinks config. `react-native-passkey` handles both.
