/**
 * Small color helpers. React Native's style engine has no `color-mix()` or
 * relative-color syntax, so the design's `color-mix(in srgb, accent N%, base)`
 * and `accent / alpha` constructs are resolved here at render time instead.
 */

type Rgb = { r: number; g: number; b: number };

function parse(color: string): Rgb {
  const hex = color.trim();
  if (hex.startsWith('#')) {
    const raw = hex.slice(1);
    const full =
      raw.length === 3
        ? raw
            .split('')
            .map((c) => c + c)
            .join('')
        : raw.slice(0, 6);
    const n = parseInt(full, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  const m = hex.match(/rgba?\(([^)]+)\)/i);
  if (m) {
    const [r, g, b] = m[1].split(',').map((p) => parseFloat(p));
    return { r: r ?? 0, g: g ?? 0, b: b ?? 0 };
  }
  return { r: 0, g: 0, b: 0 };
}

function toHex({ r, g, b }: Rgb): string {
  const c = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/**
 * Opaque blend of `color` over `base` — the `color-mix(in srgb, color N%, base)`
 * the design leans on for tinted cards and glows. `amount` is 0–1.
 */
export function mix(color: string, amount: number, base: string): string {
  const a = parse(color);
  const b = parse(base);
  const t = Math.max(0, Math.min(1, amount));
  return toHex({
    r: a.r * t + b.r * (1 - t),
    g: a.g * t + b.g * (1 - t),
    b: a.b * t + b.b * (1 - t)
  });
}

/** `color` at `alpha` (0–1) as an `rgba()` string. */
export function alpha(color: string, a: number): string {
  const { r, g, b } = parse(color);
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${Math.max(0, Math.min(1, a))})`;
}

/** Perceived luminance (0–1) — used to pick readable text over a fill. */
export function luminance(color: string): number {
  const { r, g, b } = parse(color);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** `#000` or `#fff`, whichever reads better on `color`. */
export function readableOn(color: string): string {
  return luminance(color) > 0.62 ? '#14161A' : '#FFFFFF';
}
