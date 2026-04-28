import { forwardRef } from "react";
import { TextInput, TextInputProps, View, Text } from "react-native";
import { useTheme, spacing, radius, type } from "@/lib/theme";

type Props = TextInputProps & {
  label?: string;
};

export const Input = forwardRef<TextInput, Props>(function Input(
  { label, style, ...rest },
  ref,
) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      {!!label && (
        <Text style={{ ...type.footnote, color: colors.secondaryLabel, paddingLeft: 4 }}>
          {label}
        </Text>
      )}
      <TextInput
        ref={ref}
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
});
