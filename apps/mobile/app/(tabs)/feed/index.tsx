import { useAction, useMutation, usePaginatedQuery } from "convex/react";
import { api } from "@pushr/backend/_generated/api";
import type { FunctionReturnType } from "convex/server";
import type { NotifAction } from "@pushr/backend/lib/actionsLayout";
import type { Id } from "@pushr/backend/_generated/dataModel";
import {
  Alert,
  FlatList,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";
import Animated, {
  Easing,
  Extrapolation,
  FadeIn,
  FadeOut,
  interpolate,
  interpolateColor,
  LinearTransition,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { SymbolView } from "expo-symbols";
import { Host, Picker, Text as UIText } from "@expo/ui/swift-ui";
import { fixedSize, pickerStyle, tag } from "@expo/ui/swift-ui/modifiers";
import { Image } from "expo-image";
import { BlurView } from "expo-blur";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ScreenHeader,
  ScreenBody,
  ScreenShell,
} from "@/components/ScreenHeader";
import { ScreenTransition } from "@/components/ScreenTransition";
import { Avatar } from "@/components/Avatar";
import { Card } from "@/components/Card";
import { CardBloom } from "@/components/Glow";
import { Chip, SectionDivider } from "@/components/Chip";
import { EmptyState } from "@/components/EmptyState";
import {
  NotificationContent,
  LiveActivityBadge,
  LiveActivityBody,
} from "@/components/NotificationContent";
import { useTheme, spacing, radius, type } from "@/lib/theme";
import { identityTint } from "@/lib/appColor";
import { haptic } from "@/lib/haptics";
import { promptText } from "@/lib/prompt";
import { openLink } from "@/lib/openLink";
import {
  entryTimestamp,
  feedBucket,
  formatRelative,
  groupFeedItems,
  type FeedItem,
  type FeedEntry,
} from "@/lib/feed-helpers";

// Distance (px) the row must travel past which a release commits the
// delete. Matches iOS Mail's behaviour — ~80pt is enough for a clear
// "this is a swipe-to-delete" gesture without requiring a full-row drag.
const SWIPE_DELETE_THRESHOLD = 80;
// Resistance applied to the drag. Lower = snappier. iOS Mail sits near 1.
const SWIPE_FRICTION = 1;
// Resistance past the threshold. Lower = springier rubber-band. iOS Mail
// barely overshoots once you're past the button width.
const SWIPE_OVERSHOOT_FRICTION = 4;

// Drag distance (px) past which the swipe fires an anticipation haptic — a
// light tick that tells the user "release now and it commits", the detail iOS
// Mail nails. Sits just beyond the delete threshold so it doesn't fire on a
// glancing drag.
const SWIPE_TICK_THRESHOLD = SWIPE_DELETE_THRESHOLD + 12;
// Press-in scale for list rows. Subtle spring shrink so every tap feels
// physical rather than a flat color swap.
const PRESS_SCALE = 0.97;
const PRESS_SPRING = { damping: 18, stiffness: 320, mass: 0.6 } as const;

/**
 * Spring scale-down on press. Returns an animated style plus press handlers to
 * spread onto the row's Pressable; the style goes on a wrapping Animated.View.
 */
function usePressScale() {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const onPressIn = useCallback(() => {
    scale.value = withSpring(PRESS_SCALE, PRESS_SPRING);
  }, [scale]);
  const onPressOut = useCallback(() => {
    scale.value = withSpring(1, PRESS_SPRING);
  }, [scale]);
  return { style, onPressIn, onPressOut };
}

// One page of feed rows. The server walks its per-app indexes lazily, so this
// is roughly how many documents a page costs — not `size × app-count` like the
// old take-everything-and-slice query.
const FEED_PAGE_SIZE = 50;

// Above this many source apps, the horizontal chip strip collapses into a
// SwiftUI menu — scrolling 20 chips to find one is worse than tapping a
// dropdown.
const FILTER_CHIP_THRESHOLD = 6;
// Sentinel tag for the "All apps" option in the SwiftUI Picker. Real app IDs
// are Convex strings, so any plain-text sentinel that can't collide works.
const FILTER_ALL_TAG = "__all__";

export default function Feed() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ notif?: string }>();
  const {
    results: items,
    status: feedStatus,
    loadMore,
  } = usePaginatedQuery(
    api.notifications.listMine,
    {},
    { initialNumItems: FEED_PAGE_SIZE },
  );
  const markRead = useMutation(api.notifications.markRead);
  const setRead = useMutation(api.notifications.setRead);
  const markAllRead = useMutation(api.notifications.markAllRead);
  const deleteOne = useMutation(api.notifications.deleteOne);
  const clearAll = useMutation(api.notifications.clearAll);
  const [search, setSearch] = useState("");
  const [filterAppId, setFilterAppId] = useState<string | null>(null);
  const canLoadMore = feedStatus === "CanLoadMore";
  const loadingMore = feedStatus === "LoadingMore";
  // `usePaginatedQuery` hands back `[]` while the first page is in flight;
  // "loading" is a status, not an absent array.
  const loadingFirstPage = feedStatus === "LoadingFirstPage";

  const total = items.length;

  const sourceApps = (() => {
    if (loadingFirstPage)
      return [] as { id: string; name: string; logoUrl: string | null }[];
    const seen = new Map<
      string,
      { id: string; name: string; logoUrl: string | null }
    >();
    for (const n of items) {
      const id = n.sourceAppId as unknown as string;
      if (!seen.has(id)) {
        seen.set(id, {
          id,
          name: n.sourceAppName,
          logoUrl: n.sourceAppLogoUrl ?? null,
        });
      }
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  })();

  const filtered = (() => {
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

  const entries = useMemo(
    () => groupFeedItems(filtered ?? undefined),
    [filtered],
  );

  // Counted off the filtered set: the bar's badge has to promise the same
  // scope its button acts on.
  const unreadCount = filtered?.filter((i) => !i.readAt).length ?? 0;

  // Deep-link target from the Home Screen widget (pushr://feed?notif=<id>).
  // We wait for `items` to load so we can resolve the row's url/appUrl
  // before opening, then strip the param so navigating away and back
  // doesn't re-trigger the open.
  const consumedNotifRef = useRef<string | null>(null);
  useEffect(() => {
    const target = params.notif;
    if (!target || loadingFirstPage) return;
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
  }, [params.notif, items, loadingFirstPage, markRead, router]);

  // The actual destructive op — the FloatingBar handles its own two-tap
  // confirm UX, so we just commit on demand. Clear means "clear what I'm
  // looking at": with an app filter on, only that app's notifications go, and
  // the filter drops back to All since the app it named is now empty (and its
  // chip is about to disappear with it).
  const handleClear = useCallback(async () => {
    haptic.warning();
    try {
      const deleted = await clearAll(
        filterAppId
          ? { sourceAppId: filterAppId as unknown as Id<"sourceApps"> }
          : {},
      );
      // Clearing only removes notifications from apps you own — deleting from
      // a shared app would wipe them out of every other member's feed too. So
      // a member clearing a shared app deletes nothing, and saying so beats
      // leaving them to wonder why the feed didn't change.
      if (deleted === 0) {
        haptic.warning();
        Alert.alert(
          "Nothing cleared",
          "These notifications come from an app that's shared with you. Only the app's owner can delete them.",
        );
        return;
      }
      // Only now — if the mutation failed, dropping the filter would leave the
      // feed looking untouched but unfiltered, which reads as "clear did
      // nothing" with no clue why.
      setFilterAppId(null);
    } catch {
      haptic.error();
    }
  }, [clearAll, filterAppId]);

  const handleMarkAllRead = useCallback(() => {
    haptic.success();
    // Same scoping rule as Clear: act on what's on screen.
    markAllRead(
      filterAppId
        ? { sourceAppId: filterAppId as unknown as Id<"sourceApps"> }
        : {},
    );
  }, [markAllRead, filterAppId]);

  const filteredApp = filterAppId
    ? (sourceApps.find((a) => a.id === filterAppId) ?? null)
    : null;

  // Unread gets the live accent-glow chip; a fully-read feed states its size
  // quietly instead, so the glow only ever means "there's something for you".
  const header = (
    <ScreenHeader title="Feed">
      {unreadCount > 0 ? (
        <Chip label={`${unreadCount} unread`} variant="tint" dot="glow" />
      ) : (
        <Chip label={`${total} ${total === 1 ? "item" : "items"}`} variant="ghost" />
      )}
    </ScreenHeader>
  );

  if (loadingFirstPage) {
    return (
      <ScreenTransition>
        <ScreenShell>
          {header}
          <ScreenBody>
            <FeedSkeleton />
          </ScreenBody>
        </ScreenShell>
      </ScreenTransition>
    );
  }

  if (items.length === 0) {
    return (
      <ScreenTransition>
        <ScreenShell>
          {header}
          <ScreenBody>
            <FeedEmpty />
          </ScreenBody>
        </ScreenShell>
      </ScreenTransition>
    );
  }

  const pendingAckCount = items.filter(
    (i) => i.ack && !i.acknowledgedAt,
  ).length;

  return (
    <ScreenTransition>
      <ScreenShell>
        {header}
        <ScreenBody>
        <FeedToolbar
          search={search}
          onSearchChange={setSearch}
          sourceApps={sourceApps}
          filterAppId={filterAppId}
          onFilterChange={setFilterAppId}
          pendingAckCount={pendingAckCount}
        />
        <FlatList
          style={{ flex: 1 }}
          data={entries}
          keyExtractor={(e) =>
            e.kind === "group" ? `g:${e.activityId}` : e.item._id
          }
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{
            // Derived from the bar's own geometry rather than a magic number,
            // so raising the gap can't leave the last card under the capsule.
            paddingBottom:
              insets.bottom +
              FLOATING_BAR_GAP +
              FLOATING_BAR_HEIGHT +
              spacing.lg,
          }}
          ListEmptyComponent={
            <View
              style={{
                paddingTop: spacing.xxl,
                alignItems: "center",
                gap: spacing.sm,
              }}
            >
              <SymbolView
                name="magnifyingglass"
                size={32}
                tintColor={colors.tertiaryLabel}
              />
              <Text style={{ ...type.subhead, color: colors.secondaryLabel }}>
                No matches
              </Text>
            </View>
          }
          ListFooterComponent={
            <FeedFooter
              canLoadMore={canLoadMore}
              loading={loadingMore}
              exhausted={feedStatus === "Exhausted"}
              shown={filtered?.length ?? 0}
              onLoadMore={() => {
                haptic.selection();
                loadMore(FEED_PAGE_SIZE);
              }}
            />
          }
          renderItem={({ item: entry, index }) => {
            const isFirst = index === 0;

            const entering = FadeIn.duration(220).delay(Math.min(index * 18, 120));

            // Headings mark where one age bucket gives way to the next. Read
            // state can't drive this — it alternates freely down the list, which
            // is what made every row grow its own heading.
            const bucket = feedBucket(entryTimestamp(entry));
            const prevBucket =
              index > 0 ? feedBucket(entryTimestamp(entries[index - 1])) : null;
            const divider =
              isFirst || bucket !== prevBucket ? (
                <SectionDivider>{bucket}</SectionDivider>
              ) : null;

            if (entry.kind === "group") {
              return (
                <Animated.View entering={entering}>
                  {divider}
                  <FeedGroupRow
                    group={entry}
                    onOpenItem={(item) => {
                      if (!item.readAt) markRead({ id: item._id });
                      if (item.url || item.appUrl) {
                        void openLink({ appUrl: item.appUrl, url: item.url });
                      }
                    }}
                    onToggleGroupRead={() => {
                      // If any item is unread, the swipe marks the whole group
                      // read; otherwise it flips them all back to unread.
                      const target = entry.all.some((i) => !i.readAt);
                      for (const it of entry.all) {
                        void setRead({ id: it._id, read: target });
                      }
                    }}
                    onDeleteGroup={() => {
                      haptic.warning();
                      for (const it of entry.all) {
                        void deleteOne({ id: it._id });
                      }
                    }}
                  />
                </Animated.View>
              );
            }
            return (
              <Animated.View entering={entering}>
                {divider}
                <FeedRow
                  item={entry.item}
                  onOpen={() => {
                    if (!entry.item.readAt) markRead({ id: entry.item._id });
                    if (entry.item.url || entry.item.appUrl) {
                      void openLink({
                        appUrl: entry.item.appUrl,
                        url: entry.item.url,
                      });
                    }
                  }}
                  onToggleRead={() => {
                    void setRead({
                      id: entry.item._id,
                      read: !entry.item.readAt,
                    });
                  }}
                  onDelete={() => {
                    haptic.warning();
                    deleteOne({ id: entry.item._id });
                  }}
                />
              </Animated.View>
            );
          }}
        />
        </ScreenBody>
        <FloatingBar
          unreadCount={unreadCount}
          onMarkAllRead={handleMarkAllRead}
          onClear={handleClear}
          scope={filteredApp?.name ?? null}
        />
      </ScreenShell>
    </ScreenTransition>
  );
}

// Longest app name the confirm pill spells out before eliding — past this the
// floating capsule starts crowding the screen edges.
const CLEAR_SCOPE_MAX_CHARS = 14;

function truncateName(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > CLEAR_SCOPE_MAX_CHARS
    ? `${trimmed.slice(0, CLEAR_SCOPE_MAX_CHARS - 1)}\u2026`
    : trimmed;
}

// Clearance between the floating action bar and the tab bar under it. At the
// old `spacing.lg` the two chrome layers read as one stacked block, and the bar
// looked like it belonged to the last card rather than the screen.
const FLOATING_BAR_GAP = spacing.xl;
// The bar capsule's own height (6pt padding + a 34pt row + 6pt). The list
// reserves this plus the gap so the last card scrolls clear of it.
const FLOATING_BAR_HEIGHT = 52;

// How long the Clear button stays in "Confirm" state before reverting on its
// own. Long enough to read + commit, short enough that a stray tap can't fire
// destructively a minute later.
const CLEAR_CONFIRM_TIMEOUT_MS = 2500;

function FloatingBar({
  unreadCount,
  onMarkAllRead,
  onClear,
  scope,
}: {
  unreadCount: number;
  onMarkAllRead: () => void;
  onClear: () => void;
  /** Name of the app the feed is filtered to, or `null` for the whole feed. */
  scope: string | null;
}) {
  const { colors, isDark, tintBg } = useTheme();
  const insets = useSafeAreaInsets();
  const canMarkAllRead = unreadCount > 0;
  // On iOS 26+ we render both actions inside a single Liquid Glass capsule
  // split by a hairline divider. Older OS versions fall back to the same
  // shape built from a BlurView pill.
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
  // Switching the filter mid-confirm would leave "Confirm clear X" armed over
  // a different scope — drop back to idle instead.
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setConfirming(false);
  }, [scope]);

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
      label={scope ? "Mark read" : "Mark all read"}
      accessibilityLabel={
        scope
          ? `Mark notifications from ${scope} read`
          : "Mark all notifications read"
      }
      disabled={!canMarkAllRead || confirming}
      badge={canMarkAllRead ? unreadCount : undefined}
      onPress={onMarkAllRead}
      color={colors.accent}
    />
  );
  // The confirm state spells out what's about to go: the filtered app by name,
  // or the whole feed when nothing is filtered.
  const confirmLabel = scope
    ? `Clear ${truncateName(scope)}`
    : "Confirm clear";
  const clear = (
    <ClearPill
      // Remount on scope change so the pill re-measures its label widths.
      key={confirmLabel}
      destructive={colors.destructive}
      destructiveTint={tintBg(colors.destructive)}
      confirming={confirming}
      confirmLabel={confirmLabel}
      scope={scope}
      onPress={handleClearTap}
    />
  );

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: Math.max(insets.bottom, 0) + FLOATING_BAR_GAP,
        alignItems: "center",
      }}
    >
      {liquid ? (
        // One continuous Liquid Glass capsule holding both actions, split by a
        // hairline divider — no outer tray wrapping inner pills, so it reads as
        // a single intentional element instead of a pill-inside-a-pill. The
        // buttons carry their own press feedback, so the glass surface itself
        // stays non-interactive (a whole-capsule lensing effect would light up
        // both halves on either tap). Structure mirrors the BlurView fallback.
        <GlassView
          glassEffectStyle="regular"
          colorScheme={isDark ? "dark" : "light"}
          style={{
            flexDirection: "row",
            alignItems: "stretch",
            padding: 6,
            borderRadius: 22,
            borderCurve: "continuous",
          }}
        >
          {markRead}
          <View
            style={{
              width: 0.5,
              backgroundColor: isDark
                ? "rgba(255,255,255,0.15)"
                : "rgba(0,0,0,0.1)",
              alignSelf: "stretch",
              marginVertical: 6,
            }}
          />
          {clear}
        </GlassView>
      ) : (
        <View
          style={{
            borderRadius: 28,
            overflow: "hidden",
            boxShadow: isDark
              ? "0px 8px 20px rgba(0, 0, 0, 0.5)"
              : "0px 8px 20px rgba(0, 0, 0, 0.18)",
            borderCurve: "continuous",
          }}
        >
          <BlurView
            intensity={process.env.EXPO_OS === "ios" ? 70 : 100}
            tint={isDark ? "dark" : "light"}
            style={{
              flexDirection: "row",
              alignItems: "stretch",
              paddingHorizontal: 6,
              paddingVertical: 6,
              gap: 4,
              borderWidth: 0.5,
              borderColor: isDark
                ? "rgba(255,255,255,0.08)"
                : "rgba(0,0,0,0.06)",
              borderRadius: 28,
            }}
          >
            {markRead}
            <View
              style={{
                width: 0.5,
                backgroundColor: isDark
                  ? "rgba(255,255,255,0.12)"
                  : "rgba(0,0,0,0.08)",
                alignSelf: "stretch",
                marginVertical: 8,
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
  confirmLabel,
  scope,
  onPress,
}: {
  destructive: string;
  destructiveTint: string;
  confirming: boolean;
  /** Label shown in the armed state — names the filtered app when there is one. */
  confirmLabel: string;
  scope: string | null;
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
      easing: ease,
    });
  }, [confirming, ease, progress]);
  const trashOpacity = useDerivedValue(() => 1 - progress.value);
  const warnOpacity = useDerivedValue(() => progress.value);

  const containerStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      ["rgba(0,0,0,0)", destructive],
    ),
  }));
  const textStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [destructive, "#FFFFFF"]),
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
  const labelStyle = { ...type.footnote, fontWeight: "600" as const };
  const textWidthStyle = useAnimatedStyle(() => {
    if (!measured) return {};
    return { width: idleW + (confirmW - idleW) * progress.value };
  });
  const idleTextStyle = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    color: destructive,
  }));
  const confirmTextStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    color: "#FFFFFF",
  }));

  return (
    <Animated.View layout={LinearTransition.duration(280).easing(ease)}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={
          confirming
            ? scope
              ? `Confirm clear notifications from ${scope}`
              : "Confirm clear feed"
            : scope
              ? `Clear notifications from ${scope}`
              : "Clear feed"
        }
        accessibilityHint={
          confirming ? "Commits the clear" : "Tap again to confirm"
        }
        style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
      >
        <Animated.View
          style={[
            {
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
              paddingHorizontal: 11,
              paddingVertical: 7,
              borderRadius: radius.lg,
            },
            containerStyle,
          ]}
        >
          <View style={{ width: 15, height: 15, justifyContent: "center" }}>
            <Animated.View style={[StyleSheet.absoluteFill, trashStyle]}>
              <SymbolView name="trash" size={15} tintColor={destructive} />
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFill, warnStyle]}>
              <SymbolView
                name="exclamationmark.triangle.fill"
                size={15}
                tintColor="#FFFFFF"
              />
            </Animated.View>
          </View>

          {/* One-shot offscreen measurement so we know the natural widths. */}
          {idleW === 0 && (
            <Text
              style={[labelStyle, { position: "absolute", opacity: 0 }]}
              onLayout={(e) => setIdleW(e.nativeEvent.layout.width)}
            >
              Clear
            </Text>
          )}
          {confirmW === 0 && (
            <Text
              style={[labelStyle, { position: "absolute", opacity: 0 }]}
              onLayout={(e) => setConfirmW(e.nativeEvent.layout.width)}
            >
              {confirmLabel}
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
                {confirmLabel}
              </Animated.Text>
            </Animated.View>
          ) : (
            // First-frame placeholder before measurement completes — keeps
            // the pill from rendering at width=0 for one frame on cold mount.
            <Animated.Text style={[labelStyle, textStyle]} numberOfLines={1}>
              {confirming ? confirmLabel : "Clear"}
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
  accessibilityLabel,
  onPress,
  color,
  disabled,
  badge,
  emphasized,
}: {
  icon: string;
  label: string;
  /** Spoken label when the visible one is abbreviated to fit the capsule. */
  accessibilityLabel?: string;
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
  const fg = emphasized ? "#FFFFFF" : color;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={
        badge !== undefined
          ? `${accessibilityLabel ?? label}, ${badge} unread`
          : (accessibilityLabel ?? label)
      }
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        paddingHorizontal: 11,
        paddingVertical: 7,
        borderRadius: radius.lg,
        backgroundColor: emphasized
          ? color
          : pressed
            ? tintBg(color)
            : "transparent",
        opacity: disabled ? 0.45 : 1,
      })}
    >
      <SymbolView name={icon as any} size={15} tintColor={fg} />
      <Text style={{ ...type.footnote, color: fg, fontWeight: "600" }}>
        {label}
      </Text>
      {badge !== undefined && (
        <View
          style={{
            minWidth: 18,
            paddingHorizontal: 5,
            height: 16,
            borderRadius: radius.sm,
            backgroundColor: color,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              color: "#FFFFFF",
              fontSize: 11,
              fontWeight: "700",
              lineHeight: 14,
              fontVariant: ["tabular-nums"],
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
  pendingAckCount,
}: {
  search: string;
  onSearchChange: (s: string) => void;
  sourceApps: { id: string; name: string; logoUrl: string | null }[];
  filterAppId: string | null;
  onFilterChange: (id: string | null) => void;
  pendingAckCount: number;
}) {
  const { colors, ov, tint } = useTheme();
  return (
    <View
      style={{
        gap: spacing.md,
        marginBottom: spacing.sm,
      }}
    >
      {pendingAckCount > 0 && (
        <View
          style={{
            marginHorizontal: spacing.lg,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            borderRadius: radius.md,
            borderCurve: "continuous",
            backgroundColor: tint(0.14, colors.destructive),
            borderWidth: 1,
            borderColor: tint(0.26, colors.destructive),
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.sm,
          }}
        >
          <SymbolView
            name="bell.badge.waveform"
            size={18}
            tintColor={colors.destructive}
          />
          <Text style={{ ...type.subhead, color: colors.destructive, flex: 1 }}>
            {pendingAckCount} awaiting acknowledgement — tap to stop alerting
          </Text>
        </View>
      )}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginHorizontal: spacing.lg,
          paddingHorizontal: spacing.lg - 2,
          height: 46,
          borderRadius: radius.button,
          borderCurve: "continuous",
          backgroundColor: ov(0.06),
          borderWidth: 1,
          borderColor: ov(0.05),
          gap: spacing.sm + 2,
        }}
      >
        <SymbolView
          name="magnifyingglass"
          size={17}
          tintColor={colors.tertiaryLabel}
        />
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
            padding: 0,
          }}
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
          returnKeyType="search"
        />
      </View>
      {sourceApps.length > 1 &&
        (sourceApps.length > FILTER_CHIP_THRESHOLD ? (
          <View
            style={{ marginHorizontal: spacing.lg, alignSelf: "flex-start" }}
          >
            <Host matchContents>
              <Picker
                selection={filterAppId ?? FILTER_ALL_TAG}
                onSelectionChange={(v) => {
                  haptic.selection();
                  onFilterChange(v === FILTER_ALL_TAG ? null : (v as string));
                }}
                modifiers={[
                  pickerStyle("menu"),
                  fixedSize({ horizontal: true }),
                ]}
              >
                <UIText modifiers={[tag(FILTER_ALL_TAG)]}>All apps</UIText>
                {sourceApps.map((a) => (
                  <UIText key={a.id} modifiers={[tag(a.id)]}>
                    {a.name}
                  </UIText>
                ))}
              </Picker>
            </Host>
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: spacing.lg,
              gap: spacing.xs,
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
        ))}
    </View>
  );
}

function FilterChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Chip label={label} variant={selected ? "solid" : "ghost"} onPress={onPress} />
  );
}

function FeedFooter({
  canLoadMore,
  loading,
  exhausted,
  shown,
  onLoadMore,
}: {
  canLoadMore: boolean;
  loading: boolean;
  exhausted: boolean;
  shown: number;
  onLoadMore: () => void;
}) {
  const { colors } = useTheme();
  if (shown === 0) return null;
  if (canLoadMore || loading) {
    return (
      <Pressable
        onPress={onLoadMore}
        disabled={loading}
        accessibilityRole="button"
        accessibilityLabel="Load older notifications"
        style={({ pressed }) => ({
          marginHorizontal: spacing.lg,
          marginTop: spacing.md,
          paddingVertical: spacing.sm + 2,
          alignItems: "center",
          borderRadius: radius.md,
          borderCurve: "continuous",
          backgroundColor: pressed ? colors.cellHighlight : colors.fill,
        })}
      >
        <Text
          style={{ ...type.subhead, color: colors.accent, fontWeight: "600" }}
        >
          {loading ? "Loading…" : "Load older"}
        </Text>
      </Pressable>
    );
  }
  if (exhausted) {
    return (
      <Text
        style={{
          ...type.caption1,
          color: colors.tertiaryLabel,
          textAlign: "center",
          marginTop: spacing.lg,
        }}
      >
        That's everything.
      </Text>
    );
  }
  return null;
}

