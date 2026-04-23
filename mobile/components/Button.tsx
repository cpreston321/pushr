import { ActivityIndicator, Pressable, Text, ViewStyle } from "react-native";
import { useTheme, radius, type } from "@/lib/theme";
import { haptic } from "@/lib/haptics";

type Variant = "primary" | "secondary" | "destructive" | "plain";

type Props = {
  title: string;
  onPress?: () => void | Promise<void>;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
};

export function Button({
  title,
  onPress,
  variant = "primary",
  loading,
  disabled,
  style,
}: Props) {
  const { colors } = useTheme();
  const isDisabled = disabled || loading;

  const bg: Record<Variant, string> = {
    primary: colors.accent,
    secondary: colors.fill,
    destructive: colors.destructive,
    plain: "transparent",
  };
  const fg: Record<Variant, string> = {
    primary: colors.accentContrast,
    secondary: colors.label,
    destructive: "#FFFFFF",
    plain: colors.accent,
  };

  return (
    <Pressable
      onPress={() => {
        if (isDisabled) return;
        haptic.light();
        onPress?.();
      }}
      disabled={isDisabled}
      style={({ pressed }) => [
        {
          backgroundColor: bg[variant],
          paddingVertical: 14,
          paddingHorizontal: 20,
          borderRadius: radius.md,
          alignItems: "center",
          justifyContent: "center",
          minHeight: 50,
          opacity: pressed || isDisabled ? 0.6 : 1,
          borderCurve: "continuous",
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg[variant]} />
      ) : (
        <Text style={{ ...type.headline, color: fg[variant] }}>{title}</Text>
      )}
    </Pressable>
  );
}
