import { Redirect } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { ActivityIndicator, View } from "react-native";
import { useConvexAuth } from "convex/react";
import { authClient } from "@/lib/auth-client";
import { useTheme } from "@/lib/theme";
import { useSyncWidget } from "@/lib/widget-sync";

export default function TabsLayout() {
  const { data, isPending } = authClient().useSession();
  // On sign-out the Convex auth token clears a tick before better-auth's
  // session state updates. Gating only on the better-auth session leaves a
  // window where the tab screens are still mounted but Convex is already
  // unauthenticated — their requireAuth queries then throw "Unauthenticated".
  // Watching Convex's own auth state unmounts the authed tabs the instant it
  // de-authenticates, which is exactly when those queries would start erroring.
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { colors } = useTheme();

  if (isPending || isLoading) {
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
  if (!data?.session || !isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  return <AuthedTabs tint={colors.accent} />;
}

function AuthedTabs({ tint }: { tint: string }) {
  // Mounted only after the auth gate so the Convex queries inside the
  // hook never fire unauthenticated.
  useSyncWidget();
  return (
    <NativeTabs tintColor={tint}>
      <NativeTabs.Trigger name="feed">
        <NativeTabs.Trigger.Icon sf="bell.fill" />
        <NativeTabs.Trigger.Label>Feed</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="apps">
        <NativeTabs.Trigger.Icon sf="app.badge.fill" />
        <NativeTabs.Trigger.Label>Apps</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="devices">
        <NativeTabs.Trigger.Icon sf="iphone" />
        <NativeTabs.Trigger.Label>Devices</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Icon sf="gearshape.fill" />
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
