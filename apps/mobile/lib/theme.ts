import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react';
import { useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { alpha, mix } from './color';

/**
 * pushr design tokens. The palette is a neutral gray canvas — near-black in
 * dark, near-white in light — carrying a single accent-tinted bloom, with cards
 * floating on it as distinct 20pt surfaces. Accent is user-selectable from a
 * six-color palette.
 *
 * Surface ladder, ground → nearest the viewer (both modes read the same way,
 * light mode inverted):
 *   canvas < background < backgroundLift < sheet < cell
 */
export type Palette = {
  /** Deepest surface — auth, onboarding, splash. */
  canvas: string;
  /** Default screen background. */
  background: string;
  /** One step lighter than `background`; the accent bloom mixes into this. */
  backgroundLift: string;
  grouped: string;
  sheet: string;
  /** Bottom of the sheet's own top-to-bottom gradient. */
  sheetDeep: string;
  cell: string;
  cellHighlight: string;
  /** Maximum-contrast text — screen titles, card headlines. */
  strongLabel: string;
  label: string;
  secondaryLabel: string;
  tertiaryLabel: string;
  separator: string;
  accent: string;
  accentContrast: string;
  destructive: string;
  success: string;
  warning: string;
  fill: string;
  placeholder: string;
};

export type ThemeMode = 'system' | 'light' | 'dark';
export type AccentKey = 'blue' | 'purple' | 'pink' | 'green' | 'orange' | 'indigo';

type AccentPair = { light: string; dark: string };

/**
 * The design's accent palette, used verbatim in both modes so an accent looks
 * like the same color whichever appearance you're in.
 *
 * Label contrast on top of these is handled at the point of use by
 * `readableOn()`, which flips to ink on the lighter accents (orange, green)
 * rather than forcing white through at ~2:1.
 */
export const ACCENT_PRESETS: Record<AccentKey, AccentPair> = {
  blue: { light: '#3E7BFA', dark: '#3E7BFA' },
  purple: { light: '#C15CF0', dark: '#C15CF0' },
  pink: { light: '#F0355A', dark: '#F0355A' },
  green: { light: '#2FB566', dark: '#2FB566' },
  orange: { light: '#F5A623', dark: '#F5A623' },
  indigo: { light: '#6558F5', dark: '#6558F5' }
};

export const ACCENT_ORDER: AccentKey[] = ['blue', 'purple', 'pink', 'green', 'orange', 'indigo'];

const DEFAULT_ACCENT: AccentKey = 'blue';
const STORAGE_KEY_MODE = 'pushr.themeMode';
const STORAGE_KEY_ACCENT = 'pushr.accentKey';

const basePalettes: { light: Palette; dark: Palette } = {
  light: {
    // The mirror of the dark ramp: same neutral grays, same steps, inverted.
    // Ground at `#F0F0F0`, sheets lifted toward white, cards white on top.
    canvas: '#EAEAEA',
    background: '#F0F0F0',
    backgroundLift: '#F5F5F5',
    grouped: '#F0F0F0',
    // A step toward white, the way dark's sheet is a step toward light — and
    // below `cell`, so a card inside a sheet still reads as a card.
    sheet: '#F7F7F7',
    sheetDeep: '#F0F0F0',
    cell: '#FFFFFF',
    cellHighlight: '#F2F2F2',
    strongLabel: '#0A0A0A',
    label: '#1C1C1C',
    // 6.7:1 and 4.5:1 on the white card — t3 is the de-emphasized tier
    // (timestamps, captions) and still clears AA for small text.
    secondaryLabel: '#5C5C5C',
    tertiaryLabel: '#767676',
    separator: 'rgba(0,0,0,0.09)',
    accent: ACCENT_PRESETS[DEFAULT_ACCENT].light,
    accentContrast: '#FFFFFF',
    destructive: '#D92544',
    success: '#1F9954',
    warning: '#B8760A',
    fill: 'rgba(0,0,0,0.06)',
    placeholder: '#949494'
  },
  dark: {
    // A neutral gray ramp rather than the blue-tinted near-black this started
    // as: `#242424` is the ground everything stands on, cards one step up at
    // `#2E2E2E`, text `#E8E8E8`.
    canvas: '#1C1C1C',
    background: '#242424',
    backgroundLift: '#2A2A2A',
    grouped: '#242424',
    // One step above the ground so a sheet reads as a surface over the screen
    // by value, not only by scrim, corner radius and shadow.
    sheet: '#2A2A2A',
    sheetDeep: '#242424',
    cell: '#2E2E2E',
    cellHighlight: '#383838',
    strongLabel: '#F5F5F5',
    label: '#E8E8E8',
    // 5.9:1 and 4.1:1 on the `#2E2E2E` card — t2 for supporting copy, t3 for
    // genuinely de-emphasized text (timestamps, captions).
    secondaryLabel: '#ABABAB',
    tertiaryLabel: '#8E8E8E',
    // A point more than the near-black palette needed: hairlines have to carry
    // over a lighter ground.
    separator: 'rgba(255,255,255,0.09)',
    accent: ACCENT_PRESETS[DEFAULT_ACCENT].dark,
    accentContrast: '#FFFFFF',
    destructive: '#F0546A',
    success: '#2FB566',
    warning: '#F5B13D',
    fill: 'rgba(255,255,255,0.08)',
    placeholder: '#8E8E8E'
  }
};

/** Kept as a named export for backward compatibility with existing imports. */
export const palettes = basePalettes;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32
} as const;

