import { forwardRef, useState } from 'react';
import { TextInput, TextInputProps, View, Text } from 'react-native';
import { useTheme, spacing, radius, type } from '@/lib/theme';

type Props = TextInputProps & {
  label?: string;
};

/**
 * Text field on the design's overlay-fill surface. Focus swaps the hairline
 * border for the accent so the active field is unmistakable on a dark canvas
 * where a caret alone is easy to lose.
 */
export const Input = forwardRef<TextInput, Props>(function Input(
  { label, style, onFocus, onBlur, ...rest },
  ref
) {
  const { colors, ov, tint } = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View style={{ gap: 7 }}>
      {!!label && (
        <Text
          style={{
            ...type.footnote,
            fontWeight: '500',
            color: colors.secondaryLabel,
            paddingLeft: spacing.xs
          }}
        >
          {label}
        </Text>
      )}
      <TextInput
        ref={ref}
        placeholderTextColor={colors.placeholder}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          {
            backgroundColor: ov(0.06),
            color: colors.label,
            paddingHorizontal: spacing.lg,
            paddingVertical: 15,
            borderRadius: radius.button,
            borderCurve: 'continuous',
            borderWidth: 1,
            borderColor: focused ? tint(0.55) : ov(0.08),
            fontSize: type.callout.fontSize
          },
          style
        ]}
        {...rest}
      />
    </View>
  );
});
