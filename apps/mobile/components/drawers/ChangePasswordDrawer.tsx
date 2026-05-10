import { forwardRef, useRef, useState } from 'react';
import { Alert, ScrollView, Text, TextInput, View } from 'react-native';
import { authClient } from '@/lib/auth-client';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { Drawer, useDrawer, type DrawerRef } from '@/components/Drawer';
import { DrawerHeader } from '@/components/DrawerHeader';
import { useTheme, spacing, type } from '@/lib/theme';
import { haptic } from '@/lib/haptics';

/**
 * Sheet-presented "Change password" form. Imperatively presented from
 * Settings via `ref.current?.present()`. Uses better-auth's
 * `changePassword` and revokes other sessions on success.
 */
export const ChangePasswordDrawer = forwardRef<DrawerRef>(
  function ChangePasswordDrawer(_props, ref) {
    return (
      <Drawer ref={ref} header={<HeaderShell />}>
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.md,
            paddingBottom: 60,
            gap: spacing.lg
          }}
          keyboardShouldPersistTaps="handled"
        >
          <ChangePasswordBody />
        </ScrollView>
      </Drawer>
    );
  }
);

function HeaderShell() {
  const { dismiss } = useDrawer();
  return <DrawerHeader title="Change Password" onClose={() => dismiss()} />;
}

function ChangePasswordBody() {
  const { colors } = useTheme();
  const { dismiss } = useDrawer();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
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
        revokeOtherSessions: true
      });
      if (error) {
        haptic.error();
        Alert.alert(
          "Couldn't change password",
          error.message ?? 'Please check your current password and try again.'
        );
        return;
      }
      haptic.success();
      Alert.alert(
        'Password updated',
        'Your password has been changed. Other sessions have been signed out.',
        [{ text: 'OK', onPress: () => dismiss() }]
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <View style={{ gap: spacing.xs, marginBottom: spacing.xs }}>
        <Text style={{ ...type.title2, color: colors.label }}>Update your password</Text>
        <Text style={{ ...type.subhead, color: colors.secondaryLabel }}>
          Enter your current password, then choose a new one. Other devices will be signed out.
        </Text>
      </View>

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
          <HelperText tone="warn">New password must be at least 8 characters.</HelperText>
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
        {mismatch && <HelperText tone="error">The two new passwords don't match.</HelperText>}
      </View>

      <Button
        title={busy ? 'Updating…' : 'Update password'}
        onPress={submit}
        disabled={!canSubmit}
        loading={busy}
      />
    </>
  );
}

function HelperText({ tone, children }: { tone: 'warn' | 'error'; children: React.ReactNode }) {
  const { colors } = useTheme();
  const color = tone === 'error' ? colors.destructive : colors.warning;
  return (
    <Text
      style={{
        ...type.footnote,
        color,
        paddingLeft: 4
      }}
    >
      {children}
    </Text>
  );
}
