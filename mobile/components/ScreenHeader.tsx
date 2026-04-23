import { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, spacing, type } from "@/lib/theme";

type Props = {
  title: string;
  eyebrow?: string;
  accessory?: ReactNode;
  children?: ReactNode;
};

const HERO_BG = "#0A0F16";

/**
 * Hero header: dark ink background with a soft accent bloom rendered as a true
 * SVG radial gradient, fading into solid at the bottom so a rounded-top sheet
 * can sit flush against it. Always dark regardless of system theme.
 */
export function ScreenHeader({ title, eyebrow, accessory, children }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const bloom = colors.accent;

  return (
    <View style={{ backgroundColor: HERO_BG }}>
      <View
        style={{
          paddingTop: insets.top + spacing.lg,
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing.xxl + 24,
          overflow: "hidden",
        }}
      >
        <Svg
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
          preserveAspectRatio="none"
          viewBox="0 0 100 100"
        >
          <Defs>
            <RadialGradient
              id="bloom"
              cx="20"
              cy="10"
              rx="80"
              ry="95"
              fx="20"
              fy="10"
              gradientUnits="userSpaceOnUse"
            >
              <Stop offset="0" stopColor={bloom} stopOpacity={0.75} />
              <Stop offset="0.45" stopColor={bloom} stopOpacity={0.25} />
              <Stop offset="1" stopColor={bloom} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="100" height="100" fill="url(#bloom)" />
        </Svg>
        <LinearGradient
          pointerEvents="none"
          colors={["rgba(10,15,22,0)", "rgba(10,15,22,0.7)", HERO_BG]}
          locations={[0.4, 0.8, 1]}
          style={StyleSheet.absoluteFillObject}
        />

        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: spacing.md,
          }}
        >
          <View style={{ flex: 1 }}>
            {!!eyebrow && (
              <Text
                style={{
                  ...type.subhead,
                  color: "rgba(255,255,255,0.65)",
                  marginBottom: spacing.xs,
                }}
              >
                {eyebrow}
              </Text>
            )}
            <Text
              style={{
                ...type.largeTitle,
                color: "#FFFFFF",
                fontSize: 38,
                lineHeight: 44,
              }}
            >
              {title}
            </Text>
          </View>
          {accessory ? <View>{accessory}</View> : null}
        </View>

        {children ? <View style={{ marginTop: spacing.xl }}>{children}</View> : null}
      </View>
    </View>
  );
}

/**
 * Rounded-top sheet that lifts up off a ScreenHeader. Uses the system grouped
 * background so it naturally follows light/dark mode.
 */
export function ScreenBody({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.grouped,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        marginTop: -20,
        overflow: "hidden",
      }}
    >
      {children}
    </View>
  );
}
