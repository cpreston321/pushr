import { useQuery, useMutation, useAction } from 'convex/react';
import { api } from '@pushr/backend/_generated/api';
import type { FunctionReturnType } from 'convex/server';
import type { NotifAction } from '@pushr/backend/lib/actionsLayout';
import type { Id } from '@pushr/backend/_generated/dataModel';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, {
  Easing,
  Extrapolation,
  FadeIn,
  FadeOut,
  interpolate,
  interpolateColor,
  LinearTransition,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
  type SharedValue
} from 'react-native-reanimated';
import { SymbolView } from 'expo-symbols';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader, ScreenBody } from '@/components/ScreenHeader';
import { ScreenTransition } from '@/components/ScreenTransition';
import { Avatar } from '@/components/Avatar';
import { useTheme, spacing, radius, type } from '@/lib/theme';
import { haptic } from '@/lib/haptics';
import { promptText } from '@/lib/prompt';
import { openLink } from '@/lib/openLink';
import { formatRelative, groupFeedItems, type FeedItem, type FeedEntry } from '@/lib/feed-helpers';

// Distance (px) the row must travel before a release auto-fires delete.
// Smaller = more sensitive. We want a deliberate full swipe.
const FULL_SWIPE_THRESHOLD = 140;

const FEED_PAGE_SIZE = 100;
// Server caps at 500; mirror it so the client knows when to hide "Load older".
const FEED_MAX = 500;

export default function Feed() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ notif?: string }>();
  const [limit, setLimit] = useState(FEED_PAGE_SIZE);
  const items = useQuery(api.notifications.listMine, { limit });
  const markRead = useMutation(api.notifications.markRead);
  const markAllRead = useMutation(api.notifications.markAllRead);
  const deleteOne = useMutation(api.notifications.deleteOne);
  const clearAll = useMutation(api.notifications.clearAll);
  const [search, setSearch] = useState('');
  const [filterAppId, setFilterAppId] = useState<string | null>(null);
  const canLoadMore = items != null && items.length === limit && limit < FEED_MAX;

  const unreadCount = items?.filter((i) => !i.readAt).length ?? 0;
  const total = items?.length ?? 0;

  const sourceApps = (() => {
    if (!items) return [] as { id: string; name: string; logoUrl: string | null }[];
    const seen = new Map<string, { id: string; name: string; logoUrl: string | null }>();
    for (const n of items) {
      const id = n.sourceAppId as unknown as string;
      if (!seen.has(id)) {
        seen.set(id, {
          id,
          name: n.sourceAppName,
          logoUrl: n.sourceAppLogoUrl ?? null
        });
      }
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  })();

  const filtered = (() => {
    if (!items) return items;
    const q = search.trim().toLowerCase();
    return items.filter((n) => {
      if (filterAppId && (n.sourceAppId as unknown as string) !== filterAppId) {
        return false;
      }
      if (!q) return true;
      return (
        n.title.toLowerCase().includes(q) ||
        n.body.toLowerCase().includes(q) ||
        n.sourceAppName.toLowerCase().includes(q)
      );
    });
  })();

  // Deep-link target from the Home Screen widget (pushr://feed?notif=<id>).
  // We wait for `items` to load so we can resolve the row's url/appUrl
  // before opening, then strip the param so navigating away and back
  // doesn't re-trigger the open.
  const consumedNotifRef = useRef<string | null>(null);
  useEffect(() => {
    const target = params.notif;
    if (!target || items === undefined) return;
    if (consumedNotifRef.current === target) return;
    consumedNotifRef.current = target;
    const hit = items.find((n) => (n._id as unknown as string) === target);
    if (hit) {
      if (!hit.readAt) markRead({ id: hit._id });
      if (hit.url || hit.appUrl) {
        void openLink({ appUrl: hit.appUrl, url: hit.url });
      }
    }
    router.setParams({ notif: undefined });
  }, [params.notif, items, markRead, router]);

  // The actual destructive op — the FloatingBar handles its own two-tap
  // confirm UX, so we just commit on demand.
  const handleClear = useCallback(() => {
    haptic.warning();
    clearAll({});
  }, [clearAll]);

  const header = (
    <ScreenHeader
      eyebrow={
        total > 0
          ? unreadCount > 0
            ? `${unreadCount} unread`
            : `${total} ${total === 1 ? 'item' : 'items'}`
          : `0 items`
      }
      title="Feed"
    />
  );

  if (items === undefined) {
    return (
      <ScreenTransition style={{ backgroundColor: colors.background }}>
        {header}
        <ScreenBody>
          <View
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              paddingTop: spacing.xxl
            }}
          >
            <ActivityIndicator color={colors.accent} />
          </View>
        </ScreenBody>
      </ScreenTransition>
    );
  }

  if (items.length === 0) {
    return (
      <ScreenTransition style={{ backgroundColor: colors.background }}>
        {header}
        <ScreenBody>
          <EmptyState />
        </ScreenBody>
      </ScreenTransition>
    );
  }

  const pendingAckCount = items?.filter((i) => i.ack && !i.acknowledgedAt).length ?? 0;

  const entries = useMemo(() => groupFeedItems(filtered ?? undefined), [filtered]);

  return (
    <ScreenTransition style={{ backgroundColor: colors.background }}>
      {header}
      <ScreenBody>
        <FlatList
          data={entries}
          keyExtractor={(e) => (e.kind === 'group' ? `g:${e.activityId}` : e.item._id)}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{
            paddingTop: spacing.md,
            paddingBottom: Math.max(160, insets.bottom + 100)
          }}
          ListHeaderComponent={
            <FeedToolbar
              search={search}
              onSearchChange={setSearch}
              sourceApps={sourceApps}
              filterAppId={filterAppId}
              onFilterChange={setFilterAppId}
              pendingAckCount={pendingAckCount}
            />
          }
          ListEmptyComponent={
            <View
              style={{
                paddingTop: spacing.xxl,
                alignItems: 'center',
                gap: spacing.sm
              }}
            >
              <SymbolView name="magnifyingglass" size={32} tintColor={colors.tertiaryLabel} />
              <Text style={{ ...type.subhead, color: colors.secondaryLabel }}>No matches</Text>
            </View>
          }
          ListFooterComponent={
            <FeedFooter
              canLoadMore={canLoadMore}
              limit={limit}
              max={FEED_MAX}
              shown={filtered?.length ?? 0}
              onLoadMore={() => {
                haptic.selection();
                setLimit((l) => Math.min(l + FEED_PAGE_SIZE, FEED_MAX));
              }}
            />
          }
          renderItem={({ item: entry, index }) => {
            const isFirst = index === 0;
            const isLast = index === entries.length - 1;
            if (entry.kind === 'group') {
              return (
                <FeedGroupRow
                  group={entry}
                  isFirst={isFirst}
                  isLast={isLast}
                  onOpenItem={(item) => {
                    if (!item.readAt) markRead({ id: item._id });
                    if (item.url || item.appUrl) {
                      void openLink({ appUrl: item.appUrl, url: item.url });
                    }
                  }}
                  onDeleteGroup={() => {
                    haptic.warning();
                    for (const it of entry.all) {
                      void deleteOne({ id: it._id });
                    }
                  }}
                />
              );
            }
            return (
              <FeedRow
                item={entry.item}
                isFirst={isFirst}
                isLast={isLast}
                onOpen={() => {
                  if (!entry.item.readAt) markRead({ id: entry.item._id });
                  if (entry.item.url || entry.item.appUrl) {
                    void openLink({
                      appUrl: entry.item.appUrl,
                      url: entry.item.url
                    });
                  }
                }}
                onDelete={() => {
                  haptic.warning();
                  deleteOne({ id: entry.item._id });
                }}
              />
            );
          }}
        />
      </ScreenBody>
      <FloatingBar
        unreadCount={unreadCount}
        onMarkAllRead={() => {
          haptic.success();
          markAllRead({});
        }}
        onClear={handleClear}
      />
    </ScreenTransition>
  );
}

