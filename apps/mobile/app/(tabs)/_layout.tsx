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
  // Icon-only tab bar. `hidden` on the Label is expo-router's supported way to
  // do this — it clears the native tab item's title, which is what centers the
  // icon. The label text stays here as the record of what each tab is, and
  // dropping `hidden` brings it back.
  //
  // One stroke weight across the set. It was three filled glyphs plus an
  // outline `iphone`, and `app.badge.fill` in particular rendered as a solid
  // block among hairlines. Filled isn't available for all four — SF Symbols has
  // no `iphone.fill`, device symbols are outline by design — so the set goes
  // outline, and selection is carried by `tintColor` as before.
  return (
    <NativeTabs tintColor={tint}>
      <NativeTabs.Trigger name="feed">
        <NativeTabs.Trigger.Icon sf="bell" />
        <NativeTabs.Trigger.Label hidden>Feed</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="apps">
        {/* The glyph the app already uses for source apps (see the Pro perks). */}
        <NativeTabs.Trigger.Icon sf="square.stack.3d.up" />
        <NativeTabs.Trigger.Label hidden>Apps</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="devices">
        <NativeTabs.Trigger.Icon sf="iphone" />
        <NativeTabs.Trigger.Label hidden>Devices</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Icon sf="gearshape" />
        <NativeTabs.Trigger.Label hidden>Settings</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
