import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { Image } from 'expo-image';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useTheme, spacing, radius, type } from '@/lib/theme';
import { haptic } from '@/lib/haptics';
import {
  detectProvider,
  getProviderMeta,
  type Provider,
} from '@/lib/providerDetection';
import type { FeedItem } from '@/lib/feed-helpers';
import type { NotifAction } from '@pushr/backend/lib/actionsLayout';

type Props = {
  item: FeedItem;
  /** Whether the body is currently expanded (for generic long bodies) */
  bodyExpanded?: boolean;
  onToggleBodyExpanded?: () => void;
  /** Optional: rich cards can render their own trailing affordance */
  showTrailing?: boolean;
};

/**
 * The differentiated "content" portion of a notification row.
 * FeedRow owns the container, avatar, swipe, press handling, and ActionButtonsBar.
 * This component renders the title, contextual body, badges, ack banner, etc.
 *
 * For known providers we render richer, more scannable representations.
 * Everything falls back gracefully to a polished generic treatment.
 */
export function NotificationContent({
  item,
  bodyExpanded = false,
  onToggleBodyExpanded,
  showTrailing = true,
}: Props) {
  const { colors, tintBg } = useTheme();
  const provider = detectProvider(item);
  const meta = getProviderMeta(provider);

  // For generic long bodies we still support expand/collapse.
  // Rich cards usually have more structured content so we show more by default.
  const [localExpanded, setLocalExpanded] = useState(false);
  const isExpanded = bodyExpanded || localExpanded;

  const handleToggleExpand = () => {
    haptic.selection();
    if (onToggleBodyExpanded) {
      onToggleBodyExpanded();
    } else {
      setLocalExpanded((v) => !v);
    }
  };

  const hasLongBody =
    !item.liveActivity && item.body && item.body.length > 120;

  // ------------------------------------------------------------------
  // Provider-specific rendering
  // ------------------------------------------------------------------

  if (provider === 'github') {
    return renderGitHubContent({
      item,
      colors,
      tintBg,
      meta,
      isExpanded,
      onToggleExpand: hasLongBody ? handleToggleExpand : undefined,
      showTrailing,
    });
  }

  if (provider === 'sentry') {
    return renderSentryContent({
      item,
      colors,
      tintBg,
      meta,
      isExpanded,
      onToggleExpand: hasLongBody ? handleToggleExpand : undefined,
      showTrailing,
    });
  }

  // ------------------------------------------------------------------
  // Generic / fallback (improved from original)
  // ------------------------------------------------------------------
  return (
    <View style={{ flex: 1 }}>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'baseline',
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            flex: 1,
          }}
        >
          <Text
            style={{ ...type.footnote, color: colors.secondaryLabel }}
            numberOfLines={1}
          >
            {item.sourceAppName}
          </Text>
          {item.liveActivity && (
            <LiveActivityBadge action={item.liveActivity.action} />
          )}
        </View>
        <Text style={{ ...type.caption1, color: colors.tertiaryLabel }}>
          {formatRelative(item.createdAt)}
        </Text>
      </View>

      <Text
        style={{ ...type.headline, color: colors.label, marginTop: 1 }}
        numberOfLines={1}
      >
        {item.title}
      </Text>

      {item.liveActivity ? (
        <LiveActivityBody state={item.liveActivity.state} />
      ) : (
        <>
          <Text
            style={{
              ...type.subhead,
              color: colors.secondaryLabel,
              marginTop: 1,
            }}
            numberOfLines={isExpanded ? undefined : 2}
          >
            {item.body}
          </Text>

          {hasLongBody && (
            <Pressable
              onPress={handleToggleExpand}
              hitSlop={10}
              style={({ pressed }) => ({
                marginTop: 4,
                alignSelf: 'flex-start',
                opacity: pressed ? 0.5 : 1,
              })}
              accessibilityRole="button"
              accessibilityLabel={isExpanded ? 'Show less' : 'Show more'}
            >
              <Text
                style={{
                  ...type.footnote,
                  color: colors.accent,
                  fontWeight: '600',
                }}
              >
                {isExpanded ? 'Show less' : 'Show more'}
              </Text>
            </Pressable>
          )}
        </>
      )}

      {item.ack && !item.acknowledgedAt && (
        <AckBanner item={item} colors={colors} tintBg={tintBg} />
      )}

      {showTrailing && item.image && (
        <Image
          source={{ uri: item.image }}
          style={{
            width: 56,
            height: 56,
            borderRadius: radius.md,
            backgroundColor: colors.fill,
            marginTop: spacing.sm,
          }}
          contentFit="cover"
          transition={150}
          accessibilityIgnoresInvertColors
        />
      )}
    </View>
  );
}

