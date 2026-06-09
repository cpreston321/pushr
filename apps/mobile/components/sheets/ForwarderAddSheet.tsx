import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SymbolView } from "expo-symbols";
import { useMutation } from "convex/react";
import { api } from "@pushr/backend/_generated/api";
import type { Id } from "@pushr/backend/_generated/dataModel";
import { Input } from "@/components/Input";
import { SheetActionPill, SheetHeader } from "@/components/SheetHeader";
import { useSheetNav } from "@/components/sheets/SheetNavigator";
import {
  DiscordLogo,
  SlackLogo,
  DISCORD_BG,
  SLACK_BG,
} from "@/components/source-app/BrandLogo";
import { useTheme, spacing, radius, type } from "@/lib/theme";
import { haptic } from "@/lib/haptics";

type ForwarderKind = "slack" | "discord";
type PriorityFilter = "all" | "normal_high" | "high_only";

const PRIORITY_OPTIONS: {
  value: PriorityFilter;
  title: string;
  body: string;
}[] = [
  { value: "all", title: "All pushes", body: "Forward every notification from this app." },
  {
    value: "normal_high",
    title: "Normal & high priority",
    body: "Skip pushes with priority below 5 (low-priority chatter).",
  },
  {
    value: "high_only",
    title: "High priority only",
    body: "Only urgent alerts (priority ≥ 7). Keep the channel quiet.",
  },
];

export function SourceAppForwarderAddFrame({
  sourceAppId,
}: {
  sourceAppId: Id<"sourceApps">;
}) {
  const nav = useSheetNav();
  return <Form sourceAppId={sourceAppId} onDone={nav.pop} />;
}

function Form({
  sourceAppId,
  onDone,
}: {
  sourceAppId: Id<"sourceApps">;
  onDone: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const create = useMutation(api.forwarders.create);

  const [kind, setKind] = useState<ForwarderKind>("slack");
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [priority, setPriority] = useState<PriorityFilter>("all");
  const [submitting, setSubmitting] = useState(false);

  const urlLooksRight =
    kind === "slack"
      ? /^https:\/\/hooks\.slack\.com\/services\//.test(url.trim())
      : /^https:\/\/(canary\.|ptb\.)?discord(app)?\.com\/api\/webhooks\//.test(
          url.trim(),
        );

  const canSubmit = !!url.trim() && !submitting;

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await create({
        sourceAppId,
        kind,
        url: url.trim(),
        label: label.trim() || undefined,
        priorityFilter: priority,
      });
      haptic.success();
      onDone();
    } catch (err: any) {
      haptic.error();
      Alert.alert(
        "Couldn't add forwarder",
        err?.data?.message ?? err?.message ?? "Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.sheet }}>
      <SheetHeader
        title="Add forwarder"
        onClose={onDone}
        variant="back"
        trailing={
          <SheetActionPill
            label="Add"
            onPress={submit}
            disabled={!canSubmit}
            loading={submitting}
          />
        }
      />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingTop: spacing.md,
          paddingHorizontal: spacing.lg,
          paddingBottom: insets.bottom + spacing.xxl * 2,
          gap: spacing.lg,
        }}
      >
        <FieldLabel>Destination</FieldLabel>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <BrandCard
            kind="slack"
            active={kind === "slack"}
            onPress={() => {
              haptic.selection();
              setKind("slack");
            }}
          />
          <BrandCard
            kind="discord"
            active={kind === "discord"}
            onPress={() => {
              haptic.selection();
              setKind("discord");
            }}
          />
        </View>

        <View style={{ gap: spacing.sm }}>
          <FieldLabel>Webhook URL</FieldLabel>
          <Input
            placeholder={
              kind === "slack"
                ? "https://hooks.slack.com/services/…"
                : "https://discord.com/api/webhooks/…"
            }
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            textContentType="URL"
          />
          <Text
            style={{
              ...type.caption1,
              color: colors.tertiaryLabel,
              paddingHorizontal: 4,
            }}
          >
            {kind === "slack"
              ? "Slack → your workspace → Apps → Incoming Webhooks → Add to channel."
              : "Discord → channel settings → Integrations → Webhooks → New webhook."}
            {url.trim().length > 0 && !urlLooksRight && (
              <Text style={{ color: colors.warning }}>
                {"  "}
                <SymbolView
                  name="exclamationmark.triangle.fill"
                  size={10}
                  tintColor={colors.warning}
                />{" "}
                URL doesn't match the expected format.
              </Text>
            )}
          </Text>
        </View>

        <View style={{ gap: spacing.sm }}>
          <FieldLabel>Label (optional)</FieldLabel>
          <Input
            placeholder={kind === "slack" ? "e.g. #alerts" : "e.g. ops channel"}
            value={label}
            onChangeText={setLabel}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View style={{ gap: spacing.sm }}>
          <FieldLabel>Which pushes to forward</FieldLabel>
          <View
            style={{
              backgroundColor: colors.cell,
              borderRadius: radius.lg,
              borderCurve: "continuous",
              overflow: "hidden",
            }}
          >
            {PRIORITY_OPTIONS.map((opt, i) => {
              const selected = priority === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => {
                    haptic.selection();
                    setPriority(opt.value);
                  }}
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.md,
                    gap: spacing.md,
                    backgroundColor: pressed
                      ? colors.cellHighlight
                      : "transparent",
                    borderTopWidth: i > 0 ? 0.5 : 0,
                    borderTopColor: colors.separator,
                    marginLeft: i > 0 ? spacing.md : 0,
                  })}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ ...type.body, color: colors.label }}>
                      {opt.title}
                    </Text>
                    <Text
                      style={{
                        ...type.footnote,
                        color: colors.secondaryLabel,
                        marginTop: 1,
                      }}
                    >
                      {opt.body}
                    </Text>
                  </View>
                  {selected ? (
                    <SymbolView
                      name="checkmark"
                      size={16}
                      tintColor={colors.accent}
                    />
                  ) : (
                    <View style={{ width: 16, height: 16 }} />
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function FieldLabel({ children }: { children: string }) {
  const { colors } = useTheme();
  return (
    <Text
      style={{
        ...type.footnote,
        color: colors.secondaryLabel,
        textTransform: "uppercase",
        letterSpacing: 0.5,
        fontWeight: "600",
        paddingHorizontal: 4,
      }}
    >
      {children}
    </Text>
  );
}

function BrandCard({
  kind,
  active,
  onPress,
}: {
  kind: ForwarderKind;
  active: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const label = kind === "slack" ? "Slack" : "Discord";
  const brandBg = kind === "slack" ? SLACK_BG : DISCORD_BG;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Forward to ${label}`}
      accessibilityState={{ selected: active }}
      style={({ pressed }) => ({
        flex: 1,
        backgroundColor: active ? brandBg : colors.cell,
        borderRadius: radius.lg,
        borderCurve: "continuous",
        paddingVertical: spacing.lg,
        alignItems: "center",
        gap: spacing.sm,
        borderWidth: 1.5,
        borderColor: active ? brandBg : "transparent",
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {kind === "slack" ? <SlackLogo size={44} /> : <DiscordLogo size={44} />}
      <Text
        style={{
          ...type.subhead,
          fontWeight: "600",
          color: active ? "#FFFFFF" : colors.label,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
