import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { SymbolView, type SFSymbol } from "expo-symbols";
import { api } from "../../../../convex/_generated/api";
import { DrawerHeader } from "@/components/DrawerHeader";
import { ScreenTransition } from "@/components/ScreenTransition";
import { ListSection } from "@/components/ListSection";
import { ListRow } from "@/components/ListRow";
import { useTheme, spacing, radius, type } from "@/lib/theme";
import { haptic } from "@/lib/haptics";
import { showActionSheet } from "@/lib/actionSheet";
import { SOUNDS, soundLabel } from "@/lib/sounds";

type SoundKey = "soundLow" | "soundNormal" | "soundHigh";

export default function SoundsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useConvexAuth();
  const prefs = useQuery(api.userPrefs.getMine, isAuthenticated ? {} : "skip");
  const updatePrefs = useMutation(api.userPrefs.update);

  function pickSound(key: SoundKey, title: string) {
    haptic.light();
    const current = soundLabel(prefs?.[key] ?? "default");
    showActionSheet({
      title,
      message:
        "Choose the sound played when a notification of this priority arrives.",
      options: SOUNDS.map((s) => ({
        label: current === s.label ? `✓ ${s.label}` : s.label,
        onPress: () => {
          haptic.success();
          updatePrefs({ [key]: s.value });
        },
      })),
    });
  }

  return (
    <ScreenTransition style={{ backgroundColor: colors.grouped }}>
      <DrawerHeader
        title="Notification sounds"
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
        <ListSection footer="Pick the sound each priority plays on arrival. Custom sounds beyond Default and Silent require a dev build.">
          <SoundRow
            title="Low priority"
            subtitle={'priority ≤ 4  /  "low"'}
            icon="bell.slash"
            tint={colors.secondaryLabel}
            value={prefs ? soundLabel(prefs.soundLow) : "—"}
            onPress={() => pickSound("soundLow", "Low-priority sound")}
          />
          <SoundRow
            title="Normal"
            subtitle={'priority 5–6  /  "normal"'}
            icon="bell"
            tint={colors.accent}
            value={prefs ? soundLabel(prefs.soundNormal) : "—"}
            onPress={() => pickSound("soundNormal", "Normal-priority sound")}
          />
          <SoundRow
            title="High priority"
            subtitle={'priority ≥ 7  /  "high"'}
            icon="bell.badge.fill"
            tint={colors.destructive}
            value={prefs ? soundLabel(prefs.soundHigh) : "—"}
            onPress={() => pickSound("soundHigh", "High-priority sound")}
          />
        </ListSection>
      </ScrollView>
    </ScreenTransition>
  );
}

function SoundRow({
  icon,
  title,
  subtitle,
  tint,
  value,
  onPress,
}: {
  icon: SFSymbol;
  title: string;
  subtitle: string;
  tint: string;
  value: string;
  onPress: () => void;
}) {
  const { colors, tintBg } = useTheme();
  return (
    <ListRow
      title={title}
      subtitle={subtitle}
      chevron
      onPress={onPress}
      trailing={
        <Text style={{ ...type.body, color: colors.secondaryLabel }}>
          {value}
        </Text>
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
