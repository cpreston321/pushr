import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import { Link, router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { SymbolView } from "expo-symbols";
import { Screen } from "@/components/Screen";
import { Input } from "@/components/Input";
import { Button } from "@/components/Button";
import { authClient } from "@/lib/auth-client";
import { useTheme, spacing, type } from "@/lib/theme";
import { haptic } from "@/lib/haptics";

export default function Signup() {
  const { colors } = useTheme();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!email || !password || !name) return;
    setBusy(true);
    const { error } = await authClient().signUp.email({ email, password, name });
    setBusy(false);
    if (error) {
      haptic.error();
      Alert.alert("Sign-up failed", error.message ?? "Please try again.");
      return;
    }
    haptic.success();
    const seen = await SecureStore.getItemAsync("pushr.hasOnboarded");
    router.replace(seen ? "/feed" : "/onboarding");
  }

  function goBack() {
    haptic.light();
    if (router.canGoBack()) router.back();
    else router.replace("/(auth)/login");
  }

  return (
    <Screen edges={["top", "bottom"]}>
      <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm }}>
        <Pressable
          onPress={goBack}
          hitSlop={8}
          style={({ pressed }) => ({
            alignSelf: "flex-start",
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            paddingVertical: 8,
            paddingHorizontal: spacing.sm,
            borderRadius: 10,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <SymbolView name="chevron.left" size={18} tintColor={colors.accent} />
          <Text style={{ ...type.body, color: colors.accent }}>Back</Text>
        </Pressable>
      </View>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, padding: spacing.xl, justifyContent: "center", gap: spacing.lg }}
      >
        <View style={{ marginBottom: spacing.lg }}>
          <Text style={{ ...type.largeTitle, color: colors.label }}>Create account</Text>
          <Text style={{ ...type.subhead, color: colors.secondaryLabel, marginTop: spacing.xs }}>
            Start receiving pushes from your own apps.
          </Text>
        </View>
        <Input placeholder="Name" value={name} onChangeText={setName} textContentType="name" />
        <Input
          placeholder="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          textContentType="emailAddress"
          value={email}
          onChangeText={setEmail}
        />
        <Input
          placeholder="Password"
          secureTextEntry
          textContentType="newPassword"
          value={password}
          onChangeText={setPassword}
        />
        <Button title="Sign up" onPress={submit} loading={busy} />
        <View style={{ alignItems: "center", marginTop: spacing.md }}>
          <Link href="/(auth)/login" style={{ color: colors.accent, ...type.callout }}>
            Already have an account? Sign in
          </Link>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
