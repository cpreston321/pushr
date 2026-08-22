import { Text, View } from 'react-native';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { useTheme, spacing, type } from '@/lib/theme';
import { Halo } from './Glow';
import { Button } from './Button';

type Props = {
  icon: SFSymbol;
  title: string;
  message: string;
  /** Optional primary action — the one thing that resolves the empty state. */
  actionLabel?: string;
  actionIcon?: SFSymbol;
  onAction?: () => void;
  tint?: string;
};

/**
 * Centered zero-data state: accent halo, a short verdict, one sentence of
 * explanation, and — when there's something the user can actually do about it —
 * a single action. Kept optically centered by lifting it slightly above the
 * true middle so the floating tab bar doesn't crowd it.
 */
export function EmptyState({
  icon,
  title,
  message,
  actionLabel,
  actionIcon,
  onAction,
  tint
}: Props) {
  const { colors } = useTheme();

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: spacing.xl,
        paddingBottom: 70,
        gap: spacing.lg + 2
      }}
    >
      <Halo size={92} tint={tint}>
        <SymbolView name={icon} size={40} tintColor={tint ?? colors.accent} />
      </Halo>
      <View style={{ gap: spacing.sm, alignItems: 'center' }}>
        <Text style={{ ...type.title3, fontSize: 21, color: colors.strongLabel }}>{title}</Text>
        <Text
          style={{
            ...type.subhead,
            lineHeight: 22,
            color: colors.secondaryLabel,
            textAlign: 'center',
            maxWidth: 280
          }}
        >
          {message}
        </Text>
      </View>
      {actionLabel && onAction ? (
        <Button
          title={actionLabel}
          icon={actionIcon}
          onPress={onAction}
          style={{ marginTop: spacing.xs, alignSelf: 'center', paddingHorizontal: 26 }}
        />
      ) : null}
    </View>
  );
}
