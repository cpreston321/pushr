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
import { useLiveActivityTokens } from "@/lib/useLiveActivityTokens";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useBadgeSync } from "@/lib/useBadgeSync";
import { PromptHost } from "@/components/PromptHost";

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
  // Auth-gated queries: a fresh-install device hits the auth flow, but the
  // root layout still mounts. Skip Convex calls until the session is live so
  // we don't surface "Not authenticated" errors before login.
  const { isAuthenticated } = useConvexAuth();
  const devices = useQuery(api.devices.listMine, isAuthenticated ? {} : "skip");
  const currentDeviceId = devices?.find((d) => d.enabled && !d.invalidatedAt)?._id;
  useLiveActivityTokens(isAuthenticated ? currentDeviceId : undefined);
  return (
    <>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: bg } }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
        <Stack.Screen
          name="source-app/[id]"
          options={{
            presentation: "formSheet",
            sheetAllowedDetents: [1.0],
            sheetGrabberVisible: true,
          }}
        />
        <Stack.Screen
          name="server-config"
          options={{
            presentation: "formSheet",
            sheetAllowedDetents: [0.7, 1.0],
            sheetGrabberVisible: true,
          }}
        />
        <Stack.Screen
          name="upgrade"
          options={{ presentation: "fullScreenModal" }}
        />
      </Stack>
      <PromptHost />
      <StatusBar style={isDark ? "light" : "dark"} />
    </>
  );
}
