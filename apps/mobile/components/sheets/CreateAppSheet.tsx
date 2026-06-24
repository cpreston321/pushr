import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import { Image } from "expo-image";
import { SymbolView } from "expo-symbols";
import { AppBottomSheet } from "@/components/sheets/AppBottomSheet";
import { useMutation } from "convex/react";
import { api } from "@pushr/backend/_generated/api";
import type { Id } from "@pushr/backend/_generated/dataModel";
import { Input } from "@/components/Input";
import { SheetActionPill, SheetHeader } from "@/components/SheetHeader";
import { useTheme, spacing, radius, type } from "@/lib/theme";
import { haptic } from "@/lib/haptics";
import { pickAndUploadLogo } from "@/lib/uploadLogo";
import { rememberToken } from "@/lib/tokenStore";
import { RECIPES } from "@/lib/recipes";

type CreateAppSheetApi = {
  present: () => void;
  dismiss: () => void;
};

type State = { index: number; setIndex: (i: number) => void };

const ApiCtx = createContext<CreateAppSheetApi | null>(null);
const StateCtx = createContext<State | null>(null);

export function useCreateAppSheet(): CreateAppSheetApi {
  const ctx = useContext(ApiCtx);
  if (!ctx) {
    throw new Error(
      "useCreateAppSheet must be used inside <CreateAppSheetProvider>",
    );
  }
  return ctx;
}

export function CreateAppSheetProvider({ children }: { children: ReactNode }) {
  const [index, setIndex] = useState(0);

  const api = useMemo<CreateAppSheetApi>(
    () => ({
      present: () => setIndex(1),
      dismiss: () => setIndex(0),
    }),
    [],
  );

  const state = useMemo(() => ({ index, setIndex }), [index]);

  return (
    <StateCtx.Provider value={state}>
      <ApiCtx.Provider value={api}>{children}</ApiCtx.Provider>
    </StateCtx.Provider>
  );
}

export function CreateAppSheetMount() {
  const state = useContext(StateCtx);
  if (!state) return null;
  // Only mount the form while the sheet is open. The sheet library keeps its
  // children mounted even when collapsed (detent 0), so an always-rendered
  // `CreateAppForm` would fire its `autoFocus` input on app launch and pop
  // the keyboard on whatever screen is showing. Gating on `index` also gives
  // the form fresh state on each open.
  return (
    <AppBottomSheet index={state.index} onIndexChange={state.setIndex}>
      {state.index > 0 ? (
        <CreateAppForm onDone={() => state.setIndex(0)} />
      ) : null}
    </AppBottomSheet>
  );
}

