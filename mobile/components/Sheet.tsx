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
  showHandle = true,
  children,
  style,
}: {
  title?: string;
  showHandle?: boolean;
  children: ReactNode;
  style?: ViewStyle;
}) {
  const { colors } = useTheme();

  return (
    <View style={[{ flex: 1, backgroundColor: colors.sheet }, style]}>
      {showHandle && (
        <View
          style={{
            alignItems: "center",
            paddingTop: spacing.md,
            paddingBottom: title ? spacing.md : spacing.md + spacing.md,
          }}
        >
          <View
            style={{
              width: 56,
              height: 5,
              borderRadius: 2.5,
              backgroundColor: colors.tertiaryLabel,
            }}
          />
        </View>
      )}
      {title && (
        <View
          style={{
            height: 44,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: spacing.md,
          }}
        >
          <Text style={{ ...type.headline, color: colors.label }}>{title}</Text>
        </View>
      )}
      {children}
    </View>
  );
}