// How long the Clear button stays in "Confirm" state before reverting on its
// own. Long enough to read + commit, short enough that a stray tap can't fire
// destructively a minute later.
const CLEAR_CONFIRM_TIMEOUT_MS = 2500;

function FloatingBar({
  unreadCount,
  onMarkAllRead,
  onClear
}: {
  unreadCount: number;
  onMarkAllRead: () => void;
  onClear: () => void;
}) {
  const { colors, isDark, tintBg } = useTheme();
  const insets = useSafeAreaInsets();
  const canMarkAllRead = unreadCount > 0;
  // On iOS 26+ we render each action as its own Liquid Glass pill, merged via
  // a GlassContainer so they morph together natively. Older OS versions fall
  // back to the previous BlurView pill (single capsule with a thin divider).
  const liquid = isLiquidGlassAvailable();

  // Two-tap confirm: first tap morphs the button into "Confirm clear", second
  // tap commits. Reverts automatically after a short window if the user walks
  // away. Mark-all-read is disabled while we're confirming so a stray tap
  // doesn't dismiss the confirmation by accident.
  const [confirming, setConfirming] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleClearTap = useCallback(() => {
    if (confirming) {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      setConfirming(false);
      onClear();
      return;
    }
    setConfirming(true);
    haptic.warning();
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setConfirming(false);
      timerRef.current = null;
    }, CLEAR_CONFIRM_TIMEOUT_MS);
  }, [confirming, onClear]);

  const markRead = (
    <BarAction
      icon="checkmark.circle"
      label="Mark all read"
      disabled={!canMarkAllRead || confirming}
      badge={canMarkAllRead ? unreadCount : undefined}
      onPress={onMarkAllRead}
      color={colors.accent}
    />
  );
  const clear = (
    <ClearPill
      destructive={colors.destructive}
      destructiveTint={tintBg(colors.destructive)}
      confirming={confirming}
      onPress={handleClearTap}
    />
  );

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: Math.max(insets.bottom, 0) + spacing.lg,
        alignItems: 'center'
      }}
    >
      {liquid ? (
        // Outer glass = the bar tray (one continuous capsule). Inner glass =
        // the two action buttons (separate pills sitting on top). Not wrapped
        // in a GlassContainer because we *don't* want them to merge into the
        // tray — Control Center uses the same nested-glass pattern.
        <GlassView
          glassEffectStyle="regular"
          tintColor={isDark ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.25)'}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            padding: 5,
            gap: 14,
            borderRadius: 22,
            borderCurve: 'continuous'
          }}
        >
          <GlassView
            isInteractive
            glassEffectStyle="clear"
            style={{ borderRadius: radius.lg, borderCurve: 'continuous' }}
          >
            {markRead}
          </GlassView>
          <GlassView
            isInteractive
            glassEffectStyle="clear"
            style={{ borderRadius: radius.lg, borderCurve: 'continuous' }}
          >
            {clear}
          </GlassView>
        </GlassView>
      ) : (
        <View
          style={{
            borderRadius: 28,
            overflow: 'hidden',
            boxShadow: isDark
              ? '0px 8px 20px rgba(0, 0, 0, 0.5)'
              : '0px 8px 20px rgba(0, 0, 0, 0.18)',
            borderCurve: 'continuous'
          }}
        >
          <BlurView
            intensity={process.env.EXPO_OS === 'ios' ? 70 : 100}
            tint={isDark ? 'dark' : 'light'}
            style={{
              flexDirection: 'row',
              alignItems: 'stretch',
              paddingHorizontal: 6,
              paddingVertical: 6,
              gap: 4,
              borderWidth: 0.5,
              borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
              borderRadius: 28
            }}
          >
            {markRead}
            <View
              style={{
                width: 0.5,
                backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
                alignSelf: 'stretch',
                marginVertical: 8
              }}
            />
            {clear}
          </BlurView>
        </View>
      )}
    </View>
  );
}

