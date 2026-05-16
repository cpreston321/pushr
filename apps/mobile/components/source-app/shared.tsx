import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { api } from '@pushr/backend/_generated/api';
import type { Doc, Id } from '@pushr/backend/_generated/dataModel';
import { Avatar } from '@/components/Avatar';
import { useTheme, spacing, radius, type } from '@/lib/theme';
import { haptic } from '@/lib/haptics';
import { backendConfig } from '@/lib/backend';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Role = 'owner' | 'editor' | 'viewer';

export type AppRow = Doc<'sourceApps'> & {
  logoUrl: string | null;
  role: Role;
  /** Owner-only: per-provider webhook signing configs. Empty for viewers/editors. */
  webhookConfigs: Array<{ provider: string; secret: string }>;
};

export type SharingData = NonNullable<FunctionReturnType<typeof api.sharing.listMembers>>;
export type Member = SharingData['members'][number];
export type Invite = SharingData['invites'][number];

export type WebhookProviderId = 'github' | 'sentry' | 'grafana';

export type WebhookProviderMeta = {
  label: string;
  signs: boolean;
  signatureHeader?: string;
  configHint?: string;
  hookPath: string;
};

export const WEBHOOK_PROVIDERS: Record<WebhookProviderId, WebhookProviderMeta> = {
  github: {
    label: 'GitHub',
    signs: true,
    signatureHeader: 'X-Hub-Signature-256',
    configHint: 'Repo → Settings → Webhooks',
    hookPath: '/hooks/github'
  },
  sentry: {
    label: 'Sentry',
    signs: true,
    signatureHeader: 'Sentry-Hook-Signature',
    configHint: 'Settings → Custom Integrations → Webhooks',
    hookPath: '/hooks/sentry'
  },
  grafana: {
    label: 'Grafana',
    signs: false,
    configHint: 'Alerting → Contact points → Webhook',
    hookPath: '/hooks/grafana'
  }
};

export const WEBHOOK_PROVIDER_ORDER: WebhookProviderId[] = ['github', 'sentry', 'grafana'];

export function isWebhookProviderId(v: string | undefined): v is WebhookProviderId {
  return v === 'github' || v === 'sentry' || v === 'grafana';
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

export function labelForRole(role: Role): string {
  return role === 'owner' ? 'Owner' : role === 'editor' ? 'Editor' : 'Viewer';
}

export function isMuted(row: Pick<Doc<'sourceApps'>, 'mutedUntil'>): boolean {
  return !!row.mutedUntil && row.mutedUntil > Date.now();
}

export function tomorrowAt8am(): number {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(8, 0, 0, 0);
  return d.getTime();
}

export function quietHoursLabel(
  row: Pick<Doc<'sourceApps'>, 'quietStart' | 'quietEnd'>
): string | null {
  const { quietStart: s, quietEnd: e } = row;
  if (s === undefined || e === undefined || s === e) return null;
  const fmt = (m: number) => {
    const h = Math.floor(m / 60);
    const min = m % 60;
    const period = h >= 12 ? 'pm' : 'am';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return min === 0 ? `${h12}${period}` : `${h12}:${String(min).padStart(2, '0')}${period}`;
  };
  return `${fmt(s)}–${fmt(e)}`;
}

export function curlExample(appName: string, token = '<your_token>'): string {
  const { siteUrl } = backendConfig();
  return `curl -X POST ${siteUrl}/notify \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{"title":"Hello from ${appName}","body":"It works!"}'`;
}

export function sharingSubtitle(data: SharingData | undefined): string {
  if (!data) return 'Loading…';
  const members = data.members.length;
  const pending = data.invites.length;
  const limit = data.sharedUsersLimit;
  if (members === 0 && pending === 0) {
    return data.myRole === 'owner'
      ? limit !== null
        ? `Invite up to ${limit} other ${limit === 1 ? 'person' : 'people'}`
        : 'Invite others to receive these pushes'
      : 'Just you';
  }
  const parts: string[] = [];
  parts.push(members === 1 ? '1 member' : `${members} members`);
  if (pending > 0) parts.push(`${pending} pending`);
  return parts.join(' · ');
}

export function memberSummary(data: SharingData): string {
  const total = data.members.length;
  const pending = data.invites.length;
  const memberLabel = total === 1 ? '1 member' : `${total} members`;
  if (pending === 0) return memberLabel;
  return `${memberLabel} · ${pending} pending`;
}

export function formatExpiresIn(expiresAt: number): string {
  const ms = expiresAt - Date.now();
  if (ms <= 0) return 'expired';
  const days = Math.round(ms / (24 * 60 * 60 * 1000));
  if (days >= 1) return `expires in ${days}d`;
  const hours = Math.round(ms / (60 * 60 * 1000));
  if (hours >= 1) return `expires in ${hours}h`;
  return 'expires soon';
}

export function formatRelativeShort(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  const m = Math.round(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

export function apiRowSubtitle(
  configs: Array<{ provider: string; secret: string }> | undefined
): string {
  const count = configs?.length ?? 0;
  if (count === 0) return 'Curl example, copy token, regenerate';
  if (count === 1) {
    const provider = configs![0].provider;
    const meta = isWebhookProviderId(provider) ? WEBHOOK_PROVIDERS[provider] : null;
    return meta
      ? `${meta.label} signing on · curl, regenerate`
      : 'Webhook signing on · curl, regenerate';
  }
  return `${count} webhook signers · curl, regenerate`;
}

// ---------------------------------------------------------------------------
// Section / Row primitives
// ---------------------------------------------------------------------------

export function DetailSection({
  title,
  children
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
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          paddingHorizontal: spacing.sm
        }}
      >
        {title}
      </Text>
      <View
        style={{
          backgroundColor: colors.cell,
          borderRadius: radius.lg,
          borderCurve: 'continuous',
          overflow: 'hidden'
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
                  marginLeft: 56
                }}
              />
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

export function DetailRow({
  icon,
  tint,
  title,
  titleSelectable,
  subtitle,
  trailing,
  onPress,
  chevron,
  destructive,
  badge
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
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.md,
        gap: spacing.md,
        minHeight: 56
      }}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: radius.lg,
          backgroundColor: tintBg(tint),
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <SymbolView name={icon} size={18} tintColor={tint} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
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
                borderRadius: radius.xs,
                backgroundColor: colors.accent
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: '700',
                  color: colors.accentContrast,
                  letterSpacing: 0.5
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
              marginTop: 1
            }}
            numberOfLines={2}
          >
            {subtitle}
          </Text>
        )}
      </View>
      {trailing}
      {chevron && !trailing && (
        <SymbolView name="chevron.right" size={14} tintColor={colors.tertiaryLabel} />
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
        backgroundColor: pressed ? colors.cellHighlight : 'transparent'
      })}
    >
      {content}
    </Pressable>
  );
}

