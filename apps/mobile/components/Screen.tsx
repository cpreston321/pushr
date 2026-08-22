import { ReactNode } from 'react';
import { View, ScrollView, ViewStyle } from 'react-native';
import { SafeAreaView, Edge } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/theme';
import { ScreenGlow } from './Glow';

type Props = {
  children?: ReactNode;
  scroll?: boolean;
  grouped?: boolean;
  /**
   * Paint the accent bloom behind the content. On by default — set `false` for
   * screens that sit under a sheet or already carry their own light source.
   */
  glow?: boolean;
  /** Fraction of the window the bloom covers. */
  glowExtent?: number;
  edges?: Edge[];
  style?: ViewStyle;
  contentStyle?: ViewStyle;
};

/**
 * Full-screen container on the design's canvas, with the accent bloom behind
 * the content so standalone screens (auth, onboarding) share the same light
 * source as the tabs.
 */
export function Screen({
  children,
  scroll,
  grouped,
  glow = true,
  glowExtent,
  edges,
  style,
  contentStyle
}: Props) {
  const { colors } = useTheme();
  // The deeper canvas gives the bloom more room to read; grouped list screens
  // stay on the flat background their cards are tuned against.
  const bg = grouped ? colors.grouped : glow ? colors.canvas : colors.background;

  const content = scroll ? (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[{ paddingBottom: 120 }, contentStyle]}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1 }, contentStyle]}>{children}</View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      {glow ? <ScreenGlow extent={glowExtent} /> : null}
      <SafeAreaView edges={edges ?? ['top']} style={[{ flex: 1 }, style]}>
        {content}
      </SafeAreaView>
    </View>
  );
}
