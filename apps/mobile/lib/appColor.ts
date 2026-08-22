import { mix } from './color';

/**
 * Per-source-app identity colors. The design gives every source app its own hue
 * — carried by its icon tile, its card's corner bloom and its border — so a
 * screenful of notifications reads as a legible spread of sources instead of a
 * stack of identical boxes.
 *
 * Hues are spaced around the wheel and matched in saturation so no single app
 * shouts over the others.
 */
const APP_COLORS = [
  '#17B8A0', // teal
  '#3E7BFA', // blue
  '#C9A24A', // gold
  '#C15CF0', // orchid
  '#2FB566', // green
  '#F0355A', // rose
  '#6558F5', // indigo
  '#E0763B', // ember
  '#4CA5E8', // sky
  '#D4499B' // magenta
] as const;

/**
 * Stable color for a source app. Keyed on the app's id when available (so a
 * rename doesn't reshuffle the palette) and its name otherwise.
 */
export function appColor(key: string | null | undefined): string {
  const seed = (key ?? '').trim() || '?';
  // FNV-1a — cheap, well-distributed, and stable across app launches.
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return APP_COLORS[Math.abs(hash) % APP_COLORS.length];
}

/**
 * The color a card should be lit by for a given source app, or `null` for no
 * identity bloom at all. Three cases, in priority order:
 *
 * 1. **`logoColor`** — sampled from the uploaded artwork by the backend
 *    (`convex/logoColor.ts`). The real thing, so the glow matches the logo.
 * 2. **No logo** — `appColor`'s hash of the app id. Also exact, because the
 *    monogram avatar is drawn from the same value.
 * 3. **A logo we couldn't sample** (monochrome mark, or a format with no
 *    decoder) — no identity bloom. The hash would be a guess that the visible
 *    artwork contradicts, and a plain card beats a wrong one.
 */
export function identityTint(
  logoUrl: string | null | undefined,
  colorKey: string | null | undefined,
  logoColor?: string | null
): string | null {
  if (logoColor) return logoColor;
  return logoUrl ? null : appColor(colorKey);
}

/** Light and dark ends of an app color's icon-tile gradient. */
export function appGradient(color: string): [string, string] {
  return [mix(color, 0.9, '#FFFFFF'), mix(color, 0.78, '#000000')];
}

/** One- or two-letter monogram for an app with no uploaded icon. */
export function monogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}
