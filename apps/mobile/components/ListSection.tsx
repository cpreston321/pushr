import { Children, ReactNode, isValidElement } from 'react';
import { Text, View, type ViewStyle } from 'react-native';
import { useTheme, spacing, type } from '@/lib/theme';
import { Card } from './Card';
import { SectionLabel } from './Chip';

type Props = {
  header?: string;
  footer?: string;
  /** Tint the card's corner bloom and border — use for a status-bearing group. */
  tint?: string | null;
  /**
   * Outer wrapper style. A headerless section has no `SectionLabel` to supply
   * the vertical rhythm, so pass a `marginTop` when one follows another group.
   */
  style?: ViewStyle;
  children: ReactNode;
};

/**
 * Grouped list section: a `Card` holding rows separated by hairlines, with an
 * uppercase header above and an optional footnote below. Separators are inset
 * past the row's icon tile so they line up under the text column.
 */
export function ListSection({ header, footer, tint, style, children }: Props) {
  const { colors, ov } = useTheme();
  const rows = Children.toArray(children).filter(isValidElement);

  return (
    <View style={style}>
      {header && <SectionLabel>{header}</SectionLabel>}
      <Card tint={tint} padding={false} style={{ marginHorizontal: spacing.lg }}>
        {rows.map((child, idx) => (
          <View key={idx}>
            {child}
            {idx < rows.length - 1 && (
              <View
                style={{
                  height: 1,
                  backgroundColor: ov(0.06),
                  // Clears the 16pt inset + 38pt icon tile + 13pt gap so the
                  // hairline starts under the text column.
                  marginLeft: 67
                }}
              />
            )}
          </View>
        ))}
      </Card>
      {footer && (
        <Text
          style={{
            ...type.footnote,
            lineHeight: 18,
            color: colors.tertiaryLabel,
            paddingHorizontal: spacing.xl,
            paddingTop: spacing.sm
          }}
        >
          {footer}
        </Text>
      )}
    </View>
  );
}
