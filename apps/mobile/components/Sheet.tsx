import { ReactNode } from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme, spacing, type } from '@/lib/theme';
import { ScreenTransition } from './ScreenTransition';

/**
 * The painted surface of a drawer — the root of any sheet-presented route or
 * bottom sheet. One place to change if sheets ever need to lift off the app's
 * ground instead of sharing it (see `sheet` in `lib/theme.ts`).
 */
export function DrawerSurface({
  children,
  style
}: {
  children: ReactNode;
  style?: ViewStyle;
}) {
  const { colors } = useTheme();
  return <View style={[{ flex: 1, backgroundColor: colors.sheet }, style]}>{children}</View>;
}

/**
 * Same surface for a *pushed* drawer route — the settings detail screens behind
 * `DrawerHeader`, which are full-screen rather than sheet-presented and so want
 * `ScreenTransition`'s focus animation rather than a plain view.
 */
export function DrawerScreen({
  children,
  style
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <ScreenTransition style={[{ flex: 1, backgroundColor: colors.sheet }, style]}>
      {children}
    </ScreenTransition>
  );
}

/**
 * Container for sheet-presented routes (formSheet / pageSheet). Provides:
 *   - Slightly elevated background offset from `colors.grouped` so the sheet
 *     reads as a surface above the screen behind it.
 *   - Drag-handle pill at the top (matches iOS native grabber style).
 *   - Optional centered title under the handle.
 *
 * Intended for formSheet presentations — iOS handles safe-area insets for
 * those automatically, so we don't apply top insets here (that would
 * double-pad). For fullScreenModal screens, use a manual layout.
 */
export function Sheet({
  title,
  showHandle = true,
  children,
  style
}: {
  title?: string;
  showHandle?: boolean;
  children: ReactNode;
  style?: ViewStyle;
}) {
  return (
    <DrawerSurface style={style}>
      {showHandle && <Grabber tightBottom={!!title} />}
      {title && <SheetTitle title={title} />}
      {children}
    </DrawerSurface>
  );
}

// Both split out so they read their colors from *inside* the drawer provider —
// `Sheet`'s own `useTheme()` sits above it and would hand back the screen ramp.

function Grabber({ tightBottom }: { tightBottom: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        alignItems: 'center',
        paddingTop: spacing.md,
        paddingBottom: tightBottom ? spacing.md : spacing.md + spacing.md
      }}
    >
      <View
        style={{
          width: 56,
          height: 5,
          borderRadius: 2.5,
          backgroundColor: colors.tertiaryLabel
        }}
      />
    </View>
  );
}

function SheetTitle({ title }: { title: string }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: spacing.md
      }}
    >
      <Text style={{ ...type.headline, color: colors.label }}>{title}</Text>
    </View>
  );
}
