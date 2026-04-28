import { ReactNode } from "react";
import { Pressable, Text, View, ViewStyle } from "react-native";
import { SymbolView, SFSymbol } from "expo-symbols";
import { useTheme, spacing, type } from "@/lib/theme";
import { haptic } from "@/lib/haptics";

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
  iconTint?: string;
  iconBg?: string;
  destructive?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  chevron?: boolean;
  minHeight?: number;
  style?: ViewStyle;
};

/**
 * Standard iOS list row: leading icon or avatar, title + optional subtitle,
 * trailing content (switch, value, chevron). 44pt minimum hit target.
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
  minHeight = 44,
  style,
}: Props) {
  const { colors } = useTheme();
  const titleColor = destructive ? colors.destructive : colors.label;

  const leadingNode = leading ?? (icon ? (
    <View
      style={{
        width: 28,
        height: 28,
        borderRadius: 6,
        backgroundColor: iconBg ?? colors.accent,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <SymbolView name={icon} size={18} tintColor={iconTint ?? "#FFFFFF"} />
    </View>
  ) : null);

  const content = (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          minHeight,
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
          gap: spacing.md,
        },
        style,
      ]}
    >
      {leadingNode}
      <View style={{ flex: 1, justifyContent: "center" }}>
        <Text style={{ ...type.body, color: titleColor }} numberOfLines={1}>
          {title}
        </Text>
        {!!subtitle && (
          <Text
            style={{ ...type.subhead, color: colors.secondaryLabel, marginTop: 1 }}
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
      {chevron && (
        <SymbolView name="chevron.right" size={14} tintColor={colors.tertiaryLabel} />
      )}
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
        backgroundColor: pressed ? colors.cellHighlight : "transparent",
      })}
    >
      {content}
    </Pressable>
  );
}
