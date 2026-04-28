import React from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { SymbolView, type SFSymbol } from "expo-symbols";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { Avatar } from "@/components/Avatar";
import { Sheet } from "@/components/Sheet";
import { useTheme, spacing, radius, type } from "@/lib/theme";
import { haptic } from "@/lib/haptics";
import { showActionSheet } from "@/lib/actionSheet";
import { pickAndUploadLogo } from "@/lib/uploadLogo";
import { forgetToken, recallToken } from "@/lib/tokenStore";

type AppRow = Doc<"sourceApps"> & { logoUrl: string | null };

export default function SourceAppDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const apps = useQuery(api.sourceApps.listMine) as AppRow[] | undefined;
  const plan = useQuery(api.tiers.getMyPlan);
  const isPro = plan?.tier === "pro";
  const app = apps?.find((a) => a._id === (id as Id<"sourceApps">));

  const setEnabled = useMutation(api.sourceApps.setEnabled);
  const setMute = useMutation(api.sourceApps.setMute);
  const setQuietHours = useMutation(api.sourceApps.setQuietHours);
  const rename = useMutation(api.sourceApps.rename);
  const revoke = useMutation(api.sourceApps.revoke);
  const setLogo = useMutation(api.sourceApps.setLogo);
  const removeLogo = useMutation(api.sourceApps.removeLogo);
  const generateUploadUrl = useMutation(api.sourceApps.generateLogoUploadUrl);

  if (apps === undefined) {
    return <View style={{ flex: 1, backgroundColor: colors.grouped }} />;
  }

  if (!app) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.grouped,
          alignItems: "center",
          justifyContent: "center",
          padding: spacing.xxl,
        }}
      >
        <Text style={{ ...type.body, color: colors.secondaryLabel }}>
          Source app not found.
        </Text>
      </View>
    );
  }

  const muted = isMuted(app);
  const quiet = quietHoursLabel(app);

  async function changeLogo() {
    if (!app) return;
    const url = await generateUploadUrl({});
    const picked = await pickAndUploadLogo(url);
    if (!picked.ok) {
      if (picked.reason !== "Canceled") {
        haptic.error();
        Alert.alert("Couldn't set logo", picked.reason);
      }
      return;
    }
    haptic.success();
    await setLogo({ id: app._id, storageId: picked.storageId });
  }

  function promptRename() {
    if (!app) return;
    Alert.prompt(
      "Rename app",
      undefined,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Save",
          onPress: (value?: string) => {
            const next = value?.trim();
            if (!next) return;
            haptic.success();
            rename({ id: app._id, name: next });
          },
        },
      ],
      "plain-text",
      app.name,
    );
  }

  function openMutePresets() {
    if (!app) return;
    haptic.light();
    const now = Date.now();
    const presets = [
      { label: "Mute 1 hour", ms: 60 * 60 * 1000 },
      { label: "Mute 8 hours", ms: 8 * 60 * 60 * 1000 },
      { label: "Mute until tomorrow 8am", ms: "tomorrow" as const },
    ];
    showActionSheet({
      title: "Mute",
      options: presets.map((p) => ({
        label: p.label,
        onPress: async () => {
          haptic.light();
          const until = p.ms === "tomorrow" ? tomorrowAt8am() : now + p.ms;
          await setMute({ id: app._id, until });
        },
      })),
    });
  }

  function openQuietHours() {
    if (!app) return;
    haptic.light();
    const presets = [
      { label: "No quiet hours", start: null, end: null },
      { label: "10pm – 7am", start: 22 * 60, end: 7 * 60 },
      { label: "11pm – 8am", start: 23 * 60, end: 8 * 60 },
      { label: "Midnight – 6am", start: 0, end: 6 * 60 },
      { label: "Workday (9am – 5pm)", start: 9 * 60, end: 17 * 60 },
    ];
    showActionSheet({
      title: `${app.name} quiet hours`,
      message:
        "Within this window pushes are downgraded to default priority and silent — they still land in the feed.",
      options: presets.map((p) => ({
        label: p.label,
        onPress: async () => {
          haptic.success();
          await setQuietHours({ id: app._id, start: p.start, end: p.end });
        },
      })),
    });
  }

  function confirmRevoke() {
    if (!app) return;
    haptic.warning();
    Alert.alert("Revoke token?", `This permanently disables ${app.name}.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Revoke",
        style: "destructive",
        onPress: async () => {
          haptic.error();
          await revoke({ id: app._id });
          await forgetToken(app._id);
          router.back();
        },
      },
    ]);
  }

  async function copyCurl() {
    if (!app) return;
    await Clipboard.setStringAsync(curlExample(app.name));
    haptic.success();
  }

  async function copySavedToken() {
    if (!app) return;
    const token = await recallToken(app._id);
    if (!token) {
      haptic.warning();
      Alert.alert(
        "Token not on this device",
        "We only cache the token on the device it was created on. To use it elsewhere, revoke and create a new app.",
      );
      return;
    }
    await Clipboard.setStringAsync(token);
    haptic.success();
  }

  return (
    <Sheet>
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.md,
          paddingBottom: 40,
          gap: spacing.lg,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.md,
          }}
        >
          <Avatar url={app.logoUrl} name={app.name} size={56} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text
              style={{ ...type.title3, color: colors.label }}
              numberOfLines={1}
            >
              {app.name}
            </Text>
            {!!app.description && (
              <Text
                style={{ ...type.subhead, color: colors.secondaryLabel }}
                numberOfLines={2}
              >
                {app.description}
              </Text>
            )}
            <Text
              style={{
                ...type.caption1,
                color: colors.tertiaryLabel,
                fontFamily: "Menlo",
                marginTop: 2,
              }}
            >
              {app.tokenPrefix}
            </Text>
          </View>
        </View>

        <DetailSection title="Delivery">
          <DetailRow
            icon="bell.fill"
            tint={colors.accent}
            title="Enabled"
            subtitle={
              app.enabled
                ? "Accepting pushes from this app"
                : "All pushes rejected"
            }
            trailing={
              <Switch
                style={{ alignSelf: "center" }}
                value={app.enabled}
                onValueChange={(v) => {
                  setEnabled({ id: app._id, enabled: v });
                }}
              />
            }
          />
          <DetailRow
            icon={muted ? "bell.slash.fill" : "moon.zzz"}
            tint={muted ? colors.warning : colors.secondaryLabel}
            title={muted ? "Unmute" : "Mute"}
            subtitle={
              muted
                ? app.mutedUntil
                  ? `Muted until ${new Date(app.mutedUntil).toLocaleString()}`
                  : "Muted"
                : "Silence pushes for a while"
            }
            onPress={
              muted
                ? () => setMute({ id: app._id, until: null })
                : openMutePresets
            }
            chevron={!muted}
          />
          <DetailRow
            icon="clock.badge.fill"
            tint={isPro ? colors.accent : colors.secondaryLabel}
            title="Quiet hours"
            subtitle={isPro ? (quiet ?? "Not set") : "Pro plan"}
            onPress={
              isPro
                ? openQuietHours
                : () => {
                    haptic.light();
                    router.push("/upgrade");
                  }
            }
            chevron
            badge={isPro ? undefined : "PRO"}
          />
        </DetailSection>

        <DetailSection title="Identity">
          <DetailRow
            icon="photo.fill"
            tint={colors.accent}
            title={app.logoUrl ? "Change logo" : "Add logo"}
            onPress={changeLogo}
            chevron
          />
          {app.logoUrl && (
            <DetailRow
              icon="trash"
              tint={colors.destructive}
              title="Remove logo"
              onPress={() => removeLogo({ id: app._id })}
              destructive
            />
          )}
          <DetailRow
            icon="pencil"
            tint={colors.accent}
            title="Rename"
            onPress={promptRename}
            chevron
          />
        </DetailSection>

        <DetailSection title="Integration">
          <DetailRow
            icon="terminal.fill"
            tint={colors.accent}
            title="Copy curl example"
            subtitle="Paste into any shell to send a test push"
            onPress={copyCurl}
          />
          <DetailRow
            icon="key.fill"
            tint={colors.accent}
            title="Copy token"
            subtitle="Only on the device the app was created on"
            onPress={copySavedToken}
          />
        </DetailSection>

        <DetailSection title="Danger">
          <DetailRow
            icon="xmark.octagon.fill"
            tint={colors.destructive}
            title="Revoke token"
            subtitle="Permanently disables this app"
            onPress={confirmRevoke}
            destructive
          />
        </DetailSection>
      </ScrollView>
    </Sheet>
  );
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  const rows = React.Children.toArray(children).filter(React.isValidElement);
  return (
    <View style={{ gap: spacing.xs }}>
      <Text
        style={{
          ...type.footnote,
          color: colors.secondaryLabel,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          paddingHorizontal: spacing.sm,
        }}
      >
        {title}
      </Text>
      <View
        style={{
          backgroundColor: colors.cell,
          borderRadius: radius.lg,
          borderCurve: "continuous",
          overflow: "hidden",
        }}
      >
        {rows.map((child, i) => (
          <View key={i}>
            {child}
            {i < rows.length - 1 && (
              <View
                style={{
                  height: 0.5,
                  backgroundColor: colors.separator,
                  marginLeft: 56,
                }}
              />
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

function DetailRow({
  icon,
  tint,
  title,
  subtitle,
  trailing,
  onPress,
  chevron,
  destructive,
  badge,
}: {
  icon: SFSymbol;
  tint: string;
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  destructive?: boolean;
  badge?: string;
}) {
  const { colors, tintBg } = useTheme();
  const titleColor = destructive ? colors.destructive : colors.label;

  const content = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.md,
        gap: spacing.md,
        minHeight: 56,
      }}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          backgroundColor: tintBg(tint),
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <SymbolView name={icon} size={18} tintColor={tint} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
          <Text style={{ ...type.body, color: titleColor }} numberOfLines={1}>
            {title}
          </Text>
          {badge && (
            <View
              style={{
                paddingHorizontal: 6,
                paddingVertical: 1,
                borderRadius: 4,
                backgroundColor: colors.accent,
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: "700",
                  color: colors.accentContrast,
                  letterSpacing: 0.5,
                }}
              >
                {badge}
              </Text>
            </View>
          )}
        </View>
        {!!subtitle && (
          <Text
            style={{
              ...type.footnote,
              color: colors.secondaryLabel,
              marginTop: 1,
            }}
            numberOfLines={2}
          >
            {subtitle}
          </Text>
        )}
      </View>
      {trailing}
      {chevron && !trailing && (
        <SymbolView
          name="chevron.right"
          size={14}
          tintColor={colors.tertiaryLabel}
        />
      )}
    </View>
  );

  if (!onPress) return content;
  return (
    <Pressable
      onPress={() => {
        haptic.selection();
        onPress();
      }}
      style={({ pressed }) => ({
        backgroundColor: pressed ? colors.cellHighlight : "transparent",
      })}
    >
      {content}
    </Pressable>
  );
}

function isMuted(row: Pick<Doc<"sourceApps">, "mutedUntil">): boolean {
  return !!row.mutedUntil && row.mutedUntil > Date.now();
}

function tomorrowAt8am(): number {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(8, 0, 0, 0);
  return d.getTime();
}

function quietHoursLabel(
  row: Pick<Doc<"sourceApps">, "quietStart" | "quietEnd">,
): string | null {
  const { quietStart: s, quietEnd: e } = row;
  if (s === undefined || e === undefined || s === e) return null;
  const fmt = (m: number) => {
    const h = Math.floor(m / 60);
    const min = m % 60;
    const period = h >= 12 ? "pm" : "am";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return min === 0
      ? `${h12}${period}`
      : `${h12}:${String(min).padStart(2, "0")}${period}`;
  };
  return `${fmt(s)}–${fmt(e)}`;
}

function curlExample(appName: string, token = "<your_token>"): string {
  const siteUrl =
    process.env.EXPO_PUBLIC_CONVEX_SITE_URL ?? "https://your-convex.site";
  return `curl -X POST ${siteUrl}/notify \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{"title":"Hello from ${appName}","body":"It works!"}'`;
}
