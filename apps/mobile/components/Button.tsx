import { ActivityIndicator, Pressable, Text, View, ViewStyle } from 'react-native';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { useTheme, radius, spacing } from '@/lib/theme';
import { haptic } from '@/lib/haptics';
import { readableOn } from '@/lib/color';

type Variant =
  /** Filled accent with an accent glow. One per screen. */
  | 'primary'
  /** Neutral overlay with a hairline border. */
  | 'secondary'
  /** Accent wash + accent border + accent label. */
  | 'tinted'
  | 'destructive'
  | 'plain';

type Props = {
  title: string;
  onPress?: () => void | Promise<void>;
  variant?: Variant;
  icon?: SFSymbol;
  loading?: boolean;
  disabled?: boolean;
  /** Set `false` to shrink-wrap the label instead of filling the row. */
  block?: boolean;
  style?: ViewStyle;
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  block,
  style
}: Props) {
  const { colors, ov, tint, shadow } = useTheme();
  const isDisabled = disabled || loading;

  const bg: Record<Variant, string> = {
    primary: colors.accent,
    secondary: ov(0.07),
    tinted: tint(0.13),
    destructive: tint(0.12, colors.destructive),
    plain: 'transparent'
  };
  const border: Record<Variant, string> = {
    primary: colors.accent,
    secondary: ov(0.09),
    tinted: tint(0.32),
    destructive: tint(0.24, colors.destructive),
    plain: 'transparent'
  };
  const fg: Record<Variant, string> = {
    primary: readableOn(colors.accent),
    secondary: colors.label,
    tinted: colors.accent,
    destructive: colors.destructive,
    plain: colors.accent
  };

  // A disabled button drops its variant's color entirely rather than wearing a
  // dimmed version of it: a filled accent at 60% opacity still reads as the
  // loudest thing on the surface, which is exactly wrong for something you
  // can't press. Loading is not that — work is in flight, so it keeps its
  // color and only dims.
  const inert = !!disabled && !loading;
  const surface = inert
    ? { bg: ov(0.07), border: ov(0.09), fg: colors.tertiaryLabel }
    : { bg: bg[variant], border: border[variant], fg: fg[variant] };

  return (
    <Pressable
      onPress={() => {
        if (isDisabled) return;
        haptic.light();
        onPress?.();
      }}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        {
          backgroundColor: surface.bg,
          borderWidth: 1,
          borderColor: surface.border,
          paddingVertical: 14,
          paddingHorizontal: 20,
          borderRadius: radius.button,
          borderCurve: 'continuous',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 50,
          alignSelf: block === false ? 'flex-start' : undefined,
          opacity: pressed || loading ? 0.6 : 1
        },
        // The glow is what makes the primary action read as the lit object on
        // the screen rather than just a colored rectangle.
        variant === 'primary' && !inert ? shadow.glow() : null,
        style
      ]}
    >
      {loading ? (
        <ActivityIndicator color={surface.fg} />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          {icon ? (
            <SymbolView name={icon} size={17} tintColor={surface.fg} weight="semibold" />
          ) : null}
          <Text
            style={{
              fontSize: 17,
              lineHeight: 22,
              fontWeight: '700',
              letterSpacing: -0.2,
              color: surface.fg
            }}
            numberOfLines={1}
          >
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