// ------------------------------------------------------------------
// GitHub rich treatment
// ------------------------------------------------------------------
function renderGitHubContent({
  item,
  colors,
  tintBg,
  meta,
  isExpanded,
  onToggleExpand,
  showTrailing,
}: {
  item: FeedItem;
  colors: any;
  tintBg: any;
  meta: { label: string; tint?: string };
  isExpanded: boolean;
  onToggleExpand?: () => void;
  showTrailing: boolean;
}) {
  const data = (item.data ?? {}) as Record<string, any>;
  const event = data.event || item.webhookEventType || 'event';
  const repo = data.repo || item.sourceAppName;

  // Try to extract nice context from title/body
  const prMatch = item.title.match(/#(\d+)/);
  const prNumber = prMatch ? prMatch[1] : null;

  const state = (data.state || '').toLowerCase();
  const isMerged = state.includes('merged') || item.title.toLowerCase().includes('merged');

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text
          style={{ ...type.footnote, color: colors.secondaryLabel, fontWeight: '600' }}
          numberOfLines={1}
        >
          {repo}
        </Text>
        <View
          style={{
            paddingHorizontal: 6,
            paddingVertical: 1,
            borderRadius: 4,
            backgroundColor: tintBg(colors.label, '18'),
          }}
        >
          <Text
            style={{
              ...type.caption2,
              color: colors.secondaryLabel,
              fontWeight: '700',
              letterSpacing: 0.3,
            }}
          >
            {event.toUpperCase()}
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
        <Text
          style={{ ...type.headline, color: colors.label, flexShrink: 1 }}
          numberOfLines={1}
        >
          {item.title.replace(/^[^:]+:\s*/, '')}
        </Text>

        {prNumber && (
          <View
            style={{
              paddingHorizontal: 7,
              paddingVertical: 2,
              borderRadius: 6,
              backgroundColor: isMerged ? '#238636' : colors.accent,
            }}
          >
            <Text
              style={{
                color: '#fff',
                fontSize: 11,
                fontWeight: '700',
                letterSpacing: 0.2,
              }}
            >
              #{prNumber}
            </Text>
          </View>
        )}
      </View>

      <Text
        style={{ ...type.subhead, color: colors.secondaryLabel, marginTop: 2 }}
        numberOfLines={isExpanded ? undefined : 2}
      >
        {item.body}
      </Text>

      {onToggleExpand && item.body.length > 100 && (
        <Pressable
          onPress={onToggleExpand}
          hitSlop={8}
          style={{ marginTop: 3, alignSelf: 'flex-start' }}
        >
          <Text
            style={{ ...type.footnote, color: colors.accent, fontWeight: '600' }}
          >
            {isExpanded ? 'Show less' : 'Show more'}
          </Text>
        </Pressable>
      )}

      {item.ack && !item.acknowledgedAt && (
        <AckBanner item={item} colors={colors} tintBg={tintBg} />
      )}
    </View>
  );
}

