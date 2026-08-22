import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "expo-router/react-navigation";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { BottomSheetProvider } from "@swmansion/react-native-bottom-sheet";
import {
  CreateAppSheetProvider,
  CreateAppSheetMount,
} from "@/components/sheets/CreateAppSheet";
import {
  SourceAppDetailSheetProvider,
  SourceAppDetailSheetMount,
} from "@/components/sheets/SourceAppDetailSheet";
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { convex, authClient, initBackend } from "@/lib/backend";
import { ThemePreferencesProvider, useTheme } from "@/lib/theme";
import { useNotificationResponses } from "@/lib/useNotificationResponses";
import { useLiveActivityTokens } from "@/lib/useLiveActivityTokens";
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@pushr/backend/_generated/api";
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
    <GestureHandlerRootView
      style={{ flex: 1, backgroundColor: colors.grouped }}
    >
      <ConvexBetterAuthProvider
        client={convex()}
        authClient={authClient() as never}
      >
        <ThemeProvider value={navTheme}>
          <SourceAppDetailSheetProvider>
            <CreateAppSheetProvider>
              <BottomSheetProvider>
                <CreateAppSheetMount />
                <SourceAppDetailSheetMount />
                <AppShell isDark={isDark} bg={colors.grouped} />
              </BottomSheetProvider>
            </CreateAppSheetProvider>
          </SourceAppDetailSheetProvider>
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
  const currentDeviceId = devices?.find(
    (d) => d.enabled && !d.invalidatedAt,
  )?._id;
  useLiveActivityTokens(isAuthenticated ? currentDeviceId : undefined);

  // Cold-start reconcile against RevenueCat — recovers from dropped webhooks
  // and cross-device installs by syncing entitlement state once per session.
  // No-op (and silent) if REVENUECAT_REST_API_KEY isn't configured.
  const reconcileIap = useAction(api.iap.reconcile);
  const reconciledRef = useRef(false);
  useEffect(() => {
    if (!isAuthenticated || reconciledRef.current) return;
    reconciledRef.current = true;
    reconcileIap({}).catch(() => {
      // Dropped reconcile is fine: getEffectiveTier handles natural
      // expiration via proUntil and the webhook still drives grants.
    });
  }, [isAuthenticated, reconcileIap]);

  // Reconcile the admin's plan to permanent Pro once per cold start. No-op for
  // everyone else; gated server-side by the ADMIN_EMAILS env allowlist.
  const syncMyPlan = useMutation(api.tiers.syncMyPlan);
  const syncedPlanRef = useRef(false);
  useEffect(() => {
    if (!isAuthenticated || syncedPlanRef.current) return;
    syncedPlanRef.current = true;
    syncMyPlan({}).catch(() => {});
  }, [isAuthenticated, syncMyPlan]);
  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: bg },
        }}
      >
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
        <Stack.Screen
          name="upgrade"
          options={{ presentation: "fullScreenModal" }}
        />
        <Stack.Screen
          name="change-password"
          options={{
            presentation: "formSheet",
            headerShown: false,
            title: "",
            sheetGrabberVisible: false,
            sheetAllowedDetents: [0.85],
            contentStyle: { backgroundColor: "transparent" },
          }}
        />
        <Stack.Screen
          name="server-config"
          options={{
            presentation: "formSheet",
            headerShown: false,
            title: "",
            // `SheetHeader` provides the X — a grabber on top of it gives the
            // sheet two dismiss affordances stacked in the same corner.
            sheetGrabberVisible: false,
            // Opens at half height, which is about what the content needs now
            // that the custom-deployment form is behind a flag. Still draggable
            // to near-full for large text sizes, or for when that form returns.
            sheetAllowedDetents: [0.5, 0.95],
            contentStyle: { backgroundColor: "transparent" },
          }}
        />
        <Stack.Screen
          name="token-reveal"
          options={{
            presentation: "formSheet",
            headerShown: false,
            title: "",
            sheetGrabberVisible: false,
            sheetAllowedDetents: [0.85],
            sheetExpandsWhenScrolledToEdge: false,
            contentStyle: { backgroundColor: "transparent" },
            gestureEnabled: false,
          }}
        />
      </Stack>
      <PromptHost />
      <StatusBar style={isDark ? "light" : "dark"} />
    </>
  );
}
