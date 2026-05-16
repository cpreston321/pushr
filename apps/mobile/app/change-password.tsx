import { useRef, useState } from "react";
import { Alert, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { authClient } from "@/lib/auth-client";
import { Input } from "@/components/Input";
import { SheetContainer } from "@/components/SheetContainer";
import { SheetActionPill, SheetHeader } from "@/components/SheetHeader";
import { useTheme, spacing, type } from "@/lib/theme";
import { haptic } from "@/lib/haptics";

/**
 * formSheet route presented from Settings → Change password. Replaces the
 * imperative `ChangePasswordDrawer` ref API with a navigation push: callers
 * just `router.push('/change-password')` and dismiss via `router.back()` or
 * the system grabber.
 */
export default function ChangePasswordScreen() {
  const { colors } = useTheme();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const nextRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const tooShort = next.length > 0 && next.length < 8;
  const mismatch = confirm.length > 0 && next !== confirm;
  const canSubmit = !!current && next.length >= 8 && next === confirm && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    try {
      const { error } = await authClient().changePassword({
        currentPassword: current,
        newPassword: next,
        revokeOtherSessions: true,
      });
      if (error) {
        haptic.error();
        Alert.alert(
          "Couldn't change password",
          error.message ?? "Please check your current password and try again.",
        );
        return;
      }
      haptic.success();
      Alert.alert(
        "Password updated",
        "Your password has been changed. Other sessions have been signed out.",
        [{ text: "OK", onPress: () => router.back() }],
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.sheet }}>
      <SheetHeader
        title="Change Password"
        trailing={
          <SheetActionPill
            label="Update"
            onPress={submit}
            disabled={!canSubmit}
            loading={busy}
          />
        }
      />
      <SheetContainer
        scrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: spacing.md, gap: spacing.lg }}
      >
        <Text style={{ ...type.subhead, color: colors.secondaryLabel }}>
          Enter your current password, then choose a new one. Other devices will
          be signed out.
        </Text>

        <View style={{ gap: spacing.md }}>
          <Input
            label="Current password"
            placeholder="Current password"
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            value={current}
            onChangeText={setCurrent}
            returnKeyType="next"
            onSubmitEditing={() => nextRef.current?.focus()}
            submitBehavior="submit"
          />
          <Input
            ref={nextRef}
            label="New password"
            placeholder="At least 8 characters"
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            passwordRules="minlength: 8;"
            value={next}
            onChangeText={setNext}
            returnKeyType="next"
            onSubmitEditing={() => confirmRef.current?.focus()}
            submitBehavior="submit"
          />
          {tooShort && (
            <HelperText tone="warn">
              New password must be at least 8 characters.
            </HelperText>
          )}
          <Input
            ref={confirmRef}
            label="Confirm new password"
            placeholder="Re-enter new password"
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            value={confirm}
            onChangeText={setConfirm}
            returnKeyType="done"
            onSubmitEditing={submit}
          />
          {mismatch && (
            <HelperText tone="error">
              The two new passwords don't match.
            </HelperText>
          )}
        </View>
      </SheetContainer>
    </View>
  );
}

function HelperText({
  tone,
  children,
}: {
  tone: "warn" | "error";
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  const color = tone === "error" ? colors.destructive : colors.warning;
  return (
    <Text
      style={{
        ...type.footnote,
        color,
        paddingLeft: 4,
      }}
    >
      {children}
    </Text>
  );
}
