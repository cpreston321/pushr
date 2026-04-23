import * as ImagePicker from "expo-image-picker";
import type { Id } from "../../convex/_generated/dataModel";

export type LogoPickResult =
  | { ok: true; storageId: Id<"_storage">; localUri: string }
  | { ok: false; reason: string };

/**
 * Pick an image from the library, POST it to a Convex-generated upload URL,
 * and return the resulting `_storage` id. Caller is responsible for linking
 * that id to a sourceApp via the `setLogo` mutation.
 */
export async function pickAndUploadLogo(uploadUrl: string): Promise<LogoPickResult> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    return { ok: false, reason: "Photo library permission denied" };
  }

  const pick = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
    base64: false,
  });
  if (pick.canceled) return { ok: false, reason: "Canceled" };

  const asset = pick.assets[0];
  const fileUri = asset.uri;
  const mimeType = asset.mimeType ?? "image/jpeg";

  const blob = await (await fetch(fileUri)).blob();
  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": mimeType },
    body: blob,
  });
  if (!res.ok) {
    return { ok: false, reason: `Upload failed: ${res.status}` };
  }
  const json = (await res.json()) as { storageId: Id<"_storage"> };
  return { ok: true, storageId: json.storageId, localUri: fileUri };
}
