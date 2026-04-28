import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import type { NotifAction } from "../../../../convex/lib/actionsLayout";
import type { Id } from "../../../../convex/_generated/dataModel";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import Animated, {
  Extrapolation,
  FadeIn,
  FadeOut,
  interpolate,
  LinearTransition,
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";
import { SymbolView } from "expo-symbols";
import { BlurView } from "expo-blur";
import { useCallback, useMemo, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader, ScreenBody } from "@/components/ScreenHeader";
import { ScreenTransition } from "@/components/ScreenTransition";
import { Avatar } from "@/components/Avatar";
import { useTheme, spacing, radius, type } from "@/lib/theme";
import { haptic } from "@/lib/haptics";
import { promptText } from "@/lib/prompt";

// Distance (px) the row must travel before a release auto-fires delete.
// Smaller = more sensitive. We want a deliberate full swipe.
const FULL_SWIPE_THRESHOLD = 140;

export default function Feed() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const items = useQuery(api.notifications.listMine, { limit: 100 });
  const markRead = useMutation(api.notifications.markRead);
  const markAllRead = useMutation(api.notifications.markAllRead);
  const deleteOne = useMutation(api.notifications.deleteOne);
  const clearAll = useMutation(api.notifications.clearAll);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [filterAppId, setFilterAppId] = useState<string | null>(null);

  const unreadCount = items?.filter((i) => !i.readAt).length ?? 0;
  const total = items?.length ?? 0;

  const sourceApps = (() => {
    if (!items)
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

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    haptic.light();
    setTimeout(() => setRefreshing(false), 500);
  }, []);

  function confirmClear() {
    Alert.alert(
      "Clear feed?",
      "All notifications will be permanently removed.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: () => {
            haptic.warning();
            clearAll({});
          },
        },
      ],
    );
  }

  const header = (
    <ScreenHeader
      eyebrow={
        total > 0
          ? unreadCount > 0
            ? `${unreadCount} unread`
            : `${total} ${total === 1 ? "item" : "items"}`
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
              alignItems: "center",
              justifyContent: "center",
              paddingTop: spacing.xxl,
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

  const pendingAckCount =
    items?.filter((i) => i.ack && !i.acknowledgedAt).length ?? 0;

  const entries = useMemo(
    () => groupFeedItems(filtered ?? undefined),
    [filtered],
  );

  return (
    <ScreenTransition style={{ backgroundColor: colors.background }}>
      {header}
      <ScreenBody>
        <FlatList
          data={entries}
          keyExtractor={(e) => (e.kind === "group" ? `g:${e.activityId}` : e.item._id)}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{
            paddingTop: spacing.md,
            paddingBottom: Math.max(160, insets.bottom + 100),
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
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.secondaryLabel}
            />
          }
          renderItem={({ item: entry, index }) => {
            const isFirst = index === 0;
            const isLast = index === entries.length - 1;
            if (entry.kind === "group") {
              return (
                <FeedGroupRow
                  group={entry}
                  isFirst={isFirst}
                  isLast={isLast}
                  onOpenItem={(item) => {
                    if (!item.readAt) markRead({ id: item._id });
                    if (item.url) Linking.openURL(item.url).catch(() => {});
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
                  if (entry.item.url)
                    Linking.openURL(entry.item.url).catch(() => {});
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
        onClear={confirmClear}
      />
    </ScreenTransition>
  );
}

function FloatingBar({
  unreadCount,
  onMarkAllRead,
  onClear,
}: {
  unreadCount: number;
  onMarkAllRead: () => void;
  onClear: () => void;
}) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const canMarkAllRead = unreadCount > 0;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: Math.max(insets.bottom, 0) + spacing.lg,
        alignItems: "center",
      }}
    >
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
            borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
            borderRadius: 28,
          }}
        >
          <BarAction
            icon="checkmark.circle"
            label="Mark all read"
            disabled={!canMarkAllRead}
            badge={canMarkAllRead ? unreadCount : undefined}
            onPress={onMarkAllRead}
            color={colors.accent}
          />
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
          <BarAction
            icon="trash"
            label="Clear"
            onPress={onClear}
            color={colors.destructive}
          />
        </BlurView>
      </View>
    </View>
  );
}

