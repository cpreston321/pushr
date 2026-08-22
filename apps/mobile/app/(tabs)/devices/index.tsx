import { useMutation, useQuery } from "convex/react";
import { api } from "@pushr/backend/_generated/api";
import type { Doc } from "@pushr/backend/_generated/dataModel";
import { Alert, FlatList, Pressable, Text, View } from "react-native";
import { SymbolView, type SFSymbol } from "expo-symbols";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import { useEffect, useState } from "react";
import {
  ScreenHeader,
  ScreenBody,
  ScreenShell,
} from "@/components/ScreenHeader";
import { Card } from "@/components/Card";
import { CardBloom } from "@/components/Glow";
import { Toggle } from "@/components/Toggle";
import { Chip, SectionLabel } from "@/components/Chip";
import { EmptyState } from "@/components/EmptyState";
import { IconTile } from "@/components/IconTile";
import { ScreenTransition } from "@/components/ScreenTransition";
import { useTheme, spacing, type } from "@/lib/theme";
import { haptic } from "@/lib/haptics";
import { showActionSheet } from "@/lib/actionSheet";
import { promptText } from "@/lib/prompt";
import { registerForPushAsync } from "@/lib/push";

export default function Devices() {
  const insets = useSafeAreaInsets();
  const devices = useQuery(api.devices.listMine) as
    | Doc<"devices">[]
    | undefined;
  const register = useMutation(api.devices.register);
  const setEnabled = useMutation(api.devices.setEnabled);
  const rename = useMutation(api.devices.rename);
  const remove = useMutation(api.devices.remove);

  type Status = "idle" | "registering" | "ok" | "error";
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [currentToken, setCurrentToken] = useState<string | null>(null);

  async function doRegister() {
    setStatus("registering");
    setError(null);
    const result = await registerForPushAsync();
    if (!result.ok) {
      haptic.error();
      setStatus("error");
      setError(result.reason);
      return;
    }
    setCurrentToken(result.token);
    try {
      await register({
        expoPushToken: result.token,
        platform: result.platform,
        model: result.model,
        osVersion: result.osVersion,
        name: result.model,
      });
      haptic.success();
      setStatus("ok");
    } catch (err: any) {
      haptic.error();
      setStatus("error");
      setError(err?.message ?? "Failed to register");
    }
  }

  // Auto-register once on first mount.
  useEffect(() => {
    if (status === "idle") void doRegister();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function promptRename(id: Doc<"devices">["_id"], currentName: string) {
    const next = await promptText({
      title: "Rename device",
      message: "Choose a name for this device.",
      defaultValue: currentName,
    });
    if (!next) return;
    haptic.light();
    rename({ id, name: next });
  }

  function confirmRemove(id: Doc<"devices">["_id"]) {
    haptic.warning();
    Alert.alert(
      "Remove device?",
      "It won't receive pushes until re-registered.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            haptic.error();
            remove({ id });
          },
        },
      ],
    );
  }

  async function copyToken(token: string) {
    await Clipboard.setStringAsync(token);
    haptic.success();
  }

  // A committed swipe is already a deliberate two-stage gesture, so it deletes
  // outright — the confirm Alert is reserved for the action-sheet path, where a
  // tap is much cheaper to fire by accident.
  function swipeDelete(id: Doc<"devices">["_id"]) {
    haptic.error();
    void remove({ id });
  }

  /** Long-press menu, replacing the native context menu on the old SwiftUI list. */
  function openActions(d: Doc<"devices">, title: string) {
    haptic.light();
    showActionSheet({
      title,
      options: [
        { label: "Rename", onPress: () => promptRename(d._id, title) },
        { label: "Copy push token", onPress: () => copyToken(d.expoPushToken) },
        {
          label: "Remove device",
          destructive: true,
          onPress: () => confirmRemove(d._id),
        },
      ],
    });
  }

  return (
    <ScreenTransition>
      <ScreenShell>
      <ScreenHeader
        eyebrow={devices ? `${devices.length} registered` : undefined}
        title="Devices"
      />
      <ScreenBody>
        {status !== "ok" && (
          <View style={{ paddingHorizontal: spacing.lg }}>
            <StatusCard status={status} error={error} onRetry={doRegister} />
          </View>
        )}

        <FlatList
          data={devices ?? []}
          keyExtractor={(d) => d._id}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{
            flexGrow: 1,
            paddingBottom: Math.max(140, insets.bottom + 100),
          }}
          ListHeaderComponent={
            devices && devices.length > 0 ? (
              <SectionLabel>Registered devices</SectionLabel>
            ) : null
          }
          ListEmptyComponent={
            devices ? (
              <EmptyState
                icon="iphone.slash"
                title="No devices registered"
                message="Register this device so it can receive your pushes."
                actionLabel="Register this device"
                actionIcon="checkmark"
                onAction={doRegister}
              />
            ) : null
          }
          renderItem={({ item: d }) => (
            <DeviceCard
              device={d}
              isCurrent={currentToken !== null && d.expoPushToken === currentToken}
              onToggle={(v) => {
                haptic.light();
                setEnabled({ id: d._id, enabled: v });
              }}
              onOpenActions={openActions}
              onSwipeDelete={() => swipeDelete(d._id)}
            />
          )}
        />
      </ScreenBody>
      </ScreenShell>
    </ScreenTransition>
  );
}

/**
 * One registered device as a standing tinted card. Replaces the native SwiftUI
 * row so devices share the app's card language; the affordances the native list
 * gave for free are rebuilt here — swipe left to delete, long-press for the
 * rename / copy-token / remove menu.
 */
