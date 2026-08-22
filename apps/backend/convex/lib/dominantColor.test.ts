import { describe, it, expect } from 'vitest';
import { dominantColor, rgbToHsv, samplePixels, toHex, type Rgba } from './dominantColor';

const px = (r: number, g: number, b: number, a = 255): Rgba => ({ r, g, b, a });

/** Repeat a pixel `n` times, to stand in for an area of a logo. */
const area = (p: Rgba, n: number): Rgba[] => Array.from({ length: n }, () => p);

/** Hue of a hex result, for asserting "this is gold" without pinning exact bytes. */
function hueOf(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return rgbToHsv({ r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }).h;
}

describe('rgbToHsv', () => {
  it('reports greys as unsaturated', () => {
    expect(rgbToHsv({ r: 128, g: 128, b: 128 }).s).toBe(0);
    expect(rgbToHsv({ r: 0, g: 0, b: 0 }).s).toBe(0);
  });

  it('places primaries on their hue spokes', () => {
    expect(rgbToHsv({ r: 255, g: 0, b: 0 }).h).toBeCloseTo(0);
    expect(rgbToHsv({ r: 0, g: 255, b: 0 }).h).toBeCloseTo(120);
    expect(rgbToHsv({ r: 0, g: 0, b: 255 }).h).toBeCloseTo(240);
  });
});

describe('dominantColor', () => {
  it('returns null for no pixels', () => {
    expect(dominantColor([])).toBeNull();
  });

  it('returns null when every pixel is transparent', () => {
    expect(dominantColor(area(px(255, 0, 0, 0), 100))).toBeNull();
  });

  it('returns null for a monochrome mark', () => {
    // A black glyph on white — nothing here is a color anyone would name.
    const pixels = [...area(px(20, 20, 20), 300), ...area(px(250, 250, 250), 700)];
    expect(dominantColor(pixels)).toBeNull();
  });

  it('picks the chromatic mark out of a neutral field', () => {
    const pixels = [...area(px(255, 255, 255), 900), ...area(px(220, 40, 60), 100)];
    const hue = hueOf(dominantColor(pixels)!);
    // Red-ish, near the 0/360 boundary.
    expect(hue < 20 || hue > 340).toBe(true);
  });

  it('reads gold-on-navy as gold, not a muddy blend', () => {
    // The RPH case: a gold ring on a dark navy field. A flat mean lands on a
    // desaturated olive; the logo reads as gold.
    const navy = px(16, 26, 56);
    const gold = px(198, 160, 74);
    const pixels = [...area(navy, 800), ...area(gold, 200)];

    const hue = hueOf(dominantColor(pixels)!);
    expect(hue).toBeGreaterThan(35);
    expect(hue).toBeLessThan(60);

    // And prove the naive approach would have failed: a flat mean of the same
    // pixels is a dark, near-neutral color nobody would call gold.
    const mean = {
      r: (navy.r * 800 + gold.r * 200) / 1000,
      g: (navy.g * 800 + gold.g * 200) / 1000,
      b: (navy.b * 800 + gold.b * 200) / 1000
    };
    const meanHsv = rgbToHsv(mean);
    expect(meanHsv.h).toBeGreaterThan(180); // still blue-ish
    expect(meanHsv.v).toBeLessThan(0.35); // and too dark to glow
  });

  it('lets a small vivid mark beat a large washed-out field', () => {
    const pale = px(206, 214, 224); // barely-saturated blue-grey
    const vivid = px(230, 60, 30); // small vivid ember
    const pixels = [...area(pale, 850), ...area(vivid, 150)];
    const hue = hueOf(dominantColor(pixels)!);
    expect(hue < 25 || hue > 340).toBe(true);
  });

  it('averages hues circularly across the 0-degree seam', () => {
    // Two reds either side of 0°. A naive degree-average would land near 180°
    // (cyan) — the exact opposite of the right answer.
    const pixels = [...area(px(255, 8, 40), 500), ...area(px(255, 40, 8), 500)];
    const hue = hueOf(dominantColor(pixels)!);
    expect(hue < 25 || hue > 335).toBe(true);
  });

  it('returns a color vivid enough to read as a glow', () => {
    // A very dark, barely-saturated teal still has to come back bright enough
    // to show at the 13-30% bloom opacities the cards use.
    const hex = dominantColor(area(px(18, 46, 44), 500));
    const n = parseInt(hex!.slice(1), 16);
    const { s, v } = rgbToHsv({ r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 });
    // Allow a hair under the floors: the result round-trips through 8-bit
    // channels, so 0.62 comes back as 158/255 = 0.6196.
    expect(s).toBeGreaterThanOrEqual(0.54);
    expect(v).toBeGreaterThanOrEqual(0.61);
  });

  it('ignores transparent padding around a mark', () => {
    const pixels = [...area(px(0, 0, 0, 0), 5000), ...area(px(40, 120, 220), 200)];
    const hue = hueOf(dominantColor(pixels)!);
    expect(hue).toBeGreaterThan(190);
    expect(hue).toBeLessThan(250);
  });
});

describe('samplePixels', () => {
  it('returns nothing for a zero-sized image', () => {
    expect(samplePixels(new Uint8Array(0), 0, 0)).toEqual([]);
  });

  it('reads channels in RGBA order', () => {
    const data = new Uint8Array([1, 2, 3, 4]);
    expect(samplePixels(data, 1, 1)).toEqual([{ r: 1, g: 2, b: 3, a: 4 }]);
  });

  it('caps the sample count for a large image', () => {
    const width = 1024;
    const height = 1024;
    const data = new Uint8Array(width * height * 4).fill(120);
    const out = samplePixels(data, width, height, 4096);
    expect(out.length).toBeLessThanOrEqual(4096 * 1.2);
    expect(out.length).toBeGreaterThan(1000);
  });

  it('samples across both axes of a very wide image', () => {
    // Left half red, right half blue. Striding by flat index could walk a
    // single row and miss one side entirely.
    const width = 400;
    const height = 8;
    const data = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const left = x < width / 2;
        data[i] = left ? 255 : 0;
        data[i + 2] = left ? 0 : 255;
        data[i + 3] = 255;
      }
    }
    const out = samplePixels(data, width, height, 256);
    expect(out.some((p) => p.r === 255)).toBe(true);
    expect(out.some((p) => p.b === 255)).toBe(true);
  });
});

describe('toHex', () => {
  it('clamps and pads', () => {
    expect(toHex({ r: 0, g: 0, b: 0 })).toBe('#000000');
    expect(toHex({ r: 255, g: 255, b: 255 })).toBe('#FFFFFF');
    expect(toHex({ r: -20, g: 300, b: 8 })).toBe('#00FF08');
  });
});
