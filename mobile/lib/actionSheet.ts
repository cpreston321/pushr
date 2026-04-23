import { ActionSheetIOS, Alert, Platform } from "react-native";

type Option = {
  label: string;
  onPress?: () => void | Promise<void>;
  destructive?: boolean;
};

/**
 * Native iOS action sheet, falls back to Alert on Android.
 * `Cancel` is appended automatically.
 */
export function showActionSheet({
  title,
  message,
  options,
}: {
  title?: string;
  message?: string;
  options: Option[];
}) {
  if (Platform.OS === "ios") {
    const labels = [...options.map((o) => o.label), "Cancel"];
    const cancelButtonIndex = labels.length - 1;
    const destructiveButtonIndex = options.findIndex((o) => o.destructive);
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        message,
        options: labels,
        cancelButtonIndex,
        destructiveButtonIndex: destructiveButtonIndex >= 0 ? destructiveButtonIndex : undefined,
      },
      (idx) => {
        if (idx === cancelButtonIndex) return;
        options[idx]?.onPress?.();
      },
    );
    return;
  }
  // Android fallback
  Alert.alert(title ?? "", message, [
    ...options.map((o) => ({
      text: o.label,
      style: o.destructive ? ("destructive" as const) : ("default" as const),
      onPress: () => o.onPress?.(),
    })),
    { text: "Cancel", style: "cancel" as const },
  ]);
}
