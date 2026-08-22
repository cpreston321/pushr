import { type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

/**
 * A tab screen's root container.
 *
 * This used to fade + ease the content up on every focus, since NativeTabs
 * doesn't animate tab switches itself. That animation is gone deliberately:
 * replaying it on each tab change made switching feel slower than the instant
 * native swap it's wrapping, and re-running on every focus meant returning to a
 * tab you'd already seen animated as if it were new.
 *
 * Kept as the screen root so the tab screens still have one place to hang
 * layout (and to bring an entrance animation back, if a better one shows up).
 */
export function ScreenTransition({
  children,
  style
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[{ flex: 1 }, style]}>{children}</View>;
}
