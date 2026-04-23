/**
 * Registry of sound options shown in Settings.
 *
 * `value` is exactly what gets sent to Expo Push as the `sound` field:
 *   - `null`      → silent (no sound plays)
 *   - `"default"` → iOS system default alert sound
 *   - `"x.caf"`   → custom sound bundled via the expo-notifications config
 *                   plugin. Drop the file into mobile/assets/sounds/ and add
 *                   its path to the `sounds` array in app.json, then rebuild
 *                   the dev client. Expo Go will not play custom sounds.
 */
export type Sound = {
  id: string;
  label: string;
  value: string | null;
};

export const SOUNDS: Sound[] = [
  { id: "silent", label: "Silent", value: null },
  { id: "default", label: "Default", value: "default" },
  // Add more entries here after registering a .caf file in app.json, e.g.:
  // { id: "chime", label: "Chime", value: "chime.caf" },
];

export function soundLabel(value: string | null): string {
  if (value === null) return "Silent";
  const match = SOUNDS.find((s) => s.value === value);
  return match?.label ?? value;
}
