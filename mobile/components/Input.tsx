import { TextInput, TextInputProps, View, Text } from "react-native";
import { useTheme, spacing, radius, type } from "@/lib/theme";

type Props = TextInputProps & {
  label?: string;
};

export function Input({ label, style, ...rest }: Props) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      {!!label && (
        <Text style={{ ...type.footnote, color: colors.secondaryLabel, paddingLeft: 4 }}>
          {label}
        </Text>
      )}
      <TextInput
        placeholderTextColor={colors.placeholder}
        style={[
          {
            backgroundColor: colors.fill,
            color: colors.label,
            paddingHorizontal: spacing.lg,
            paddingVertical: 14,
            borderRadius: radius.md,
            fontSize: type.body.fontSize,
            borderCurve: "continuous",
          },
          style,
        ]}
        {...rest}
      />
    </View>
  );
}
