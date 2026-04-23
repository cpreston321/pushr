import { ReactNode } from "react";
import { View, ScrollView, ViewStyle } from "react-native";
import { SafeAreaView, Edge } from "react-native-safe-area-context";
import { useTheme } from "@/lib/theme";

type Props = {
  children?: ReactNode;
  scroll?: boolean;
  grouped?: boolean;
  edges?: Edge[];
  style?: ViewStyle;
  contentStyle?: ViewStyle;
};

/**
 * Screen container with the iOS grouped-list background when `grouped`.
 * Use `grouped` for list-based screens (Feed, Apps, Devices, Settings).
 */
export function Screen({ children, scroll, grouped, edges, style, contentStyle }: Props) {
  const { colors } = useTheme();
  const bg = grouped ? colors.grouped : colors.background;

  const content = scroll ? (
    <ScrollView
      style={{ flex: 1, backgroundColor: bg }}
      contentContainerStyle={[{ paddingBottom: 120 }, contentStyle]}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1, backgroundColor: bg }, contentStyle]}>{children}</View>
  );

  return (
    <SafeAreaView
      edges={edges ?? ["top"]}
      style={[{ flex: 1, backgroundColor: bg }, style]}
    >
      {content}
    </SafeAreaView>
  );
}
