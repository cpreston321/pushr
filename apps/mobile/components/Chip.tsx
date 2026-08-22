import { type ReactNode } from 'react';
import { Pressable, Text, View, type ViewStyle } from 'react-native';
import { useTheme, radius, spacing, type } from '@/lib/theme';
import { haptic } from '@/lib/haptics';
import { readableOn } from '@/lib/color';

export type ChipVariant =
  /** Filled accent — the selected filter, the primary count. */
  | 'solid'
  /** Accent wash + accent border + accent text — a live status. */
  | 'tint'
  /** Neutral overlay — unselected filters, metadata. */
  | 'ghost';

type Props = {
  label: string;
  variant?: ChipVariant;
  /** Overrides the accent for `solid` / `tint`. */
  color?: string;
  /** Leading status dot; `'glow'` adds the accent bloom behind it. */
  dot?: boolean | 'glow';
  leading?: ReactNode;
  /** Trailing count bubble. */
  count?: number;
  size?: 'sm' | 'md';
  onPress?: () => void;
  style?: ViewStyle;
};

/**
 * Pill used for feed filters, unread counts and inline status. `tint` is the
 * "something is live" treatment — a glowing dot on an accent wash — and reads
 * as active without needing motion.
 */
export function Chip({
  label,
  variant = 'ghost',
  color,
  dot,
  leading,
  count,
  size = 'md',
  onPress,
  style
}: Props) {
  const { colors, ov, tint: tintOf } = useTheme();
  const base = color ?? colors.accent;
  const small = size === 'sm';

  const bg = variant === 'solid' ? base : variant === 'tint' ? tintOf(0.15, base) : ov(0.06);
  const border = variant === 'solid' ? base : variant === 'tint' ? tintOf(0.3, base) : ov(0.06);
  const fg =
    variant === 'solid' ? readableOn(base) : variant === 'tint' ? base : colors.secondaryLabel;

  const body = (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.xs + 2,
          alignSelf: 'flex-start',
          paddingVertical: small ? 4 : 7,
          paddingLeft: dot ? (small ? 8 : 10) : small ? 10 : 16,
          paddingRight: small ? 10 : 16,
          borderRadius: radius.pill,
          borderCurve: 'continuous',
          backgroundColor: bg,
          borderWidth: 1,
          borderColor: border
        },
        style
      ]}
    >
      {dot ? (
        <View
          style={{
            width: 7,
            height: 7,
            borderRadius: radius.pill,
            backgroundColor: variant === 'solid' ? fg : base,
            ...(dot === 'glow'
              ? {
                  shadowColor: base,
                  shadowOpacity: 0.8,
                  shadowRadius: 5,
                  shadowOffset: { width: 0, height: 0 }
                }
              : null)
          }}
        />
      ) : null}
      {leading}
      <Text
        style={{
          fontSize: small ? 11 : 13,
          lineHeight: small ? 14 : 17,
          fontWeight: '600',
          color: fg
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
      {count !== undefined ? (
        <View
          style={{
            minWidth: 17,
            height: 17,
            paddingHorizontal: 5,
            borderRadius: radius.pill,
            backgroundColor: variant === 'solid' ? ov(0.22) : base,
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <Text style={{ fontSize: 11, fontWeight: '700', color: readableOn(base) }}>{count}</Text>
        </View>
      ) : null}
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable
      onPress={() => {
        haptic.selection();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
    >
      {body}
    </Pressable>
  );
}

/**
 * Uppercase grouped-list section header. Sits above a `Card` / `ListSection`
 * with the design's wide tracking and de-emphasized weight.
 */
export function SectionLabel({
  children,
  style,
  trailing
}: {
  children: string;
  style?: ViewStyle;
  trailing?: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          paddingHorizontal: spacing.xl,
          marginTop: spacing.xl + 2,
          marginBottom: spacing.sm + 2
        },
        style
      ]}
    >
      <Text
        style={{
          ...type.sectionLabel,
          textTransform: 'uppercase',
          color: colors.tertiaryLabel
        }}
      >
        {children}
      </Text>
      {trailing}
    </View>
  );
}

/**
 * Section label with a hairline rule running to the trailing edge — used to
 * split the feed into "New" and "Earlier" without adding a heavy header.
 */
export function SectionDivider({ children }: { children: string }) {
  const { colors, ov } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingHorizontal: spacing.xl,
        marginTop: spacing.xl,
        marginBottom: spacing.sm + 2
      }}
    >
      <Text
        style={{
          ...type.sectionLabel,
          textTransform: 'uppercase',
          color: colors.tertiaryLabel
        }}
      >
        {children}
      </Text>
      <View style={{ flex: 1, height: 1, backgroundColor: ov(0.07) }} />
    </View>
  );
}