function BarAction({
  icon,
  label,
  onPress,
  color,
  disabled,
  badge,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  color: string;
  disabled?: boolean;
  badge?: number;
}) {
  const { tintBg } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 22,
        backgroundColor: pressed ? tintBg(color) : "transparent",
        opacity: disabled ? 0.45 : 1,
      })}
    >
      <SymbolView name={icon as any} size={18} tintColor={color} />
      <Text style={{ ...type.callout, color, fontWeight: "600" }}>{label}</Text>
      {badge !== undefined && (
        <View
          style={{
            minWidth: 20,
            paddingHorizontal: 6,
            height: 18,
            borderRadius: 9,
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
  const { colors, tintBg } = useTheme();
  return (
    <View
      style={{
        gap: spacing.sm,
        marginBottom: spacing.lg,
        marginTop: spacing.md,
      }}
    >
      {pendingAckCount > 0 && (
        <View
          style={{
            marginHorizontal: spacing.lg,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            borderRadius: 10,
            borderCurve: "continuous",
            backgroundColor: tintBg(colors.destructive, "1F"),
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
          paddingHorizontal: spacing.md,
          height: 36,
          borderRadius: 10,
          borderCurve: "continuous",
          backgroundColor: colors.fill,
          gap: spacing.sm,
        }}
      >
        <SymbolView
          name="magnifyingglass"
          size={16}
          tintColor={colors.secondaryLabel}
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
      {sourceApps.length > 1 && (
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
      )}
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
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 14,
        backgroundColor: selected
          ? colors.accent
          : pressed
            ? colors.cellHighlight
            : colors.fill,
      })}
    >
      <Text
        style={{
          ...type.footnote,
          fontWeight: "600",
          color: selected ? colors.accentContrast : colors.label,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function EmptyState() {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: spacing.xxl,
        gap: spacing.md,
      }}
    >
      <View
        style={{
          width: 88,
          height: 88,
          borderRadius: 44,
          backgroundColor: colors.fill,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <SymbolView
          name="bell.slash"
          size={40}
          tintColor={colors.tertiaryLabel}
        />
      </View>
      <Text style={{ ...type.title3, color: colors.label }}>
        Your feed is empty
      </Text>
      <Text
        style={{
          ...type.subhead,
          color: colors.secondaryLabel,
          textAlign: "center",
          maxWidth: 260,
        }}
      >
        Create a source app in the Apps tab and send your first push.
      </Text>
    </View>
  );
}

type FeedItem = FunctionReturnType<typeof api.notifications.listMine>[number];

type FeedEntry =
  | { kind: "single"; item: FeedItem }
  | {
      kind: "group";
      activityId: string;
      latest: FeedItem;
      all: FeedItem[];
    };

/**
 * Collapse consecutive `liveActivity` notifications that share the same
 * `activityId` into a single group. Items arrive newest-first, so
 * `latest` is the head of each group and `all` is every event (start +
 * updates + end) for that activity in reverse chronological order.
 */
function groupFeedItems(items?: FeedItem[]): FeedEntry[] {
  if (!items) return [];
  const out: FeedEntry[] = [];
  const indexByActivity = new Map<string, number>();
  for (const item of items) {
    const activityId = item.liveActivity?.activityId;
    if (!activityId) {
      out.push({ kind: "single", item });
      continue;
    }
    const existingIdx = indexByActivity.get(activityId);
    if (existingIdx !== undefined) {
      const existing = out[existingIdx];
      if (existing.kind === "group") {
        existing.all.push(item);
      }
      continue;
    }
    out.push({ kind: "group", activityId, latest: item, all: [item] });
    indexByActivity.set(activityId, out.length - 1);
  }
  return out;
}

function FeedGroupRow({
  group,
  isFirst,
  isLast,
  onOpenItem,
  onDeleteGroup,
}: {
  group: Extract<FeedEntry, { kind: "group" }>;
  isFirst: boolean;
  isLast: boolean;
  onOpenItem: (item: FeedItem) => void;
  onDeleteGroup: () => void;
}) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const latest = group.latest;
  const anyEnded = group.all.some((i) => i.liveActivity?.action === "end");
  const eventCount = group.all.length;

  const header = (
    <Pressable
      onPress={() => {
        haptic.selection();
        setExpanded((e) => !e);
      }}
      style={({ pressed }) => ({
        backgroundColor: pressed ? colors.cellHighlight : colors.cell,
        paddingLeft: spacing.md,
        paddingRight: spacing.lg,
        paddingVertical: spacing.md,
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        minHeight: 72,
        opacity: anyEnded ? 0.85 : 1,
      })}
    >
      <View>
        <Avatar
          url={latest.sourceAppLogoUrl}
          name={latest.sourceAppName}
          size={40}
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
      {[...group.all].reverse().map((item) => (
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
            borderRadius: 8,
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
    <View
      style={{
        marginHorizontal: spacing.lg,
        borderTopLeftRadius: isFirst ? radius.lg : 0,
        borderTopRightRadius: isFirst ? radius.lg : 0,
        borderBottomLeftRadius: isLast ? radius.lg : 0,
        borderBottomRightRadius: isLast ? radius.lg : 0,
        overflow: "hidden",
        backgroundColor: colors.cell,
        borderCurve: "continuous",
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
          if (direction === "right") onDeleteGroup();
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
            marginLeft: 64,
          }}
        />
      )}
    </View>
  );
}

function ActionBadge({
  action,
}: {
  action?: "start" | "update" | "end";
}) {
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
  isFirst,
  isLast,
  onOpen,
  onDelete,
}: {
  item: FeedItem;
  isFirst: boolean;
  isLast: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const { colors, tintBg } = useTheme();
  const unread = !item.readAt;

  const row = (
    <Pressable
      onPress={() => {
        haptic.selection();
        onOpen();
      }}
      style={({ pressed }) => ({
        backgroundColor: pressed ? colors.cellHighlight : colors.cell,
        paddingLeft: spacing.md,
        paddingRight: spacing.lg,
        paddingVertical: spacing.md,
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        minHeight: 72,
      })}
    >
      <View>
        <Avatar
          url={item.sourceAppLogoUrl}
          name={item.sourceAppName}
          size={40}
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
          <Text
            style={{
              ...type.subhead,
              color: colors.secondaryLabel,
              marginTop: 1,
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
              alignSelf: "flex-start",
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 10,
              backgroundColor: tintBg(colors.destructive),
            }}
          >
            <SymbolView
              name="bell.badge"
              size={11}
              tintColor={colors.destructive}
            />
            <Text
              style={{
                ...type.caption2,
                color: colors.destructive,
                fontWeight: "600",
              }}
            >
              {item.ack.attempts > 0
                ? `Ack needed · re-alerted ${item.ack.attempts}×`
                : "Ack needed"}
            </Text>
          </View>
        )}
      </View>
      {item.url && (
        <SymbolView
          name="chevron.right"
          size={14}
          tintColor={colors.tertiaryLabel}
        />
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
        overflow: "hidden",
        backgroundColor: colors.cell,
        borderCurve: "continuous",
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
          if (direction === "right") {
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
            marginLeft: 64,
          }}
        />
      )}
    </View>
  );
}

function ActionButtonsBar({
  notificationId,
  actions,
  disabled,
}: {
  notificationId: Id<"notifications">;
  actions: NotifAction[];
  disabled: boolean;
}) {
  const { colors } = useTheme();
  const invoke = useAction(api.actions.invoke);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, "ok" | "fail">>({});

  async function handle(action: NotifAction) {
    if (busy || disabled) return;
    haptic.selection();
    setBusy(action.id);
    try {
      if (action.kind === "open_url") {
        void Linking.openURL(action.url).catch(() => {});
      }
      if (action.kind === "reply") {
        const text = await promptText({
          title: action.label,
          placeholder: action.placeholder ?? "Type a reply",
          confirmLabel: "Send",
        });
        if (text === null) return;
        const result = await invoke({
          notificationId,
          actionIdentifier: action.id,
          reply: text,
        });
        setDone((d) => ({
          ...d,
          [action.id]: result?.ok ? "ok" : "fail",
        }));
        return;
      }
      const result = await invoke({
        notificationId,
        actionIdentifier: action.id,
      });
      setDone((d) => ({ ...d, [action.id]: result?.ok ? "ok" : "fail" }));
    } catch {
      setDone((d) => ({ ...d, [action.id]: "fail" }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        gap: spacing.xs,
        paddingHorizontal: spacing.md,
        paddingLeft: 64,
        paddingBottom: spacing.md,
        paddingTop: 2,
      }}
    >
      {actions.map((a) => {
        const status = done[a.id];
        const tint =
          status === "fail"
            ? colors.destructive
            : a.kind === "reply"
              ? colors.accent
              : a.destructive
                ? colors.destructive
                : colors.label;
        return (
          <Pressable
            key={a.id}
            onPress={() => handle(a)}
            disabled={busy !== null || disabled}
            style={({ pressed }) => ({
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 14,
              borderWidth: 0.5,
              borderColor: colors.separator,
              backgroundColor: pressed ? colors.cellHighlight : colors.fill,
              opacity: busy !== null && busy !== a.id ? 0.5 : 1,
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
            })}
          >
            {status === "ok" && (
              <SymbolView
                name="checkmark"
                size={12}
                tintColor={colors.accent}
              />
            )}
            {status === "fail" && (
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
                fontWeight: "600",
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

function LiveActivityBadge({
  action,
}: {
  action: "start" | "update" | "end";
}) {
  const { colors, tintBg } = useTheme();
  const ended = action === "end";
  const label = ended ? "Activity ended" : "Live Activity";
  const tint = ended ? colors.tertiaryLabel : colors.accent;
  const bg = ended ? colors.fill : tintBg(colors.accent, "1F");
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
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
          fontWeight: "700",
          letterSpacing: 0.2,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function LiveActivityBody({
  state,
}: {
  state: {
    title?: string;
    status?: string;
    progress?: number;
    icon?: string;
  };
}) {
  const { colors } = useTheme();
  const hasProgress = typeof state.progress === "number";
  const pct = hasProgress ? Math.max(0, Math.min(1, state.progress!)) : 0;
  return (
    <View style={{ marginTop: 4, gap: 6 }}>
      {(state.icon || state.status) && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
          }}
        >
          {state.icon && (
            <SymbolView
              name={state.icon as any}
              size={13}
              tintColor={colors.secondaryLabel}
            />
          )}
          {state.status && (
            <Text
              style={{
                ...type.subhead,
                color: colors.secondaryLabel,
                flex: 1,
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
                fontVariant: ["tabular-nums"],
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
            overflow: "hidden",
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

function SwipeAction({
  progress,
  tint,
  label,
  icon,
  side,
  onPress,
}: {
  progress: SharedValue<number>;
  tint: string;
  label: string;
  icon: string;
  side: "left" | "right";
  onPress: () => void;
}) {
  const from = side === "left" ? -20 : 20;
  const style = useAnimatedStyle(() => ({
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
    opacity: interpolate(progress.value, [0, 0.5, 1], [0, 0.5, 1]),
  }));
  return (
    <Pressable
      onPress={onPress}
      style={{
        width: 96,
        backgroundColor: tint,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Animated.View style={[{ alignItems: "center" }, style]}>
        <SymbolView name={icon as any} size={22} tintColor="#FFFFFF" />
        <Text style={{ color: "#FFFFFF", ...type.caption1, marginTop: 4 }}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
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
