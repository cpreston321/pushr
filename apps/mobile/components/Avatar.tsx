import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/lib/theme';
import { appColor, appGradient, monogram } from '@/lib/appColor';
import { readableOn } from '@/lib/color';

type Props = {
  url: string | null | undefined;
  name: string;
  size?: number;
  /**
   * Stable key for the app's identity color — pass the source app id so a
   * rename doesn't change its color. Falls back to the name.
   */
  colorKey?: string | null;
};

/**
 * Source-app icon: a full circle — uploaded artwork when there is any,
 * otherwise a monogram on the app's own identity gradient.
 */
export function Avatar({ url, name, size = 44, colorKey }: Props) {
  const { ov } = useTheme();
  const corner = size / 2;

  if (url) {
    return (
      <Image
        source={{ uri: url }}
        style={{
          width: size,
          height: size,
          borderRadius: corner,
          backgroundColor: ov(0.06)
        }}
        contentFit="cover"
      />
    );
  }

  const base = appColor(colorKey ?? name);
  const [from, to] = appGradient(base);

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: corner,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <LinearGradient
        colors={[from, to]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <Text
        style={{
          fontSize: size * 0.34,
          fontWeight: '700',
          letterSpacing: -0.4,
          color: readableOn(to)
        }}
      >
        {monogram(name)}
      </Text>
    </View>
  );
}
