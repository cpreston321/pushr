import { useId } from 'react';
import { StyleSheet, useWindowDimensions, View, type ViewStyle } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '@/lib/theme';
import { mix } from '@/lib/color';

/**
 * `useId()` emits framework-reserved punctuation (`«`, `:`) that isn't valid in
 * an SVG id or a `url(#…)` reference, so strip it down to word characters.
 */
function useGradientId(prefix: string): string {
  return `${prefix}${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
}

/**
 * The accent bloom that sits behind every top-level screen: a wide, shallow
 * ellipse centered just above the top edge, mixing the accent into a lifted
 * background and dissolving into the flat canvas around 45% down the screen.
 *
 * This is the single element that makes the app read as one surface — every
 * screen shares the same light source, so cards, chips and sheets all appear
 * lit from the same place.
 *
 * Drop it as the first child of an absolutely-unclipped screen root; it paints
 * itself behind siblings and never intercepts touches.
 */
export function ScreenGlow({
  /** Bloom color. Defaults to the current accent. */
  tint,
  /** Fraction of the window height the bloom occupies. */
  extent = 0.52,
  /**
   * How strongly the tint mixes into the background at its brightest. Defaults
   * per mode: an alpha that's a whisper over near-black turns the whole canvas
   * into tinted cream over near-white, so light mode takes a quarter of it. The
   * canvas is meant to read as neutral gray, lit from one place — not colored.
   */
  strength
}: {
  tint?: string;
  extent?: number;
  strength?: number;
}) {
  const { colors, isDark } = useTheme();
  const { height } = useWindowDimensions();
  const peak = mix(
    tint ?? colors.accent,
    strength ?? (isDark ? 0.2 : 0.05),
    colors.backgroundLift
  );
  // react-native-svg resolves gradient ids from a process-wide registry, so
  // every mounted gradient needs its own id or they overwrite each other.
  const gid = useGradientId('screenGlow');

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: Math.round(height * extent)
      }}
    >
      <Svg
        style={StyleSheet.absoluteFill}
        preserveAspectRatio="none"
        viewBox="0 0 100 100"
        pointerEvents="none"
      >
        <Defs>
          {/* Stretched by preserveAspectRatio="none" into the wide, shallow
              ellipse the design specifies (130% wide, centered at -8% y). */}
          <RadialGradient
            id={gid}
            gradientUnits="userSpaceOnUse"
            cx="50"
            cy="-15"
            rx="130"
            ry="115"
            fx="50"
            fy="-15"
          >
            <Stop offset="0" stopColor={peak} stopOpacity={1} />
            <Stop offset="0.55" stopColor={peak} stopOpacity={0.45} />
            <Stop offset="1" stopColor={peak} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" fill={`url(#${gid})`} />
      </Svg>
    </View>
  );
}

/**
 * Circular accent halo behind an icon — the anchor of every empty state and
 * onboarding page. A soft radial fill inside a hairline ring of the same hue.
 */
export function Halo({
  size = 92,
  tint,
  children,
  style
}: {
  size?: number;
  tint?: string;
  children?: React.ReactNode;
  style?: ViewStyle;
}) {
  const { colors, tint: tintOf } = useTheme();
  const color = tint ?? colors.accent;
  const gid = useGradientId('halo');

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 1,
          borderColor: tintOf(0.24, color),
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden'
        },
        style
      ]}
    >
      <Svg style={StyleSheet.absoluteFill} viewBox="0 0 100 100" pointerEvents="none">
        <Defs>
          <RadialGradient
            id={gid}
            gradientUnits="userSpaceOnUse"
            cx="50"
            cy="40"
            rx="62"
            ry="62"
            fx="50"
            fy="40"
          >
            <Stop offset="0" stopColor={color} stopOpacity={0.26} />
            <Stop offset="1" stopColor={color} stopOpacity={0.06} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" fill={`url(#${gid})`} />
      </Svg>
      {children}
    </View>
  );
}

/**
 * Corner bloom used inside tinted cards: a large soft radial anchored near the
 * top-left, fading out by the card's midpoint. Absolutely positioned — the
 * parent must clip it (`overflow: 'hidden'`).
 */
export function CardBloom({ tint, strength = 0.16 }: { tint: string; strength?: number }) {
  const gid = useGradientId('cardBloom');
  const { isDark } = useTheme();
  // Halved in light mode for the same reason `ScreenGlow` is cut there: the
  // identity tint is meant to make a card recognizable, not pastel.
  const peak = isDark ? strength : strength * 0.5;
  return (
    <Svg
      style={StyleSheet.absoluteFill}
      preserveAspectRatio="none"
      viewBox="0 0 100 100"
      pointerEvents="none"
    >
      <Defs>
        <RadialGradient
          id={gid}
          gradientUnits="userSpaceOnUse"
          cx="6"
          cy="0"
          rx="130"
          ry="130"
          fx="6"
          fy="0"
        >
          <Stop offset="0" stopColor={tint} stopOpacity={peak} />
          <Stop offset="0.46" stopColor={tint} stopOpacity={peak * 0.35} />
          <Stop offset="1" stopColor={tint} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="100" height="100" fill={`url(#${gid})`} />
    </Svg>
  );
}
