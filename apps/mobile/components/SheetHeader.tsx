import { type ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { SymbolView } from "expo-symbols";
import { BlurView } from "expo-blur";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { useTheme, spacing, type } from "@/lib/theme";

export const SHEET_HEADER_HEIGHT = 72;

/**
 * Shared header for formSheet routes: a 44pt glass `X` close button on the
 * left, the sheet's title centered, and an optional trailing slot — typically
 * a `<SheetActionPill />` for the primary submit action.
 *
 * Sits as a flex-column sibling above the body content. Opaque
 * `colors.sheet` background reads as a distinct chrome region from the
 * scrolling body underneath.
 *
 * The close button dismisses via `router.back()` — callers don't wire it up.
 */
export function SheetHeader({
  title,
  trailing,
  onClose,
  variant = "close",
}: {
  title: string;
  trailing?: ReactNode;
  onClose?: () => void;
  variant?: "close" | "back";
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        height: SHEET_HEADER_HEIGHT,
        backgroundColor: colors.sheet,
        zIndex: 10,
        flexDirection: "row",
        alignItems: "center",
        paddingTop: spacing.md,
        paddingHorizontal: spacing.md,
        paddingBottom: spacing.sm,
        gap: spacing.md,
      }}
    >
      <SheetCloseButton onPress={onClose} variant={variant} />
      <Text
        style={{ ...type.headline, color: colors.label, flex: 1 }}
        numberOfLines={1}
      >
        {title}
      </Text>
      {trailing}
    </View>
  );
}

function SheetCloseButton({
  onPress,
  variant,
}: {
  onPress?: () => void;
  variant: "close" | "back";
}) {
  const { colors } = useTheme();
  const inner = (
    <Pressable
      onPress={onPress ?? (() => router.back())}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={variant === "back" ? "Back" : "Close"}
      style={{
        width: 44,
        height: 44,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <SymbolView
        name={variant === "back" ? "chevron.left" : "xmark"}
        size={variant === "back" ? 18 : 16}
        weight="semibold"
        tintColor={colors.label}
      />
    </Pressable>
  );
  return <GlassChip>{inner}</GlassChip>;
}

/**
 * Glass capsule action button for the trailing slot of `<SheetHeader />` —
 * typically the form's primary submit. Disabled state dims the label;
 * `loading` swaps the label for a spinner.
 */
export function SheetActionPill({
  label,
  onPress,
  disabled,
  loading,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  const { colors } = useTheme();
  const textColor = disabled ? colors.tertiaryLabel : colors.label;
  const inner = (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        height: 44,
        minWidth: 88,
        paddingHorizontal: 18,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text style={{ ...type.callout, fontWeight: "600", color: textColor }}>
          {label}
        </Text>
      )}
    </Pressable>
  );
  return <GlassChip>{inner}</GlassChip>;
}

/**
 * Internal: pill-shaped glass container with native iOS 26 Liquid Glass
 * interaction. The child `Pressable` lives *inside* the `GlassView` so the
 * tap reaches it and `isInteractive` drives the squish/shimmer animation
 * (mirrors the working FloatingBar pattern). Falls back to `BlurView` with
 * a layered `pointerEvents="none"` pattern on pre-iOS-26.
 */
function GlassChip({ children }: { children: ReactNode }) {
  const { isDark } = useTheme();
  const liquid = isLiquidGlassAvailable();

  if (liquid) {
    return (
      <GlassView
        isInteractive
        glassEffectStyle="clear"
        colorScheme={isDark ? "dark" : "light"}
        style={{
          borderRadius: 22,
          borderCurve: "continuous",
        }}
      >
        {children}
      </GlassView>
    );
  }

  return (
    <View
      style={{
        borderRadius: 22,
        borderCurve: "continuous",
        overflow: "hidden",
      }}
    >
      <BlurView
        intensity={isDark ? 50 : 70}
        tint={isDark ? "dark" : "light"}
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: isDark
            ? "rgba(40,40,42,0.55)"
            : "rgba(255,255,255,0.55)",
        }}
      />
      {children}
    </View>
  );
}
