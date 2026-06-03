import { Redirect, Tabs } from "expo-router";
import type { ComponentProps } from "react";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@barbaari/shared";
import { ActivityIndicator, View } from "react-native";
import { useMobileSession } from "../../hooks/useMobileSession";

type TabIconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

function tabOptions(label: string, icon: TabIconName) {
  return {
    title: label,
    tabBarLabel: label,
    tabBarIcon: ({ color, size }: { color: string; size: number }) => (
      <MaterialCommunityIcons name={icon} color={color} size={size ?? 22} />
    )
  };
}

const hiddenTab = { href: null };

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { user, area, loading } = useMobileSession();
  const bottomOffset = Math.max(insets.bottom, 12) + 10;
  if (loading) return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}><ActivityIndicator color={colors.primary} /></View>;
  if (!user || area === "unsupported") return <Redirect href="/login" />;
  const parent = area === "parent";

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.neutral,
        tabBarShowLabel: true,
        tabBarStyle: {
          marginHorizontal: 18,
          marginBottom: bottomOffset,
          height: 66,
          borderRadius: 999,
          backgroundColor: colors.white,
          borderTopWidth: 0,
          position: "absolute",
          shadowColor: colors.primary,
          shadowOpacity: 0.13,
          shadowRadius: 18
        },
        tabBarIconStyle: { marginTop: 4 },
        tabBarItemStyle: { paddingVertical: 3 },
        tabBarLabelStyle: { fontWeight: "800", fontSize: 10, lineHeight: 12, marginTop: 0, marginBottom: 4 }
      }}
    >
      <Tabs.Screen name="index" options={tabOptions("Home", "home-outline")} />
      <Tabs.Screen name="child" options={parent ? tabOptions("Child", "account-child-outline") : hiddenTab} />
      <Tabs.Screen name="staff" options={parent ? hiddenTab : tabOptions("Kids", "account-group-outline")} />
      <Tabs.Screen name="billing" options={parent ? tabOptions("Billing", "credit-card-outline") : hiddenTab} />
      <Tabs.Screen name="attendance" options={tabOptions("Attend", "calendar-check-outline")} />
      <Tabs.Screen name="notes" options={parent ? hiddenTab : tabOptions("Notes", "note-text-outline")} />
      <Tabs.Screen name="more" options={tabOptions("More", "dots-horizontal-circle-outline")} />
      <Tabs.Screen name="messages" options={hiddenTab} />
      <Tabs.Screen name="notifications" options={hiddenTab} />
    </Tabs>
  );
}