/**
 * Border-radius scale. Multiples of 4 (Apple's standard design grid) so all
 * rounded corners snap to the same rhythm. Tokens are sized for: tiny chips
 * and badges (xs), small chips and inline icon containers (sm), list rows
 * and medium cards (md), large cards and feature tiles (lg), drawers and
 * sheets (xl). `pill` for fully-rounded capsules. Use these instead of raw
 * numbers — direct numeric `borderRadius: N` is reserved for math-derived
 * cases (circles where radius = width / 2).
 */
export const radius = {
  xs: 4,
  sm: 8,
  /** Inline icon tiles, inputs, small chips. */
  md: 12,
  /** Primary buttons. */
  button: 14,
  lg: 16,
  /** Standing card / list-section corner — the design's signature radius. */
  card: 20,
  xl: 20,
  /** Bottom sheets and drawers. */
  sheet: 26,
  pill: 9999
} as const;

export const type = {
  /**
   * Display sizes carry negative tracking (the design's `-0.02em`) — tight
   * letterforms are what make the headings read as one deliberate voice
   * rather than stock system text.
   */
  display: { fontSize: 40, lineHeight: 42, fontWeight: '800' as const, letterSpacing: -0.8 },
  largeTitle: { fontSize: 34, lineHeight: 38, fontWeight: '700' as const, letterSpacing: -0.7 },
  title1: { fontSize: 28, lineHeight: 33, fontWeight: '700' as const, letterSpacing: -0.56 },
  title2: { fontSize: 22, lineHeight: 27, fontWeight: '700' as const, letterSpacing: -0.44 },
  title3: { fontSize: 20, lineHeight: 25, fontWeight: '700' as const, letterSpacing: -0.4 },
  /** All-caps kicker above a hero title. Pair with `textTransform: 'uppercase'`. */
  eyebrow: { fontSize: 13, lineHeight: 16, fontWeight: '700' as const, letterSpacing: 1.3 },
  /** Grouped-list section header. Pair with `textTransform: 'uppercase'`. */
  sectionLabel: { fontSize: 13, lineHeight: 16, fontWeight: '600' as const, letterSpacing: 0.55 },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' as const, letterSpacing: -0.43 },
  body: { fontSize: 17, lineHeight: 22, fontWeight: '400' as const, letterSpacing: -0.43 },
  callout: { fontSize: 16, lineHeight: 21, fontWeight: '400' as const, letterSpacing: -0.32 },
  subhead: { fontSize: 15, lineHeight: 20, fontWeight: '400' as const, letterSpacing: -0.24 },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const, letterSpacing: -0.08 },
  caption1: { fontSize: 12, lineHeight: 16, fontWeight: '400' as const },
  caption2: { fontSize: 11, lineHeight: 13, fontWeight: '400' as const }
} as const;

