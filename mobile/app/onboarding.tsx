import { useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import * as SecureStore from "expo-secure-store";
import { SymbolView, type SFSymbol } from "expo-symbols";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import {
  useTheme,
  useThemePreferences,
  spacing,
  radius,
  type,
  ACCENT_PRESETS,
  ACCENT_ORDER,
  type AccentKey,
  type ThemeMode,
} from "@/lib/theme";
import { haptic } from "@/lib/haptics";
import { registerForPushAsync } from "@/lib/push";

export const HAS_ONBOARDED_KEY = "pushr.hasOnboarded";

type StepId = "welcome" | "theme" | "notifications" | "done";

type Step = {
  id: StepId;
  icon: SFSymbol;
  tint?: string;
  eyebrow: string;
  title: string;
  body: string;
};

export default function Onboarding() {
  const { colors, tintBg } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const [notifStatus, setNotifStatus] = useState<
    "idle" | "requesting" | "granted" | "denied"
  >("idle");
  const [notifError, setNotifError] = useState<string | null>(null);

  const registerDevice = useMutation(api.devices.register);

  const steps: Step[] = [
    {
      id: "welcome",
      icon: "bell.badge.fill",
      tint: colors.accent,
      eyebrow: "Welcome",
      title: "Your personal push hub",
      body: "pushr turns any HTTP POST into a notification on your phone. Let's get you set up in under a minute.",
    },
    {
      id: "theme",
      icon: "paintpalette.fill",
      tint: colors.accent,
      eyebrow: "Step 1 of 2",
      title: "Make it yours",
      body: "Choose light, dark, or match your system — plus the accent color you like. You can change these any time in Settings.",
    },
    {
      id: "notifications",
      icon: "app.badge",
      tint: colors.accent,
      eyebrow: "Step 2 of 2",
      title: "Enable notifications",
      body: "We need permission to deliver pushes on this device. Your device will also be registered so you can receive pushes immediately.",
    },
    {
      id: "done",
      icon: "checkmark.seal.fill",
      tint: colors.success,
      eyebrow: "All set",
      title: "You're ready",
      body: "Create source apps in the Apps tab to receive your own pushes — or wait for an invite. Settings lets you swap backends and tweak sounds.",
    },
  ];

  function goTo(index: number) {
    const clamped = Math.max(0, Math.min(steps.length - 1, index));
    setPage(clamped);
    scrollRef.current?.scrollTo({ x: clamped * screenWidth, animated: true });
  }

  function onMomentumEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const next = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
    setPage(next);
  }

  async function enableNotifications() {
    setNotifStatus("requesting");
    setNotifError(null);
    const result = await registerForPushAsync();
    if (!result.ok) {
      haptic.error();
      setNotifStatus("denied");
      setNotifError(result.reason);
      return;
    }
    try {
      await registerDevice({
        expoPushToken: result.token,
        platform: result.platform,
        model: result.model,
        osVersion: result.osVersion,
        name: result.model,
      });
      haptic.success();
      setNotifStatus("granted");
    } catch (err: any) {
      haptic.error();
      setNotifStatus("denied");
      setNotifError(err?.message ?? "Failed to register this device");
    }
  }

  async function finish() {
    await SecureStore.setItemAsync(HAS_ONBOARDED_KEY, "1");
    haptic.success();
    router.replace("/feed");
  }

  const currentStep = steps[page];

  return (
    <Screen edges={["top", "bottom"]}>
      <View style={{ flex: 1 }}>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onMomentumEnd}
          scrollEventThrottle={16}
          style={{ flex: 1 }}
        >
          {steps.map((s) => (
            <View
              key={s.id}
              style={{
                width: screenWidth,
                paddingHorizontal: spacing.xl,
                paddingTop: insets.top + spacing.xl,
                gap: spacing.xl,
                justifyContent: "center",
              }}
            >
              <View
                style={{
                  width: 88,
                  height: 88,
                  borderRadius: 44,
                  backgroundColor: tintBg(s.tint ?? colors.accent),
                  alignItems: "center",
                  justifyContent: "center",
                  alignSelf: "flex-start",
                }}
              >
                <SymbolView name={s.icon} size={44} tintColor={s.tint ?? colors.accent} />
              </View>
              <View style={{ gap: spacing.sm }}>
                <Text
                  style={{
                    ...type.footnote,
                    color: s.tint ?? colors.accent,
                    textTransform: "uppercase",
                    letterSpacing: 0.6,
                  }}
                >
                  {s.eyebrow}
                </Text>
                <Text style={{ ...type.largeTitle, color: colors.label }}>{s.title}</Text>
                <Text
                  style={{
                    ...type.body,
                    color: colors.secondaryLabel,
                    lineHeight: 24,
                  }}
                >
                  {s.body}
                </Text>
              </View>

              {s.id === "theme" && <ThemePicker />}

              {s.id === "notifications" && (
                <StatusPanel
                  status={notifStatus}
                  error={notifError}
                  onRetry={enableNotifications}
                />
              )}

            </View>
          ))}
        </ScrollView>

        <View
          style={{
            padding: spacing.xl,
            paddingBottom: Math.max(insets.bottom, spacing.lg),
            gap: spacing.md,
          }}
        >
          <StepFooter
            step={currentStep}
            page={page}
            total={steps.length}
            busy={notifStatus === "requesting"}
            notifStatus={notifStatus}
            onNext={() => goTo(page + 1)}
            onEnable={enableNotifications}
            onFinish={finish}
            onSkip={() => goTo(page + 1)}
            colors={colors}
          />
        </View>
      </View>
    </Screen>
  );
}

