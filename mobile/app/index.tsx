import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { authClient } from "@/lib/auth-client";
import { useTheme } from "@/lib/theme";

export default function Index() {
  const { data, isPending } = authClient().useSession();
  const { colors } = useTheme();
  if (isPending) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.grouped,
        }}
      >
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  return <Redirect href={data?.session ? "/feed" : "/(auth)/login"} />;
}
