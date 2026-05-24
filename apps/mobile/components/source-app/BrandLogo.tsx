import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

/**
 * Authentic Slack mark — the 4-color squircles arranged in a hashtag-like
 * cluster. Rendered as inline SVG so it scales cleanly and doesn't need a
 * native rebuild to swap in.
 *
 * Sits on a soft white pill so the brand colors read at small sizes against
 * any background — matches how Slack itself renders its icon in dark UIs.
 */
export function SlackLogo({ size = 32 }: { size?: number }) {
  const inner = size * 0.62;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <Svg width={inner} height={inner} viewBox="0 0 270 270">
        <Path
          fill="#E01E5A"
          d="M99.4,151.2c0,7.1-5.8,12.9-12.9,12.9c-7.1,0-12.9-5.8-12.9-12.9c0-7.1,5.8-12.9,12.9-12.9h12.9V151.2z M105.9,151.2c0-7.1,5.8-12.9,12.9-12.9c7.1,0,12.9,5.8,12.9,12.9v32.3c0,7.1-5.8,12.9-12.9,12.9c-7.1,0-12.9-5.8-12.9-12.9V151.2z"
        />
        <Path
          fill="#36C5F0"
          d="M118.8,99.4c-7.1,0-12.9-5.8-12.9-12.9c0-7.1,5.8-12.9,12.9-12.9c7.1,0,12.9,5.8,12.9,12.9v12.9H118.8z M118.8,105.9c7.1,0,12.9,5.8,12.9,12.9c0,7.1-5.8,12.9-12.9,12.9H86.5c-7.1,0-12.9-5.8-12.9-12.9c0-7.1,5.8-12.9,12.9-12.9H118.8z"
        />
        <Path
          fill="#2EB67D"
          d="M170.6,118.8c0-7.1,5.8-12.9,12.9-12.9c7.1,0,12.9,5.8,12.9,12.9c0,7.1-5.8,12.9-12.9,12.9h-12.9V118.8z M164.1,118.8c0,7.1-5.8,12.9-12.9,12.9c-7.1,0-12.9-5.8-12.9-12.9V86.5c0-7.1,5.8-12.9,12.9-12.9c7.1,0,12.9,5.8,12.9,12.9V118.8z"
        />
        <Path
          fill="#ECB22E"
          d="M151.2,170.6c7.1,0,12.9,5.8,12.9,12.9c0,7.1-5.8,12.9-12.9,12.9c-7.1,0-12.9-5.8-12.9-12.9v-12.9H151.2z M151.2,164.1c-7.1,0-12.9-5.8-12.9-12.9c0-7.1,5.8-12.9,12.9-12.9h32.3c7.1,0,12.9,5.8,12.9,12.9c0,7.1-5.8,12.9-12.9,12.9H151.2z"
        />
      </Svg>
    </View>
  );
}

/**
 * Authentic Discord mark — white wumpus silhouette on the brand blurple
 * (#5865F2). Squircle background to match other rounded brand chips in the
 * UI.
 */
export function DiscordLogo({ size = 32 }: { size?: number }) {
  const inner = size * 0.62;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: '#5865F2',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <Svg width={inner} height={inner} viewBox="0 0 71 55" fill="none">
        <Path
          fill="#FFFFFF"
          d="M60.105 4.898A58.55 58.55 0 0 0 45.653.415a.221.221 0 0 0-.232.111 40.784 40.784 0 0 0-1.803 3.7c-5.456-.817-10.886-.817-16.23 0-.485-1.164-1.201-2.587-1.828-3.7a.228.228 0 0 0-.233-.11A58.388 58.388 0 0 0 10.875 4.9a.207.207 0 0 0-.095.082C1.578 18.73-.944 32.144.293 45.39a.244.244 0 0 0 .093.167c6.073 4.46 11.955 7.167 17.729 8.962a.23.23 0 0 0 .249-.082 42.08 42.08 0 0 0 3.627-5.9.225.225 0 0 0-.123-.312 38.772 38.772 0 0 1-5.539-2.64.228.228 0 0 1-.022-.378c.372-.279.744-.569 1.1-.862a.22.22 0 0 1 .23-.031c11.619 5.304 24.198 5.304 35.68 0a.22.22 0 0 1 .233.028c.356.293.728.586 1.103.865a.228.228 0 0 1-.02.378 36.384 36.384 0 0 1-5.54 2.637.227.227 0 0 0-.121.315 47.249 47.249 0 0 0 3.624 5.897.225.225 0 0 0 .249.084c5.801-1.794 11.684-4.502 17.757-8.961a.228.228 0 0 0 .092-.164c1.48-15.315-2.48-28.618-10.497-40.412a.18.18 0 0 0-.093-.084Zm-36.38 32.427c-3.497 0-6.38-3.211-6.38-7.156 0-3.944 2.827-7.156 6.38-7.156 3.583 0 6.438 3.24 6.382 7.156 0 3.945-2.827 7.156-6.382 7.156Zm23.593 0c-3.498 0-6.38-3.211-6.38-7.156 0-3.944 2.826-7.156 6.38-7.156 3.582 0 6.437 3.24 6.38 7.156 0 3.945-2.798 7.156-6.38 7.156Z"
        />
      </Svg>
    </View>
  );
}

/** Brand colors — exported in case other surfaces need them. */
export const SLACK_BG = '#4A154B';
export const DISCORD_BG = '#5865F2';
