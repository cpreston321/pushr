import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export const PUSHR_CATEGORY = "pushr.default";
export const PUSHR_ACTION_CATEGORY = "pushr.action";

/**
 * Registers the notification categories (iOS lock-screen actions) that the
 * server stamps onto delivered pushes via `categoryId`. Safe to call multiple
 * times.
 *
 *   pushr.default                 — baseline: Mark read, Open
 *   pushr.action                  — legacy single-action category (back-compat)
 *   pushr.acts.1 … pushr.acts.4   — N numbered action buttons
 *   pushr.acts.reply              — reply only
 *   pushr.acts.reply.1 … .3       — reply + N action buttons
 *
 * iOS requires categories to be pre-registered; we can't send dynamic
 * labels over the wire. The on-device feed UI renders the real labels from
 * `data.actions`; the lockscreen banner shows the generic placeholders.
 */
const ACTS_REGISTRATIONS: Array<{
  id: string;
  actions: Notifications.NotificationAction[];
}> = [];

for (let n = 1; n <= 4; n++) {
  const actionButtons: Notifications.NotificationAction[] = [];
  for (let i = 1; i <= n; i++) {
    actionButtons.push({
      identifier: `act_${i}`,
      buttonTitle: `Action ${i}`,
      options: { opensAppToForeground: false },
    });
  }
  ACTS_REGISTRATIONS.push({ id: `pushr.acts.${n}`, actions: actionButtons });
}

const REPLY_BUTTON: Notifications.NotificationAction = {
  identifier: "reply",
  buttonTitle: "Reply",
  textInput: { submitButtonTitle: "Send", placeholder: "Reply…" },
  options: { opensAppToForeground: false },
};

ACTS_REGISTRATIONS.push({ id: "pushr.acts.reply", actions: [REPLY_BUTTON] });
for (let n = 1; n <= 3; n++) {
  const buttons: Notifications.NotificationAction[] = [REPLY_BUTTON];
  for (let i = 1; i <= n; i++) {
    buttons.push({
      identifier: `act_${i}`,
      buttonTitle: `Action ${i}`,
      options: { opensAppToForeground: false },
    });
  }
  ACTS_REGISTRATIONS.push({ id: `pushr.acts.reply.${n}`, actions: buttons });
}

void Promise.all([
  Notifications.setNotificationCategoryAsync(PUSHR_CATEGORY, [
    {
      identifier: "mark_read",
      buttonTitle: "Mark read",
      options: { opensAppToForeground: false },
    },
    {
      identifier: "open_link",
      buttonTitle: "Open",
      options: { opensAppToForeground: true },
    },
  ]),
  Notifications.setNotificationCategoryAsync(PUSHR_ACTION_CATEGORY, [
    {
      identifier: "open_action_url",
      buttonTitle: "Action",
      options: { opensAppToForeground: true },
    },
    {
      identifier: "mark_read",
      buttonTitle: "Mark read",
      options: { opensAppToForeground: false },
    },
  ]),
  ...ACTS_REGISTRATIONS.map((r) =>
    Notifications.setNotificationCategoryAsync(r.id, r.actions),
  ),
]).catch(() => {
  // Expo Go doesn't fully support setting categories; swallow errors so app
  // startup isn't blocked.
});

export async function setBadge(count: number): Promise<void> {
  try {
    await Notifications.setBadgeCountAsync(count);
  } catch {
    // Not fatal — some platforms / Expo Go can reject this.
  }
}

export type RegistrationResult =
  | { ok: true; token: string; platform: "ios" | "android"; model: string; osVersion: string }
  | { ok: false; reason: string };

/**
 * Ask for push permission and resolve an Expo push token for this device.
 * Returns `ok: false` with a human-readable reason if we can't get one —
 * e.g. running on a simulator, user declined, or Expo project id missing.
 */
export async function registerForPushAsync(): Promise<RegistrationResult> {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  if (!Device.isDevice) {
    return { ok: false, reason: "Push requires a physical device (simulators don't receive APNs)" };
  }

  const perms = await Notifications.getPermissionsAsync();
  let granted = perms.granted || perms.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  if (!granted) {
    const request = await Notifications.requestPermissionsAsync();
    granted = request.granted;
  }
  if (!granted) {
    return { ok: false, reason: "Notification permission denied" };
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID;

  try {
    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    return {
      ok: true,
      token: tokenResponse.data,
      platform: Platform.OS === "ios" ? "ios" : "android",
      model: Device.modelName ?? "unknown",
      osVersion: Device.osVersion ?? "unknown",
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: msg };
  }
}
