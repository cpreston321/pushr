import { useMutation, useQuery } from "convex/react";
import { api } from "@pushr/backend/_generated/api";
import type { Doc } from "@pushr/backend/_generated/dataModel";
import { Alert, Pressable, Text, View } from "react-native";
import { SymbolView } from "expo-symbols";
import * as Clipboard from "expo-clipboard";
import { useEffect, useState } from "react";
import {
  Button as UIButton,
  ContentUnavailableView,
  ContextMenu,
  HStack,
  Host,
  Image,
  List,
  Section as UISection,
  Spacer,
  Text as UIText,
  Toggle,
  VStack,
} from "@expo/ui/swift-ui";
import { font, foregroundStyle, listStyle } from "@expo/ui/swift-ui/modifiers";
import { ScreenHeader, ScreenBody } from "@/components/ScreenHeader";
import { ScreenTransition } from "@/components/ScreenTransition";
import { useTheme, spacing, radius, type } from "@/lib/theme";
import { haptic } from "@/lib/haptics";
import { promptText } from "@/lib/prompt";
import { registerForPushAsync } from "@/lib/push";

export default function Devices() {
  const { colors } = useTheme();
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

  // Swipe-to-delete on the native List. iOS already shows a "Delete" button
  // on partial swipe, so we skip the JS Alert and just remove on commit.
  function handleSwipeDelete(indices: number[]) {
    if (!devices) return;
    haptic.error();
    for (const i of indices) {
      const dev = devices[i];
      if (dev) void remove({ id: dev._id });
    }
  }

  return (
    <ScreenTransition style={{ backgroundColor: colors.background }}>
      <ScreenHeader
        eyebrow={devices ? `${devices.length} registered` : undefined}
        title="Devices"
      />
      <ScreenBody>
        {status !== "ok" && (
          <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.xl }}>
            <StatusCard status={status} error={error} onRetry={doRegister} />
          </View>
        )}

        <Host
          useViewportSizeMeasurement
          style={{ flex: 1, marginTop: spacing.md }}
        >
          <List modifiers={[listStyle("insetGrouped")]}>
            {devices && devices.length > 0 ? (
              <UISection title="Registered devices">
                <List.ForEach onDelete={handleSwipeDelete}>
                  {devices.map((d) => {
                    const isCurrent =
                      currentToken !== null && d.expoPushToken === currentToken;
                    const subtitle = [
                      isCurrent ? "This device" : null,
                      d.platform,
                      d.osVersion,
                      d.invalidatedAt ? "invalidated" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ");
                    const title = d.name ?? d.model ?? d.platform;
                    return (
                      <ContextMenu key={d._id}>
                        <ContextMenu.Items>
                          <UIButton
                            systemImage="pencil"
                            onPress={() => promptRename(d._id, title)}
                            label="Rename"
                          />
                          <UIButton
                            systemImage="doc.on.doc"
                            onPress={() => copyToken(d.expoPushToken)}
                            label="Copy push token"
                          />
                          <UIButton
                            role="destructive"
                            systemImage="trash"
                            onPress={() => confirmRemove(d._id)}
                            label="Remove device"
                          />
                        </ContextMenu.Items>
                        <ContextMenu.Trigger>
                          <HStack alignment="center" spacing={12}>
                            <Image
                              systemName="iphone"
                              size={22}
                              color={
                                isCurrent
                                  ? colors.accent
                                  : colors.secondaryLabel
                              }
                            />
                            <VStack alignment="leading" spacing={2}>
                              <UIText>{title}</UIText>
                              <UIText
                                modifiers={[
                                  font({ size: 13 }),
                                  foregroundStyle({
                                    type: "hierarchical",
                                    style: "secondary",
                                  }),
                                ]}
                              >
                                {subtitle}
                              </UIText>
                            </VStack>
                            <Spacer />
                            <Toggle
                              isOn={d.enabled}
                              onIsOnChange={(v) => {
                                haptic.light();
                                setEnabled({ id: d._id, enabled: v });
                              }}
                            />
                          </HStack>
                        </ContextMenu.Trigger>
                      </ContextMenu>
                    );
                  })}
                </List.ForEach>
              </UISection>
            ) : devices ? (
              <UISection>
                <ContentUnavailableView
                  title="No devices yet"
                  systemImage="iphone.slash"
                  description="Tap register above to enable pushes on this device."
                />
              </UISection>
            ) : null}
          </List>
        </Host>
      </ScreenBody>
    </ScreenTransition>
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
  const { colors, tintBg } = useTheme();

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
    <View
      style={{
        backgroundColor: colors.cell,
        padding: spacing.lg,
        borderRadius: radius.lg,
        borderCurve: "continuous",
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: radius.md,
          borderCurve: "continuous",
          backgroundColor: tintBg(tint),
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <SymbolView name={cfg.icon as any} size={22} tintColor={tint} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ ...type.headline, color: colors.label }}>
          {cfg.title}
        </Text>
        <Text
          selectable={status === "error"}
          style={{
            ...type.footnote,
            color: colors.secondaryLabel,
            marginTop: 2,
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
        <Text style={{ ...type.callout, color: colors.accent }}>
          {status === "ok" ? "Re-register" : "Register"}
        </Text>
      </Pressable>
    </View>
  );
}