/**
 * Clear button with a smooth two-tap confirm. Everything animates from one
 * shared progress value (0 → 1) so the bg color, text color, and pill width
 * all move on the same iOS-feeling ease curve. The icon swaps with a quick
 * crossfade keyed on the same progress.
 */
function ClearPill({
  destructive,
  destructiveTint,
  confirming,
  onPress
}: {
  destructive: string;
  destructiveTint: string;
  confirming: boolean;
  onPress: () => void;
}) {
  const progress = useSharedValue(0);
  // iOS's signature ease-out curve — same one UIKit uses for sheet
  // presentations. Feels like the native system, not a generic linear morph.
  const ease = Easing.bezier(0.32, 0.72, 0, 1);

  // Drive the progress shared value from React state. withTiming gives us
  // smooth interpolation across all dependent animated styles.
  useEffect(() => {
    progress.value = withTiming(confirming ? 1 : 0, {
      duration: 280,
      easing: ease
    });
  }, [confirming, ease, progress]);
  const trashOpacity = useDerivedValue(() => 1 - progress.value);
  const warnOpacity = useDerivedValue(() => progress.value);

  const containerStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], ['rgba(0,0,0,0)', destructive])
  }));
  const textStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [destructive, '#FFFFFF'])
  }));
  const trashStyle = useAnimatedStyle(() => ({ opacity: trashOpacity.value }));
  const warnStyle = useAnimatedStyle(() => ({ opacity: warnOpacity.value }));
  // Reference to silence unused-var; destructiveTint is reserved for a future
  // press-feedback layer if needed.
  void destructiveTint;

  // Both label texts render at all times (absolutely overlapped) so neither
  // snaps in or out — opacity is driven from the same shared progress that
  // controls bg color, text color, and icon swap. The container width
  // interpolates between the two measured natural widths so the pill grows
  // and shrinks in lockstep with the colors.
  const [idleW, setIdleW] = useState(0);
  const [confirmW, setConfirmW] = useState(0);
  const measured = idleW > 0 && confirmW > 0;
  const labelStyle = { ...type.footnote, fontWeight: '600' as const };
  const textWidthStyle = useAnimatedStyle(() => {
    if (!measured) return {};
    return { width: idleW + (confirmW - idleW) * progress.value };
  });
  const idleTextStyle = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    color: destructive
  }));
  const confirmTextStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    color: '#FFFFFF'
  }));

  return (
    <Animated.View layout={LinearTransition.duration(280).easing(ease)}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={confirming ? 'Confirm clear feed' : 'Clear feed'}
        accessibilityHint={confirming ? 'Commits the clear' : 'Tap again to confirm'}
        style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
      >
        <Animated.View
          style={[
            {
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              paddingHorizontal: 11,
              paddingVertical: 7,
              borderRadius: radius.lg
            },
            containerStyle
          ]}
        >
          <View style={{ width: 15, height: 15, justifyContent: 'center' }}>
            <Animated.View style={[StyleSheet.absoluteFill, trashStyle]}>
              <SymbolView name="trash" size={15} tintColor={destructive} />
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFill, warnStyle]}>
              <SymbolView name="exclamationmark.triangle.fill" size={15} tintColor="#FFFFFF" />
            </Animated.View>
          </View>

          {/* One-shot offscreen measurement so we know the natural widths. */}
          {idleW === 0 && (
            <Text
              style={[labelStyle, { position: 'absolute', opacity: 0 }]}
              onLayout={(e) => setIdleW(e.nativeEvent.layout.width)}
            >
              Clear
            </Text>
          )}
          {confirmW === 0 && (
            <Text
              style={[labelStyle, { position: 'absolute', opacity: 0 }]}
              onLayout={(e) => setConfirmW(e.nativeEvent.layout.width)}
            >
              Confirm clear
            </Text>
          )}

          {measured ? (
            <Animated.View style={[{ height: 18 }, textWidthStyle]}>
              <Animated.Text
                style={[StyleSheet.absoluteFill, labelStyle, idleTextStyle]}
                numberOfLines={1}
              >
                Clear
              </Animated.Text>
              <Animated.Text
                style={[StyleSheet.absoluteFill, labelStyle, confirmTextStyle]}
                numberOfLines={1}
              >
                Confirm clear
              </Animated.Text>
            </Animated.View>
          ) : (
            // First-frame placeholder before measurement completes — keeps
            // the pill from rendering at width=0 for one frame on cold mount.
            <Animated.Text style={[labelStyle, textStyle]} numberOfLines={1}>
              {confirming ? 'Confirm clear' : 'Clear'}
            </Animated.Text>
          )}
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

