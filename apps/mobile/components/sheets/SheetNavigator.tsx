import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useWindowDimensions, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from "react-native-reanimated";

export type Frame = { id: string; node: ReactNode };

type NavApi = {
  push: (frame: Frame) => void;
  pop: () => void;
  reset: (frame: Frame) => void;
  dismissSheet: () => void;
  canGoBack: boolean;
  depth: number;
};

const NavCtx = createContext<NavApi | null>(null);

export function useSheetNav(): NavApi {
  const v = useContext(NavCtx);
  if (!v) throw new Error("useSheetNav must be used inside <SheetNavigator>");
  return v;
}

/**
 * iOS-style horizontal stack navigator for content inside a bottom sheet.
 * Renders all frames in a row of full sheet-width columns and animates
 * translateX between them with Reanimated.
 */
export function SheetNavigator({
  initial,
  resetKey,
  onDismissSheet,
}: {
  initial: Frame;
  /** Changing this key resets the stack to the initial frame (e.g. when sheet reopens with a new entity). */
  resetKey?: string;
  onDismissSheet: () => void;
}) {
  const width = useWindowDimensions().width;
  const [stack, setStack] = useState<Frame[]>([initial]);
  const tx = useSharedValue(0);

  useEffect(() => {
    setStack([initial]);
    tx.value = withTiming(0, { duration: 250, easing: Easing.out(Easing.cubic) });
    // initial is intentionally re-read on resetKey change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  useEffect(() => {
    tx.value = withTiming(-(stack.length - 1) * width, {
      duration: 280,
      easing: Easing.out(Easing.cubic),
    });
  }, [stack.length, width, tx]);

  const push = useCallback((frame: Frame) => {
    setStack((s) => [...s, frame]);
  }, []);

  const pop = useCallback(() => {
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  }, []);

  const reset = useCallback((frame: Frame) => {
    setStack([frame]);
  }, []);

  const api = useMemo<NavApi>(
    () => ({
      push,
      pop,
      reset,
      dismissSheet: onDismissSheet,
      canGoBack: stack.length > 1,
      depth: stack.length,
    }),
    [push, pop, reset, onDismissSheet, stack.length],
  );

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }],
  }));

  return (
    <NavCtx.Provider value={api}>
      <View style={{ flex: 1, overflow: "hidden" }}>
        <Animated.View
          style={[
            {
              flex: 1,
              flexDirection: "row",
              width: width * stack.length,
            },
            rowStyle,
          ]}
        >
          {stack.map((f) => (
            <View key={f.id} style={{ width, flex: 1 }}>
              {f.node}
            </View>
          ))}
        </Animated.View>
      </View>
    </NavCtx.Provider>
  );
}
