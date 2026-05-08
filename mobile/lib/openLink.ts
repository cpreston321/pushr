import { Linking } from "react-native";

/**
 * Open a notification's tap target. Tries `appUrl` first (deep-link / custom
 * scheme) and falls back to `url` (typically a web URL) if the device has no
 * handler registered for the deep-link.
 *
 * Why try-and-catch instead of `Linking.canOpenURL`:
 * iOS only reports `canOpenURL` as `true` for schemes declared in this app's
 * `LSApplicationQueriesSchemes`, which we can't enumerate up-front for every
 * destination app or PWA shortcut a user might point at. `openURL` rejects
 * cleanly when no handler exists, so we let it try and fall back on failure.
 *
 * Usage: `await openLink({ appUrl: "shortcuts://run-shortcut?name=MyPWA",
 *                          url: "https://mypwa.example.com" })`
 */
export async function openLink(opts: {
  appUrl?: string | null;
  url?: string | null;
}): Promise<boolean> {
  if (opts.appUrl) {
    try {
      await Linking.openURL(opts.appUrl);
      return true;
    } catch {
      // Custom-scheme handler not installed — fall through to the web URL.
    }
  }
  if (opts.url) {
    try {
      await Linking.openURL(opts.url);
      return true;
    } catch {
      // Nothing handled the URL; caller can decide whether to surface this.
    }
  }
  return false;
}
