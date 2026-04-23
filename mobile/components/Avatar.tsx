import { View, Text } from "react-native";
import { Image } from "expo-image";
import { useTheme } from "@/lib/theme";

type Props = {
  url: string | null | undefined;
  name: string;
  size?: number;
};

/**
 * Source-app avatar: circular image with initial-letter fallback in the accent color.
 */
export function Avatar({ url, name, size = 44 }: Props) {
  const { colors } = useTheme();
  const r = size / 2;
  if (url) {
    return (
      <Image
        source={{ uri: url }}
        style={{
          width: size,
          height: size,
          borderRadius: r,
          backgroundColor: colors.fill,
        }}
        contentFit="cover"
      />
    );
  }
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: r,
        backgroundColor: colors.accent,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ fontSize: size * 0.42, fontWeight: "600", color: colors.accentContrast }}>
        {initial}
      </Text>
    </View>
  );
}
