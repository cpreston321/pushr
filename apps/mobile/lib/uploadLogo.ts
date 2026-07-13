import * as ImagePicker from 'expo-image-picker';
import { File, UploadType } from 'expo-file-system';
import type { Id } from '@pushr/backend/_generated/dataModel';

export type LogoPickResult =
  | { ok: true; storageId: Id<'_storage'>; localUri: string }
  | { ok: false; reason: string };

/**
 * Pick an image from the library, POST it to a Convex-generated upload URL,
 * and return the resulting `_storage` id. Caller is responsible for linking
 * that id to a sourceApp via the `setLogo` mutation.
 */
export async function pickAndUploadLogo(uploadUrl: string): Promise<LogoPickResult> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    return { ok: false, reason: 'Photo library permission denied' };
  }

  const pick = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
    base64: false
  });
  if (pick.canceled) return { ok: false, reason: 'Canceled' };

  const asset = pick.assets[0];
  const fileUri = asset.uri;
  const mimeType = asset.mimeType ?? 'image/jpeg';

  try {
    // Upload the raw bytes straight from the file URI. React Native's `fetch`
    // can't reliably read a `file://` URI or send a `Blob` body, so we use the
    // native binary uploader instead.
    const res = await new File(fileUri).upload(uploadUrl, {
      httpMethod: 'POST',
      uploadType: UploadType.BINARY_CONTENT,
      mimeType,
      headers: { 'Content-Type': mimeType }
    });
    if (res.status < 200 || res.status >= 300) {
      return { ok: false, reason: `Upload failed: ${res.status}` };
    }
    const json = JSON.parse(res.body) as { storageId: Id<'_storage'> };
    return { ok: true, storageId: json.storageId, localUri: fileUri };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : 'Upload failed'
    };
  }
}
