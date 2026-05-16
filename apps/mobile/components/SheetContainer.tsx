import { type ReactNode } from 'react';
import { ScrollView, useWindowDimensions, View, type ViewStyle } from 'react-native';

/**
 * Workaround wrapper for `presentation: 'formSheet'` routes whose ScrollView
 * collapses or fails to scroll inside the iOS form-sheet host container.
 *
 * - Pins the ScrollView's height to `useWindowDimensions().height` so it
 *   doesn't depend on the (sometimes ambiguous) flex chain inside the sheet.
 * - Pads the bottom of `contentContainerStyle` by 30% of the window height
 *   so there's always enough scrollable surface, preventing the "snap back"
 *   bounce iOS does when content is shorter than the sheet.
 * - `flexGrow: 1` keeps the content container expanding to fill the
 *   scrollable area for short bodies.
 *
 * Use as the body of any formSheet route; siblings (a sticky `SheetHeader`,
 * etc.) sit outside of `SheetContainer`:
 *
 *   <View style={{ flex: 1, backgroundColor: colors.sheet }}>
 *     <SheetHeader title="..." />
 *     <SheetContainer scrollView>{body}</SheetContainer>
 *   </View>
 */
export function SheetContainer({
  children,
  scrollView = false,
  contentContainerStyle,
  keyboardShouldPersistTaps
}: {
  children: ReactNode;
  scrollView?: boolean;
  contentContainerStyle?: ViewStyle;
  keyboardShouldPersistTaps?: 'never' | 'always' | 'handled';
}) {
  const { height } = useWindowDimensions();
  const bottomPad = height * 0.3;

  if (!scrollView) {
    return <View style={{ flex: 1 }}>{children}</View>;
  }

  return (
    <View style={{ flex: 1, overflow: 'hidden' }}>
      <ScrollView
        style={{ height }}
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 20,
          paddingBottom: bottomPad,
          ...contentContainerStyle
        }}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        showsVerticalScrollIndicator
      >
        {children}
      </ScrollView>
    </View>
  );
}
