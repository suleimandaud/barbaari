import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Provider as PaperProvider } from "react-native-paper";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { colors } from "@barbaari/shared";

const paperTheme = {
  colors: {
    primary: colors.primary,
    secondary: colors.secondary,
    tertiary: colors.tertiary,
    background: colors.background,
    surface: colors.card,
    onSurface: colors.text,
    outline: colors.border
  }
};

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <PaperProvider theme={paperTheme}>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="login" />
          <Stack.Screen name="otp" />
          {["notifications", "documents", "messages", "incidents", "daily-notes", "profile", "receipts"].map((name) => (
            <Stack.Screen
              key={name}
              name={name}
              options={{
                headerShown: true,
                headerBackTitle: "Back",
                headerTintColor: colors.primary,
                headerStyle: { backgroundColor: colors.background },
                headerShadowVisible: false,
                title: name.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ")
              }}
            />
          ))}
        </Stack>
      </PaperProvider>
    </SafeAreaProvider>
  );
}
