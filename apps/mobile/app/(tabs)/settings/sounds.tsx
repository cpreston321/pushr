import { router } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useConvexAuth, useQuery } from 'convex/react';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { api } from '@pushr/backend/_generated/api';
import { DrawerHeader } from '@/components/DrawerHeader';
import { DrawerScreen } from '@/components/Sheet';
import { ListSection } from '@/components/ListSection';
import { ListRow } from '@/components/ListRow';
import { useTheme, spacing, radius, type } from '@/lib/theme';
import { haptic } from '@/lib/haptics';
import { soundLabel } from '@/lib/sounds';

export default function SoundsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useConvexAuth();
  const prefs = useQuery(api.userPrefs.getMine, isAuthenticated ? {} : 'skip');

  function open(paramKey: 'low' | 'normal' | 'high') {
    haptic.selection();
    // Cast: typed-routes regenerate on next `expo start`; the runtime path is
    // valid (file is sibling to this one).
    router.push({
      pathname: '/(tabs)/settings/sound-picker' as never,
      params: { key: paramKey }
    });
  }

  return (
    <DrawerScreen>
      <DrawerHeader title="Notification sounds" leading="back" safeAreaTop={insets.top} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          paddingTop: spacing.md,
          paddingBottom: insets.bottom + spacing.xxl
        }}
      >
        <ListSection footer="Pick the sound each priority plays on arrival. Tap a priority to preview and choose.">
          <SoundRow
            title="Low priority"
            subtitle={'priority ≤ 4  /  "low"'}
            icon="bell.slash"
            value={prefs ? soundLabel(prefs.soundLow) : '—'}
            onPress={() => open('low')}
          />
          <SoundRow
            title="Normal"
            subtitle={'priority 5–6  /  "normal"'}
            icon="bell"
            tint={colors.accent}
            value={prefs ? soundLabel(prefs.soundNormal) : '—'}
            onPress={() => open('normal')}
          />
          <SoundRow
            title="High priority"
            subtitle={'priority ≥ 7  /  "high"'}
            icon="bell.badge.fill"
            tint={colors.destructive}
            value={prefs ? soundLabel(prefs.soundHigh) : '—'}
            onPress={() => open('high')}
          />
        </ListSection>
      </ScrollView>
    </DrawerScreen>
  );
}

function SoundRow({
  icon,
  title,
  subtitle,
  tint,
  value,
  onPress
}: {
  icon: SFSymbol;
  title: string;
  subtitle: string;
  /** Omit for the muted treatment — resolved here so it reads the drawer ramp. */
  tint?: string;
  value: string;
  onPress: () => void;
}) {
  const { colors, tintBg } = useTheme();
  const rowTint = tint ?? colors.secondaryLabel;
  return (
    <ListRow
      title={title}
      subtitle={subtitle}
      chevron
      onPress={onPress}
      trailing={<Text style={{ ...type.body, color: colors.secondaryLabel }}>{value}</Text>}
      leading={
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: radius.lg,
            backgroundColor: tintBg(rowTint),
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <SymbolView name={icon} size={18} tintColor={rowTint} />
        </View>
      }
    />
  );
}
