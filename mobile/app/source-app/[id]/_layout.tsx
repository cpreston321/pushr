import { Stack } from "expo-router";
import { useTheme } from "@/lib/theme";

export default function SourceAppLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.sheet },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen
        name="sharing"
        options={{
          headerShown: true,
          headerTitle: "Sharing",
          headerBackTitle: "Back",
          headerStyle: { backgroundColor: colors.sheet },
          headerTintColor: colors.label,
          headerShadowVisible: false,
          headerStatusBarHeight: 16,
        }}
      />
    </Stack>
  );
}
