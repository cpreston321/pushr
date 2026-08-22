import { type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useTheme, spacing, type } from '@/lib/theme';
import { haptic } from '@/lib/haptics';

/**
 * iOS 26 / xchat-style header used at the top of in-app detail screens
 * (sounds, advanced, sound-picker, upgrade). Provides a glass-blur close /
 * back button and centered title; no status-bar padding by default — pass
 * `safeAreaTop` when used at the very top of a full-screen route.
 */

export type DrawerHeaderProps = {
  title: string;
  /** When set, the title becomes a Pressable that triggers this. */
  onPressTitle?: () => void;
  /** Override leading button behaviour. Defaults to dismiss/back depending on stack depth. */
  onClose?: () => void;
  /** Show a custom trailing accessory (e.g., an action button). */
  trailing?: ReactNode;
  /** Leading icon shape. Defaults to "close" (X). Use "back" for drilled-in
   *  scenes (e.g., a sheet pushed on top of another sheet). */
  leading?: 'close' | 'back';
  /** Float the header over content (absolute positioning). Use on screens
   *  where the body wants to extend behind the header (e.g., a hero gradient). */
  floating?: boolean;
  /** Extra top padding for the X button — typically the device safe-area top
   *  inset. Use on fullScreenModal screens where the status bar is visible. */
  safeAreaTop?: number;
  /** Hide the title text (still occupies layout space for the chevron logic). */
  hideTitle?: boolean;
  /** Which side the close/back button sits on. Defaults to "left". When set
   *  to "right", `trailing` is ignored — the close button takes that slot. */
  closeAlign?: 'left' | 'right';
};

const BUTTON_SIZE = 36;

export function DrawerHeader({
  title,
  onPressTitle,
  onClose,
  trailing,
  leading = 'close',
  floating = false,
  safeAreaTop = 0,
  hideTitle = false,
  closeAlign = 'left'
}: DrawerHeaderProps) {
  const { colors, isDark } = useTheme();
  const showBack = leading === 'back';
  const closeOnRight = closeAlign === 'right';

  const handleLeading = () => {
    haptic.light();
    if (onClose) onClose();
    else router.back();
  };

  const closeButton = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={showBack ? 'Back' : 'Close'}
      onPress={handleLeading}
      hitSlop={10}
      style={({ pressed }) => ({
        width: BUTTON_SIZE,
        height: BUTTON_SIZE,
        borderRadius: BUTTON_SIZE / 2,
        overflow: 'hidden',
        opacity: pressed ? 0.7 : 1
      })}
    >
      <BlurView
        intensity={isDark ? 50 : 70}
        tint={isDark ? 'dark' : 'light'}
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)'
        }}
      >
        <SymbolView
          name={showBack ? 'chevron.left' : 'xmark'}
          size={showBack ? 16 : 13}
          weight="semibold"
          tintColor={colors.label}
        />
      </BlurView>
    </Pressable>
  );

  // Empty 36×36 spacer that mirrors the close button's footprint, used on
  // whichever side doesn't host the close so the title stays optically
  // centered.
  const spacer = <View style={{ width: BUTTON_SIZE, height: BUTTON_SIZE }} />;

  return (
    <View
      pointerEvents="box-none"
      style={{
        ...(floating ? { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20 } : null),
        paddingTop: safeAreaTop + spacing.sm,
        paddingBottom: spacing.sm,
        paddingHorizontal: spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        backgroundColor: 'transparent'
      }}
    >
      {closeOnRight ? spacer : closeButton}

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        {hideTitle ? null : onPressTitle ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              haptic.selection();
              onPressTitle();
            }}
            hitSlop={6}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: spacing.sm,
              paddingVertical: 4,
              opacity: pressed ? 0.6 : 1
            })}
          >
            <Text numberOfLines={1} style={{ ...type.headline, color: colors.label }}>
              {title}
            </Text>
            <SymbolView
              name="chevron.right"
              size={11}
              weight="semibold"
              tintColor={colors.tertiaryLabel}
            />
          </Pressable>
        ) : (
          <Text numberOfLines={1} style={{ ...type.headline, color: colors.label }}>
            {title}
          </Text>
        )}
      </View>

      {closeOnRight ? (
        closeButton
      ) : (
        <View
          style={{
            width: BUTTON_SIZE,
            height: BUTTON_SIZE,
            alignItems: 'flex-end',
            justifyContent: 'center'
          }}
        >
          {trailing ?? null}
        </View>
      )}
    </View>
  );
}

/** No-op kept for compatibility with the previous absolute-positioned API. */
export function DrawerHeaderSpacer() {
  return null;
}