function DeviceCard({
  device: d,
  isCurrent,
  onToggle,
  onOpenActions,
  onSwipeDelete,
}: {
  device: Doc<"devices">;
  isCurrent: boolean;
  onToggle: (value: boolean) => void;
  onOpenActions: (device: Doc<"devices">, title: string) => void;
  onSwipeDelete: () => void;
}) {
  const { colors, ov } = useTheme();
  const title = d.name ?? d.model ?? d.platform;
  const invalidated = !!d.invalidatedAt;
  const detail = [d.platform, d.osVersion].filter(Boolean).join(" · ");

  // An invalidated token is the state worth flagging; otherwise a live device
  // carries the accent and a disabled one drops the tint entirely.
  const tint = invalidated
    ? colors.destructive
    : d.enabled
      ? colors.accent
      : null;
  const statusColor = invalidated
    ? colors.destructive
    : d.enabled
      ? colors.success
      : colors.tertiaryLabel;

  return (
    <Card
      tint={tint}
      bloom={false}
      padding={false}
      style={{ marginHorizontal: spacing.lg, marginBottom: spacing.md }}
    >
      <ReanimatedSwipeable
        friction={2}
        rightThreshold={40}
        overshootRight={false}
        renderRightActions={() => (
          <Pressable
            onPress={onSwipeDelete}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${title}`}
            style={{
              backgroundColor: colors.destructive,
              justifyContent: "center",
              alignItems: "center",
              width: 96,
            }}
          >
            <SymbolView name="trash.fill" size={20} tintColor="#FFFFFF" />
            <Text style={{ color: "#FFFFFF", ...type.caption1, marginTop: 4 }}>
              Remove
            </Text>
          </Pressable>
        )}
      >
        {/* Opaque so the swipe action stays hidden underneath as the row
            slides — which is why this layer, not the Card, blooms. */}
        <View style={{ backgroundColor: colors.cell }}>
          {tint ? <CardBloom tint={tint} strength={isCurrent ? 0.2 : 0.13} /> : null}
          <Pressable
            onLongPress={() => onOpenActions(d, title)}
            accessibilityRole="button"
            accessibilityLabel={`${title}, ${detail}${
              invalidated ? ", token invalidated" : ""
            }${d.enabled ? "" : ", disabled"}`}
            accessibilityHint="Long-press for device actions. Swipe left to remove."
            style={({ pressed }) => ({
              backgroundColor: pressed ? ov(0.05) : "transparent",
              flexDirection: "row",
              alignItems: "center",
              gap: 13,
              paddingHorizontal: spacing.lg - 2,
              paddingVertical: spacing.lg - 2,
              minHeight: 72,
            })}
          >
            <IconTile
              icon="iphone"
              size={48}
              color={invalidated ? colors.destructive : colors.accent}
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}
              >
                <Text
                  style={{ ...type.headline, color: colors.label, flexShrink: 1 }}
                  numberOfLines={1}
                >
                  {title}
                </Text>
                {isCurrent && (
                  <Chip label="This device" size="sm" variant="tint" />
                )}
              </View>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  marginTop: 5,
                }}
              >
                <View
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: statusColor,
                  }}
                />
                <Text
                  style={{ ...type.footnote, color: colors.secondaryLabel }}
                  numberOfLines={1}
                >
                  {invalidated ? `${detail} · invalidated` : detail}
                </Text>
              </View>
            </View>
            <Toggle
              value={d.enabled}
              onValueChange={onToggle}
              accessibilityLabel={`${title} enabled`}
            />
          </Pressable>
        </View>
      </ReanimatedSwipeable>
    </Card>
  );
}

function StatusCard({
  status,
  error,
  onRetry,
}: {
  status: "idle" | "registering" | "ok" | "error";
  error: string | null;
  onRetry: () => void;
}) {
  const { colors } = useTheme();

  const configs = {
    idle: {
      icon: "hourglass",
      title: "Ready",
      body: "Tap register to enable pushes.",
    },
    registering: {
      icon: "arrow.clockwise",
      title: "Registering…",
      body: "Asking iOS for a push token.",
    },
    ok: {
      icon: "checkmark.seal.fill",
      title: "Device registered",
      body: "You'll receive pushes on this device.",
    },
    error: {
      icon: "exclamationmark.triangle.fill",
      title: "Couldn't register",
      body: error ?? "Unknown error",
    },
  } as const;
  const cfg = configs[status];
  const tint =
    status === "error"
      ? colors.destructive
      : status === "ok"
        ? colors.success
        : colors.accent;

  return (
    <Card
      tint={tint}
      // A registration failure is the one thing on this screen the user has to
      // act on, so it takes the strongest bloom the card language allows.
      strength={status === "error" ? 0.24 : 0.16}
      style={{ flexDirection: "row", alignItems: "center", gap: 13 }}
    >
      <IconTile icon={cfg.icon as SFSymbol} size={44} color={tint} />
      <View style={{ flex: 1 }}>
        <Text style={{ ...type.headline, color: colors.strongLabel }}>
          {cfg.title}
        </Text>
        <Text
          selectable={status === "error"}
          style={{
            ...type.footnote,
            lineHeight: 18,
            color: colors.secondaryLabel,
            marginTop: 3,
          }}
        >
          {cfg.body}
        </Text>
      </View>
      <Pressable
        onPress={() => {
          haptic.light();
          onRetry();
        }}
        hitSlop={8}
      >
        <Text
          style={{ ...type.subhead, fontWeight: "600", color: colors.accent }}
        >
          {status === "ok" ? "Re-register" : "Register"}
        </Text>
      </Pressable>
    </Card>
  );
}
