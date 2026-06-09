import { useMemo, type ReactNode } from "react";
import { Dimensions, View } from "react-native";
import { ModalBottomSheet } from "@swmansion/react-native-bottom-sheet";
import { useTheme, radius } from "@/lib/theme";

export function AppBottomSheet({
  index,
  onIndexChange,
  children,
}: {
  index: number;
  onIndexChange: (i: number) => void;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  const openHeight = useMemo(
    () => Math.round(Dimensions.get("window").height * 0.85),
    [],
  );
  const detents = useMemo(() => [0, openHeight], [openHeight]);

  return (
    <ModalBottomSheet
      detents={detents}
      index={index}
      onIndexChange={onIndexChange}
      scrimColor="rgba(0,0,0,0.4)"
    >
      <View
        style={{
          flex: 1,
          backgroundColor: colors.sheet,
          borderTopLeftRadius: radius.xl,
          borderTopRightRadius: radius.xl,
          overflow: "hidden",
        }}
      >
        {children}
      </View>
    </ModalBottomSheet>
  );
}
