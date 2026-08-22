import { useMemo, type ReactNode } from "react";
import { Dimensions } from "react-native";
import { ModalBottomSheet } from "@swmansion/react-native-bottom-sheet";
import { radius } from "@/lib/theme";
import { DrawerSurface } from "@/components/Sheet";

export function AppBottomSheet({
  index,
  onIndexChange,
  children,
}: {
  index: number;
  onIndexChange: (i: number) => void;
  children: ReactNode;
}) {
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
      <DrawerSurface
        style={{
          borderTopLeftRadius: radius.xl,
          borderTopRightRadius: radius.xl,
          overflow: "hidden",
        }}
      >
        {children}
      </DrawerSurface>
    </ModalBottomSheet>
  );
}
