import { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, spacing, radius, type } from '@/lib/theme';
import { haptic } from '@/lib/haptics';
import { ScreenGlow } from './Glow';

type Props = {
  title: string;
  /** Quiet line of context above the title — a count, an email, a status. */
  eyebrow?: string;
  accessory?: ReactNode;
  children?: ReactNode;
};

/**
 * Top-level screen title block. Sits directly on the glowing canvas — no
 * separate dark hero, no rounded sheet seam — so the accent bloom behind it
 * carries continuously from the status bar down through the content.
 *
 * Pair with `<ScreenShell>`, which paints the bloom.
 */
export function ScreenHeader({ title, eyebrow, accessory, children }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        paddingTop: insets.top + spacing.md,
        paddingHorizontal: spacing.xl,
        paddingBottom: spacing.lg
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: spacing.md
        }}
      >
        <View style={{ flex: 1, gap: spacing.xs + 2 }}>
          {!!eyebrow && (
            <Text style={{ ...type.subhead, fontWeight: '500', color: colors.secondaryLabel }}>
              {eyebrow}
            </Text>
          )}
          <Text style={{ ...type.largeTitle, color: colors.strongLabel }}>{title}</Text>
        </View>
        {accessory ? <View style={{ marginTop: spacing.sm }}>{accessory}</View> : null}
      </View>

      {children ? <View style={{ marginTop: spacing.md }}>{children}</View> : null}
    </View>
  );
}

/**
 * Screen root: flat canvas with the accent bloom painted behind everything.
 * Replaces the old header/body split — content scrolls over one continuous
 * surface, which is what makes the app feel like a single lit space.
 */
export function ScreenShell({
  children,
  /** Shrink or grow the bloom. Detail screens want less. */
  glowExtent
}: {
  children: ReactNode;
  glowExtent?: number;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenGlow extent={glowExtent} />
      {children}
    </View>
  );
}

/**
 * Kept for call-site compatibility with the previous header/body split. It no
 * longer draws its own background or rounded lift — the canvas is continuous
 * now — so it's just the flexing content region below the title.
 */
export function ScreenBody({ children }: { children: ReactNode }) {
  return <View style={{ flex: 1 }}>{children}</View>;
}

/**
 * Square glyph button for a header's trailing slot (overflow menu, add). Two
 * weights: `ghost` for secondary affordances, `accent` for the one that
 * creates something.
 */
export function HeaderButton({
  icon,
  onPress,
  variant = 'ghost',
  accessibilityLabel
}: {
  icon: SFSymbol;
  onPress: () => void;
  variant?: 'ghost' | 'accent';
  accessibilityLabel: string;
}) {
  const { colors, ov, tint } = useTheme();
  const accent = variant === 'accent';

  return (
    <Pressable
      onPress={() => {
        haptic.selection();
        onPress();
      }}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: accent ? radius.pill : radius.md,
        borderCurve: 'continuous',
        backgroundColor: accent ? tint(0.16) : ov(0.06),
        borderWidth: 1,
        borderColor: accent ? tint(0.3) : ov(0.06),
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.6 : 1
      })}
    >
      <SymbolView
        name={icon}
        size={20}
        weight="semibold"
        tintColor={accent ? colors.accent : colors.secondaryLabel}
      />
    </Pressable>
  );
}
