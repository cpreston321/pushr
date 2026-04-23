import { ReactNode } from "react";
import { Text, View, type ViewStyle } from "react-native";
import { useTheme, spacing, type } from "@/lib/theme";

/**
 * Container for sheet-presented routes (formSheet / pageSheet). Provides:
 *   - Slightly elevated background offset from `colors.grouped` so the sheet
 *     reads as a surface above the screen behind it.
 *   - Drag-handle pill at the top (matches iOS native grabber style).
 *   - Optional centered title under the handle.
 *
 * Intended for formSheet presentations — iOS handles safe-area insets for
 * those automatically, so we don't apply top insets here (that would
 * double-pad). For fullScreenModal screens, use a manual layout.
 */
export function Sheet({
  title,
  children,
  style,
}: {
  title?: string;
  children: ReactNode;
  style?: ViewStyle;
}) {
  const { colors, isDark } = useTheme();
  const bg = isDark ? "#141416" : "#E9E9ED";

  return (
    <View style={[{ flex: 1, backgroundColor: bg }, style]}>
      <View
        style={{
          alignItems: "center",
          paddingTop: 6,
          paddingBottom: spacing.md,
        }}
      >
        <View
          style={{
            width: 36,
            height: 5,
            borderRadius: 2.5,
            backgroundColor: colors.tertiaryLabel,
          }}
        />
      </View>
      {title && (
        <View
          style={{ height: 44, alignItems: "center", justifyContent: "center" }}
        >
          <Text style={{ ...type.headline, color: colors.label }}>{title}</Text>
        </View>
      )}
      {children}
    </View>
  );
}
