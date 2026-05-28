import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import { Image } from "expo-image";
import { SymbolView } from "expo-symbols";
import { useMutation } from "convex/react";
import { api } from "@pushr/backend/_generated/api";
import type { Id } from "@pushr/backend/_generated/dataModel";
import { Input } from "@/components/Input";
import { SheetContainer } from "@/components/SheetContainer";
import { SheetActionPill, SheetHeader } from "@/components/SheetHeader";
import { useTheme, spacing, radius, type } from "@/lib/theme";
import { haptic } from "@/lib/haptics";
import { pickAndUploadLogo } from "@/lib/uploadLogo";
import { rememberToken } from "@/lib/tokenStore";
import { RECIPES, type Recipe } from "@/lib/recipes";

/**
 * formSheet route — create a new source app. On success the bearer token is
 * routed forward to `/token-reveal` (which is shown once) via `router.replace`
 * so the create sheet is dismissed in the same gesture.
 */
export default function CreateAppScreen() {
  const { colors } = useTheme();
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

  async function pickLogo() {
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
  }

  async function submit() {
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
      router.replace({
        pathname: "/token-reveal" as never,
        params: { id: result.id, name: trimmed, token: result.token },
      });
    } catch (err: any) {
      haptic.error();
      Alert.alert("Couldn't create app", err?.message ?? "Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.sheet }}>
      <SheetHeader
        title="New source app"
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
      <SheetContainer
        scrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: spacing.md, gap: spacing.lg }}
      >
        {/* Recipe picker — the delightful entry point for Phase 2 */}
        {/* <View style={{ gap: spacing.sm }}>
          <Text style={{ ...type.footnote, color: colors.secondaryLabel, paddingHorizontal: spacing.lg }}>
            Start from a template
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}
          >
            {RECIPES.slice(0, 5).map((recipe) => (
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                selected={selectedRecipeId === recipe.id}
                onPress={() => {
                  haptic.selection();
                  const isSame = selectedRecipeId === recipe.id;
                  setSelectedRecipeId(isSame ? null : recipe.id);
                  if (!isSame) {
                    setName(recipe.suggestedName);
                    setDesc(recipe.suggestedDescription || '');
                  }
                }}
              />
            ))}
          </ScrollView>
          <Pressable
            onPress={() => {
              haptic.selection();
              setSelectedRecipeId(null);
              // Keep existing name/desc if user has edited them, or we could clear — for now just deselect
            }}
            style={{ paddingHorizontal: spacing.lg, paddingTop: 4 }}
          >
            <Text style={{ ...type.footnote, color: colors.accent }}>Or create manually</Text>
          </Pressable>
        </View> */}

        {/* Active template banner + details — powerful "use template" experience */}
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

            {/* Mini example preview */}
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

            {/* Expandable template details */}
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

        {/* Branding hint from the selected recipe */}
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
      </SheetContainer>
    </View>
  );
}

function RecipeCard({
  recipe,
  selected,
  onPress,
}: {
  recipe: Recipe;
  selected?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const accent = recipe.accentHint || colors.accent;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        width: 160,
        padding: spacing.md,
        borderRadius: radius.lg,
        backgroundColor: selected
          ? accent + "18"
          : pressed
            ? colors.cellHighlight
            : colors.fill,
        borderWidth: selected ? 1 : 0.5,
        borderColor: selected ? accent : colors.separator,
      })}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: accent,
          }}
        />
        <Text
          style={{ ...type.headline, color: colors.label }}
          numberOfLines={1}
        >
          {recipe.name}
        </Text>
      </View>
      <Text
        style={{ ...type.subhead, color: colors.secondaryLabel, marginTop: 4 }}
        numberOfLines={2}
      >
        {recipe.description}
      </Text>
      {selected && recipe.setupNote && (
        <Text
          style={{
            ...type.caption2,
            color: colors.secondaryLabel,
            marginTop: spacing.sm,
          }}
          numberOfLines={3}
        >
          {recipe.setupNote}
        </Text>
      )}
    </Pressable>
  );
}