export function SharingCountBadge({
  memberCount,
  pendingCount
}: {
  memberCount: number;
  pendingCount: number;
}) {
  const { colors } = useTheme();
  const total = memberCount + pendingCount;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Text
        style={{
          ...type.subhead,
          color: colors.secondaryLabel,
          fontVariant: ['tabular-nums']
        }}
      >
        {total}
      </Text>
      {pendingCount > 0 && (
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: radius.xs,
            backgroundColor: colors.warning
          }}
        />
      )}
    </View>
  );
}

export function RoleBadge({ role, muted }: { role: Role; muted?: boolean }) {
  const { colors, tintBg } = useTheme();
  const label = labelForRole(role);
  const tint =
    role === 'owner' ? colors.accent : role === 'editor' ? colors.success : colors.secondaryLabel;
  return (
    <View
      style={{
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: radius.xs,
        backgroundColor: muted ? colors.fill : tintBg(tint)
      }}
    >
      <Text
        style={{
          ...type.caption2,
          color: muted ? colors.secondaryLabel : tint,
          fontWeight: '600'
        }}
      >
        {label}
      </Text>
    </View>
  );
}

export function UsageCard({
  tier,
  used,
  limit,
  atLimit
}: {
  tier: SharingData['ownerTier'];
  used: number;
  limit: number | null;
  atLimit: boolean;
}) {
  const { colors } = useTheme();
  const isFree = tier === 'free';
  const limitDisplay = limit ?? '∞';
  const tint = atLimit ? colors.warning : colors.accent;

  return (
    <View
      style={{
        backgroundColor: colors.cell,
        borderRadius: radius.lg,
        borderCurve: 'continuous',
        padding: spacing.lg,
        gap: spacing.sm
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <SymbolView name="person.2.fill" size={16} tintColor={tint} />
        <Text
          style={{
            ...type.footnote,
            color: tint,
            fontWeight: '600',
            textTransform: 'uppercase',
            letterSpacing: 0.5
          }}
        >
          {isFree ? 'Free plan' : 'Pro plan'}
        </Text>
        <View style={{ flex: 1 }} />
        <Text
          style={{
            ...type.footnote,
            color: colors.secondaryLabel,
            fontVariant: ['tabular-nums']
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
            overflow: 'hidden'
          }}
        >
          <View
            style={{
              width: `${Math.min(1, used / Math.max(limit, 1)) * 100}%`,
              height: '100%',
              backgroundColor: tint
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

export function MembersSection({
  title,
  count,
  emptyIcon,
  emptyText,
  children
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
          flexDirection: 'row',
          alignItems: 'baseline',
          gap: spacing.xs,
          paddingHorizontal: spacing.sm
        }}
      >
        <Text
          style={{
            ...type.footnote,
            color: colors.secondaryLabel,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            fontWeight: '600'
          }}
        >
          {title}
        </Text>
        {count > 0 && (
          <Text
            style={{
              ...type.footnote,
              color: colors.tertiaryLabel,
              fontVariant: ['tabular-nums']
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
            borderCurve: 'continuous',
            paddingVertical: spacing.xl,
            paddingHorizontal: spacing.lg,
            alignItems: 'center',
            gap: spacing.sm
          }}
        >
          <SymbolView name={emptyIcon} size={28} tintColor={colors.tertiaryLabel} />
          <Text
            style={{
              ...type.footnote,
              color: colors.secondaryLabel,
              textAlign: 'center'
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
            borderCurve: 'continuous',
            overflow: 'hidden'
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
                    marginLeft: 64
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

export function MemberRow({
  member,
  onPress,
  showMenuHint
}: {
  member: Member;
  onPress?: () => void;
  showMenuHint?: boolean;
}) {
  const { colors } = useTheme();
  const display = member.email ?? 'Member';
  const subtitle = member.isMe ? `${labelForRole(member.role)} · You` : labelForRole(member.role);

  const content = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.lg,
        minHeight: 60
      }}
    >
      <Avatar url={null} name={display} size={36} />
      <View style={{ flex: 1 }}>
        <Text selectable style={{ ...type.body, color: colors.label }} numberOfLines={1}>
          {display}
        </Text>
        <Text
          style={{
            ...type.footnote,
            color: colors.secondaryLabel,
            marginTop: 1
          }}
          numberOfLines={1}
        >
          {subtitle}
        </Text>
      </View>
      <RoleBadge role={member.role} />
      {showMenuHint && <SymbolView name="ellipsis" size={16} tintColor={colors.tertiaryLabel} />}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: pressed ? 'rgba(127,127,127,0.08)' : 'transparent'
      })}
    >
      {content}
    </Pressable>
  );
}

export function InviteRow({
  invite,
  onPress,
  showMenuHint
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
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.lg,
        minHeight: 60
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: tintBg(colors.warning),
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <SymbolView name="envelope.fill" size={16} tintColor={colors.warning} />
      </View>
      <View style={{ flex: 1 }}>
        <Text selectable style={{ ...type.body, color: colors.label }} numberOfLines={1}>
          {invite.email}
        </Text>
        <Text
          style={{
            ...type.footnote,
            color: colors.secondaryLabel,
            marginTop: 1
          }}
          numberOfLines={1}
        >
          Invited as {labelForRole(invite.role)} · sent {sent} · {expiresIn}
        </Text>
      </View>
      <RoleBadge role={invite.role} muted />
      {showMenuHint && <SymbolView name="ellipsis" size={16} tintColor={colors.tertiaryLabel} />}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: pressed ? 'rgba(127,127,127,0.08)' : 'transparent'
      })}
    >
      {content}
    </Pressable>
  );
}

export function EmptyMessage({
  icon,
  title,
  message
}: {
  icon: SFSymbol;
  title: string;
  message: string;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        alignItems: 'center',
        paddingVertical: spacing.xxl,
        paddingHorizontal: spacing.lg,
        gap: spacing.md
      }}
    >
      <SymbolView name={icon} size={48} tintColor={colors.tertiaryLabel} />
      <Text style={{ ...type.title3, color: colors.label }}>{title}</Text>
      <Text
        style={{
          ...type.subhead,
          color: colors.secondaryLabel,
          textAlign: 'center'
        }}
      >
        {message}
      </Text>
    </View>
  );
}

export function DestructiveFooterButton({
  label,
  onPress
}: {
  label: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        haptic.selection();
        onPress();
      }}
      style={({ pressed }) => ({
        backgroundColor: pressed ? colors.cellHighlight : colors.cell,
        borderRadius: radius.lg,
        borderCurve: 'continuous',
        paddingVertical: spacing.md,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 52
      })}
    >
      <Text
        style={{
          ...type.body,
          color: colors.destructive,
          fontWeight: '600'
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function SharingSummarySection({
  sourceAppId,
  onPress
}: {
  sourceAppId: Id<'sourceApps'>;
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
        icon={atLimit ? 'sparkles' : 'person.2.fill'}
        tint={atLimit ? colors.warning : colors.accent}
        title="Manage sharing"
        subtitle={subtitle}
        onPress={onPress}
        chevron
        trailing={
          memberCount + pendingCount > 0 ? (
            <SharingCountBadge memberCount={memberCount} pendingCount={pendingCount} />
          ) : undefined
        }
      />
    </DetailSection>
  );
}
