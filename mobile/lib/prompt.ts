import {
  Alert,
  type AlertButton,
  type KeyboardTypeOptions,
  type TextInputProps,
} from "react-native";

type TextContentType = TextInputProps["textContentType"];

/**
 * Cross-platform single-line text prompt.
 *
 * On iOS we use the native `Alert.prompt`. On Android (and any other
 * platform that doesn't ship `Alert.prompt`) we fall back to a JS modal
 * mounted by `<PromptHost />` at the root layout.
 *
 * Resolves with the trimmed input string when the user confirms, or `null`
 * if they cancel / dismiss. Returning `""` is impossible — we treat empty
 * confirms as cancels because every caller in this app rejects empty input
 * anyway.
 */
export type PromptOptions = {
  title: string;
  message?: string;
  defaultValue?: string;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  // iOS-only — used as the secureTextEntry hint and the input type.
  // Maps to TextInput's `textContentType` on Android.
  contentType?: TextContentType;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  // True for short single-tap interactions like "Rename". On iOS this maps
  // to the `plain-text` style; we ignore it on Android.
  autoFocus?: boolean;
};

let nextRequestId = 1;
type Listener = (req: PromptRequest) => void;
const listeners: Set<Listener> = new Set();

type PromptRequest = PromptOptions & {
  id: number;
  resolve: (value: string | null) => void;
};

/** Subscribe to prompt requests — used by `<PromptHost />`. */
export function subscribePrompts(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Show a text prompt and resolve with the user's input, or null if they
 * cancelled. Use on rename / "Invite by email" flows that previously called
 * `Alert.prompt` directly (which crashes on Android).
 */
export function promptText(opts: PromptOptions): Promise<string | null> {
  if (process.env.EXPO_OS === "ios" && typeof Alert.prompt === "function") {
    return new Promise((resolve) => {
      const buttons: AlertButton[] = [
        {
          text: opts.cancelLabel ?? "Cancel",
          style: "cancel",
          onPress: () => resolve(null),
        },
        {
          text: opts.confirmLabel ?? "Save",
          style: opts.destructive ? "destructive" : "default",
          onPress: (value?: string) => {
            const trimmed = value?.trim();
            resolve(trimmed && trimmed.length > 0 ? trimmed : null);
          },
        },
      ];
      Alert.prompt(
        opts.title,
        opts.message,
        buttons,
        "plain-text",
        opts.defaultValue ?? "",
        opts.keyboardType,
      );
    });
  }
  return new Promise((resolve) => {
    const req: PromptRequest = {
      ...opts,
      id: nextRequestId++,
      resolve,
    };
    if (listeners.size === 0) {
      // No host mounted — fall back to a no-op cancel rather than hang.
      console.warn(
        "[promptText] PromptHost not mounted; resolving as cancel",
      );
      resolve(null);
      return;
    }
    for (const l of listeners) l(req);
  });
}
