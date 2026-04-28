import React, { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type TextInputProps,
} from "react-native";
import { useTheme, spacing, radius, type } from "@/lib/theme";
import { subscribePrompts } from "@/lib/prompt";

type ActiveRequest = {
  id: number;
  title: string;
  message?: string;
  defaultValue?: string;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  contentType?: TextInputProps["textContentType"];
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  resolve: (value: string | null) => void;
};

/**
 * Mounts at the root layout and renders a JS-backed prompt modal whenever
 * `promptText` is called on a platform without a native `Alert.prompt`
 * (i.e. anything other than iOS).
 */
export function PromptHost() {
  const { colors } = useTheme();
  const [active, setActive] = useState<ActiveRequest | null>(null);
  const [value, setValue] = useState("");
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    return subscribePrompts((req) => {
      setActive(req);
      setValue(req.defaultValue ?? "");
    });
  }, []);

  useEffect(() => {
    if (active) {
      // Defer so Modal mount completes before we try to focus.
      const t = setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [active]);

  function close(result: string | null) {
    if (!active) return;
    active.resolve(result);
    setActive(null);
    setValue("");
  }

  function confirm() {
    const trimmed = value.trim();
    close(trimmed.length > 0 ? trimmed : null);
  }

  return (
    <Modal
      visible={active !== null}
      animationType="fade"
      transparent
      onRequestClose={() => close(null)}
    >
      <KeyboardAvoidingView
        behavior="padding"
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.4)",
          alignItems: "center",
          justifyContent: "center",
          padding: spacing.xl,
        }}
      >
        <View
          style={{
            width: "100%",
            maxWidth: 360,
            backgroundColor: colors.cell,
            borderRadius: radius.lg,
            borderCurve: "continuous",
            padding: spacing.xl,
            gap: spacing.md,
            boxShadow: "0px 8px 24px rgba(0,0,0,0.25)",
          }}
        >
          {!!active?.title && (
            <Text style={{ ...type.headline, color: colors.label }}>
              {active.title}
            </Text>
          )}
          {!!active?.message && (
            <Text
              style={{ ...type.subhead, color: colors.secondaryLabel }}
            >
              {active.message}
            </Text>
          )}
          <TextInput
            ref={inputRef}
            value={value}
            onChangeText={setValue}
            onSubmitEditing={confirm}
            returnKeyType="done"
            placeholder={active?.placeholder}
            placeholderTextColor={colors.placeholder}
            keyboardType={active?.keyboardType}
            textContentType={active?.contentType}
            style={{
              backgroundColor: colors.fill,
              color: colors.label,
              paddingHorizontal: spacing.md,
              paddingVertical: 12,
              borderRadius: radius.md,
              borderCurve: "continuous",
              fontSize: type.body.fontSize,
            }}
          />
          <View
            style={{
              flexDirection: "row",
              gap: spacing.sm,
              marginTop: spacing.xs,
            }}
          >
            <Pressable
              onPress={() => close(null)}
              style={({ pressed }) => ({
                flex: 1,
                paddingVertical: 12,
                borderRadius: radius.md,
                borderCurve: "continuous",
                alignItems: "center",
                backgroundColor: pressed ? colors.cellHighlight : colors.fill,
              })}
            >
              <Text style={{ ...type.callout, color: colors.label }}>
                {active?.cancelLabel ?? "Cancel"}
              </Text>
            </Pressable>
            <Pressable
              onPress={confirm}
              style={({ pressed }) => ({
                flex: 1,
                paddingVertical: 12,
                borderRadius: radius.md,
                borderCurve: "continuous",
                alignItems: "center",
                backgroundColor: active?.destructive
                  ? colors.destructive
                  : pressed
                    ? colors.accent
                    : colors.accent,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text
                style={{
                  ...type.callout,
                  color: colors.accentContrast,
                  fontWeight: "600",
                }}
              >
                {active?.confirmLabel ?? "Save"}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
