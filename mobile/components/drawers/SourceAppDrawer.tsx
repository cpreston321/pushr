import React, { forwardRef, useImperativeHandle, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { useMutation, useQuery } from "convex/react";
import { SymbolView, type SFSymbol } from "expo-symbols";
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
} from "react-native-reanimated";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { Avatar } from "@/components/Avatar";
import { Drawer, useDrawer, type DrawerRef } from "@/components/Drawer";
import { DrawerHeader } from "@/components/DrawerHeader";
import { ProGate } from "@/components/Pro";
import { useTheme, spacing, radius, type } from "@/lib/theme";
import { haptic } from "@/lib/haptics";
import { showActionSheet } from "@/lib/actionSheet";
import { promptText } from "@/lib/prompt";
import { pickAndUploadLogo } from "@/lib/uploadLogo";
import { forgetToken, recallToken } from "@/lib/tokenStore";
import { backendConfig } from "@/lib/backend";

type Role = "owner" | "editor" | "viewer";
type AppRow = Doc<"sourceApps"> & { logoUrl: string | null; role: Role };
type SharingData = NonNullable<
  FunctionReturnType<typeof api.sharing.listMembers>
>;
type Member = SharingData["members"][number];
type Invite = SharingData["invites"][number];

export type SourceAppDrawerRef = DrawerRef & {
  open: (id: Id<"sourceApps">) => Promise<void>;
};

export type SourceAppDrawerProps = {
  /**
   * Called after the owner rotates a source-app token. The drawer dismisses
   * itself first; the parent typically presents a TokenDrawer to reveal the
   * new bearer (only chance to capture it).
   */
  onTokenRotated?: (info: { id: Id<"sourceApps">; name: string; token: string }) => void;
};

/**
 * Two TrueSheets stacked: the detail sheet, and a sharing sheet that
 * presents on top of it when "Manage sharing" is tapped. iOS handles the
 * stack; back-arrow on the sharing sheet dismisses just the top sheet.
 */
export const SourceAppDrawer = forwardRef<SourceAppDrawerRef, SourceAppDrawerProps>(
  function SourceAppDrawer({ onTokenRotated }, ref) {
    const detailRef = useRef<DrawerRef>(null);
    const sharingRef = useRef<DrawerRef>(null);
    const [appId, setAppId] = useState<Id<"sourceApps"> | null>(null);

    useImperativeHandle(
      ref,
      () => ({
        present: (i) => detailRef.current?.present(i) ?? Promise.resolve(),
        dismiss: () => detailRef.current?.dismiss() ?? Promise.resolve(),
        open: async (id) => {
          setAppId(id);
          await detailRef.current?.present();
        },
      }),
      [],
    );

    return (
      <>
        <Drawer
          ref={detailRef}
          header={
            <DetailHeader
              appId={appId}
              onClose={() => detailRef.current?.dismiss()}
            />
          }
        >
          <ScrollView
            contentContainerStyle={{
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.md,
              paddingBottom: 40,
              gap: spacing.lg,
            }}
          >
            {appId ? (
              <DetailBody
                appId={appId}
                onOpenSharing={() => sharingRef.current?.present()}
                onTokenRotated={async (info) => {
                  await detailRef.current?.dismiss();
                  onTokenRotated?.(info);
                }}
              />
            ) : null}
          </ScrollView>
        </Drawer>

        <Drawer
          ref={sharingRef}
          header={
            <DrawerHeader
              title="Sharing"
              leading="back"
              onClose={() => sharingRef.current?.dismiss()}
            />
          }
        >
          <ScrollView
            contentContainerStyle={{
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.md,
              paddingBottom: 40,
              gap: spacing.lg,
            }}
          >
            {appId ? <SharingBody sourceAppId={appId} /> : null}
          </ScrollView>
        </Drawer>
      </>
    );
  },
);

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

function DetailHeader({
  appId,
  onClose,
}: {
  appId: Id<"sourceApps"> | null;
  onClose: () => void;
}) {
  const apps = useQuery(api.sourceApps.listMine) as AppRow[] | undefined;
  const app = apps?.find((a) => a._id === appId);
  const role = app?.role;
  const canEdit = role === "owner" || role === "editor";

  const rename = useMutation(api.sourceApps.rename);

  async function promptRename() {
    if (!app) return;
    const next = await promptText({
      title: "Rename app",
      defaultValue: app.name,
    });
    if (!next) return;
    haptic.success();
    rename({ id: app._id, name: next });
  }

  return (
    <DrawerHeader
      title={app?.name ?? ""}
      onPressTitle={app && canEdit ? promptRename : undefined}
      onClose={onClose}
    />
  );
}

