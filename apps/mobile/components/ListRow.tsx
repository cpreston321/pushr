import { ReactNode } from 'react';
import { Pressable, Text, View, ViewStyle } from 'react-native';
import { SymbolView, SFSymbol } from 'expo-symbols';
import { useTheme, spacing, type } from '@/lib/theme';
import { haptic } from '@/lib/haptics';
import { IconTile } from './IconTile';

type Props = {
  title: string;
  subtitle?: string;
  caption?: string;
  /** Allow long-press to copy the caption (for things like push tokens). */
  captionSelectable?: boolean;
  /** Allow long-press to copy the subtitle. */
  subtitleSelectable?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
  icon?: SFSymbol;
  /** Tints the icon tile's glyph and wash. Defaults to the accent. */
  iconTint?: string;
  /** Legacy override for a fully custom tile fill. */
  iconBg?: string;
  destructive?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  chevron?: boolean;
  minHeight?: number;
  style?: ViewStyle;
};

/**
 * Grouped-list row: a tinted icon tile, a title with optional subtitle, and
 * trailing content (switch, value, chevron). The tile is what gives the rows
 * their rhythm — every row on a screen shares its column.
 */
export function ListRow({
  title,
  subtitle,
  caption,
  captionSelectable,
  subtitleSelectable,
  leading,
  trailing,
  icon,
  iconTint,
  iconBg,
  destructive,
  onPress,
  onLongPress,
  chevron,
  minHeight = 52,
  style
}: Props) {
  const { colors, ov } = useTheme();
  const titleColor = destructive ? colors.destructive : colors.label;

  const leadingNode =
    leading ??
    (icon ? (
      iconBg ? (
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 11,
            borderCurve: 'continuous',
            backgroundColor: iconBg,
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <SymbolView name={icon} size={18} tintColor={iconTint ?? '#FFFFFF'} />
        </View>
      ) : (
        <IconTile icon={icon} size={38} color={destructive ? colors.destructive : iconTint} />
      )
    ) : null);

  const content = (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          minHeight,
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md + 1,
          gap: 13
        },
        style
      ]}
    >
      {leadingNode}
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Text style={{ ...type.callout, fontWeight: '600', color: titleColor }} numberOfLines={1}>
          {title}
        </Text>
        {!!subtitle && (
          <Text
            style={{ ...type.footnote, color: colors.secondaryLabel, marginTop: 2 }}
            numberOfLines={2}
            selectable={subtitleSelectable}
          >
            {subtitle}
          </Text>
        )}
        {!!caption && (
          <Text
            style={{ ...type.caption1, color: colors.tertiaryLabel, marginTop: 2 }}
            numberOfLines={1}
            selectable={captionSelectable}
          >
            {caption}
          </Text>
        )}
      </View>
      {trailing}
      {chevron && <SymbolView name="chevron.right" size={13} tintColor={colors.tertiaryLabel} />}
    </View>
  );

  if (!onPress && !onLongPress) return content;

  return (
    <Pressable
      onPress={() => {
        haptic.selection();
        onPress?.();
      }}
      onLongPress={onLongPress}
      android_ripple={{ color: colors.cellHighlight }}
      style={({ pressed }) => ({
        backgroundColor: pressed ? ov(0.05) : 'transparent'
      })}
    >
      {content}
    </Pressable>
  );
}
