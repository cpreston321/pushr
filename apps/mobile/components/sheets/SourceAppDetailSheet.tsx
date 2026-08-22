import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SymbolView } from "expo-symbols";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppBottomSheet } from "@/components/sheets/AppBottomSheet";
import { Toggle } from "@/components/Toggle";
import {
  SheetNavigator,
  useSheetNav,
} from "@/components/sheets/SheetNavigator";
import { SourceAppApiFrame } from "@/components/sheets/SourceAppApiSheet";
import { SourceAppSharingFrame } from "@/components/sheets/SourceAppSharingSheet";
import { useMutation, useQuery } from "convex/react";
import { api } from "@pushr/backend/_generated/api";
import type { Id } from "@pushr/backend/_generated/dataModel";
import { Avatar } from "@/components/Avatar";
import { ProGate } from "@/components/Pro";
import { SheetHeader } from "@/components/SheetHeader";
import {
  apiRowSubtitle,
  DestructiveFooterButton,
  DetailRow,
  DetailSection,
  isMuted,
  quietHoursLabel,
  RoleBadge,
  SharingSummarySection,
  tomorrowAt8am,
  type AppRow,
} from "@/components/source-app/shared";
import { useTheme, spacing, radius, type } from "@/lib/theme";
import { haptic } from "@/lib/haptics";
import { showActionSheet } from "@/lib/actionSheet";
import { promptText } from "@/lib/prompt";
import { pickAndUploadLogo } from "@/lib/uploadLogo";
import { forgetToken } from "@/lib/tokenStore";
import { formatRelative } from "@/lib/feed-helpers";
import { getProviderMeta } from "@/lib/providerDetection";
import { RECIPES } from "@/lib/recipes";

type SourceAppDetailSheetApi = {
  present: (appId: Id<"sourceApps">) => void;
  dismiss: () => void;
};

type State = {
  appId: Id<"sourceApps"> | null;
  setAppId: (id: Id<"sourceApps"> | null) => void;
  index: number;
  setIndex: (i: number) => void;
};

const ApiCtx = createContext<SourceAppDetailSheetApi | null>(null);
const StateCtx = createContext<State | null>(null);

export function useSourceAppDetailSheet(): SourceAppDetailSheetApi {
  const ctx = useContext(ApiCtx);
  if (!ctx) {
    throw new Error(
      "useSourceAppDetailSheet must be used inside <SourceAppDetailSheetProvider>",
    );
  }
  return ctx;
}

export function SourceAppDetailSheetProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [appId, setAppId] = useState<Id<"sourceApps"> | null>(null);
  const [index, setIndex] = useState(0);

  const api = useMemo<SourceAppDetailSheetApi>(
    () => ({
      present: (id) => {
        setAppId(id);
        setIndex(1);
      },
      dismiss: () => setIndex(0),
    }),
    [],
  );

  const state = useMemo(
    () => ({ appId, setAppId, index, setIndex }),
    [appId, index],
  );

  return (
    <StateCtx.Provider value={state}>
      <ApiCtx.Provider value={api}>{children}</ApiCtx.Provider>
    </StateCtx.Provider>
  );
}

export function SourceAppDetailSheetMount() {
  const state = useContext(StateCtx);
  if (!state) return null;
  const handleIndexChange = (i: number) => {
    state.setIndex(i);
    if (i === 0) state.setAppId(null);
  };
  return (
    <AppBottomSheet index={state.index} onIndexChange={handleIndexChange}>
      {state.appId ? (
        <SheetNavigator
          initial={{
            id: `detail-${state.appId}`,
            node: <DetailFrame appId={state.appId} />,
          }}
          resetKey={state.appId}
          onDismissSheet={() => state.setIndex(0)}
        />
      ) : null}
    </AppBottomSheet>
  );
}