function DetailBody({
  appId,
  onOpenSharing,
  onTokenRotated,
}: {
  appId: Id<"sourceApps">;
  onOpenSharing: () => void;
  onTokenRotated: (info: {
    id: Id<"sourceApps">;
    name: string;
    token: string;
  }) => void;
}) {
  const { colors } = useTheme();
  const { dismiss } = useDrawer();
  const apps = useQuery(api.sourceApps.listMine) as AppRow[] | undefined;
  const app = apps?.find((a) => a._id === appId);
  const role = app?.role;
  const isOwner = role === "owner";
  const canEdit = role === "owner" || role === "editor";

  const setEnabled = useMutation(api.sourceApps.setEnabled);
  const setMute = useMutation(api.sourceApps.setMute);
  const setQuietHours = useMutation(api.sourceApps.setQuietHours);
  const rename = useMutation(api.sourceApps.rename);
  const revoke = useMutation(api.sourceApps.revoke);
  const setLogo = useMutation(api.sourceApps.setLogo);
  const removeLogo = useMutation(api.sourceApps.removeLogo);
  const generateUploadUrl = useMutation(api.sourceApps.generateLogoUploadUrl);
  const leaveApp = useMutation(api.sharing.leaveApp);
  const sendTestPush = useMutation(api.notifications.sendTest);
  const rotateToken = useMutation(api.sourceApps.rotateToken);
  const [sendingTest, setSendingTest] = useState(false);
  const [rotating, setRotating] = useState(false);

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
    await setLogo({ id: app._id, storageId: picked.storageId });
  }

  async function promptRename() {
    if (!app) return;
    const next = await promptText({
      title: "Rename app",
      defaultValue: app.name,
    });
    if (!next) return;
    haptic.success();
    rename({ id: app._id, name: next });
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
          await dismiss();
        },
      },
    ]);
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
            await dismiss();
          },
        },
      ],
    );
  }

  async function copyCurl() {
    if (!app) return;
    await Clipboard.setStringAsync(curlExample(app.name));
    haptic.success();
  }

  async function handleRotate() {
    if (!app || rotating) return;
    Alert.alert(
      "Regenerate token?",
      `Any caller still using the current token for ${app.name} will stop working immediately. The notification feed history is preserved.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Regenerate",
          style: "destructive",
          onPress: async () => {
            setRotating(true);
            try {
              const { token } = await rotateToken({ id: app._id });
              haptic.success();
              onTokenRotated({ id: app._id, name: app.name, token });
            } catch (err: any) {
              haptic.error();
              Alert.alert(
                "Couldn't regenerate token",
                err?.data?.message ?? err?.message ?? "Please try again.",
              );
            } finally {
              setRotating(false);
            }
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
    <>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.md,
        }}
      >
        <Avatar url={app.logoUrl} name={app.name} size={56} />
        <View style={{ flex: 1, gap: 2 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.xs,
            }}
          >
            <Text
              style={{ ...type.title3, color: colors.label, flexShrink: 1 }}
              numberOfLines={1}
            >
              {app.name}
            </Text>
            {!isOwner && <RoleBadge role={role!} />}
          </View>
          {!!app.description && (
            <Text
              style={{ ...type.subhead, color: colors.secondaryLabel }}
              numberOfLines={2}
            >
              {app.description}
            </Text>
          )}
          {isOwner && (
            <Text
              selectable
              style={{
                ...type.caption1,
                color: colors.tertiaryLabel,
                fontFamily: "Menlo",
                marginTop: 2,
              }}
            >
              {app.tokenPrefix}
            </Text>
          )}
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

      {canEdit && (
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
      )}

      <SharingSummarySection
        sourceAppId={app._id}
        onPress={onOpenSharing}
      />

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
              icon="terminal.fill"
              tint={colors.accent}
              title="Copy curl example"
              subtitle="Paste into any shell to send a push"
              onPress={copyCurl}
            />
          )}
          {isOwner && (
            <DetailRow
              icon="key.fill"
              tint={colors.accent}
              title="Copy token"
              subtitle="Only on the device the app was created on"
              onPress={copySavedToken}
            />
          )}
          {isOwner && (
            <DetailRow
              icon="arrow.triangle.2.circlepath"
              tint={colors.warning}
              title={rotating ? "Regenerating…" : "Regenerate token"}
              subtitle="Invalidates the old token. The new one is shown once."
              onPress={rotating ? undefined : handleRotate}
              destructive
            />
          )}
        </DetailSection>
      )}

      {isOwner ? (
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
      ) : (
        <DetailSection title="Membership">
          <DetailRow
            icon="rectangle.portrait.and.arrow.right"
            tint={colors.destructive}
            title="Leave app"
            subtitle="Stop receiving pushes from this app"
            onPress={confirmLeave}
            destructive
          />
        </DetailSection>
      )}
    </>
  );
}

function SharingSummarySection({
  sourceAppId,
  onPress,
}: {
  sourceAppId: Id<"sourceApps">;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const data = useQuery(api.sharing.listMembers, { sourceAppId });

  const subtitle = sharingSubtitle(data);
  const memberCount = data?.members.length ?? 0;
  const pendingCount = data?.invites.length ?? 0;
  const atLimit =
    data?.sharedUsersLimit !== null &&
    data?.sharedUsersLimit !== undefined &&
    data.sharedUsersUsed >= data.sharedUsersLimit;

  return (
    <DetailSection title="Sharing">
      <DetailRow
        icon={atLimit ? "sparkles" : "person.2.fill"}
        tint={atLimit ? colors.warning : colors.accent}
        title="Manage sharing"
        subtitle={subtitle}
        onPress={onPress}
        chevron
        trailing={
          memberCount + pendingCount > 0 ? (
            <SharingCountBadge
              memberCount={memberCount}
              pendingCount={pendingCount}
            />
          ) : undefined
        }
      />
    </DetailSection>
  );
}

// ---------------------------------------------------------------------------
// Sharing
// ---------------------------------------------------------------------------

function SharingBody({
  sourceAppId,
}: {
  sourceAppId: Id<"sourceApps">;
}) {
  const { colors } = useTheme();

  const app = useQuery(api.sourceApps.getById, { id: sourceAppId });
  const data = useQuery(api.sharing.listMembers, { sourceAppId });

  const inviteByEmail = useMutation(api.sharing.inviteByEmail);
  const cancelInvite = useMutation(api.sharing.cancelInvite);
  const removeMember = useMutation(api.sharing.removeMember);
  const setMemberRole = useMutation(api.sharing.setMemberRole);

  if (app === undefined || data === undefined) {
    return (
      <View style={{ paddingTop: spacing.xxl, alignItems: "center" }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!app) {
    return (
      <EmptyMessage
        icon="exclamationmark.triangle"
        title="Source app not found"
        message="It may have been revoked or you no longer have access."
      />
    );
  }

  const isOwner = data.myRole === "owner";
  const limit = data.sharedUsersLimit;
  const used = data.sharedUsersUsed;
  const atLimit = limit !== null && used >= limit;

  async function handleInvite() {
    const email = await promptText({
      title: `Invite to ${app!.name}`,
      message:
        "They'll receive pushes from this app on their devices and see the feed.",
      placeholder: "person@example.com",
      keyboardType: "email-address",
      contentType: "emailAddress",
      confirmLabel: "Send invite",
    });
    if (!email) return;
    try {
      const result = await inviteByEmail({
        sourceAppId,
        email,
        role: "editor",
      });
      haptic.success();
      if ("alreadyMember" in result && result.alreadyMember) {
        Alert.alert(
          "Already a member",
          `${email} already has access to ${app!.name}.`,
        );
      } else if ("refreshed" in result && result.refreshed) {
        Alert.alert(
          "Invite refreshed",
          `Updated the existing invite for ${email}.`,
        );
      }
    } catch (err: any) {
      haptic.error();
      Alert.alert(
        "Couldn't send invite",
        err?.data?.message ?? err?.message ?? "Please try again.",
      );
    }
  }

  function memberMenu(member: Member) {
    if (!isOwner || member.isMe) return;
    haptic.light();
    showActionSheet({
      title: member.email ?? "Member",
      options: [
        {
          label:
            member.role === "editor" ? "Demote to viewer" : "Promote to editor",
          onPress: async () => {
            haptic.success();
            await setMemberRole({
              sourceAppId,
              memberId: member._id,
              role: member.role === "editor" ? "viewer" : "editor",
            });
          },
        },
        {
          label: "Remove from app",
          destructive: true,
          onPress: () => {
            Alert.alert(
              "Remove member?",
              `${member.email ?? "This user"} will stop receiving pushes from ${app!.name}.`,
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Remove",
                  style: "destructive",
                  onPress: async () => {
                    haptic.error();
                    await removeMember({
                      sourceAppId,
                      memberId: member._id,
                    });
                  },
                },
              ],
            );
          },
        },
      ],
    });
  }

  function inviteMenu(invite: Invite) {
    haptic.light();
    showActionSheet({
      title: invite.email,
      options: [
        {
          label: "Resend invite",
          onPress: async () => {
            try {
              await inviteByEmail({
                sourceAppId,
                email: invite.email,
                role: invite.role,
              });
              haptic.success();
            } catch (err: any) {
              haptic.error();
              Alert.alert(
                "Couldn't resend",
                err?.data?.message ?? err?.message ?? "Please try again.",
              );
            }
          },
        },
        {
          label: "Cancel invite",
          destructive: true,
          onPress: async () => {
            haptic.warning();
            await cancelInvite({ inviteId: invite._id });
          },
        },
      ],
    });
  }

  return (
    <>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.md,
          paddingVertical: spacing.sm,
        }}
      >
        <Avatar url={app.logoUrl ?? null} name={app.name} size={48} />
        <View style={{ flex: 1 }}>
          <Text
            style={{ ...type.title3, color: colors.label }}
            numberOfLines={1}
          >
            {app.name}
          </Text>
          <Text
            style={{
              ...type.subhead,
              color: colors.secondaryLabel,
              marginTop: 2,
            }}
            numberOfLines={1}
          >
            {memberSummary(data)}
          </Text>
        </View>
      </View>

      <UsageCard
        tier={data.ownerTier}
        used={used}
        limit={limit}
        atLimit={atLimit}
      />

      {isOwner && (
        <Pressable
          accessibilityRole="button"
          onPress={atLimit ? undefined : handleInvite}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.md,
            padding: spacing.md,
            borderRadius: radius.lg,
            borderCurve: "continuous",
            backgroundColor: atLimit
              ? colors.cell
              : pressed
                ? colors.cellHighlight
                : colors.cell,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: atLimit ? colors.warning : colors.accent,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <SymbolView
              name={atLimit ? "sparkles" : "person.crop.circle.badge.plus"}
              size={20}
              tintColor={colors.accentContrast}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                ...type.body,
                color: colors.label,
                fontWeight: "600",
              }}
            >
              {atLimit ? "Upgrade to invite more" : "Invite by email"}
            </Text>
            <Text
              style={{
                ...type.footnote,
                color: colors.secondaryLabel,
                marginTop: 1,
              }}
            >
              {atLimit
                ? "Free plan allows 1 shared user per app"
                : "They'll receive pushes from this app on their devices"}
            </Text>
          </View>
          <SymbolView
            name="chevron.right"
            size={14}
            tintColor={colors.tertiaryLabel}
          />
        </Pressable>
      )}

      <Section
        title="Members"
        count={data.members.length}
        emptyIcon="person.2"
        emptyText={
          isOwner
            ? "You're the only member. Invite someone above."
            : "Just you here for now."
        }
      >
        {data.members.map((m) => (
          <Animated.View
            key={m._id}
            entering={FadeIn}
            exiting={FadeOut}
            layout={LinearTransition}
          >
            <MemberRow
              member={m}
              onPress={isOwner && !m.isMe ? () => memberMenu(m) : undefined}
              showMenuHint={isOwner && !m.isMe}
            />
          </Animated.View>
        ))}
      </Section>

      <Section
        title="Pending invites"
        count={data.invites.length}
        emptyIcon="envelope"
        emptyText={
          isOwner
            ? "No invites waiting for a response."
            : "No outstanding invitations."
        }
      >
        {data.invites.map((i) => (
          <Animated.View
            key={i._id}
            entering={FadeIn}
            exiting={FadeOut}
            layout={LinearTransition}
          >
            <InviteRow
              invite={i}
              onPress={isOwner ? () => inviteMenu(i) : undefined}
              showMenuHint={isOwner}
            />
          </Animated.View>
        ))}
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Shared row / section primitives
// ---------------------------------------------------------------------------

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  const rows = React.Children.toArray(children).filter(React.isValidElement);
  if (rows.length === 0) return null;
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
  titleSelectable,
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
  titleSelectable?: boolean;
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
        <View
          style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}
        >
          <Text
            style={{ ...type.body, color: titleColor }}
            numberOfLines={1}
            selectable={titleSelectable}
          >
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

function SharingCountBadge({
  memberCount,
  pendingCount,
}: {
  memberCount: number;
  pendingCount: number;
}) {
  const { colors } = useTheme();
  const total = memberCount + pendingCount;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <Text
        style={{
          ...type.subhead,
          color: colors.secondaryLabel,
          fontVariant: ["tabular-nums"],
        }}
      >
        {total}
      </Text>
      {pendingCount > 0 && (
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: colors.warning,
          }}
        />
      )}
    </View>
  );
}

function RoleBadge({ role, muted }: { role: Role; muted?: boolean }) {
  const { colors, tintBg } = useTheme();
  const label =
    role === "owner" ? "Owner" : role === "editor" ? "Editor" : "Viewer";
  const tint =
    role === "owner"
      ? colors.accent
      : role === "editor"
        ? colors.success
        : colors.secondaryLabel;
  return (
    <View
      style={{
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        backgroundColor: muted ? colors.fill : tintBg(tint),
      }}
    >
      <Text
        style={{
          ...type.caption2,
          color: muted ? colors.secondaryLabel : tint,
          fontWeight: "600",
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function UsageCard({
  tier,
  used,
  limit,
  atLimit,
}: {
  tier: SharingData["ownerTier"];
  used: number;
  limit: number | null;
  atLimit: boolean;
}) {
  const { colors } = useTheme();
  const isFree = tier === "free";
  const limitDisplay = limit ?? "∞";
  const tint = atLimit ? colors.warning : colors.accent;

  return (
    <View
      style={{
        backgroundColor: colors.cell,
        borderRadius: radius.lg,
        borderCurve: "continuous",
        padding: spacing.lg,
        gap: spacing.sm,
      }}
    >
      <View
        style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}
      >
        <SymbolView name="person.2.fill" size={16} tintColor={tint} />
        <Text
          style={{
            ...type.footnote,
            color: tint,
            fontWeight: "600",
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          {isFree ? "Free plan" : "Pro plan"}
        </Text>
        <View style={{ flex: 1 }} />
        <Text
          style={{
            ...type.footnote,
            color: colors.secondaryLabel,
            fontVariant: ["tabular-nums"],
          }}
        >
          {used} of {limitDisplay} used
        </Text>
      </View>
      {limit !== null && (
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
              width: `${Math.min(1, used / Math.max(limit, 1)) * 100}%`,
              height: "100%",
              backgroundColor: tint,
            }}
          />
        </View>
      )}
      {atLimit && isFree && (
        <Text style={{ ...type.footnote, color: colors.secondaryLabel }}>
          Upgrade to Pro for unlimited shared users per app.
        </Text>
      )}
    </View>
  );
}

function Section({
  title,
  count,
  emptyIcon,
  emptyText,
  children,
}: {
  title: string;
  count: number;
  emptyIcon: SFSymbol;
  emptyText: string;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  const rows = React.Children.toArray(children).filter(React.isValidElement);
  return (
    <View style={{ gap: spacing.xs }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "baseline",
          gap: spacing.xs,
          paddingHorizontal: spacing.sm,
        }}
      >
        <Text
          style={{
            ...type.footnote,
            color: colors.secondaryLabel,
            textTransform: "uppercase",
            letterSpacing: 0.5,
            fontWeight: "600",
          }}
        >
          {title}
        </Text>
        {count > 0 && (
          <Text
            style={{
              ...type.footnote,
              color: colors.tertiaryLabel,
              fontVariant: ["tabular-nums"],
            }}
          >
            ({count})
          </Text>
        )}
      </View>
      {rows.length === 0 ? (
        <View
          style={{
            backgroundColor: colors.cell,
            borderRadius: radius.lg,
            borderCurve: "continuous",
            paddingVertical: spacing.xl,
            paddingHorizontal: spacing.lg,
            alignItems: "center",
            gap: spacing.sm,
          }}
        >
          <SymbolView
            name={emptyIcon}
            size={28}
            tintColor={colors.tertiaryLabel}
          />
          <Text
            style={{
              ...type.footnote,
              color: colors.secondaryLabel,
              textAlign: "center",
            }}
          >
            {emptyText}
          </Text>
        </View>
      ) : (
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
                    marginLeft: 64,
                  }}
                />
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function MemberRow({
  member,
  onPress,
  showMenuHint,
}: {
  member: Member;
  onPress?: () => void;
  showMenuHint?: boolean;
}) {
  const { colors } = useTheme();
  const display = member.email ?? "Member";
  const subtitle = member.isMe
    ? `${labelForRole(member.role)} · You`
    : labelForRole(member.role);

  const content = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.lg,
        minHeight: 60,
      }}
    >
      <Avatar url={null} name={display} size={36} />
      <View style={{ flex: 1 }}>
        <Text
          selectable
          style={{ ...type.body, color: colors.label }}
          numberOfLines={1}
        >
          {display}
        </Text>
        <Text
          style={{
            ...type.footnote,
            color: colors.secondaryLabel,
            marginTop: 1,
          }}
          numberOfLines={1}
        >
          {subtitle}
        </Text>
      </View>
      <RoleBadge role={member.role} />
      {showMenuHint && (
        <SymbolView name="ellipsis" size={16} tintColor={colors.tertiaryLabel} />
      )}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: pressed ? "rgba(127,127,127,0.08)" : "transparent",
      })}
    >
      {content}
    </Pressable>
  );
}

function InviteRow({
  invite,
  onPress,
  showMenuHint,
}: {
  invite: Invite;
  onPress?: () => void;
  showMenuHint?: boolean;
}) {
  const { colors, tintBg } = useTheme();
  const expiresIn = formatExpiresIn(invite.expiresAt);
  const sent = formatRelativeShort(invite.createdAt);

  const content = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.lg,
        minHeight: 60,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: tintBg(colors.warning),
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <SymbolView name="envelope.fill" size={16} tintColor={colors.warning} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          selectable
          style={{ ...type.body, color: colors.label }}
          numberOfLines={1}
        >
          {invite.email}
        </Text>
        <Text
          style={{
            ...type.footnote,
            color: colors.secondaryLabel,
            marginTop: 1,
          }}
          numberOfLines={1}
        >
          Invited as {labelForRole(invite.role)} · sent {sent} · {expiresIn}
        </Text>
      </View>
      <RoleBadge role={invite.role} muted />
      {showMenuHint && (
        <SymbolView name="ellipsis" size={16} tintColor={colors.tertiaryLabel} />
      )}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: pressed ? "rgba(127,127,127,0.08)" : "transparent",
      })}
    >
      {content}
    </Pressable>
  );
}

function EmptyMessage({
  icon,
  title,
  message,
}: {
  icon: SFSymbol;
  title: string;
  message: string;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        alignItems: "center",
        paddingVertical: spacing.xxl,
        paddingHorizontal: spacing.lg,
        gap: spacing.md,
      }}
    >
      <SymbolView name={icon} size={48} tintColor={colors.tertiaryLabel} />
      <Text style={{ ...type.title3, color: colors.label }}>{title}</Text>
      <Text
        style={{
          ...type.subhead,
          color: colors.secondaryLabel,
          textAlign: "center",
        }}
      >
        {message}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function labelForRole(role: Role): string {
  return role === "owner" ? "Owner" : role === "editor" ? "Editor" : "Viewer";
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
  // backendConfig() throws if the app booted without EXPO_PUBLIC_CONVEX_SITE_URL,
  // and respects the user's self-hosted override saved via Server Config — so
  // the curl always points at a real, reachable endpoint.
  const { siteUrl } = backendConfig();
  return `curl -X POST ${siteUrl}/notify \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{"title":"Hello from ${appName}","body":"It works!"}'`;
}

function sharingSubtitle(data: SharingData | undefined): string {
  if (!data) return "Loading…";
  const members = data.members.length;
  const pending = data.invites.length;
  const limit = data.sharedUsersLimit;
  if (members === 0 && pending === 0) {
    return data.myRole === "owner"
      ? limit !== null
        ? `Invite up to ${limit} other ${limit === 1 ? "person" : "people"}`
        : "Invite others to receive these pushes"
      : "Just you";
  }
  const parts: string[] = [];
  parts.push(members === 1 ? "1 member" : `${members} members`);
  if (pending > 0) parts.push(`${pending} pending`);
  return parts.join(" · ");
}

function memberSummary(data: SharingData): string {
  const total = data.members.length;
  const pending = data.invites.length;
  const memberLabel = total === 1 ? "1 member" : `${total} members`;
  if (pending === 0) return memberLabel;
  return `${memberLabel} · ${pending} pending`;
}

function formatExpiresIn(expiresAt: number): string {
  const ms = expiresAt - Date.now();
  if (ms <= 0) return "expired";
  const days = Math.round(ms / (24 * 60 * 60 * 1000));
  if (days >= 1) return `expires in ${days}d`;
  const hours = Math.round(ms / (60 * 60 * 1000));
  if (hours >= 1) return `expires in ${hours}h`;
  return "expires soon";
}

function formatRelativeShort(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}
