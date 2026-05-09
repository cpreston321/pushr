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
  // Custom palette — synthesized originals, see mobile/scripts/synth-sounds.py.
  // Bundled via the expo-notifications plugin entry in app.json; rebuild the
  // dev client after adding new ones (Expo Go can't play these).
  { id: "pulse", label: "Pulse", value: "pulse.caf" },
  { id: "wire", label: "Wire", value: "wire.caf" },
  { id: "tap", label: "Tap", value: "tap.caf" },
  { id: "bell", label: "Bell", value: "bell.caf" },
  { id: "escalate", label: "Escalate", value: "escalate.caf" },
  { id: "klaxon", label: "Klaxon", value: "klaxon.caf" },
];

export function soundLabel(value: string | null): string {
  if (value === null) return "Silent";
  const match = SOUNDS.find((s) => s.value === value);
  return match?.label ?? value;
}
