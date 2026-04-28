import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Doc } from "../../../../convex/_generated/dataModel";
import { Alert, Pressable, ScrollView, Switch, Text, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { useEffect, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader, ScreenBody } from "@/components/ScreenHeader";
import { ScreenTransition } from "@/components/ScreenTransition";
import { ListSection } from "@/components/ListSection";
import { ListRow } from "@/components/ListRow";
import { useTheme, spacing, type } from "@/lib/theme";
import { haptic } from "@/lib/haptics";
import { showActionSheet } from "@/lib/actionSheet";
import { promptText } from "@/lib/prompt";
import { registerForPushAsync } from "@/lib/push";

export default function Devices() {
  const { colors, tintBg } = useTheme();
  const insets = useSafeAreaInsets();
  const devices = useQuery(api.devices.listMine) as Doc<"devices">[] | undefined;
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

  function handleDevicePress(id: Doc<"devices">["_id"], name: string) {
    haptic.warning();
    showActionSheet({
      title: name,
      options: [
        {
          label: "Rename",
          onPress: () => promptRename(id, name),
        },
        {
          label: "Remove device",
          destructive: true,
          onPress: () => {
            Alert.alert("Remove device?", "It won't receive pushes until re-registered.", [
              { text: "Cancel", style: "cancel" },
              {
                text: "Remove",
                style: "destructive",
                onPress: () => {
                  haptic.error();
                  remove({ id });
                },
              },
            ]);
          },
        },
      ],
    });
  }

  return (
    <ScreenTransition style={{ backgroundColor: colors.background }}>
      <ScreenHeader
        eyebrow={devices ? `${devices.length} registered` : undefined}
        title="Devices"
      />
      <ScreenBody>
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{
            paddingTop: spacing.xl,
            paddingBottom: Math.max(120, insets.bottom + spacing.xxl + 60),
          }}
        >
      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md, marginBottom: spacing.xl }}>
        <StatusCard status={status} error={error} onRetry={doRegister} />
      </View>

      {devices && devices.length > 0 && (
        <ListSection header="Registered Devices">
          {devices.map((d) => {
            const isCurrent = currentToken !== null && d.expoPushToken === currentToken;
            const subtitleParts = [
              isCurrent ? "This device" : null,
              d.platform,
              d.osVersion,
              d.invalidatedAt ? "invalidated" : null,
            ].filter(Boolean);
            return (
            <ListRow
              key={d._id}
              title={d.name ?? d.model ?? d.platform}
              subtitle={subtitleParts.join(" · ")}
              caption={`${d.expoPushToken.slice(0, 28)}…`}
              captionSelectable
              leading={
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: isCurrent ? tintBg(colors.accent) : colors.fill,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <SymbolView
                    name="iphone"
                    size={22}
                    tintColor={isCurrent ? colors.accent : colors.secondaryLabel}
                  />
                </View>
              }
              trailing={
                <Switch
                  style={{ alignSelf: "center" }}
                  value={d.enabled}
                  onValueChange={(v) => {
                    haptic.light();
                    setEnabled({ id: d._id, enabled: v });
                  }}
                />
              }
              onPress={() => handleDevicePress(d._id, d.name ?? d.model ?? "this device")}
            />
            );
          })}
        </ListSection>
      )}

      {(!devices || devices.length === 0) && (
        <View
          style={{
            padding: spacing.xxl,
            alignItems: "center",
            gap: spacing.md,
          }}
        >
          <SymbolView name="iphone.slash" size={48} tintColor={colors.tertiaryLabel} />
          <Text style={{ ...type.subhead, color: colors.secondaryLabel, textAlign: "center" }}>
            No devices yet. Tap register above.
          </Text>
        </View>
      )}
        </ScrollView>
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
    idle: { icon: "hourglass", title: "Ready", body: "Tap register to enable pushes." },
    registering: { icon: "arrow.clockwise", title: "Registering…", body: "Asking iOS for a push token." },
    ok: { icon: "checkmark.seal.fill", title: "Device registered", body: "You'll receive pushes on this device." },
    error: { icon: "exclamationmark.triangle.fill", title: "Couldn't register", body: error ?? "Unknown error" },
  } as const;
  const cfg = configs[status];
  const tint = status === "error" ? colors.destructive : status === "ok" ? colors.success : colors.accent;

  return (
    <View
      style={{
        backgroundColor: colors.cell,
        padding: spacing.lg,
        borderRadius: 14,
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
          borderRadius: 12,
          borderCurve: "continuous",
          backgroundColor: tintBg(tint),
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <SymbolView name={cfg.icon as any} size={22} tintColor={tint} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ ...type.headline, color: colors.label }}>{cfg.title}</Text>
        <Text
          selectable={status === "error"}
          style={{ ...type.footnote, color: colors.secondaryLabel, marginTop: 2 }}
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