function FeedEmpty() {
  return (
    <EmptyState
      icon="checkmark.circle"
      title="You're all caught up"
      message="New notifications from your connected apps will show up here."
    />
  );
}

/**
 * First-load placeholder. A search-bar bar plus a card of ghost rows that
 * pulse in unison — reads as "content is coming" and mirrors the real row
 * layout so nothing jumps when data lands, instead of a bare spinner.
 */
function FeedSkeleton() {
  const { colors } = useTheme();
  const shimmer = useSharedValue(0.4);
  useEffect(() => {
    shimmer.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [shimmer]);
  const pulse = useAnimatedStyle(() => ({ opacity: shimmer.value }));
  const rows = [0, 1, 2, 3, 4];
  return (
    <View style={{ marginTop: spacing.xl }}>
      <Animated.View
        style={[
          {
            height: 44,
            marginHorizontal: spacing.lg,
            borderRadius: radius.md,
            borderCurve: "continuous",
            backgroundColor: colors.fill,
            marginBottom: spacing.lg,
          },
          pulse,
        ]}
      />
      <View
        style={{
          marginHorizontal: spacing.lg,
          borderRadius: radius.lg,
          borderCurve: "continuous",
          overflow: "hidden",
          backgroundColor: colors.cell,
        }}
      >
        {rows.map((i) => (
          <View key={i}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.md,
                paddingLeft: spacing.md,
                paddingRight: spacing.lg,
                paddingVertical: spacing.md,
                minHeight: 72,
              }}
            >
              <Animated.View
                style={[
                  {
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: colors.fill,
                  },
                  pulse,
                ]}
              />
              <View style={{ flex: 1, gap: 8 }}>
                <Animated.View
                  style={[
                    {
                      height: 12,
                      width: "45%",
                      borderRadius: 6,
                      backgroundColor: colors.fill,
                    },
                    pulse,
                  ]}
                />
                <Animated.View
                  style={[
                    {
                      height: 12,
                      width: "80%",
                      borderRadius: 6,
                      backgroundColor: colors.fill,
                    },
                    pulse,
                  ]}
                />
              </View>
            </View>
            {i < rows.length - 1 && (
              <View
                style={{
                  height: 0.5,
                  backgroundColor: colors.separator,
                  marginLeft: 64,
                }}
              />
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

// Feed types and pure helpers live in `@/lib/feed-helpers` so they can be
// unit-tested in jest without dragging in the whole screen module.

function FeedGroupRow({
  group,
  onOpenItem,
  onToggleGroupRead,
  onDeleteGroup,
}: {
  group: Extract<FeedEntry, { kind: "group" }>;
  onOpenItem: (item: FeedItem) => void;
  onToggleGroupRead: () => void;
  onDeleteGroup: () => void;
}) {
  const { colors, ov } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const latest = group.latest;
  const anyEnded = group.all.some((i) => i.liveActivity?.action === "end");
  const anyUnread = group.all.some((i) => !i.readAt);
  const eventCount = group.all.length;
  const swipeRef = useRef<SwipeableMethods | null>(null);
  const pressScale = usePressScale();
  // Same rule as a single row — see the note there on uploaded logos.
  const identity = identityTint(
    latest.sourceAppLogoUrl,
    latest.sourceAppId as unknown as string,
    latest.sourceAppLogoColor,
  );
  const tint = identity ?? (anyUnread && !anyEnded ? colors.accent : null);

  const header = (
    <Pressable
      onPress={() => {
        haptic.selection();
        setExpanded((e) => !e);
      }}
      onPressIn={pressScale.onPressIn}
      onPressOut={pressScale.onPressOut}
      accessibilityRole="button"
      accessibilityLabel={`Live activity from ${latest.sourceAppName}, ${latest.title}, ${eventCount} ${eventCount === 1 ? "event" : "events"}${anyEnded ? ", ended" : ""}`}
      accessibilityState={{ expanded }}
      accessibilityHint="Toggles event history"
      style={({ pressed }) => ({
        backgroundColor: pressed ? ov(0.05) : "transparent",
        paddingLeft: spacing.lg,
        paddingRight: spacing.lg,
        paddingVertical: spacing.lg,
        flexDirection: "row",
        alignItems: "center",
        gap: 13,
        minHeight: 72,
        opacity: anyEnded ? 0.85 : 1,
      })}
    >
      <View>
        <Avatar
          url={latest.sourceAppLogoUrl}
          name={latest.sourceAppName}
          colorKey={latest.sourceAppId as unknown as string}
          size={44}
        />
        {!latest.readAt && !anyEnded && (
          <View
            style={{
              position: "absolute",
              left: -2,
              top: -2,
              width: 12,
              height: 12,
              borderRadius: 6,
              backgroundColor: colors.accent,
              borderWidth: 2,
              borderColor: colors.cell,
            }}
          />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "baseline",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              flex: 1,
            }}
          >
            <Text
              style={{ ...type.footnote, color: colors.secondaryLabel }}
              numberOfLines={1}
            >
              {latest.sourceAppName}
            </Text>
            {latest.liveActivity && (
              <LiveActivityBadge action={latest.liveActivity.action} />
            )}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 3,
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: 6,
                backgroundColor: colors.fill,
              }}
            >
              <Text
                style={{
                  ...type.caption2,
                  color: colors.secondaryLabel,
                  fontWeight: "600",
                }}
              >
                {eventCount} event{eventCount === 1 ? "" : "s"}
              </Text>
            </View>
          </View>
          <Text style={{ ...type.caption1, color: colors.tertiaryLabel }}>
            {formatRelative(latest.createdAt)}
          </Text>
        </View>
        <Text
          style={{ ...type.headline, color: colors.label, marginTop: 1 }}
          numberOfLines={1}
        >
          {latest.title}
        </Text>
        {latest.liveActivity ? (
          <LiveActivityBody state={latest.liveActivity.state} />
        ) : (
          <Text
            style={{
              ...type.subhead,
              color: colors.secondaryLabel,
              marginTop: 1,
            }}
            numberOfLines={2}
          >
            {latest.body}
          </Text>
        )}
      </View>
      <SymbolView
        name={expanded ? "chevron.up" : "chevron.down"}
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
        gap: spacing.sm,
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
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.sm,
            paddingVertical: 6,
            paddingHorizontal: 6,
            borderRadius: radius.sm,
            backgroundColor: pressed ? colors.cellHighlight : "transparent",
            opacity: item.liveActivity?.action === "end" ? 0.7 : 1,
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
              flex: 1,
            }}
            numberOfLines={1}
          >
            {item.liveActivity?.state.status ??
              item.liveActivity?.state.title ??
              item.body}
          </Text>
          {typeof item.liveActivity?.state.progress === "number" && (
            <Text
              style={{
                ...type.caption1,
                color: colors.tertiaryLabel,
                fontVariant: ["tabular-nums"],
              }}
            >
              {Math.round(
                Math.max(0, Math.min(1, item.liveActivity.state.progress)) *
                  100,
              )}
              %
            </Text>
          )}
          <Text
            style={{
              ...type.caption2,
              color: colors.tertiaryLabel,
              fontVariant: ["tabular-nums"],
              minWidth: 34,
              textAlign: "right",
            }}
          >
            {formatRelative(item.createdAt)}
          </Text>
        </Pressable>
      ))}
    </Animated.View>
  );

  return (
    <Card
      tint={tint}
      bloom={false}
      padding={false}
      style={{ marginHorizontal: spacing.lg, marginBottom: spacing.md }}
    >
      <ReanimatedSwipeable
        ref={swipeRef}
        friction={SWIPE_FRICTION}
        overshootFriction={SWIPE_OVERSHOOT_FRICTION}
        rightThreshold={SWIPE_DELETE_THRESHOLD}
        leftThreshold={SWIPE_DELETE_THRESHOLD}
        renderLeftActions={(progress) => (
          <SwipeAction
            progress={progress}
            side="left"
            tint={colors.accent}
            label={anyUnread ? "Read" : "Unread"}
            icon={anyUnread ? "checkmark.circle.fill" : "circle"}
            onPress={() => {
              haptic.selection();
              onToggleGroupRead();
              swipeRef.current?.close();
            }}
          />
        )}
        // Render the action against the row's full unswiped width so the
        // destructive surface can grow with the gesture (iOS Mail style)
        // rather than sitting as a fixed 96pt pill.
        renderRightActions={(progress, translation) => (
          <SwipeAction
            progress={progress}
            translation={translation}
            tint={colors.destructive}
            label="Delete all"
            icon="trash.fill"
            onPress={onDeleteGroup}
          />
        )}
        // Fires when the release crosses the threshold and the snap-open
        // animation kicks off. Commit immediately — Convex's mutation
        // round-trip + LinearTransition row collapse happen in parallel,
        // landing right as the snap-open finishes.
        onSwipeableWillOpen={(direction) => {
          if (direction === "right") {
            haptic.warning();
            onDeleteGroup();
          } else {
            haptic.selection();
            onToggleGroupRead();
            swipeRef.current?.close();
          }
        }}
      >
        <Animated.View style={pressScale.style}>
          {/* Opaque so the swipe actions stay hidden underneath as the row
              slides — which is why this layer, not the Card, blooms. */}
          <View style={{ backgroundColor: colors.cell }}>
            {tint ? (
              <CardBloom tint={tint} strength={anyUnread && !anyEnded ? 0.3 : 0.13} />
            ) : null}
            {header}
            {expandedList}
          </View>
        </Animated.View>
      </ReanimatedSwipeable>
    </Card>
  );
}

