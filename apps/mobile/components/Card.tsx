import { type ReactNode } from 'react';
import { Pressable, View, type ViewStyle } from 'react-native';
import { useTheme, radius as radii, spacing } from '@/lib/theme';
import { CardBloom } from './Glow';
import { haptic } from '@/lib/haptics';

type Props = {
  children: ReactNode;
  /**
   * Brand or status color for the card's corner bloom and border. Pass the
   * source app's color for feed rows, `colors.success` / `colors.destructive`
   * for status cards, or omit for a plain neutral surface.
   */
  tint?: string | null;
  /** Bloom opacity at its brightest. Raise it to make a card the hero. */
  strength?: number;
  /**
   * Set `false` to keep the tinted border but skip the bloom — for cards whose
   * content must stay opaque (a swipeable row sliding over hidden actions) and
   * therefore paint their own bloom inside, above the covered layer.
   */
  bloom?: boolean;
  /** Inner padding. `false` for flush content (grouped rows, media). */
  padding?: number | false;
  cornerRadius?: number;
  /** Lift the card off the canvas with a drop shadow. */
  elevated?: boolean;
  style?: ViewStyle;
};

/**
 * The standing surface of the whole app: a 20pt rounded panel above the canvas,
 * optionally lit from its top-left corner by a tinted bloom with a border of
 * the same hue.
 *
 * The tint is what carries meaning here — a feed row inherits its source app's
 * color, a status card inherits green or red — so a screenful of cards reads as
 * a legible spread of sources rather than a stack of identical boxes.
 */
export function Card({
  children,
  tint,
  strength = 0.16,
  bloom = true,
  padding = spacing.lg,
  cornerRadius = radii.card,
  elevated,
  style
}: Props) {
  const { colors, isDark, ov, tint: tintOf, shadow } = useTheme();
  // `tint()` already boosts alpha 1.35× in light mode so washes survive against
  // white — but a hairline doesn't need surviving, it needs to not shout. With
  // the bloom halved in light, the border is the card's whole identity signal,
  // so it takes roughly half the alpha too (0.12 × 1.35 ≈ 0.16 effective).
  const borderAlpha = isDark ? 0.22 : 0.12;

  return (
    <View
      style={[
        {
          borderRadius: cornerRadius,
          borderCurve: 'continuous',
          backgroundColor: colors.cell,
          borderWidth: 1,
          borderColor: tint ? tintOf(borderAlpha, tint) : ov(0.06),
          padding: padding === false ? undefined : padding,
          overflow: 'hidden'
        },
        elevated && shadow.card,
        style
      ]}
    >
      {tint && bloom ? <CardBloom tint={tint} strength={strength} /> : null}
      {children}
    </View>
  );
}

/**
 * Tappable `Card`. Presses dim the surface rather than scaling it, so a long
 * list of cards doesn't jitter under a scrolling thumb.
 */
export function CardPressable({
  onPress,
  onLongPress,
  accessibilityLabel,
  accessibilityHint,
  ...cardProps
}: Props & {
  onPress?: () => void;
  onLongPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}) {
  return (
    <Pressable
      onPress={
        onPress &&
        (() => {
          haptic.selection();
          onPress();
        })
      }
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => ({ opacity: pressed ? 0.72 : 1 })}
    >
      <Card {...cardProps} />
    </Pressable>
  );
}
