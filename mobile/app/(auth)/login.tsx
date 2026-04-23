import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, Text, View } from "react-native";
import { Link, router } from "expo-router";
import { SymbolView } from "expo-symbols";
import { Screen } from "@/components/Screen";
import { Input } from "@/components/Input";
import { Button } from "@/components/Button";
import { currentServerLabel } from "@/lib/backend";
import { authClient } from "@/lib/auth-client";
import { useTheme, spacing, type } from "@/lib/theme";
import { haptic } from "@/lib/haptics";

export default function Login() {
  const { colors } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!email || !password) return;
    setBusy(true);
    const { error } = await authClient().signIn.email({ email, password });
    setBusy(false);
    if (error) {
      haptic.error();
      Alert.alert("Sign-in failed", error.message ?? "Please check your credentials.");
      return;
    }
    haptic.success();
    router.replace("/feed");
  }

  return (
    <Screen edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <View
          style={{
            flex: 1,
            paddingHorizontal: spacing.xl,
            justifyContent: "center",
            gap: spacing.lg,
          }}
        >
          <View style={{ alignItems: "center", gap: spacing.md, marginBottom: spacing.xl }}>
            <View
              style={{
                width: 72,
                height: 72,
                borderRadius: 22,
                borderCurve: "continuous",
                backgroundColor: colors.accent,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <SymbolView name="bell.badge.fill" size={38} tintColor={colors.accentContrast} />
            </View>
            <Text style={{ ...type.largeTitle, color: colors.label }}>pushr</Text>
            <Text
              style={{ ...type.subhead, color: colors.secondaryLabel, textAlign: "center" }}
            >
              Your personal push-notification hub.
            </Text>
          </View>
          <Input
            placeholder="Email"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            value={email}
            onChangeText={setEmail}
          />
          <Input
            placeholder="Password"
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            value={password}
            onChangeText={setPassword}
          />
          <Button title="Sign in" onPress={submit} loading={busy} />
          <View style={{ alignItems: "center", marginTop: spacing.md }}>
            <Link href="/(auth)/signup" style={{ color: colors.accent, ...type.callout }}>
              Create an account
            </Link>
          </View>
        </View>
        <Pressable
          onPress={() => router.push("/server-config")}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignSelf: "center",
            alignItems: "center",
            gap: 6,
            paddingVertical: spacing.sm,
            paddingHorizontal: spacing.md,
            marginBottom: spacing.md,
            borderRadius: 16,
            opacity: pressed ? 0.6 : 1,
          })}
          hitSlop={8}
        >
          <SymbolView name="server.rack" size={12} tintColor={colors.tertiaryLabel} />
          <Text style={{ ...type.caption1, color: colors.tertiaryLabel }}>
            Server: {currentServerLabel()}
          </Text>
        </Pressable>
      </KeyboardAvoidingView>
    </Screen>
  );
}
