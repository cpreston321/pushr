import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
} from "react-native-reanimated";
import { SymbolView } from "expo-symbols";
import { useMutation, useQuery } from "convex/react";
import { api } from "@pushr/backend/_generated/api";
import type { Id } from "@pushr/backend/_generated/dataModel";
import { Avatar } from "@/components/Avatar";
import { SheetHeader } from "@/components/SheetHeader";
import { useSheetNav } from "@/components/sheets/SheetNavigator";
import {
  EmptyMessage,
  InviteRow,
  labelForRole,
  MemberRow,
  MembersSection,
  memberSummary,
  UsageCard,
  type Invite,
  type Member,
} from "@/components/source-app/shared";
import { useTheme, spacing, radius, type } from "@/lib/theme";
import { haptic } from "@/lib/haptics";
import { showActionSheet } from "@/lib/actionSheet";
import { promptText } from "@/lib/prompt";

export function SourceAppSharingFrame({
  appId,
}: {
  appId: Id<"sourceApps">;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const nav = useSheetNav();
  return (
    <View style={{ flex: 1, backgroundColor: colors.sheet }}>
      <SheetHeader title="Sharing" onClose={nav.pop} variant="back" />
      <ScrollView
        contentContainerStyle={{
          paddingTop: spacing.md,
          paddingHorizontal: spacing.lg,
          paddingBottom: insets.bottom + spacing.xxl * 2,
          gap: spacing.lg,
        }}
      >
        <Body sourceAppId={appId} />
      </ScrollView>
    </View>
  );
}

function Body({ sourceAppId }: { sourceAppId: Id<"sourceApps"> }) {
  const { colors } = useTheme();
  const app = useQuery(api.sourceApps.getById, { id: sourceAppId });
  const data = useQuery(api.sharing.listMembers, { sourceAppId });

  const inviteByEmail = useMutation(api.sharing.inviteByEmail);
  const cancelInvite = useMutation(api.sharing.cancelInvite);
  const removeMember = useMutation(api.sharing.removeMember);
  const setMemberRole = useMutation(api.sharing.setMemberRole);
  const setInviteRole = useMutation(api.sharing.setInviteRole);

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
      confirmLabel: "Next",
    });
    if (!email) return;
    haptic.light();
    showActionSheet({
      title: `Invite ${email} as…`,
      message:
        "Editors can adjust delivery settings. Viewers only receive pushes.",
      options: [
        { label: "Editor", onPress: () => sendInvite(email, "editor") },
        { label: "Viewer", onPress: () => sendInvite(email, "viewer") },
      ],
    });
  }

  async function sendInvite(email: string, role: "editor" | "viewer") {
    try {
      const result = await inviteByEmail({ sourceAppId, email, role });
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
            member.role === "editor"
              ? "Demote to viewer"
              : "Promote to editor",
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
                    await removeMember({ sourceAppId, memberId: member._id });
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
    const otherRole: "editor" | "viewer" =
      invite.role === "editor" ? "viewer" : "editor";
    showActionSheet({
      title: invite.email,
      message: `Pending · ${labelForRole(invite.role)}`,
      options: [
        {
          label: `Change role to ${labelForRole(otherRole)}`,
          onPress: async () => {
            try {
              await setInviteRole({ inviteId: invite._id, role: otherRole });
              haptic.success();
            } catch (err: any) {
              haptic.error();
              Alert.alert(
                "Couldn't change role",
                err?.data?.message ?? err?.message ?? "Please try again.",
              );
            }
          },
        },
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
              borderRadius: radius.xl,
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
            <Text style={{ ...type.body, color: colors.label, fontWeight: "600" }}>
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

      <MembersSection
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
      </MembersSection>

      <MembersSection
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
      </MembersSection>
    </>
  );
}
