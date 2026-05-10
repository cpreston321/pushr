import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { authClient } from '@/lib/auth-client';
import { useTheme } from '@/lib/theme';
import { HAS_ONBOARDED_KEY } from './onboarding';

export default function Index() {
  const { data, isPending } = authClient().useSession();
  const { colors } = useTheme();
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    SecureStore.getItemAsync(HAS_ONBOARDED_KEY).then((v) => setOnboarded(v === '1'));
  }, []);

  if (isPending || onboarded === null) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.grouped
        }}
      >
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!data?.session) return <Redirect href="/(auth)/login" />;
  if (!onboarded) return <Redirect href="/onboarding" />;
  return <Redirect href="/feed" />;
}