function BarAction({
  icon,
  label,
  onPress,
  color,
  disabled,
  badge,
  emphasized
}: {
  icon: string;
  label: string;
  onPress: () => void;
  color: string;
  disabled?: boolean;
  badge?: number;
  /**
   * Filled-background variant. Used by the two-tap confirm state on Clear
   * to flag "this tap will commit" with a saturated red pill.
   */
  emphasized?: boolean;
}) {
  const { tintBg } = useTheme();
  const fg = emphasized ? '#FFFFFF' : color;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={badge !== undefined ? `${label}, ${badge} unread` : label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 11,
        paddingVertical: 7,
        borderRadius: radius.lg,
        backgroundColor: emphasized ? color : pressed ? tintBg(color) : 'transparent',
        opacity: disabled ? 0.45 : 1
      })}
    >
      <SymbolView name={icon as any} size={15} tintColor={fg} />
      <Text style={{ ...type.footnote, color: fg, fontWeight: '600' }}>{label}</Text>
      {badge !== undefined && (
        <View
          style={{
            minWidth: 18,
            paddingHorizontal: 5,
            height: 16,
            borderRadius: radius.sm,
            backgroundColor: color,
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <Text
            style={{
              color: '#FFFFFF',
              fontSize: 11,
              fontWeight: '700',
              lineHeight: 14,
              fontVariant: ['tabular-nums']
            }}
          >
            {badge}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

function FeedToolbar({
  search,
  onSearchChange,
  sourceApps,
  filterAppId,
  onFilterChange,
  pendingAckCount
}: {
  search: string;
  onSearchChange: (s: string) => void;
  sourceApps: { id: string; name: string; logoUrl: string | null }[];
  filterAppId: string | null;
  onFilterChange: (id: string | null) => void;
  pendingAckCount: number;
}) {
  const { colors, tintBg } = useTheme();
  return (
    <View
      style={{
        gap: spacing.sm,
        marginBottom: spacing.lg,
        marginTop: spacing.md
      }}
    >
      {pendingAckCount > 0 && (
        <View
          style={{
            marginHorizontal: spacing.lg,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            borderRadius: radius.md,
            borderCurve: 'continuous',
            backgroundColor: tintBg(colors.destructive, '1F'),
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm
          }}
        >
          <SymbolView name="bell.badge.waveform" size={18} tintColor={colors.destructive} />
          <Text style={{ ...type.subhead, color: colors.destructive, flex: 1 }}>
            {pendingAckCount} awaiting acknowledgement — tap to stop alerting
          </Text>
        </View>
      )}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          marginHorizontal: spacing.lg,
          paddingHorizontal: spacing.md,
          height: 44,
          borderRadius: radius.md,
          borderCurve: 'continuous',
          backgroundColor: colors.fill,
          gap: spacing.sm
        }}
      >
        <SymbolView name="magnifyingglass" size={16} tintColor={colors.secondaryLabel} />
        <TextInput
          value={search}
          onChangeText={onSearchChange}
          placeholder="Search feed"
          placeholderTextColor={colors.placeholder}
          style={{
            flex: 1,
            fontSize: 17,
            lineHeight: 22,
            color: colors.label,
            padding: 0
          }}
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
          returnKeyType="search"
        />
      </View>
      {sourceApps.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: spacing.lg,
            gap: spacing.xs
          }}
        >
          <FilterChip
            label="All"
            selected={filterAppId === null}
            onPress={() => {
              haptic.selection();
              onFilterChange(null);
            }}
          />
          {sourceApps.map((a) => (
            <FilterChip
              key={a.id}
              label={a.name}
              selected={filterAppId === a.id}
              onPress={() => {
                haptic.selection();
                onFilterChange(filterAppId === a.id ? null : a.id);
              }}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function FilterChip({
  label,
  selected,
  onPress
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Filter by ${label}`}
      accessibilityState={{ selected }}
      style={({ pressed }) => ({
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: radius.lg,
        backgroundColor: selected ? colors.accent : pressed ? colors.cellHighlight : colors.fill
      })}
    >
      <Text
        style={{
          ...type.footnote,
          fontWeight: '600',
          color: selected ? colors.accentContrast : colors.label
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function FeedFooter({
  canLoadMore,
  limit,
  max,
  shown,
  onLoadMore
}: {
  canLoadMore: boolean;
  limit: number;
  max: number;
  shown: number;
  onLoadMore: () => void;
}) {
  const { colors } = useTheme();
  if (shown === 0) return null;
  if (canLoadMore) {
    return (
      <Pressable
        onPress={onLoadMore}
        accessibilityRole="button"
        accessibilityLabel="Load older notifications"
        style={({ pressed }) => ({
          marginHorizontal: spacing.lg,
          marginTop: spacing.md,
          paddingVertical: spacing.sm + 2,
          alignItems: 'center',
          borderRadius: radius.md,
          borderCurve: 'continuous',
          backgroundColor: pressed ? colors.cellHighlight : colors.fill
        })}
      >
        <Text style={{ ...type.subhead, color: colors.accent, fontWeight: '600' }}>Load older</Text>
      </Pressable>
    );
  }
  if (limit >= max) {
    return (
      <Text
        style={{
          ...type.caption1,
          color: colors.tertiaryLabel,
          textAlign: 'center',
          marginTop: spacing.lg
        }}
      >
        Showing the latest {max}. Older notifications stay on the server.
      </Text>
    );
  }
  return null;
}

function EmptyState() {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.xxl,
        gap: spacing.md
      }}
    >
      <View
        style={{
          width: 88,
          height: 88,
          borderRadius: 44,
          backgroundColor: colors.fill,
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <SymbolView name="bell.slash" size={40} tintColor={colors.tertiaryLabel} />
      </View>
      <Text style={{ ...type.title3, color: colors.label }}>Your feed is empty</Text>
      <Text
        style={{
          ...type.subhead,
          color: colors.secondaryLabel,
          textAlign: 'center',
          maxWidth: 280
        }}
      >
        Create a source app in the Apps tab and send your first push.
      </Text>
    </View>
  );
}

// Feed types and pure helpers live in `@/lib/feed-helpers` so they can be
// unit-tested in jest without dragging in the whole screen module.

function FeedGroupRow({
  group,
  isFirst,
  isLast,
  onOpenItem,
  onDeleteGroup
}: {
  group: Extract<FeedEntry, { kind: 'group' }>;
  isFirst: boolean;
  isLast: boolean;
  onOpenItem: (item: FeedItem) => void;
  onDeleteGroup: () => void;
}) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const latest = group.latest;
  const anyEnded = group.all.some((i) => i.liveActivity?.action === 'end');
  const eventCount = group.all.length;

  const header = (
    <Pressable
      onPress={() => {
        haptic.selection();
        setExpanded((e) => !e);
      }}
      accessibilityRole="button"
      accessibilityLabel={`Live activity from ${latest.sourceAppName}, ${latest.title}, ${eventCount} ${eventCount === 1 ? 'event' : 'events'}${anyEnded ? ', ended' : ''}`}
      accessibilityState={{ expanded }}
      accessibilityHint="Toggles event history"
      style={({ pressed }) => ({
        backgroundColor: pressed ? colors.cellHighlight : colors.cell,
        paddingLeft: spacing.md,
        paddingRight: spacing.lg,
        paddingVertical: spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        minHeight: 72,
        opacity: anyEnded ? 0.85 : 1
      })}
    >
      <View>
        <Avatar url={latest.sourceAppLogoUrl} name={latest.sourceAppName} size={40} />
        {!latest.readAt && !anyEnded && (
          <View
            style={{
              position: 'absolute',
              left: -2,
              top: -2,
              width: 12,
              height: 12,
              borderRadius: 6,
              backgroundColor: colors.accent,
              borderWidth: 2,
              borderColor: colors.cell
            }}
          />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'baseline'
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              flex: 1
            }}
          >
            <Text style={{ ...type.footnote, color: colors.secondaryLabel }} numberOfLines={1}>
              {latest.sourceAppName}
            </Text>
            {latest.liveActivity && <LiveActivityBadge action={latest.liveActivity.action} />}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 3,
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: 6,
                backgroundColor: colors.fill
              }}
            >
              <Text
                style={{
                  ...type.caption2,
                  color: colors.secondaryLabel,
                  fontWeight: '600'
                }}
              >
                {eventCount} event{eventCount === 1 ? '' : 's'}
              </Text>
            </View>
          </View>
          <Text style={{ ...type.caption1, color: colors.tertiaryLabel }}>
            {formatRelative(latest.createdAt)}
          </Text>
        </View>
        <Text style={{ ...type.headline, color: colors.label, marginTop: 1 }} numberOfLines={1}>
          {latest.title}
        </Text>
        {latest.liveActivity ? (
          <LiveActivityBody state={latest.liveActivity.state} />
        ) : (
          <Text
            style={{
              ...type.subhead,
              color: colors.secondaryLabel,
              marginTop: 1
            }}
            numberOfLines={2}
          >
            {latest.body}
          </Text>
        )}
      </View>
      <SymbolView
        name={expanded ? 'chevron.up' : 'chevron.down'}
        size={13}
        tintColor={colors.tertiaryLabel}
      />
    </Pressable>
  );

  const expandedList = expanded && (
    <Animated.View
      entering={FadeIn.duration(180)}
      exiting={FadeOut.duration(120)}
      layout={LinearTransition}
      style={{
        backgroundColor: colors.fill,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        gap: spacing.sm
      }}
    >
      {[...group.all].toReversed().map((item) => (
        <Pressable
          key={item._id}
          onPress={() => {
            haptic.selection();
            onOpenItem(item);
          }}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            paddingVertical: 6,
            paddingHorizontal: 6,
            borderRadius: radius.sm,
            backgroundColor: pressed ? colors.cellHighlight : 'transparent',
            opacity: item.liveActivity?.action === 'end' ? 0.7 : 1
          })}
        >
          <ActionBadge action={item.liveActivity?.action} />
          {item.liveActivity?.state.icon && (
            <SymbolView
              name={item.liveActivity.state.icon as any}
              size={14}
              tintColor={colors.secondaryLabel}
            />
          )}
          <Text
            style={{
              ...type.footnote,
              color: colors.label,
              flex: 1
            }}
            numberOfLines={1}
          >
            {item.liveActivity?.state.status ?? item.liveActivity?.state.title ?? item.body}
          </Text>
          {typeof item.liveActivity?.state.progress === 'number' && (
            <Text
              style={{
                ...type.caption1,
                color: colors.tertiaryLabel,
                fontVariant: ['tabular-nums']
              }}
            >
              {Math.round(Math.max(0, Math.min(1, item.liveActivity.state.progress)) * 100)}%
            </Text>
          )}
          <Text
            style={{
              ...type.caption2,
              color: colors.tertiaryLabel,
              fontVariant: ['tabular-nums'],
              minWidth: 34,
              textAlign: 'right'
            }}
          >
            {formatRelative(item.createdAt)}
          </Text>
        </Pressable>
      ))}
    </Animated.View>
  );

  return (
    <View
      style={{
        marginHorizontal: spacing.lg,
        borderTopLeftRadius: isFirst ? radius.lg : 0,
        borderTopRightRadius: isFirst ? radius.lg : 0,
        borderBottomLeftRadius: isLast ? radius.lg : 0,
        borderBottomRightRadius: isLast ? radius.lg : 0,
        overflow: 'hidden',
        backgroundColor: colors.cell,
        borderCurve: 'continuous'
      }}
    >
      <ReanimatedSwipeable
        friction={1.6}
        overshootFriction={8}
        rightThreshold={FULL_SWIPE_THRESHOLD}
        renderRightActions={(progress) => (
          <SwipeAction
            progress={progress}
            tint={colors.destructive}
            label="Delete all"
            icon="trash.fill"
            side="right"
            onPress={onDeleteGroup}
          />
        )}
        onSwipeableWillOpen={(direction) => {
          if (direction === 'right') onDeleteGroup();
        }}
      >
        <View>
          {header}
          {expandedList}
        </View>
      </ReanimatedSwipeable>
      {!isLast && (
        <View
          style={{
            height: 0.5,
            backgroundColor: colors.separator,
            marginLeft: 64
          }}
        />
      )}
    </View>
  );
}

function ActionBadge({ action }: { action?: 'start' | 'update' | 'end' }) {
  const { colors, tintBg } = useTheme();
  const spec = (() => {
    switch (action) {
      case 'start':
        return { label: 'START', color: colors.accent };
      case 'end':
        return { label: 'END', color: colors.success };
      case 'update':
      default:
        return { label: 'UPDATE', color: colors.warning };
    }
  })();
  return (
    <View
      style={{
        minWidth: 56,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 5,
        alignItems: 'center',
        backgroundColor: tintBg(spec.color)
      }}
    >
      <Text
        numberOfLines={1}
        allowFontScaling={false}
        style={{
          fontSize: 10,
          lineHeight: 13,
          color: spec.color,
          fontWeight: '700',
          letterSpacing: 0.3
        }}
      >
        {spec.label}
      </Text>
    </View>
  );
}

function FeedRow({
  item,
  isFirst,
  isLast,
  onOpen,
  onDelete
}: {
  item: FeedItem;
  isFirst: boolean;
  isLast: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const { colors, tintBg } = useTheme();
  const unread = !item.readAt;

  const a11yParts = [
    unread ? 'Unread' : 'Read',
    `notification from ${item.sourceAppName}`,
    item.title,
    item.body,
    formatRelative(item.createdAt) + ' ago',
    item.ack && !item.acknowledgedAt ? 'acknowledgement needed' : null
  ].filter(Boolean);
  const row = (
    <Pressable
      onPress={() => {
        haptic.selection();
        onOpen();
      }}
      accessibilityRole="button"
      accessibilityLabel={a11yParts.join(', ')}
      accessibilityHint={item.url ? 'Opens linked URL' : 'Marks as read'}
      style={({ pressed }) => ({
        backgroundColor: pressed ? colors.cellHighlight : colors.cell,
        paddingLeft: spacing.md,
        paddingRight: spacing.lg,
        paddingVertical: spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        minHeight: 72
      })}
    >
      <View>
        <Avatar url={item.sourceAppLogoUrl} name={item.sourceAppName} size={40} />
        {unread && (
          <View
            style={{
              position: 'absolute',
              left: -2,
              top: -2,
              width: 12,
              height: 12,
              borderRadius: 6,
              backgroundColor: colors.accent,
              borderWidth: 2,
              borderColor: colors.cell
            }}
          />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'baseline'
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              flex: 1
            }}
          >
            <Text style={{ ...type.footnote, color: colors.secondaryLabel }} numberOfLines={1}>
              {item.sourceAppName}
            </Text>
            {item.liveActivity && <LiveActivityBadge action={item.liveActivity.action} />}
          </View>
          <Text style={{ ...type.caption1, color: colors.tertiaryLabel }}>
            {formatRelative(item.createdAt)}
          </Text>
        </View>
        <Text style={{ ...type.headline, color: colors.label, marginTop: 1 }} numberOfLines={1}>
          {item.title}
        </Text>
        {item.liveActivity ? (
          <LiveActivityBody state={item.liveActivity.state} />
        ) : (
          <Text
            style={{
              ...type.subhead,
              color: colors.secondaryLabel,
              marginTop: 1
            }}
            numberOfLines={2}
          >
            {item.body}
          </Text>
        )}
        {item.ack && !item.acknowledgedAt && (
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
              backgroundColor: tintBg(colors.destructive)
            }}
          >
            <SymbolView name="bell.badge" size={11} tintColor={colors.destructive} />
            <Text
              style={{
                ...type.caption2,
                color: colors.destructive,
                fontWeight: '600'
              }}
            >
              {item.ack.attempts > 0
                ? `Ack needed · re-alerted ${item.ack.attempts}×`
                : 'Ack needed'}
            </Text>
          </View>
        )}
      </View>
      {item.image ? (
        <Image
          source={{ uri: item.image }}
          style={{
            width: 56,
            height: 56,
            borderRadius: radius.md,
            backgroundColor: colors.fill
          }}
          contentFit="cover"
          transition={150}
          accessibilityIgnoresInvertColors
        />
      ) : (
        item.url && <SymbolView name="chevron.right" size={14} tintColor={colors.tertiaryLabel} />
      )}
    </Pressable>
  );

  const actions = (item.actions ?? []) as NotifAction[];
  const rowStack = (
    <View style={{ backgroundColor: colors.cell }}>
      {row}
      {actions.length > 0 && (
        <ActionButtonsBar
          notificationId={item._id}
          actions={actions}
          disabled={item.acknowledgedAt !== undefined}
        />
      )}
    </View>
  );

  return (
    <View
      style={{
        marginHorizontal: spacing.lg,
        borderTopLeftRadius: isFirst ? radius.lg : 0,
        borderTopRightRadius: isFirst ? radius.lg : 0,
        borderBottomLeftRadius: isLast ? radius.lg : 0,
        borderBottomRightRadius: isLast ? radius.lg : 0,
        overflow: 'hidden',
        backgroundColor: colors.cell,
        borderCurve: 'continuous'
      }}
    >
      <ReanimatedSwipeable
        friction={1.6}
        overshootFriction={8}
        rightThreshold={FULL_SWIPE_THRESHOLD}
        renderRightActions={(progress) => (
          <SwipeAction
            progress={progress}
            tint={colors.destructive}
            label="Delete"
            icon="trash.fill"
            side="right"
            onPress={() => {
              haptic.warning();
              onDelete();
            }}
          />
        )}
        onSwipeableWillOpen={(direction) => {
          if (direction === 'right') {
            haptic.warning();
            onDelete();
          }
        }}
      >
        {rowStack}
      </ReanimatedSwipeable>
      {!isLast && (
        <View
          style={{
            height: 0.5,
            backgroundColor: colors.separator,
            marginLeft: 64
          }}
        />
      )}
    </View>
  );
}

function ActionButtonsBar({
  notificationId,
  actions,
  disabled
}: {
  notificationId: Id<'notifications'>;
  actions: NotifAction[];
  disabled: boolean;
}) {
  const { colors } = useTheme();
  const invoke = useAction(api.actions.invoke);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, 'ok' | 'fail'>>({});

  async function handle(action: NotifAction) {
    if (busy || disabled) return;
    haptic.selection();
    setBusy(action.id);
    try {
      if (action.kind === 'open_url') {
        void Linking.openURL(action.url).catch(() => {});
      }
      if (action.kind === 'reply') {
        const text = await promptText({
          title: action.label,
          placeholder: action.placeholder ?? 'Type a reply',
          confirmLabel: 'Send'
        });
        if (text === null) return;
        const result = await invoke({
          notificationId,
          actionIdentifier: action.id,
          reply: text
        });
        setDone((d) => ({
          ...d,
          [action.id]: result?.ok ? 'ok' : 'fail'
        }));
        return;
      }
      const result = await invoke({
        notificationId,
        actionIdentifier: action.id
      });
      setDone((d) => ({ ...d, [action.id]: result?.ok ? 'ok' : 'fail' }));
    } catch {
      setDone((d) => ({ ...d, [action.id]: 'fail' }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.xs,
        paddingHorizontal: spacing.md,
        paddingLeft: 64,
        paddingBottom: spacing.md,
        paddingTop: 2
      }}
    >
      {actions.map((a) => {
        const status = done[a.id];
        const tint =
          status === 'fail'
            ? colors.destructive
            : a.kind === 'reply'
              ? colors.accent
              : a.destructive
                ? colors.destructive
                : colors.label;
        return (
          <Pressable
            key={a.id}
            onPress={() => handle(a)}
            disabled={busy !== null || disabled}
            accessibilityRole="button"
            accessibilityLabel={a.label}
            accessibilityState={{
              disabled: busy !== null || disabled,
              busy: busy === a.id
            }}
            style={({ pressed }) => ({
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: radius.lg,
              borderWidth: 0.5,
              borderColor: colors.separator,
              backgroundColor: pressed ? colors.cellHighlight : colors.fill,
              opacity: busy !== null && busy !== a.id ? 0.5 : 1,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4
            })}
          >
            {status === 'ok' && <SymbolView name="checkmark" size={12} tintColor={colors.accent} />}
            {status === 'fail' && (
              <SymbolView
                name="exclamationmark.triangle"
                size={12}
                tintColor={colors.destructive}
              />
            )}
            <Text
              style={{
                ...type.footnote,
                color: tint,
                fontWeight: '600'
              }}
            >
              {a.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function LiveActivityBadge({ action }: { action: 'start' | 'update' | 'end' }) {
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
        backgroundColor: bg
      }}
    >
      <View
        style={{
          width: 5,
          height: 5,
          borderRadius: 2.5,
          backgroundColor: tint,
          opacity: ended ? 0.6 : 1
        }}
      />
      <Text
        style={{
          ...type.caption2,
          color: tint,
          fontWeight: '700',
          letterSpacing: 0.2
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function LiveActivityBody({
  state
}: {
  state: {
    title?: string;
    status?: string;
    progress?: number;
    icon?: string;
  };
}) {
  const { colors } = useTheme();
  const hasProgress = typeof state.progress === 'number';
  const pct = hasProgress ? Math.max(0, Math.min(1, state.progress!)) : 0;
  return (
    <View style={{ marginTop: 4, gap: 6 }}>
      {(state.icon || state.status) && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6
          }}
        >
          {state.icon && (
            <SymbolView name={state.icon as any} size={13} tintColor={colors.secondaryLabel} />
          )}
          {state.status && (
            <Text
              style={{
                ...type.subhead,
                color: colors.secondaryLabel,
                flex: 1
              }}
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
                fontVariant: ['tabular-nums']
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
            overflow: 'hidden'
          }}
        >
          <View
            style={{
              width: `${pct * 100}%`,
              height: 4,
              backgroundColor: colors.accent,
              borderRadius: 2
            }}
          />
        </View>
      )}
    </View>
  );
}

function SwipeAction({
  progress,
  tint,
  label,
  icon,
  side,
  onPress
}: {
  progress: SharedValue<number>;
  tint: string;
  label: string;
  icon: string;
  side: 'left' | 'right';
  onPress: () => void;
}) {
  const from = side === 'left' ? -20 : 20;
  const style = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(progress.value, [0, 1], [from, 0], Extrapolation.CLAMP)
      }
    ],
    opacity: interpolate(progress.value, [0, 0.5, 1], [0, 0.5, 1])
  }));
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        width: 96,
        backgroundColor: tint,
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <Animated.View style={[{ alignItems: 'center' }, style]}>
        <SymbolView name={icon as any} size={22} tintColor="#FFFFFF" />
        <Text style={{ color: '#FFFFFF', ...type.caption1, marginTop: 4 }}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}