function CreateAppForm({ onDone }: { onDone: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const create = useMutation(api.sourceApps.create);
  const generateUploadUrl = useMutation(api.sourceApps.generateLogoUploadUrl);

  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const [showTemplateDetails, setShowTemplateDetails] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);
  const [logo, setLogo] = useState<{
    storageId: Id<"_storage">;
    localUri: string;
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const selectedRecipe = selectedRecipeId
    ? RECIPES.find((r) => r.id === selectedRecipeId)
    : null;
  const canSubmit = !!name.trim() && !submitting;

  const pickLogo = useCallback(async () => {
    if (uploading) return;
    setUploading(true);
    try {
      const url = await generateUploadUrl({});
      const res = await pickAndUploadLogo(url);
      if (!res.ok) {
        if (res.reason !== "Canceled") {
          haptic.error();
          Alert.alert("Couldn't set logo", res.reason);
        }
        return;
      }
      haptic.light();
      setLogo({ storageId: res.storageId, localUri: res.localUri });
    } finally {
      setUploading(false);
    }
  }, [generateUploadUrl, uploading]);

  const submit = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    haptic.success();
    try {
      const result = await create({
        name: trimmed,
        description: desc.trim() || undefined,
        logoStorageId: logo?.storageId,
      });
      await rememberToken(result.id, result.token);
      onDone();
      router.push({
        pathname: "/token-reveal" as never,
        params: { id: result.id, name: trimmed, token: result.token },
      });
    } catch (err: any) {
      haptic.error();
      Alert.alert("Couldn't create app", err?.message ?? "Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [create, desc, logo?.storageId, name, onDone, submitting]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.sheet }}>
      <SheetHeader
        title="New source app"
        onClose={onDone}
        trailing={
          <SheetActionPill
            label={
              selectedRecipe ? `Create from ${selectedRecipe.name}` : "Create"
            }
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
        {selectedRecipe && (
          <View
            style={{
              marginHorizontal: spacing.lg,
              padding: spacing.md,
              borderRadius: radius.lg,
              backgroundColor: colors.fill,
              borderWidth: 0.5,
              borderColor: colors.separator,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.sm,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={{ ...type.footnote, color: colors.secondaryLabel }}
                >
                  Using template
                </Text>
                <Text
                  style={{
                    ...type.subhead,
                    color: colors.label,
                    fontWeight: "600",
                  }}
                >
                  {selectedRecipe.name}
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  haptic.selection();
                  setSelectedRecipeId(null);
                  setShowTemplateDetails(false);
                }}
                hitSlop={12}
              >
                <SymbolView
                  name="xmark.circle.fill"
                  size={22}
                  tintColor={colors.tertiaryLabel}
                />
              </Pressable>
            </View>

            <View
              style={{
                marginTop: spacing.sm,
                paddingTop: spacing.sm,
                borderTopWidth: 0.5,
                borderTopColor: colors.separator,
              }}
            >
              <Text
                style={{
                  ...type.caption2,
                  color: colors.tertiaryLabel,
                  fontWeight: "600",
                }}
              >
                Example notification
              </Text>
              <Text
                style={{ ...type.footnote, color: colors.label, marginTop: 2 }}
                numberOfLines={1}
              >
                {selectedRecipe.example.title}
              </Text>
              <Text
                style={{ ...type.caption2, color: colors.secondaryLabel }}
                numberOfLines={1}
              >
                {selectedRecipe.example.body}
              </Text>
            </View>

            <Pressable
              onPress={() => {
                haptic.selection();
                setShowTemplateDetails(!showTemplateDetails);
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
                {showTemplateDetails ? "Hide" : "Show"} template details &
                example curl
              </Text>
            </Pressable>

            {showTemplateDetails && (
              <View style={{ marginTop: spacing.sm, gap: spacing.sm }}>
                {selectedRecipe.recommendedPriority && (
                  <Text
                    style={{ ...type.caption2, color: colors.secondaryLabel }}
                  >
                    Recommended priority: {selectedRecipe.recommendedPriority}
                  </Text>
                )}
                {selectedRecipe.suggestedQuietHours && (
                  <Text
                    style={{ ...type.caption2, color: colors.secondaryLabel }}
                  >
                    Suggested quiet hours:{" "}
                    {Math.floor(selectedRecipe.suggestedQuietHours[0] / 60)}pm –{" "}
                    {Math.floor(selectedRecipe.suggestedQuietHours[1] / 60)}am
                  </Text>
                )}

                <View
                  style={{
                    marginTop: spacing.xs,
                    padding: spacing.sm,
                    backgroundColor: colors.background,
                    borderRadius: radius.md,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 4,
                    }}
                  >
                    <Text
                      style={{ ...type.caption2, color: colors.tertiaryLabel }}
                    >
                      Example curl
                    </Text>
                    <Pressable
                      onPress={async () => {
                        await Clipboard.setStringAsync(
                          selectedRecipe.example.curl,
                        );
                        haptic.success();
                        setCopiedCurl(true);
                        setTimeout(() => setCopiedCurl(false), 1800);
                      }}
                      hitSlop={10}
                      style={{ padding: 4 }}
                    >
                      <Text
                        style={{
                          ...type.caption2,
                          color: copiedCurl ? colors.success : colors.accent,
                          fontWeight: "600",
                        }}
                      >
                        {copiedCurl ? "Copied!" : "Copy"}
                      </Text>
                    </Pressable>
                  </View>
                  <Text
                    style={{
                      ...type.caption2,
                      color: colors.label,
                      fontFamily: "Menlo",
                      fontSize: 11,
                    }}
                    selectable
                  >
                    {selectedRecipe.example.curl}
                  </Text>
                </View>
              </View>
            )}
          </View>
        )}

        <View
          style={{
            alignItems: "center",
            gap: spacing.sm,
            paddingVertical: spacing.md,
          }}
        >
          <Pressable onPress={pickLogo} disabled={uploading}>
            {logo ? (
              <Image
                source={{ uri: logo.localUri }}
                style={{
                  width: 92,
                  height: 92,
                  borderRadius: 46,
                  backgroundColor: colors.fill,
                }}
                contentFit="cover"
              />
            ) : (
              <View
                style={{
                  width: 92,
                  height: 92,
                  borderRadius: 46,
                  backgroundColor: colors.fill,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor: colors.separator,
                  borderStyle: "dashed",
                }}
              >
                <SymbolView
                  name={uploading ? "arrow.up.circle" : "photo.badge.plus"}
                  size={34}
                  tintColor={colors.secondaryLabel}
                />
              </View>
            )}
          </Pressable>
          <Pressable onPress={pickLogo} disabled={uploading} hitSlop={8}>
            <Text style={{ ...type.footnote, color: colors.accent }}>
              {uploading
                ? "Uploading…"
                : logo
                  ? "Change logo"
                  : "Add a logo (optional)"}
            </Text>
          </Pressable>
        </View>

        {selectedRecipeId &&
          (() => {
            const recipe = RECIPES.find((r) => r.id === selectedRecipeId);
            if (!recipe?.accentHint) return null;
            return (
              <Text
                style={{
                  ...type.caption2,
                  color: colors.secondaryLabel,
                  paddingHorizontal: spacing.lg,
                  marginTop: -spacing.sm,
                }}
              >
                Suggested accent for {recipe.name}: {recipe.accentHint}
              </Text>
            );
          })()}

        <Input
          label="Name"
          placeholder="e.g. home"
          value={name}
          onChangeText={setName}
          autoFocus
        />
        <Input
          label="Description (optional)"
          placeholder="What sends from this app?"
          value={desc}
          onChangeText={setDesc}
        />
      </ScrollView>
    </View>
  );
}
