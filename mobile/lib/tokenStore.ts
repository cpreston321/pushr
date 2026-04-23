import * as SecureStore from "expo-secure-store";

const key = (appId: string) => `pushr.token.${appId}`;

/**
 * Cache a source-app bearer token in iOS SecureStore so the user can re-copy
 * it later from the Apps list. Device-local only — never synced, and cleared
 * if the user uninstalls the app or revokes the token.
 */
export async function rememberToken(appId: string, token: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key(appId), token);
  } catch {
    // SecureStore can fail silently (e.g. locked keychain); not worth surfacing.
  }
}

export async function recallToken(appId: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key(appId));
  } catch {
    return null;
  }
}

export async function forgetToken(appId: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key(appId));
  } catch {
    // Already gone — ignore.
  }
}
