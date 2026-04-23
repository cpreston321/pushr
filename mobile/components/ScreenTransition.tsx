import { useCallback, type ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useFocusEffect } from "expo-router";

/**
 * Wrap a tab screen's root so its content fades + eases up every time the tab
 * gains focus. NativeTabs doesn't animate transitions natively, so this adds a
 * subtle entrance animation on each tab switch.
 */
export function ScreenTransition({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(6);

  useFocusEffect(
    useCallback(() => {
      opacity.value = 0;
      translateY.value = 6;
      opacity.value = withTiming(1, {
        duration: 220,
        easing: Easing.out(Easing.cubic),
      });
      translateY.value = withTiming(0, {
        duration: 260,
        easing: Easing.out(Easing.cubic),
      });
    }, [opacity, translateY]),
  );

  const animated = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return <Animated.View style={[{ flex: 1 }, style, animated]}>{children}</Animated.View>;
}