function ActionBadge({ action }: { action?: "start" | "update" | "end" }) {
  const { colors, tintBg } = useTheme();
  const spec = (() => {
    switch (action) {
      case "start":
        return { label: "START", color: colors.accent };
      case "end":
        return { label: "END", color: colors.success };
      case "update":
      default:
        return { label: "UPDATE", color: colors.warning };
    }
  })();
  return (
    <View
      style={{
        minWidth: 56,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 5,
        alignItems: "center",
        backgroundColor: tintBg(spec.color),
      }}
    >
      <Text
        numberOfLines={1}
        allowFontScaling={false}
        style={{
          fontSize: 10,
          lineHeight: 13,
          color: spec.color,
          fontWeight: "700",
          letterSpacing: 0.3,
        }}
      >
        {spec.label}
      </Text>
    </View>
  );
}

function FeedRow({
  item,
  onOpen,
  onToggleRead,
  onDelete,
}: {
  item: FeedItem;
  onOpen: () => void;
  onToggleRead: () => void;
  onDelete: () => void;
}) {
  const { colors, ov } = useTheme();
  const unread = !item.readAt;
  const swipeRef = useRef<SwipeableMethods | null>(null);
  const pressScale = usePressScale();
  // An uploaded logo's color is sampled server-side; a generated avatar shares
  // the hash its monogram is drawn from. When neither is available the card
  // carries the accent while unread — a state signal, not a claim about the
  // artwork — and stays plain once read.
  const identity = identityTint(
    item.sourceAppLogoUrl,
    item.sourceAppId as unknown as string,
    item.sourceAppLogoColor,
  );
  const tint = identity ?? (unread ? colors.accent : null);

  // Inline body expansion. A hidden absolute Text (no line cap) sits over
  // the visible body and reports the natural line count via `onTextLayout`.
  // If that's > 2 the body would truncate, so we surface the expand chevron.
  // More reliable than diffing rendered-vs-original chars on the visible
  // (already-capped) Text, which mishandles ellipsis and whitespace.
  const [bodyExpanded, setBodyExpanded] = useState(false);

  const a11yParts = [
    unread ? "Unread" : "Read",
    `notification from ${item.sourceAppName}`,
    item.title,
    item.body,
    formatRelative(item.createdAt) + " ago",
    item.ack && !item.acknowledgedAt ? "acknowledgement needed" : null,
  ].filter(Boolean);
  const row = (
    <Pressable
      onPress={() => {
        haptic.selection();
        onOpen();
      }}
      onPressIn={pressScale.onPressIn}
      onPressOut={pressScale.onPressOut}
      accessibilityRole="button"
      accessibilityLabel={a11yParts.join(", ")}
      accessibilityHint={item.url ? "Opens linked URL" : "Marks as read"}
      style={({ pressed }) => ({
        backgroundColor: pressed ? ov(0.05) : "transparent",
        paddingLeft: spacing.lg,
        paddingRight: spacing.lg,
        paddingVertical: spacing.lg,
        flexDirection: "row",
        alignItems: "center",
        gap: 13,
        minHeight: 72,
      })}
    >
      <View>
        <Avatar
          url={item.sourceAppLogoUrl}
          name={item.sourceAppName}
          colorKey={item.sourceAppId as unknown as string}
          size={44}
        />
        {unread && (
          <View
            style={{
              position: "absolute",
              left: -2,
              top: -2,
              width: 12,
              height: 12,
              borderRadius: 6,
              backgroundColor: colors.accent,
              borderWidth: 2,
              borderColor: colors.cell,
            }}
          />
        )}
      </View>
      <NotificationContent
        item={item}
        bodyExpanded={bodyExpanded}
        onToggleBodyExpanded={() => setBodyExpanded((v) => !v)}
      />
      {item.image ? (
        <Image
          source={{ uri: item.image }}
          style={{
            width: 56,
            height: 56,
            borderRadius: radius.md,
            backgroundColor: colors.fill,
          }}
          contentFit="cover"
          transition={150}
          accessibilityIgnoresInvertColors
        />
      ) : (
        item.url && (
          <SymbolView
            name="chevron.right"
            size={14}
            tintColor={colors.tertiaryLabel}
          />
        )
      )}
    </Pressable>
  );

  const actions = (item.actions ?? []) as NotifAction[];
  const rowStack = (
    // Opaque so the swipe actions stay hidden underneath as the row slides,
    // which is why this layer — not the Card — carries the corner bloom.
    <View style={{ backgroundColor: colors.cell }}>
      {tint ? <CardBloom tint={tint} strength={unread ? 0.3 : 0.13} /> : null}
      {row}
      {actions.length > 0 && (
        <ActionButtonsBar
          notificationId={item._id}
          actions={actions}
          serverResults={item.actionResults}
          disabled={item.acknowledgedAt !== undefined}
        />
      )}
    </View>
  );

  return (
    <Card
      tint={tint}
      bloom={false}
      padding={false}
      style={{ marginHorizontal: spacing.lg, marginBottom: spacing.md }}
    >
      <ReanimatedSwipeable
        ref={swipeRef}
        friction={SWIPE_FRICTION}
        overshootFriction={SWIPE_OVERSHOOT_FRICTION}
        rightThreshold={SWIPE_DELETE_THRESHOLD}
        leftThreshold={SWIPE_DELETE_THRESHOLD}
        renderLeftActions={(progress) => (
          <SwipeAction
            progress={progress}
            side="left"
            tint={colors.accent}
            label={unread ? "Read" : "Unread"}
            icon={unread ? "checkmark.circle.fill" : "circle"}
            onPress={() => {
              haptic.selection();
              onToggleRead();
              swipeRef.current?.close();
            }}
          />
        )}
        renderRightActions={(progress, translation) => (
          <SwipeAction
            progress={progress}
            translation={translation}
            tint={colors.destructive}
            label="Delete"
            icon="trash.fill"
            onPress={() => {
              haptic.warning();
              onDelete();
            }}
          />
        )}
        onSwipeableWillOpen={(direction) => {
          if (direction === "right") {
            haptic.warning();
            onDelete();
          } else {
            // Leading swipe toggles read/unread as a single gesture, then
            // snaps closed — the row stays in place (unlike delete).
            haptic.selection();
            onToggleRead();
            swipeRef.current?.close();
          }
        }}
      >
        <Animated.View style={pressScale.style}>{rowStack}</Animated.View>
      </ReanimatedSwipeable>
    </Card>
  );
}

