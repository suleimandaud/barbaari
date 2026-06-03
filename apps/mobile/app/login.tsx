import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@barbaari/shared";
import { loginMobile, mobileAreaForRole, registerParentMobile } from "../services/auth";

export default function Login() {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<"parent" | "staff">("parent");
  const [email, setEmail] = useState("parent@littlelantern.test");
  const [password, setPassword] = useState("Password123!");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [registering, setRegistering] = useState(false);

  async function signIn() {
    setError("");
    setMessage("");
    try {
      const user = await loginMobile(email, password);
      const area = mobileAreaForRole(user.role);
      if (area === "unsupported") {
        setError("This mobile app is for parents and classroom staff. Please use the web dashboard for your role.");
        return;
      }
      if (mode === "parent" && area === "staff") setMessage("You selected Parent, but this is a staff account. Opening staff tools.");
      if (mode === "staff" && area === "parent") setMessage("You selected Staff, but this is a parent account. Opening parent tools.");
    } catch {
      setError("Login failed. Check the backend and credentials.");
      return;
    }
    router.replace("/(tabs)");
  }

  async function registerParent() {
    setError("");
    setMessage("");
    if (mode === "staff") {
      setMessage("Staff accounts are created by your daycare administrator. Please contact your manager.");
      return;
    }
    if (!name.trim()) {
      setError("Enter your name to register.");
      return;
    }
    setRegistering(true);
    try {
      const user = await registerParentMobile(name, email, password);
      if (mobileAreaForRole(user.role) === "parent") router.replace("/(tabs)");
    } catch {
      setError("Registration failed. This email may already be in use or needs daycare setup.");
    } finally {
      setRegistering(false);
    }
  }

  return (
    <SafeAreaView edges={["top", "bottom", "left", "right"]} style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={[styles.screen, { paddingBottom: insets.bottom + 22 }]}>
        <View style={styles.hero}>
          <View style={styles.logo}><Text style={styles.logoText}>B</Text></View>
          <Text style={styles.title}>Barbaari</Text>
          <Text style={styles.subtitle}>Daily daycare care, attendance, payments, and parent updates in one calm workspace.</Text>
        </View>
        <View style={styles.card}>
          <View style={styles.switcher}>
            {(["parent", "staff"] as const).map((item) => (
              <Pressable key={item} onPress={() => { setMode(item); setEmail(item === "parent" ? "parent@littlelantern.test" : "teacher@littlelantern.test"); setMessage(""); setError(""); }} style={[styles.switchPill, mode === item && styles.switchActive]}>
                <Text style={[styles.switchText, mode === item && styles.switchTextActive]}>{item === "parent" ? "Parent" : "Staff"}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.flowCopy}>{mode === "parent" ? "Parents and guardians use their invited email/password or tablet PIN for attendance." : "Staff and teacher accounts are created by your daycare administrator."}</Text>
          {mode === "parent" ? (
            <>
              <Text style={styles.label}>Full name for registration</Text>
              <TextInput value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor={colors.muted} style={styles.input} />
            </>
          ) : null}
          <Text style={styles.label}>Email or phone</Text>
          <TextInput autoCapitalize="none" value={email} onChangeText={setEmail} placeholder="name@example.com" placeholderTextColor={colors.muted} style={styles.input} />
          <Text style={styles.label}>{mode === "staff" ? "Password or PIN" : "Password"}</Text>
          <TextInput secureTextEntry value={password} onChangeText={setPassword} placeholder={mode === "staff" ? "Staff password or quick PIN" : "Password"} placeholderTextColor={colors.muted} style={styles.input} />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <Pressable onPress={signIn} style={styles.primaryButton}>
            <Ionicons name="lock-closed-outline" size={18} color="white" />
            <Text style={styles.primaryText}>Secure login</Text>
          </Pressable>
          <Pressable onPress={registerParent} style={styles.secondaryButton}>
            <Ionicons name={mode === "parent" ? "person-add-outline" : "business-outline"} size={18} color={colors.primary} />
            <Text style={styles.secondaryText}>{mode === "parent" ? (registering ? "Registering..." : "Register parent account") : "Staff registration info"}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  screen: { flex: 1, justifyContent: "center", paddingHorizontal: 22, paddingTop: 22, backgroundColor: colors.background },
  hero: { alignItems: "center", marginBottom: 24 },
  logo: { width: 64, height: 64, borderRadius: 22, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  logoText: { color: "white", fontSize: 34, fontWeight: "900" },
  title: { fontSize: 42, fontWeight: "900", color: colors.text },
  subtitle: { marginTop: 8, color: colors.muted, textAlign: "center", fontSize: 16, lineHeight: 23 },
  card: { gap: 12, padding: 18, borderRadius: 26, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  switcher: { flexDirection: "row", padding: 5, borderRadius: 999, backgroundColor: colors.white, marginBottom: 4 },
  switchPill: { flex: 1, minHeight: 42, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  switchActive: { backgroundColor: colors.primary },
  switchText: { color: colors.neutral, fontWeight: "800" },
  switchTextActive: { color: "white" },
  flowCopy: { color: colors.muted, fontWeight: "700", lineHeight: 20 },
  label: { color: colors.neutral, fontWeight: "800", marginTop: 4 },
  input: { minHeight: 52, borderRadius: 18, paddingHorizontal: 15, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, color: colors.text },
  primaryButton: { minHeight: 54, borderRadius: 999, backgroundColor: colors.primary, flexDirection: "row", gap: 9, alignItems: "center", justifyContent: "center", marginTop: 8 },
  primaryText: { color: "white", fontWeight: "900", fontSize: 16 },
  secondaryButton: { minHeight: 52, borderRadius: 999, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, flexDirection: "row", gap: 9, alignItems: "center", justifyContent: "center" },
  secondaryText: { color: colors.primary, fontWeight: "900" },
  error: { color: "#B42318", fontWeight: "800" },
  message: { color: colors.primary, fontWeight: "800", lineHeight: 20 }
});
