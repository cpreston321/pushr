import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { convex, authClient, initBackend } from "@/lib/backend";
import { ThemePreferencesProvider, useTheme } from "@/lib/theme";
import { useNotificationResponses } from "@/lib/useNotificationResponses";
import { useBadgeSync } from "@/lib/useBadgeSync";

export default function RootLayout() {
  return (
    <ThemePreferencesProvider>
      <ThemedRoot />
    </ThemePreferencesProvider>
  );
}

function ThemedRoot() {
  const { isDark, colors } = useTheme();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    initBackend()
      .then(() => setReady(true))
      .catch(() => setReady(true)); // fail open — default URLs will throw on use if truly missing
  }, []);

  const navTheme = {
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(isDark ? DarkTheme.colors : DefaultTheme.colors),
      primary: colors.accent,
      background: colors.grouped,
      card: colors.background,
      text: colors.label,
      border: colors.separator,
      notification: colors.accent,
    },
  };

  if (!ready) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.grouped,
        }}
      >
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.grouped }}>
      <ConvexBetterAuthProvider client={convex()} authClient={authClient() as never}>
        <ThemeProvider value={navTheme}>
          <AppShell isDark={isDark} bg={colors.grouped} />
        </ThemeProvider>
      </ConvexBetterAuthProvider>
    </GestureHandlerRootView>
  );
}

function AppShell({ isDark, bg }: { isDark: boolean; bg: string }) {
  useNotificationResponses();
  useBadgeSync();
  return (
    <>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: bg } }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
        <Stack.Screen
          name="source-app/[id]"
          options={{ presentation: "formSheet", sheetAllowedDetents: [0.6, 1.0] }}
        />
        <Stack.Screen
          name="server-config"
          options={{ presentation: "formSheet", sheetAllowedDetents: [0.7, 1.0] }}
        />
        <Stack.Screen
          name="upgrade"
          options={{ presentation: "fullScreenModal" }}
        />
      </Stack>
      <StatusBar style={isDark ? "light" : "dark"} />
    </>
  );
}