// Action buttons line up with the row's text column rather than its outer
// padding, so they read as part of the notification instead of a floating
// strip: row padding + avatar + the gap between them.
const ACTION_INDENT = spacing.lg + 44 + 13;
// Matches the compact chip height used elsewhere; keeps the buttons from
// out-weighing the two lines of text above them.
const ACTION_HEIGHT = 32;

// `destructive` only exists on the open_url / callback variants, so narrow
// before reading it.
function isDestructiveAction(a: NotifAction): boolean {
  return "destructive" in a && !!a.destructive;
}

// Honest leading glyph per action kind. Callbacks that aren't destructive get
// none — a generic checkmark would mislabel arbitrary actions.
function actionIcon(a: NotifAction): string | null {
  if (a.kind === "reply") return "arrowshape.turn.up.left.fill";
  if (a.kind === "open_url") return "arrow.up.right";
  if (isDestructiveAction(a)) return "xmark";
  return null;
}

type ActionOutcome = { ok: boolean; detail?: string; spent: boolean };

function ActionButtonsBar({
  notificationId,
  actions,
  serverResults,
  disabled,
}: {
  notificationId: Id<"notifications">;
  actions: NotifAction[];
  /** Settled outcomes from the backend — survives scroll, remount and relaunch. */
  serverResults: FeedItem["actionResults"];
  disabled: boolean;
}) {
  const { colors, ov, tint } = useTheme();
  // One suggested action per notification: the first non-destructive action
  // wears the accent tint, everything else stays neutral.
  const primaryId = actions.find((a) => !isDestructiveAction(a))?.id;
  const invoke = useAction(api.actions.invoke);
  const [busy, setBusy] = useState<string | null>(null);
  // Optimistic, for the window between the tap and the backend's answer. The
  // server's own results are authoritative and land over the top of these.
  const [local, setLocal] = useState<Record<string, ActionOutcome>>({});

  const outcomes = useMemo(() => {
    const merged: Record<string, ActionOutcome> = { ...local };
    for (const r of serverResults ?? []) {
      merged[r.actionId] = {
        ok: r.ok,
        detail: r.detail,
        // A successful callback or reply is spent — the backend refuses to fire
        // it twice, so the button stops offering. A link is always re-openable.
        spent: r.ok && r.kind !== "open_url",
      };
    }
    return merged;
  }, [local, serverResults]);

  function record(actionId: string, outcome: ActionOutcome) {
    setLocal((l) => ({ ...l, [actionId]: outcome }));
  }

  async function handle(action: NotifAction) {
    if (busy || disabled || outcomes[action.id]?.spent) return;
    haptic.selection();
    setBusy(action.id);
    try {
      if (action.kind === "open_url") {
        void Linking.openURL(action.url).catch(() => {});
        record(action.id, { ok: true, detail: "Opened", spent: false });
      }
      let reply: string | undefined;
      if (action.kind === "reply") {
        const text = await promptText({
          title: action.label,
          placeholder: action.placeholder ?? "Type a reply",
          confirmLabel: "Send",
        });
        if (text === null) return;
        reply = text;
      }
      if (action.kind === "open_url") return;
      const result = await invoke({
        notificationId,
        actionIdentifier: action.id,
        ...(reply !== undefined ? { reply } : {}),
      });
      const ok = !!result?.ok;
      // `alreadyDone` means another tap (or another device) got there first and
      // nothing was sent this time — the outcome is still "done", not an error.
      // `pending` means one is in flight, so leave the button alone and let the
      // subscription deliver the real result.
      if (result?.pending) return;
      record(action.id, {
        ok,
        detail:
          result?.detail ??
          (ok
            ? result?.alreadyDone
              ? "Already sent"
              : action.kind === "reply"
                ? "Reply sent"
                : "Sent"
            : "Failed"),
        spent: ok,
      });
    } catch {
      record(action.id, { ok: false, detail: "Failed", spent: false });
    } finally {
      setBusy(null);
    }
  }

  return (
    // Deliberately transparent: the card's corner bloom is painted by the
    // stack above this and an opaque background would clip it off in a hard
    // line right above the buttons. The parent already paints `cell`, so the
    // swipe actions stay hidden underneath either way.
    <View>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: spacing.sm - 2,
          paddingLeft: ACTION_INDENT,
          paddingRight: spacing.lg,
          paddingBottom: spacing.lg,
          // The row above already ends on 16pt of padding — the buttons sit on
          // that, so the strip adds none of its own on top.
          paddingTop: 0,
        }}
      >
        {actions.map((a) => {
          const outcome = outcomes[a.id];
          const failed = outcome?.ok === false;
          const spent = !!outcome?.spent;
          const inert = busy !== null || disabled || spent;
          const destructive = isDestructiveAction(a);
          const isPrimary = a.id === primaryId;
          // Each button's semantic color. The primary wears it as a wash +
          // hairline + label (the design's `tinted` treatment); everything
          // else stays neutral so one action reads as the suggested one
          // without a saturated block shouting over the notification text.
          const themeColor = failed
            ? colors.destructive
            : destructive
              ? colors.destructive
              : colors.accent;
          // A spent action stops being emphasized — it's a record of what
          // happened, not an invitation.
          const emphasized = (isPrimary || destructive || failed) && !spent;
          const fg = spent
            ? colors.secondaryLabel
            : emphasized
              ? themeColor
              : colors.label;
          const leadIcon = actionIcon(a);
          return (
            <Pressable
              key={a.id}
              onPress={() => handle(a)}
              disabled={inert}
              accessibilityRole="button"
              accessibilityLabel={
                spent ? `${a.label} — already done` : a.label
              }
              accessibilityState={{
                disabled: inert,
                busy: busy === a.id,
              }}
              style={({ pressed }) => ({
                minHeight: ACTION_HEIGHT,
                paddingHorizontal: 14,
                borderRadius: radius.pill,
                borderCurve: "continuous",
                borderWidth: 1,
                borderColor: emphasized ? tint(0.32, themeColor) : ov(0.08),
                backgroundColor: emphasized ? tint(0.13, themeColor) : ov(0.05),
                opacity: pressed || (busy !== null && busy !== a.id) ? 0.6 : 1,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              })}
            >
              {outcome?.ok ? (
                <SymbolView
                  name="checkmark"
                  size={12}
                  weight="semibold"
                  tintColor={fg}
                />
              ) : failed ? (
                <SymbolView
                  name="exclamationmark.triangle.fill"
                  size={12}
                  weight="semibold"
                  tintColor={colors.destructive}
                />
              ) : leadIcon ? (
                <SymbolView
                  name={leadIcon as any}
                  size={12}
                  weight="semibold"
                  tintColor={fg}
                />
              ) : null}
              <Text
                style={{
                  fontSize: 13,
                  lineHeight: 17,
                  fontWeight: "600",
                  letterSpacing: -0.08,
                  color: fg,
                }}
                numberOfLines={1}
              >
                {a.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Subtle result feedback — turns the feed into a live command center */}
      {Object.keys(outcomes).length > 0 && (
        <View
          style={{
            paddingLeft: ACTION_INDENT,
            paddingRight: spacing.lg,
            paddingBottom: spacing.md,
            marginTop: -spacing.sm,
            gap: 4,
          }}
        >
          {Object.entries(outcomes).map(([id, outcome]) =>
            outcome.detail ? (
              <Text
                key={id}
                style={{
                  ...type.caption1,
                  color: outcome.ok ? colors.secondaryLabel : colors.destructive,
                }}
              >
                {outcome.detail}
              </Text>
            ) : null,
          )}
        </View>
      )}
    </View>
  );
}

/**
 * Right-side destructive swipe action. Fixed 96pt width so
 * ReanimatedSwipeable has a well-defined snap target (it measures this
 * intrinsic width to determine where the row settles when opened). Icon
 * glides in from the right edge of the action so it feels anchored to
 * the gesture rather than floating in mid-air.
 */
function SwipeAction({
  progress,
  translation,
  side = "right",
  tint,
  label,
  icon,
  onPress,
}: {
  progress: SharedValue<number>;
  // Live drag distance. When provided, crossing SWIPE_TICK_THRESHOLD fires a
  // one-shot anticipation haptic (with hysteresis so it re-arms on the way
  // back). Only the destructive action passes this so the tick doesn't
  // double-fire across both swipe directions.
  translation?: SharedValue<number>;
  side?: "left" | "right";
  tint: string;
  label: string;
  icon: string;
  onPress: () => void;
}) {
  const armed = useSharedValue(false);
  useAnimatedReaction(
    () => (translation ? Math.abs(translation.value) : 0),
    (dist) => {
      if (!translation) return;
      if (!armed.value && dist >= SWIPE_TICK_THRESHOLD) {
        armed.value = true;
        runOnJS(haptic.light)();
      } else if (armed.value && dist < SWIPE_TICK_THRESHOLD - 12) {
        armed.value = false;
      }
    },
  );
  // Icon glides in from the edge the action is anchored to.
  const from = side === "right" ? 20 : -20;
  const iconStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(
          progress.value,
          [0, 1],
          [from, 0],
          Extrapolation.CLAMP,
        ),
      },
    ],
    opacity: interpolate(
      progress.value,
      [0, 0.4, 1],
      [0, 0.6, 1],
      Extrapolation.CLAMP,
    ),
  }));
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        width: 96,
        backgroundColor: tint,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Animated.View style={[{ alignItems: "center" }, iconStyle]}>
        <SymbolView name={icon as any} size={22} tintColor="#FFFFFF" />
        <Text style={{ color: "#FFFFFF", ...type.caption1, marginTop: 4 }}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}