function DetailFrame({ appId }: { appId: Id<"sourceApps"> }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const nav = useSheetNav();
  const apps = useQuery(api.sourceApps.listMine) as AppRow[] | undefined;
  const app = apps?.find((a) => a._id === appId);

  return (
    <View style={{ flex: 1, backgroundColor: colors.sheet }}>
      <SheetHeader title={app?.name ?? ""} onClose={nav.dismissSheet} />
      <ScrollView
        contentContainerStyle={{
          paddingTop: spacing.md,
          paddingHorizontal: spacing.lg,
          paddingBottom: insets.bottom + spacing.xxl * 2,
          gap: spacing.lg,
        }}
      >
        <Body appId={appId} />
      </ScrollView>
    </View>
  );
}

function Body({ appId }: { appId: Id<"sourceApps"> }) {
  const nav = useSheetNav();
  const onOpenSharing = () =>
    nav.push({
      id: `sharing-${appId}`,
      node: <SourceAppSharingFrame appId={appId} />,
    });
  const onOpenApi = () =>
    nav.push({
      id: `api-${appId}`,
      node: <SourceAppApiFrame appId={appId} />,
    });
  const onDismiss = nav.dismissSheet;
  const { colors } = useTheme();
  const apps = useQuery(api.sourceApps.listMine) as AppRow[] | undefined;
  const app = apps?.find((a) => a._id === appId);
  const role = app?.role;
  const isOwner = role === "owner";
  const canEdit = role === "owner" || role === "editor";

  const setEnabled = useMutation(api.sourceApps.setEnabled);
  const setMute = useMutation(api.sourceApps.setMute);
  const setQuietHours = useMutation(api.sourceApps.setQuietHours);
  const deleteApp = useMutation(api.sourceApps.deleteApp);
  const setLogo = useMutation(api.sourceApps.setLogo);
  const removeLogo = useMutation(api.sourceApps.removeLogo);

  const stats = useQuery(
    api.sourceApps.getStats,
    app ? { id: app._id } : "skip",
  );
  const generateUploadUrl = useMutation(api.sourceApps.generateLogoUploadUrl);
  const leaveApp = useMutation(api.sharing.leaveApp);
  const sendTestPush = useMutation(api.notifications.sendTest);
  const [sendingTest, setSendingTest] = useState(false);
  // Local preview of a just-picked logo, shown instantly while the remote
  // `logoUrl` round-trips (upload → mutation → reactive query → CDN download).
  const [pendingLogoUri, setPendingLogoUri] = useState<string | null>(null);
  // Drop the local preview when the sheet switches to a different app.
  useEffect(() => setPendingLogoUri(null), [appId]);

  if (apps === undefined) {
    return (
      <View style={{ paddingTop: spacing.xxl, alignItems: "center" }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!app) {
    return (
      <View style={{ paddingTop: spacing.xxl, alignItems: "center" }}>
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
    setPendingLogoUri(picked.localUri);
    await setLogo({ id: app._id, storageId: picked.storageId });
  }

  function handleAvatarPress() {
    if (!app || !canEdit) return;
    haptic.light();
    if (!app.logoUrl) {
      changeLogo();
      return;
    }
    showActionSheet({
      title: "Logo",
      options: [
        { label: "Change logo", onPress: changeLogo },
        {
          label: "Remove logo",
          destructive: true,
          onPress: () => {
            haptic.warning();
            setPendingLogoUri(null);
            removeLogo({ id: app._id });
          },
        },
      ],
    });
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
    Alert.alert(
      "Delete app?",
      `Permanently deletes ${app.name} and everything tied to it: the bearer token, notification history, delivery records, live activities, the logo, members, and pending invites. This can't be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            haptic.error();
            const id = app._id;
            onDismiss();
            try {
              await deleteApp({ id });
              await forgetToken(id);
            } catch (err: any) {
              haptic.error();
              Alert.alert(
                "Couldn't delete app",
                err?.data?.message ?? err?.message ?? "Please try again.",
              );
            }
          },
        },
      ],
    );
  }

  function confirmLeave() {
    if (!app) return;
    haptic.warning();
    Alert.alert(
      "Leave app?",
      `You'll stop receiving pushes from ${app.name}. The owner can re-invite you later.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Leave",
          style: "destructive",
          onPress: async () => {
            haptic.success();
            await leaveApp({ sourceAppId: app._id });
            onDismiss();
          },
        },
      ],
    );
  }

  async function handleSendTest() {
    if (!app || sendingTest) return;
    setSendingTest(true);
    try {
      await sendTestPush({ sourceAppId: app._id });
      haptic.success();
    } catch (err: any) {
      haptic.error();
      Alert.alert(
        "Test push failed",
        err?.data?.message ?? err?.message ?? "Please try again.",
      );
    } finally {
      setSendingTest(false);
    }
  }

  return (
    <>
      <View
        style={{
          alignItems: "center",
          gap: spacing.sm,
          paddingVertical: spacing.md,
        }}
      >
        <Pressable
          onPress={canEdit ? handleAvatarPress : undefined}
          disabled={!canEdit}
          accessibilityRole={canEdit ? "button" : undefined}
          accessibilityLabel={canEdit ? "Change logo" : undefined}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <Avatar url={pendingLogoUri ?? app.logoUrl} name={app.name} size={72} />
          {canEdit && (
            <View
              style={{
                position: "absolute",
                bottom: -2,
                right: -2,
                width: 26,
                height: 26,
                borderRadius: 13,
                backgroundColor: colors.accent,
                borderWidth: 3,
                borderColor: colors.sheet,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <SymbolView
                name="camera.fill"
                size={11}
                tintColor={colors.accentContrast}
              />
            </View>
          )}
        </Pressable>
        {!!app.description && (
          <Text
            style={{
              ...type.subhead,
              color: colors.secondaryLabel,
              textAlign: "center",
              paddingHorizontal: spacing.xl,
            }}
            numberOfLines={3}
          >
            {app.description}
          </Text>
        )}
        {!isOwner && <RoleBadge role={role!} />}
      </View>

      <DetailSection title="Delivery">
        <DetailRow
          icon="bell.fill"
          tint={colors.accent}
          title="Enabled"
          subtitle={
            app.enabled ? "Accepting pushes from this app" : "All pushes rejected"
          }
          trailing={
            <Toggle
              value={app.enabled}
              disabled={!canEdit}
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
              : canEdit
                ? "Silence pushes for a while"
                : "Owner or editor required"
          }
          onPress={
            !canEdit
              ? undefined
              : muted
                ? () => setMute({ id: app._id, until: null })
                : openMutePresets
          }
          chevron={canEdit && !muted}
        />
        <ProGate feature="Quiet hours" icon="clock.badge.fill">
          <DetailRow
            icon="clock.badge.fill"
            tint={colors.accent}
            title="Quiet hours"
            subtitle={quiet ?? "Not set"}
            onPress={canEdit ? openQuietHours : undefined}
            chevron={canEdit}
          />
        </ProGate>
      </DetailSection>

      <SharingSummarySection
        sourceAppId={app._id}
        onPress={onOpenSharing}
      />

      {stats && (
        <DetailSection title="Recent activity">
          <View style={{ padding: spacing.md, gap: spacing.sm }}>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <View
                style={{
                  flex: 1,
                  backgroundColor: colors.fill,
                  borderRadius: radius.md,
                  padding: spacing.md,
                }}
              >
                <Text
                  style={{ ...type.caption2, color: colors.secondaryLabel }}
                >
                  7 days
                </Text>
                <Text
                  style={{
                    ...type.title3,
                    color: colors.label,
                    marginTop: 2,
                  }}
                >
                  {stats.notificationCount7d}
                </Text>
              </View>
              <View
                style={{
                  flex: 1,
                  backgroundColor: colors.fill,
                  borderRadius: radius.md,
                  padding: spacing.md,
                }}
              >
                <Text
                  style={{ ...type.caption2, color: colors.secondaryLabel }}
                >
                  30 days
                </Text>
                <Text
                  style={{
                    ...type.title3,
                    color: colors.label,
                    marginTop: 2,
                  }}
                >
                  {stats.notificationCount30d}
                </Text>
              </View>
            </View>

            <View style={{ gap: 4 }}>
              {stats.lastNotificationAt && (
                <Text
                  style={{ ...type.caption2, color: colors.secondaryLabel }}
                >
                  Last activity: {formatRelative(stats.lastNotificationAt)} ago
                </Text>
              )}
              {stats.deliverySuccessRate !== undefined && (
                <Text
                  style={{ ...type.caption2, color: colors.secondaryLabel }}
                >
                  Delivery success: {stats.deliverySuccessRate}%
                </Text>
              )}
              {stats.ackRate !== undefined && (
                <Text
                  style={{ ...type.caption2, color: colors.secondaryLabel }}
                >
                  Ack rate: {stats.ackRate}%
                </Text>
              )}
              {stats.primaryProvider &&
                (() => {
                  const meta = getProviderMeta(stats.primaryProvider as any);
                  return (
                    <Text
                      style={{
                        ...type.caption2,
                        color: meta.tint || colors.secondaryLabel,
                      }}
                    >
                      Primary: {meta.label}
                    </Text>
                  );
                })()}
            </View>
          </View>
        </DetailSection>
      )}

      {stats?.primaryProvider &&
        (() => {
          const matchingRecipe = RECIPES.find(
            (r) => r.provider === stats.primaryProvider,
          );
          if (!matchingRecipe) return null;

          const hasQuietHours =
            app.quietStart !== undefined && app.quietEnd !== undefined;
          const recommendedQuiet = matchingRecipe.suggestedQuietHours;

          return (
            <DetailSection title="Smart recommendations">
              <View
                style={{
                  marginHorizontal: spacing.lg,
                  padding: spacing.md,
                  backgroundColor: colors.fill,
                  borderRadius: radius.md,
                  borderWidth: 0.5,
                  borderColor: colors.separator,
                }}
              >
                <Text
                  style={{ ...type.footnote, color: colors.secondaryLabel }}
                >
                  This app matches the{" "}
                  <Text style={{ fontWeight: "600", color: colors.label }}>
                    {matchingRecipe.name}
                  </Text>{" "}
                  recipe
                </Text>

                {recommendedQuiet && !hasQuietHours && canEdit && (
                  <Pressable
                    onPress={() => {
                      haptic.selection();
                      const [start, end] = recommendedQuiet;
                      setQuietHours({ id: app._id, start, end });
                    }}
                    style={{ marginTop: spacing.sm }}
                  >
                    <Text
                      style={{
                        ...type.footnote,
                        color: colors.accent,
                        fontWeight: "600",
                      }}
                    >
                      Apply recommended quiet hours (
                      {Math.floor(recommendedQuiet[0] / 60)}pm –{" "}
                      {Math.floor(recommendedQuiet[1] / 60)}am)
                    </Text>
                  </Pressable>
                )}

                {hasQuietHours && recommendedQuiet && (
                  <Text
                    style={{
                      ...type.caption2,
                      color: colors.secondaryLabel,
                      marginTop: spacing.sm,
                    }}
                  >
                    Quiet hours already set
                  </Text>
                )}
              </View>
            </DetailSection>
          );
        })()}

      {canEdit && (
        <DetailSection title="Integration">
          <DetailRow
            icon="paperplane.fill"
            tint={colors.success}
            title={sendingTest ? "Sending…" : "Send test push"}
            subtitle="Fires a notification to your devices right now"
            onPress={sendingTest ? undefined : handleSendTest}
          />
          {isOwner && (
            <DetailRow
              icon="key.fill"
              tint={colors.accent}
              title="API & token"
              subtitle={apiRowSubtitle(app.webhookConfigs)}
              onPress={onOpenApi}
              chevron
              badge={
                app.webhookConfigs && app.webhookConfigs.length > 0
                  ? "ON"
                  : undefined
              }
            />
          )}
        </DetailSection>
      )}

      <DestructiveFooterButton
        label={isOwner ? "Delete app" : "Leave app"}
        onPress={isOwner ? confirmRevoke : confirmLeave}
      />
    </>
  );
}
