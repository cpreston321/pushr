# Source-app identity color

Every source app has an identity color. It lights the card bloom behind a feed
row and an Apps-list row, and it's the gradient behind a monogram avatar.

## How it works today

`apps/mobile/lib/appColor.ts` hashes the app's Convex id (FNV-1a) into one of ten
spaced hues. Because the avatar and the card bloom both read that same function,
a **generated** avatar and its glow can never disagree.

For an app with an **uploaded logo** we have no idea what color the artwork is,
so `identityTint()` returns `null` and the card carries no identity bloom — a
gold-and-navy logo sitting in a green card looks broken in a way a plain card
does not. Feed rows still glow the accent while unread, since that's a state
signal rather than a claim about the logo.

## The fix: sample the artwork

Store a color on the app at upload time and prefer it over the hash. Neither the
client nor the backend can currently read pixels, so this needs a decoder.

### Why not client-side

- `expo-image` exposes no pixel API, and neither does `expo-image-picker`.
- `expo-image-manipulator` can resize to 1×1, but returns PNG/JPEG base64 —
  still compressed, so it needs the same decoder.
- `@shopify/react-native-skia` *can* (`image.readPixels()`), but it's a large
  native dependency to add for one swatch.

### Recommended shape (backend)

1. **Schema** — add `logoColor: v.optional(v.string())` to `sourceApps` in
   `apps/backend/convex/schema.ts`.
2. **Action** — a `"use node"` action that takes the `_storage` id, pulls the
   blob with `ctx.storage.get`, decodes it, and writes the result through an
   internal mutation. Decode with a pure-JS decoder (`jpeg-js` for JPEG,
   `fast-png` for PNG); pick by the stored content type.
3. **Pick a color, don't average** — a flat mean of all pixels turns most logos
   into mud. Skip fully/near-transparent pixels, drop near-white and near-black,
   bucket the rest by hue, and take the most-saturated populous bucket. For the
   gold-on-navy case that yields the gold, which is what reads as the logo's
   color.
4. **Trigger** — call the action after `setLogo`, and leave `logoColor` unset on
   failure so the client falls back cleanly.
5. **Expose it** — join `logoColor` into `notifications.listMine` (alongside the
   existing `sourceAppLogoUrl`) and the source-app list query.
6. **Client** — `identityTint()` becomes
   `logoColor ?? (logoUrl ? null : appColor(key))`, and nothing else changes.

### Gotchas

- iOS photo-library images can be HEIC. `expo-image-picker` usually transcodes
  to JPEG on export, but confirm the stored content type rather than assuming.
- Decode a downscaled copy, not the full-resolution upload — a 64×64 sample is
  plenty for a dominant color and keeps the action well inside its limits.
- Backfilling existing logos means walking `sourceApps` with a
  `logoStorageId` and no `logoColor`.
