import { ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { DrawerHeader } from '@/components/DrawerHeader';
import { DrawerScreen } from '@/components/Sheet';
import { ListSection } from '@/components/ListSection';
import { ListRow } from '@/components/ListRow';
import { useTheme, spacing, radius, type } from '@/lib/theme';
import { haptic } from '@/lib/haptics';
import { currentServerLabel } from '@/lib/backend';

export default function AdvancedScreen() {
  const insets = useSafeAreaInsets();

  return (
    <DrawerScreen>
      <DrawerHeader title="Advanced" leading="back" safeAreaTop={insets.top} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          paddingTop: spacing.md,
          paddingBottom: insets.bottom + spacing.xxl
        }}
      >
        <ListSection footer="Self-hosting? Point pushr at your own Convex deployment. Changing the server signs you out and requires an app restart.">
          <TintedRow
            icon="server.rack"
            title="Backend"
            trailing={currentServerLabel()}
            onPress={() => {
              haptic.selection();
              router.push('/server-config');
            }}
          />
        </ListSection>
      </ScrollView>
    </DrawerScreen>
  );
}

function TintedRow({
  icon,
  title,
  trailing,
  onPress
}: {
  icon: SFSymbol;
  title: string;
  trailing?: string;
  onPress?: () => void;
}) {
  // Read inside the row so the tint comes from the drawer's ramp, not the
  // screen's — the route root sits above the provider.
  const { colors, tintBg } = useTheme();
  const tint = colors.accent;
  return (
    <ListRow
      title={title}
      onPress={onPress}
      chevron={!!onPress && !trailing}
      trailing={
        trailing ? (
          <Text style={{ ...type.body, color: colors.secondaryLabel }}>{trailing}</Text>
        ) : undefined
      }
      leading={
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: radius.lg,
            backgroundColor: tintBg(tint),
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <SymbolView name={icon} size={18} tintColor={tint} />
        </View>
      }
    />
  );
}
