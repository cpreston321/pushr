import { useRef } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SymbolView, type SFSymbol } from "expo-symbols";
import { DrawerHeader } from "@/components/DrawerHeader";
import { ScreenTransition } from "@/components/ScreenTransition";
import { ListSection } from "@/components/ListSection";
import { ListRow } from "@/components/ListRow";
import { useTheme, spacing, radius, type } from "@/lib/theme";
import { haptic } from "@/lib/haptics";
import { currentServerLabel } from "@/lib/backend";
import type { DrawerRef } from "@/components/Drawer";
import { ServerConfigDrawer } from "@/components/drawers/ServerConfigDrawer";

export default function AdvancedScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const serverConfigRef = useRef<DrawerRef>(null);

  return (
    <ScreenTransition style={{ backgroundColor: colors.grouped }}>
      <DrawerHeader
        title="Advanced"
        leading="back"
        safeAreaTop={insets.top}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          paddingTop: spacing.md,
          paddingBottom: insets.bottom + spacing.xxl,
        }}
      >
        <ListSection footer="Self-hosting? Point pushr at your own Convex deployment. Changing the server signs you out and requires an app restart.">
          <TintedRow
            icon="server.rack"
            title="Backend"
            trailing={currentServerLabel()}
            tint={colors.accent}
            onPress={() => {
              haptic.selection();
              serverConfigRef.current?.present();
            }}
          />
        </ListSection>
      </ScrollView>
      <ServerConfigDrawer ref={serverConfigRef} />
    </ScreenTransition>
  );
}

function TintedRow({
  icon,
  title,
  trailing,
  tint,
  onPress,
}: {
  icon: SFSymbol;
  title: string;
  trailing?: string;
  tint: string;
  onPress?: () => void;
}) {
  const { colors, tintBg } = useTheme();
  return (
    <ListRow
      title={title}
      onPress={onPress}
      chevron={!!onPress && !trailing}
      trailing={
        trailing ? (
          <Text style={{ ...type.body, color: colors.secondaryLabel }}>
            {trailing}
          </Text>
        ) : undefined
      }
      leading={
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: radius.lg,
            backgroundColor: tintBg(tint),
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <SymbolView name={icon} size={18} tintColor={tint} />
        </View>
      }
    />
  );
}
