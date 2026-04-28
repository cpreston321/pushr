import React from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { SymbolView, type SFSymbol } from "expo-symbols";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Avatar } from "@/components/Avatar";
import { useTheme, spacing, radius, type } from "@/lib/theme";
import { haptic } from "@/lib/haptics";
import { showActionSheet } from "@/lib/actionSheet";
import { promptText } from "@/lib/prompt";

type Role = "owner" | "editor" | "viewer";
type SharingData = NonNullable<FunctionReturnType<typeof api.sharing.listMembers>>;
type Member = SharingData["members"][number];
type Invite = SharingData["invites"][number];

export default function SharingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const sourceAppId = id as Id<"sourceApps">;
  const { colors } = useTheme();

  const app = useQuery(api.sourceApps.getById, { id: sourceAppId });
  const data = useQuery(api.sharing.listMembers, { sourceAppId });

  const inviteByEmail = useMutation(api.sharing.inviteByEmail);
  const cancelInvite = useMutation(api.sharing.cancelInvite);
  const removeMember = useMutation(api.sharing.removeMember);
  const setMemberRole = useMutation(api.sharing.setMemberRole);

  if (app === undefined || data === undefined) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
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
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.lg,
        paddingBottom: 40,
        gap: spacing.lg,
      }}
    >
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
            onPress={atLimit ? () => router.push("/upgrade") : handleInvite}
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
                tintColor={atLimit ? colors.accentContrast : colors.accentContrast}
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
                onPress={
                  isOwner && !m.isMe ? () => memberMenu(m) : undefined
                }
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
    </ScrollView>
  );
}

function memberSummary(data: SharingData): string {
  const total = data.members.length;
  const pending = data.invites.length;
  const memberLabel =
    total === 1 ? "1 member" : `${total} members`;
  if (pending === 0) return memberLabel;
  return `${memberLabel} · ${pending} pending`;
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
  const { colors, tintBg } = useTheme();
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
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.sm,
        }}
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
          <SymbolView name={emptyIcon} size={28} tintColor={colors.tertiaryLabel} />
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
        <SymbolView
          name="ellipsis"
          size={16}
          tintColor={colors.tertiaryLabel}
        />
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
        <SymbolView
          name="ellipsis"
          size={16}
          tintColor={colors.tertiaryLabel}
        />
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
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
        borderCurve: "continuous",
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
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: spacing.xxl,
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

function labelForRole(role: Role): string {
  return role === "owner" ? "Owner" : role === "editor" ? "Editor" : "Viewer";
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
