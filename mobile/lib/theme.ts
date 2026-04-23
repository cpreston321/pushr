import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useColorScheme } from "react-native";
import * as SecureStore from "expo-secure-store";

/**
 * iOS system colors + iOS-native grouped list tokens. Accent is user-selectable
 * from a small palette of presets, defaulting to system indigo.
 */
export type Palette = {
  background: string;
  grouped: string;
  cell: string;
  cellHighlight: string;
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

export type ThemeMode = "system" | "light" | "dark";
export type AccentKey = "blue" | "purple" | "pink" | "green" | "orange" | "indigo";

type AccentPair = { light: string; dark: string };

export const ACCENT_PRESETS: Record<AccentKey, AccentPair> = {
  indigo: { light: "#5856D6", dark: "#5E5CE6" },
  blue: { light: "#007AFF", dark: "#0A84FF" },
  purple: { light: "#AF52DE", dark: "#BF5AF2" },
  pink: { light: "#FF2D55", dark: "#FF375F" },
  green: { light: "#34C759", dark: "#30D158" },
  orange: { light: "#FF9500", dark: "#FF9F0A" },
};

export const ACCENT_ORDER: AccentKey[] = [
  "blue",
  "purple",
  "pink",
  "green",
  "orange",
  "indigo",
];

const DEFAULT_ACCENT: AccentKey = "indigo";
const STORAGE_KEY_MODE = "pushr.themeMode";
const STORAGE_KEY_ACCENT = "pushr.accentKey";

const basePalettes: { light: Palette; dark: Palette } = {
  light: {
    background: "#FFFFFF",
    grouped: "#F2F2F7",
    cell: "#FFFFFF",
    cellHighlight: "#E5E5EA",
    label: "#000000",
    secondaryLabel: "rgba(60,60,67,0.6)",
    tertiaryLabel: "rgba(60,60,67,0.3)",
    separator: "rgba(60,60,67,0.29)",
    accent: ACCENT_PRESETS[DEFAULT_ACCENT].light,
    accentContrast: "#FFFFFF",
    destructive: "#FF3B30",
    success: "#34C759",
    warning: "#FF9500",
    fill: "rgba(120,120,128,0.12)",
    placeholder: "rgba(60,60,67,0.3)",
  },
  dark: {
    background: "#000000",
    grouped: "#000000",
    cell: "#1C1C1E",
    cellHighlight: "#2C2C2E",
    label: "#FFFFFF",
    secondaryLabel: "rgba(235,235,245,0.6)",
    tertiaryLabel: "rgba(235,235,245,0.3)",
    separator: "rgba(84,84,88,0.65)",
    accent: ACCENT_PRESETS[DEFAULT_ACCENT].dark,
    accentContrast: "#FFFFFF",
    destructive: "#FF453A",
    success: "#30D158",
    warning: "#FF9F0A",
    fill: "rgba(120,120,128,0.24)",
    placeholder: "rgba(235,235,245,0.3)",
  },
};

/** Kept as a named export for backward compatibility with existing imports. */
export const palettes = basePalettes;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
} as const;

export const type = {
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: "700" as const, letterSpacing: 0.37 },
  title1: { fontSize: 28, lineHeight: 34, fontWeight: "700" as const, letterSpacing: 0.36 },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: "700" as const, letterSpacing: 0.35 },
  title3: { fontSize: 20, lineHeight: 25, fontWeight: "600" as const, letterSpacing: 0.38 },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: "600" as const, letterSpacing: -0.43 },
  body: { fontSize: 17, lineHeight: 22, fontWeight: "400" as const, letterSpacing: -0.43 },
  callout: { fontSize: 16, lineHeight: 21, fontWeight: "400" as const, letterSpacing: -0.32 },
  subhead: { fontSize: 15, lineHeight: 20, fontWeight: "400" as const, letterSpacing: -0.24 },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: "400" as const, letterSpacing: -0.08 },
  caption1: { fontSize: 12, lineHeight: 16, fontWeight: "400" as const },
  caption2: { fontSize: 11, lineHeight: 13, fontWeight: "400" as const },
} as const;

type Prefs = {
  mode: ThemeMode;
  accentKey: AccentKey;
  setMode: (mode: ThemeMode) => void;
  setAccent: (key: AccentKey) => void;
};

const ThemePrefsContext = createContext<Prefs>({
  mode: "system",
  accentKey: DEFAULT_ACCENT,
  setMode: () => {},
  setAccent: () => {},
});

export function ThemePreferencesProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [accentKey, setAccentState] = useState<AccentKey>(DEFAULT_ACCENT);

  useEffect(() => {
    (async () => {
      try {
        const [m, a] = await Promise.all([
          SecureStore.getItemAsync(STORAGE_KEY_MODE),
          SecureStore.getItemAsync(STORAGE_KEY_ACCENT),
        ]);
        if (m === "light" || m === "dark" || m === "system") setModeState(m);
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
    [mode, accentKey, setMode, setAccent],
  );

  return React.createElement(ThemePrefsContext.Provider, { value }, children);
}

export function useThemePreferences() {
  return useContext(ThemePrefsContext);
}

export function useTheme() {
  const scheme = useColorScheme();
  const { mode, accentKey } = useContext(ThemePrefsContext);
  const isDark = mode === "system" ? scheme === "dark" : mode === "dark";
  const base = isDark ? basePalettes.dark : basePalettes.light;
  const accent = ACCENT_PRESETS[accentKey][isDark ? "dark" : "light"];
  const colors: Palette = { ...base, accent };
  return { isDark, colors, spacing, radius, type, mode, accentKey };
}
