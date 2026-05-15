import { useEffect, useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { SymbolView } from 'expo-symbols';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { api } from '@pushr/backend/_generated/api';
import { DrawerHeader } from '@/components/DrawerHeader';
import { ScreenTransition } from '@/components/ScreenTransition';
import { ListSection } from '@/components/ListSection';
import { ListRow } from '@/components/ListRow';
import { useTheme, spacing, radius } from '@/lib/theme';
import { haptic } from '@/lib/haptics';
import { SOUNDS } from '@/lib/sounds';

type SoundKey = 'soundLow' | 'soundNormal' | 'soundHigh';

const KEY_FROM_PARAM: Record<string, SoundKey> = {
  low: 'soundLow',
  normal: 'soundNormal',
  high: 'soundHigh'
};

const TITLE_FROM_PARAM: Record<string, string> = {
  low: 'Low priority',
  normal: 'Normal priority',
  high: 'High priority'
};

// `require` must be static. Map each .caf in SOUNDS to its bundled asset so we
// can play a preview when the user taps a row.
const SOUND_ASSETS: Record<string, number> = {
  'pulse.caf': require('@/assets/sounds/pulse.caf'),
  'wire.caf': require('@/assets/sounds/wire.caf'),
  'tap.caf': require('@/assets/sounds/tap.caf'),
  'bell.caf': require('@/assets/sounds/bell.caf'),
  'escalate.caf': require('@/assets/sounds/escalate.caf'),
  'klaxon.caf': require('@/assets/sounds/klaxon.caf')
};

export default function SoundPickerScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ key?: string }>();
  const paramKey = (params.key ?? 'normal') as keyof typeof KEY_FROM_PARAM;
  const prefKey = KEY_FROM_PARAM[paramKey] ?? 'soundNormal';
  const title = TITLE_FROM_PARAM[paramKey] ?? 'Sound';

  const { isAuthenticated } = useConvexAuth();
  const prefs = useQuery(api.userPrefs.getMine, isAuthenticated ? {} : 'skip');
  const updatePrefs = useMutation(api.userPrefs.update);

  // Match Apple's Sounds & Haptics: previews play even on silent mode so the
  // user can actually hear what they're picking.
  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true });
  }, []);

  // One pre-loaded player per sound. Calling `replace()` on a single shared
  // player races with `play()` — the new source isn't ready in time when the
  // user taps quickly. Pre-loading lets every preview start instantly.
  const pulsePlayer = useAudioPlayer(SOUND_ASSETS['pulse.caf']);
  const wirePlayer = useAudioPlayer(SOUND_ASSETS['wire.caf']);
  const tapPlayer = useAudioPlayer(SOUND_ASSETS['tap.caf']);
  const bellPlayer = useAudioPlayer(SOUND_ASSETS['bell.caf']);
  const escalatePlayer = useAudioPlayer(SOUND_ASSETS['escalate.caf']);
  const klaxonPlayer = useAudioPlayer(SOUND_ASSETS['klaxon.caf']);

  const players = useMemo(
    () => ({
      'pulse.caf': pulsePlayer,
      'wire.caf': wirePlayer,
      'tap.caf': tapPlayer,
      'bell.caf': bellPlayer,
      'escalate.caf': escalatePlayer,
      'klaxon.caf': klaxonPlayer
    }),
    [pulsePlayer, wirePlayer, tapPlayer, bellPlayer, escalatePlayer, klaxonPlayer]
  );

  const currentValue = prefs?.[prefKey] ?? 'default';
  const currentId = useMemo(
    () => SOUNDS.find((s) => s.value === currentValue)?.id ?? null,
    [currentValue]
  );

  function previewAndSelect(value: string | null) {
    haptic.selection();
    updatePrefs({ [prefKey]: value });
    // 'default' is the iOS system chime — not directly playable from JS.
    // null is Silent — nothing to play.
    if (!value || value === 'default') return;
    const player = players[value as keyof typeof players];
    if (!player) return;
    // Stop whichever preview is currently playing, then start the new one
    // from the beginning. Pausing other players is a no-op if they're idle.
    for (const p of Object.values(players)) {
      if (p !== player && p.playing) p.pause();
    }
    try {
      player.seekTo(0);
      player.play();
    } catch {
      // expo-audio surfaces errors via events; swallow here so a missing asset
      // doesn't break selection.
    }
  }

  return (
    <ScreenTransition style={{ backgroundColor: colors.grouped }}>
      <DrawerHeader title={title} leading="back" safeAreaTop={insets.top} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          paddingTop: spacing.md,
          paddingBottom: insets.bottom + spacing.xxl
        }}
      >
        <ListSection footer="Tap a sound to preview and set. Default uses the iOS system notification chime. Custom sounds require a dev build.">
          {SOUNDS.map((s) => {
            const selected = s.id === currentId;
            return (
              <ListRow
                key={s.id}
                title={s.label}
                onPress={() => previewAndSelect(s.value)}
                leading={<SoundLeading sound={s} selected={selected} />}
                trailing={
                  selected ? (
                    <SymbolView name="checkmark" size={16} tintColor={colors.accent} />
                  ) : undefined
                }
              />
            );
          })}
        </ListSection>
      </ScrollView>
    </ScreenTransition>
  );
}

function SoundLeading({
  sound,
  selected
}: {
  sound: (typeof SOUNDS)[number];
  selected: boolean;
}) {
  const { colors, tintBg } = useTheme();
  const symbol =
    sound.value === null
      ? 'bell.slash'
      : sound.value === 'default'
        ? 'bell.fill'
        : 'speaker.wave.2.fill';
  const iconTint = selected ? colors.accent : colors.label;
  const bg = selected ? tintBg(colors.accent) : colors.fill;
  return (
    <View
      style={{
        width: 32,
        height: 32,
        borderRadius: radius.lg,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <SymbolView name={symbol} size={16} tintColor={iconTint} />
    </View>
  );
}
