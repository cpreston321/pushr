import { Children, ReactNode, isValidElement } from "react";
import { Text, View } from "react-native";
import { useTheme, spacing, radius, type } from "@/lib/theme";

type Props = {
  header?: string;
  footer?: string;
  children: ReactNode;
};

/**
 * iOS-grouped list section: rounded card containing rows with hairline
 * separators (automatically inserted between children). Header/footer
 * strings render as uppercase caption above / footnote below the card.
 */
export function ListSection({ header, footer, children }: Props) {
  const { colors } = useTheme();
  const rows = Children.toArray(children).filter(isValidElement);

  return (
    <View>
      {header && (
        <Text
          style={{
            ...type.footnote,
            color: colors.secondaryLabel,
            textTransform: "uppercase",
            letterSpacing: 0.5,
            paddingHorizontal: spacing.xl,
            paddingBottom: spacing.xs,
          }}
        >
          {header}
        </Text>
      )}
      <View
        style={{
          marginHorizontal: spacing.lg,
          backgroundColor: colors.cell,
          borderRadius: radius.lg,
          overflow: "hidden",
        }}
      >
        {rows.map((child, idx) => (
          <View key={idx}>
            {child}
            {idx < rows.length - 1 && (
              <View
                style={{
                  height: 0.5,
                  backgroundColor: colors.separator,
                  marginLeft: 60,
                }}
              />
            )}
          </View>
        ))}
      </View>
      {footer && (
        <Text
          style={{
            ...type.footnote,
            color: colors.secondaryLabel,
            paddingHorizontal: spacing.xl,
            paddingTop: spacing.xs,
          }}
        >
          {footer}
        </Text>
      )}
    </View>
  );
}