function StatusPanel({
  status,
  error,
  onRetry,
}: {
  status: "idle" | "requesting" | "granted" | "denied";
  error: string | null;
  onRetry: () => void;
}) {
  const { colors, tintBg } = useTheme();
  if (status === "idle") return null;
  const tint =
    status === "granted"
      ? colors.success
      : status === "denied"
        ? colors.destructive
        : colors.accent;
  const icon: SFSymbol =
    status === "granted"
      ? "checkmark.circle.fill"
      : status === "denied"
        ? "exclamationmark.triangle.fill"
        : "arrow.clockwise";
  const message =
    status === "granted"
      ? "Notifications enabled — this device is registered."
      : status === "denied"
        ? (error ?? "Couldn't enable notifications.")
        : "Asking iOS for permission…";

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        padding: spacing.md,
        borderRadius: radius.lg,
        borderCurve: "continuous",
        backgroundColor: tintBg(tint, "18"),
      }}
    >
      <SymbolView name={icon} size={22} tintColor={tint} />
      <Text style={{ ...type.subhead, color: tint, flex: 1 }}>{message}</Text>
      {status === "denied" && (
        <Pressable onPress={onRetry} hitSlop={6}>
          <Text style={{ ...type.footnote, color: tint, fontWeight: "600" }}>Retry</Text>
        </Pressable>
      )}
    </View>
  );
}

function StepFooter({
  step,
  page,
  total,
  busy,
  notifStatus,
  onNext,
  onEnable,
  onFinish,
  onSkip,
  colors,
}: {
  step: Step;
  page: number;
  total: number;
  busy: boolean;
  notifStatus: "idle" | "requesting" | "granted" | "denied";
  onNext: () => void;
  onEnable: () => void;
  onFinish: () => void;
  onSkip: () => void;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ flexDirection: "row", justifyContent: "center", gap: 6 }}>
        {Array.from({ length: total }).map((_, i) => (
          <View
            key={i}
            style={{
              width: i === page ? 20 : 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: i === page ? colors.accent : colors.fill,
            }}
          />
        ))}
      </View>

      {step.id === "welcome" && <Button title="Get started" onPress={onNext} />}

      {step.id === "theme" && <Button title="Continue" onPress={onNext} />}

      {step.id === "notifications" && (
        <View style={{ gap: spacing.sm }}>
          <Button
            title={notifStatus === "granted" ? "Continue" : "Enable notifications"}
            onPress={notifStatus === "granted" ? onNext : onEnable}
            loading={busy && notifStatus === "requesting"}
          />
          {notifStatus !== "granted" && (
            <Button title="Skip for now" variant="plain" onPress={onSkip} />
          )}
        </View>
      )}

      {step.id === "done" && <Button title="Open pushr" onPress={onFinish} />}
    </View>
  );
}

function ThemePicker() {
  const { colors, isDark, tintBg } = useTheme();
  const { mode, setMode, accentKey, setAccent } = useThemePreferences();

  const modes: { value: ThemeMode; label: string; icon: SFSymbol }[] = [
    { value: "system", label: "System", icon: "iphone" },
    { value: "light", label: "Light", icon: "sun.max.fill" },
    { value: "dark", label: "Dark", icon: "moon.fill" },
  ];

  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        {modes.map((m) => {
          const selected = mode === m.value;
          return (
            <Pressable
              key={m.value}
              onPress={() => {
                haptic.selection();
                setMode(m.value);
              }}
              style={({ pressed }) => ({
                flex: 1,
                aspectRatio: 1.1,
                borderRadius: radius.md,
                borderCurve: "continuous",
                backgroundColor: selected ? tintBg(colors.accent) : colors.fill,
                borderWidth: 1.5,
                borderColor: selected ? colors.accent : "transparent",
                alignItems: "center",
                justifyContent: "center",
                gap: spacing.xs,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <SymbolView
                name={m.icon}
                size={26}
                tintColor={selected ? colors.accent : colors.secondaryLabel}
              />
              <Text
                style={{
                  ...type.footnote,
                  fontWeight: "600",
                  color: selected ? colors.accent : colors.secondaryLabel,
                }}
              >
                {m.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          padding: spacing.md,
          borderRadius: radius.md,
          borderCurve: "continuous",
          backgroundColor: colors.fill,
        }}
      >
        <Text style={{ ...type.subhead, color: colors.label, fontWeight: "500" }}>
          Accent
        </Text>
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          {ACCENT_ORDER.map((key: AccentKey) => {
            const color = ACCENT_PRESETS[key][isDark ? "dark" : "light"];
            const selected = accentKey === key;
            return (
              <Pressable
                key={key}
                onPress={() => {
                  haptic.selection();
                  setAccent(key);
                }}
                hitSlop={6}
              >
                <View
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    borderWidth: selected ? 2 : 0,
                    borderColor: color,
                    padding: selected ? 3 : 0,
                  }}
                >
                  <View
                    style={{ flex: 1, borderRadius: 999, backgroundColor: color }}
                  />
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}