type Prefs = {
  mode: ThemeMode;
  accentKey: AccentKey;
  setMode: (mode: ThemeMode) => void;
  setAccent: (key: AccentKey) => void;
};

const ThemePrefsContext = createContext<Prefs>({
  mode: 'system',
  accentKey: DEFAULT_ACCENT,
  setMode: () => {},
  setAccent: () => {}
});

export function ThemePreferencesProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [accentKey, setAccentState] = useState<AccentKey>(DEFAULT_ACCENT);

  useEffect(() => {
    (async () => {
      try {
        const [m, a] = await Promise.all([
          SecureStore.getItemAsync(STORAGE_KEY_MODE),
          SecureStore.getItemAsync(STORAGE_KEY_ACCENT)
        ]);
        if (m === 'light' || m === 'dark' || m === 'system') setModeState(m);
        if (a && a in ACCENT_PRESETS) setAccentState(a as AccentKey);
      } catch {
        // non-fatal — fall back to defaults.
      }
    })();
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    SecureStore.setItemAsync(STORAGE_KEY_MODE, next).catch(() => {});
  }, []);

  const setAccent = useCallback((next: AccentKey) => {
    setAccentState(next);
    SecureStore.setItemAsync(STORAGE_KEY_ACCENT, next).catch(() => {});
  }, []);

  const value = useMemo(
    () => ({ mode, accentKey, setMode, setAccent }),
    [mode, accentKey, setMode, setAccent]
  );

  return React.createElement(ThemePrefsContext.Provider, { value }, children);
}

export function useThemePreferences() {
  return useContext(ThemePrefsContext);
}

export function useTheme() {
  const scheme = useColorScheme();
  const { mode, accentKey } = useContext(ThemePrefsContext);
  const isDark = mode === 'system' ? scheme === 'dark' : mode === 'dark';
  const base = isDark ? basePalettes.dark : basePalettes.light;
  const accent = ACCENT_PRESETS[accentKey][isDark ? 'dark' : 'light'];
  const colors: Palette = { ...base, accent };

  // Soft tinted background helper. Dark mode keeps the original alpha; light
  // mode roughly doubles it so tints on white surfaces don't look washed out.
  const tintBg = (hex: string, a: string = '22'): string => {
    if (isDark) return hex + a;
    const boosted = Math.min(255, parseInt(a, 16) * 2);
    return hex + boosted.toString(16).padStart(2, '0').toUpperCase();
  };

  /**
   * Neutral overlay at `a` (0–1) — white over dark, black over light. Stands in
   * for the design's `--ovNN` custom properties.
   */
  const ov = (a: number): string => (isDark ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`);

  /**
   * Translucent wash of `color` (defaults to the accent) for tinted chips,
   * icon tiles and card blooms. Light mode gets a touch more so the tint
   * survives against white.
   */
  const tint = (a: number, color: string = accent): string =>
    alpha(color, isDark ? a : Math.min(1, a * 1.35));

  /** Opaque blend of `color` into a surface — the `color-mix()` equivalent. */
  const blend = (a: number, color: string = accent, surface: string = colors.cell): string =>
    mix(color, a, surface);

  /** Drop shadows sized to the surface they lift. */
  const shadow = {
    card: {
      shadowColor: '#000000',
      shadowOpacity: isDark ? 0.35 : 0.07,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 4
    },
    floating: {
      shadowColor: '#000000',
      shadowOpacity: isDark ? 0.5 : 0.14,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 10 },
      elevation: 10
    },
    /** Accent-colored bloom under a filled accent surface. */
    glow: (color: string = accent) => ({
      shadowColor: color,
      shadowOpacity: isDark ? 0.4 : 0.28,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 8 },
      elevation: 8
    })
  };

  return {
    isDark,
    colors,
    spacing,
    radius,
    type,
    mode,
    accentKey,
    tintBg,
    ov,
    tint,
    blend,
    shadow
  };
}
