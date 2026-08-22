import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { Button } from '@/components/Button';
import { DrawerSurface } from '@/components/Sheet';
import { SheetContainer } from '@/components/SheetContainer';
import { SheetHeader } from '@/components/SheetHeader';
import { useTheme, spacing, radius, type } from '@/lib/theme';
import { haptic } from '@/lib/haptics';
import { backendConfig } from '@/lib/backend';

function curlExample(appName: string, token = '<your_token>') {
  const { siteUrl } = backendConfig();
  return `curl -X POST "${siteUrl}/notify" \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{"title":"Hello","body":"Test from ${appName}","priority":"high"}'`;
}

/**
 * formSheet route — reveals a freshly-created or freshly-rotated bearer
 * token. Token, app name, and app id arrive via params from
 * `/create-app` (after create) or `/source-app-api` (after rotate). The
 * "Done" button requires either a token copy or a second confirmation tap
 * so a stray dismiss doesn't lose the only chance to capture the token.
 */
export default function TokenRevealScreen() {
  const params = useLocalSearchParams<{ id?: string; name?: string; token?: string }>();
  const name = params.name ?? '';
  const token = params.token ?? '';

  return (
    <DrawerSurface>
      <SheetHeader title="Your token" />
      <SheetContainer
        scrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: spacing.md, gap: spacing.lg }}
      >
        <Body name={name} token={token} />
      </SheetContainer>
    </DrawerSurface>
  );
}

function Body({ name, token }: { name: string; token: string }) {
  const { colors, tintBg } = useTheme();
  const [copied, setCopied] = useState<'token' | 'curl' | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function copy(kind: 'token' | 'curl', text: string) {
    await Clipboard.setStringAsync(text);
    haptic.success();
    setCopied(kind);
    setTimeout(() => setCopied((c) => (c === kind ? null : c)), 2000);
  }

  function handleDone() {
    if (!confirming && copied !== 'token') {
      haptic.warning();
      setConfirming(true);
      setTimeout(() => setConfirming(false), 4000);
      return;
    }
    setCopied(null);
    setConfirming(false);
    router.back();
  }

  const tokenCopied = copied === 'token';
  const curlCopied = copied === 'curl';
  const accent = colors.warning;

  return (
    <>
      <View style={{ alignItems: 'center', gap: spacing.xs }}>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: radius.lg,
            borderCurve: 'continuous',
            backgroundColor: tintBg(accent),
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <SymbolView name="exclamationmark.shield.fill" size={22} tintColor={accent} />
        </View>
        <Text
          style={{
            ...type.title3,
            color: colors.label,
            textAlign: 'center',
            marginTop: spacing.xs
          }}
        >
          Save this token now
        </Text>
        <Text
          style={{
            ...type.footnote,
            color: colors.secondaryLabel,
            textAlign: 'center',
            paddingHorizontal: spacing.lg
          }}
        >
          {name ? `Token for ${name}. ` : ''}
          Shown once — close this and you'll need to regenerate.
        </Text>
      </View>

      <View
        style={{
          backgroundColor: colors.cell,
          borderRadius: radius.lg,
          borderCurve: 'continuous',
          overflow: 'hidden'
        }}
      >
        <View
          style={{
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.md,
            paddingBottom: spacing.md,
            gap: spacing.xs
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between'
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
              Bearer token
            </Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                paddingHorizontal: 7,
                paddingVertical: 2,
                borderRadius: 999,
                backgroundColor: tintBg(tokenCopied ? colors.success : accent)
              }}
            >
              <View
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 3,
                  backgroundColor: tokenCopied ? colors.success : accent
                }}
              />
              <Text
                style={{
                  ...type.caption2,
                  color: tokenCopied ? colors.success : accent,
                  fontWeight: '700',
                  letterSpacing: 0.5
                }}
              >
                {tokenCopied ? 'COPIED' : 'SHOWN ONCE'}
              </Text>
            </View>
          </View>
          <Text
            selectable
            style={{
              fontFamily: 'Menlo',
              fontSize: 14,
              lineHeight: 22,
              color: colors.label
            }}
          >
            {token}
          </Text>
        </View>

        <View style={{ height: 0.5, backgroundColor: colors.separator }} />

        <TokenSheetRow
          icon={tokenCopied ? 'checkmark.circle.fill' : 'doc.on.doc'}
          tint={tokenCopied ? colors.success : colors.accent}
          title={tokenCopied ? 'Copied' : 'Copy token'}
          onPress={() => copy('token', token)}
        />

        <View
          style={{
            height: 0.5,
            backgroundColor: colors.separator,
            marginLeft: 56
          }}
        />

        <TokenSheetRow
          icon={curlCopied ? 'checkmark.circle.fill' : 'terminal.fill'}
          tint={curlCopied ? colors.success : colors.accent}
          title={curlCopied ? 'Copied' : 'Copy curl example'}
          subtitle={curlCopied ? undefined : 'Try it from the command line right now'}
          onPress={() => copy('curl', curlExample(name, token))}
        />
      </View>

      <Button
        title={confirming ? 'Tap again to dismiss without copying' : 'Done'}
        variant={tokenCopied ? 'primary' : 'secondary'}
        onPress={handleDone}
      />
    </>
  );
}

function TokenSheetRow({
  icon,
  tint,
  title,
  subtitle,
  onPress
}: {
  icon: SFSymbol;
  tint: string;
  title: string;
  subtitle?: string;
  onPress: () => void;
}) {
  const { colors, tintBg } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        opacity: pressed ? 0.6 : 1,
        minHeight: 52
      })}
    >
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: radius.md,
          backgroundColor: tintBg(tint),
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <SymbolView name={icon} size={16} tintColor={tint} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ ...type.body, color: colors.label }}>{title}</Text>
        {!!subtitle && (
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
        )}
      </View>
    </Pressable>
  );
}
