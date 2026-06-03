import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@barbaari/shared";

export default function Otp() {
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView edges={["top", "bottom", "left", "right"]} style={styles.safeArea}>
      <View style={[styles.screen, { paddingBottom: insets.bottom + 22 }]}>
        <View style={styles.card}>
          <Ionicons name="shield-checkmark-outline" size={42} color={colors.primary} />
          <Text style={styles.title}>OTP verification</Text>
          <Text style={styles.subtitle}>One-time passcode login is not enabled for this organization. Use secure email/password login or tablet PIN verification.</Text>
          <Pressable onPress={() => router.replace("/login")} style={styles.button}><Text style={styles.buttonText}>Back to secure login</Text></Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  screen: { flex: 1, justifyContent: "center", paddingHorizontal: 22, paddingTop: 22, backgroundColor: colors.background },
  card: { gap: 14, padding: 22, borderRadius: 26, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  title: { fontSize: 30, fontWeight: "900", color: colors.text },
  subtitle: { color: colors.muted, fontSize: 16, lineHeight: 23 },
  button: { minHeight: 54, borderRadius: 999, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  buttonText: { color: "white", fontSize: 16, fontWeight: "900" }
});
