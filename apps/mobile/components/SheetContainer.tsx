import { useState, type ReactNode } from 'react';
import {
  ScrollView,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type ViewStyle
} from 'react-native';
import { spacing } from '@/lib/theme';

/**
 * Wrapper for `presentation: 'formSheet'` routes whose ScrollView collapses or
 * fails to scroll inside the iOS form-sheet host container.
 *
 * The ScrollView needs an explicit height — inside the sheet host the flex
 * chain is sometimes ambiguous and it collapses to nothing. We take that height
 * from the wrapper's own layout, which *is* the sheet's visible area, so the
 * scroll viewport matches what the user can see and content scrolls naturally.
 *
 * The fallback, until that first layout pass lands (or if the host hands us a
 * zero height), is the old behaviour: pin to the window and pad the bottom by
 * 30% of it. That pad is load-bearing in the fallback — a viewport taller than
 * the sheet leaves the bottom of the content visible-but-unreachable unless the
 * content is forced past the viewport's end. Once measured, the pad drops to a
 * normal gutter, so a short sheet no longer scrolls into empty space.
 *
 * Use as the body of any formSheet route; siblings (a sticky `SheetHeader`,
 * etc.) sit outside of `SheetContainer`:
 *
 *   <DrawerSurface>
 *     <SheetHeader title="..." />
 *     <SheetContainer scrollView>{body}</SheetContainer>
 *   </DrawerSurface>
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
  const { height: windowHeight } = useWindowDimensions();
  const [available, setAvailable] = useState(0);

  if (!scrollView) {
    return <View style={{ flex: 1 }}>{children}</View>;
  }

  const measured = available > 0;
  const onLayout = (e: LayoutChangeEvent) => {
    const next = Math.round(e.nativeEvent.layout.height);
    if (next !== available) setAvailable(next);
  };

  return (
    <View style={{ flex: 1, overflow: 'hidden' }} onLayout={onLayout}>
      <ScrollView
        style={{ height: measured ? available : windowHeight }}
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 20,
          paddingBottom: measured ? spacing.xxl : windowHeight * 0.3,
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
