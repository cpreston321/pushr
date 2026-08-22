import { View, type ViewStyle } from 'react-native';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/lib/theme';
import { mix, readableOn } from '@/lib/color';

type Props = {
  icon: SFSymbol;
  /** Tile size in points. The corner radius scales with it. */
  size?: number;
  /** Tint for the tile. Defaults to the accent. */
  color?: string;
  /**
   * `wash` — translucent tint behind a colored glyph (list rows, settings).
   * `solid` — saturated gradient fill behind a white glyph (feature tiles).
   */
  variant?: 'wash' | 'solid';
  style?: ViewStyle;
};

/**
 * Rounded-square glyph container that fronts every list row and feature block.
 * Two weights: a quiet translucent `wash` for repeating rows, and a saturated
 * `solid` for the one tile on a screen that should feel like an object.
 */
export function IconTile({ icon, size = 38, color, variant = 'wash', style }: Props) {
  const { colors, tint } = useTheme();
  const base = color ?? colors.accent;
  const corner = Math.round(size * 0.29);
  const glyph = Math.round(size * 0.48);

  if (variant === 'solid') {
    return (
      <View
        style={[
          {
            width: size,
            height: size,
            borderRadius: corner,
            borderCurve: 'continuous',
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center'
          },
          style
        ]}
      >
        <LinearGradient
          // Lighter at the top-left, saturated at the bottom-right — the same
          // light direction as the screen bloom above it.
          colors={[mix(base, 0.84, '#FFFFFF'), base]}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.85, y: 1 }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <SymbolView name={icon} size={glyph} tintColor={readableOn(base)} weight="semibold" />
      </View>
    );
  }

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: corner,
          borderCurve: 'continuous',
          backgroundColor: tint(0.16, base),
          alignItems: 'center',
          justifyContent: 'center'
        },
        style
      ]}
    >
      <SymbolView name={icon} size={glyph} tintColor={base} />
    </View>
  );
}
