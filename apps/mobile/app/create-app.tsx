import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useMutation } from 'convex/react';
import { api } from '@pushr/backend/_generated/api';
import type { Id } from '@pushr/backend/_generated/dataModel';
import { Input } from '@/components/Input';
import { SheetContainer } from '@/components/SheetContainer';
import { SheetActionPill, SheetHeader } from '@/components/SheetHeader';
import { useTheme, spacing, type } from '@/lib/theme';
import { haptic } from '@/lib/haptics';
import { pickAndUploadLogo } from '@/lib/uploadLogo';
import { rememberToken } from '@/lib/tokenStore';

/**
 * formSheet route — create a new source app. On success the bearer token is
 * routed forward to `/token-reveal` (which is shown once) via `router.replace`
 * so the create sheet is dismissed in the same gesture.
 */
export default function CreateAppScreen() {
  const { colors } = useTheme();
  const create = useMutation(api.sourceApps.create);
  const generateUploadUrl = useMutation(api.sourceApps.generateLogoUploadUrl);

  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [logo, setLogo] = useState<{
    storageId: Id<'_storage'>;
    localUri: string;
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = !!name.trim() && !submitting;

  async function pickLogo() {
    if (uploading) return;
    setUploading(true);
    try {
      const url = await generateUploadUrl({});
      const res = await pickAndUploadLogo(url);
      if (!res.ok) {
        if (res.reason !== 'Canceled') {
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
        logoStorageId: logo?.storageId
      });
      await rememberToken(result.id, result.token);
      router.replace({
        pathname: '/token-reveal' as never,
        params: { id: result.id, name: trimmed, token: result.token }
      });
    } catch (err: any) {
      haptic.error();
      Alert.alert("Couldn't create app", err?.message ?? 'Please try again.');
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
            label="Create"
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
        <View style={{ alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md }}>
          <Pressable onPress={pickLogo} disabled={uploading}>
            {logo ? (
              <Image
                source={{ uri: logo.localUri }}
                style={{
                  width: 92,
                  height: 92,
                  borderRadius: 46,
                  backgroundColor: colors.fill
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
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: colors.separator,
                  borderStyle: 'dashed'
                }}
              >
                <SymbolView
                  name={uploading ? 'arrow.up.circle' : 'photo.badge.plus'}
                  size={34}
                  tintColor={colors.secondaryLabel}
                />
              </View>
            )}
          </Pressable>
          <Pressable onPress={pickLogo} disabled={uploading} hitSlop={8}>
            <Text style={{ ...type.footnote, color: colors.accent }}>
              {uploading ? 'Uploading…' : logo ? 'Change logo' : 'Add a logo (optional)'}
            </Text>
          </Pressable>
        </View>

        <Input label="Name" placeholder="e.g. home" value={name} onChangeText={setName} autoFocus />
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
