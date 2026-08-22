import { Switch, type SwitchProps } from 'react-native';
import { useTheme } from '@/lib/theme';

/**
 * The app's switch. A bare RN `Switch` falls back to iOS system green for its
 * on-track, which reads as a different design language next to an accent the
 * user picked — so the on-track carries the accent instead, and the off-track a
 * neutral fill from the palette rather than the platform's own gray.
 *
 * Takes every `Switch` prop; the colors are defaults, so a caller that needs a
 * semantic color (green for "healthy", say) can still override them.
 */
export function Toggle(props: SwitchProps) {
  const { colors, ov } = useTheme();
  return (
    <Switch
      trackColor={{ false: ov(0.14), true: colors.accent }}
      ios_backgroundColor={ov(0.14)}
      style={{ alignSelf: 'center' }}
      {...props}
    />
  );
}