// ------------------------------------------------------------------
// Sentry rich treatment (error-focused)
// ------------------------------------------------------------------
function renderSentryContent({
  item,
  colors,
  tintBg,
  meta,
  isExpanded,
  onToggleExpand,
  showTrailing,
}: any) {
  const data = (item.data ?? {}) as Record<string, any>;
  const level = (data.level || item.webhookEventType || '').toLowerCase();

  const levelColor =
    level === 'fatal' || level === 'error' ? colors.destructive :
    level === 'warning' ? '#FF9F0A' : colors.secondaryLabel;

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={{ ...type.footnote, color: colors.secondaryLabel }}>
          {item.sourceAppName}
        </Text>
        <View
          style={{
            paddingHorizontal: 6,
            paddingVertical: 1,
            borderRadius: 4,
            backgroundColor: tintBg(levelColor, '22'),
          }}
        >
          <Text
            style={{
              ...type.caption2,
              color: levelColor,
              fontWeight: '700',
              textTransform: 'uppercase',
            }}
          >
            {level || 'error'}
          </Text>
        </View>
      </View>

      <Text
        style={{ ...type.headline, color: colors.label, marginTop: 1 }}
        numberOfLines={1}
      >
        {item.title}
      </Text>

      <Text
        style={{ ...type.subhead, color: colors.secondaryLabel, marginTop: 2 }}
        numberOfLines={isExpanded ? undefined : 2}
      >
        {item.body}
      </Text>

      {onToggleExpand && (
        <Pressable onPress={onToggleExpand} style={{ marginTop: 3, alignSelf: 'flex-start' }}>
          <Text style={{ ...type.footnote, color: colors.accent, fontWeight: '600' }}>
            {isExpanded ? 'Show less' : 'Show more'}
          </Text>
        </Pressable>
      )}

      {item.ack && !item.acknowledgedAt && (
        <AckBanner item={item} colors={colors} tintBg={tintBg} />
      )}
    </View>
  );
}

// ------------------------------------------------------------------
// Small shared pieces (we can move these to shared files later)
// ------------------------------------------------------------------
function AckBanner({ item, colors, tintBg }: any) {
  return (
    <View
      style={{
        marginTop: 6,
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: radius.md,
        backgroundColor: tintBg(colors.destructive),
      }}
    >
      <SymbolView name="bell.badge" size={11} tintColor={colors.destructive} />
      <Text
        style={{ ...type.caption2, color: colors.destructive, fontWeight: '600' }}
      >
        {item.ack.attempts > 0
          ? `Ack needed · re-alerted ${item.ack.attempts}×`
          : 'Ack needed'}
      </Text>
    </View>
  );
}

export function LiveActivityBadge({ action }: { action: 'start' | 'update' | 'end' }) {
  const { colors, tintBg } = useTheme();
  const ended = action === 'end';
  const label = ended ? 'Activity ended' : 'Live Activity';
  const tint = ended ? colors.tertiaryLabel : colors.accent;
  const bg = ended ? colors.fill : tintBg(colors.accent, '1F');

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
        backgroundColor: bg,
      }}
    >
      <View
        style={{
          width: 5,
          height: 5,
          borderRadius: 2.5,
          backgroundColor: tint,
          opacity: ended ? 0.6 : 1,
        }}
      />
      <Text
        style={{
          ...type.caption2,
          color: tint,
          fontWeight: '700',
          letterSpacing: 0.2,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

export function LiveActivityBody({ state }: { state: any }) {
  const { colors } = useTheme();
  const hasProgress = typeof state.progress === 'number';
  const pct = hasProgress ? Math.max(0, Math.min(1, state.progress)) : 0;

  return (
    <View style={{ marginTop: 4, gap: 6 }}>
      {(state.icon || state.status) && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {state.icon && (
            <SymbolView
              name={state.icon as any}
              size={13}
              tintColor={colors.secondaryLabel}
            />
          )}
          {state.status && (
            <Text
              style={{ ...type.subhead, color: colors.secondaryLabel, flex: 1 }}
              numberOfLines={1}
            >
              {state.status}
            </Text>
          )}
          {hasProgress && (
            <Text
              style={{
                ...type.caption1,
                color: colors.tertiaryLabel,
                fontVariant: ['tabular-nums'],
              }}
            >
              {Math.round(pct * 100)}%
            </Text>
          )}
        </View>
      )}

      {hasProgress && (
        <View
          style={{
            height: 4,
            borderRadius: 2,
            backgroundColor: colors.fill,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              width: `${pct * 100}%`,
              height: 4,
              backgroundColor: colors.accent,
              borderRadius: 2,
            }}
          />
        </View>
      )}
    </View>
  );
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  return `${d}d`;
}
