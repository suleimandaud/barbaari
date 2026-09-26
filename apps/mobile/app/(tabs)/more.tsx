import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { authApi, colors, getApiError } from "@barbaari/shared";
import { Button, Card, Screen, SectionTitle } from "../../components/Ui";
import { logoutMobile } from "../../services/auth";
import { useMobileSession } from "../../hooks/useMobileSession";

type MoreItem = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
};

export default function More() {
  const { area, user } = useMobileSession();
  const parentItems: MoreItem[] = [
    { icon: "chatbubbles-outline", title: "Messages", subtitle: "Contact daycare staff", onPress: () => router.push("/messages") },
    { icon: "folder-open-outline", title: "Documents", subtitle: "Child files and uploads", onPress: () => router.push("/documents") },
    { icon: "alert-circle-outline", title: "Incidents", subtitle: "Reports shared by staff", onPress: () => router.push("/incidents") },
    { icon: "document-text-outline", title: "Daily Notes", subtitle: "Care updates and classroom notes", onPress: () => router.push("/daily-notes") },
    { icon: "notifications-outline", title: "Alerts", subtitle: "Notifications and reminders", onPress: () => router.push("/notifications") },
    { icon: "receipt-outline", title: "Receipts", subtitle: "Payment history and receipts", onPress: () => router.push("/receipts") },
    { icon: "call-outline", title: "Emergency Call", subtitle: "Call emergency services", onPress: () => Linking.openURL("tel:911") },
    { icon: "person-circle-outline", title: "Profile", subtitle: "Parent and child profile", onPress: () => router.push("/profile") }
  ];
  const staffItems: MoreItem[] = [
    { icon: "alert-circle-outline", title: "Incidents", subtitle: "Create incident reports from Kids", onPress: () => router.push("/incidents") },
    { icon: "chatbubbles-outline", title: "Messages", subtitle: "Classroom communication", onPress: () => router.push("/messages") },
    { icon: "notifications-outline", title: "Alerts", subtitle: "Staff notifications", onPress: () => router.push("/notifications") },
    { icon: "person-circle-outline", title: "Profile", subtitle: user?.name ?? "Staff profile", onPress: () => router.push("/profile") }
  ];
  const items = area === "staff" ? staffItems : parentItems;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <SectionTitle eyebrow={area === "staff" ? "Staff tools" : "Parent tools"} title="More" />
        <View style={styles.grid}>
          {items.map((item) => <MoreTile key={item.title} item={item} />)}
        </View>
        <Card>
          <Text style={styles.name}>{user?.name ?? "Account"}</Text>
          <Text style={styles.muted}>{user?.email}</Text>
          <Button variant="outline" onPress={async () => { await logoutMobile(); router.replace("/login"); }}>Logout</Button>
        </Card>
        <DeleteAccountCard canSelfDelete={area === "parent"} />
      </ScrollView>
    </Screen>
  );
}

// App Store guideline 5.1.1(v): accounts created in the app (parent registration) must be
// deletable in the app. Staff/admin accounts are created and removed by their daycare.
function DeleteAccountCard({ canSelfDelete }: { canSelfDelete: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  if (!canSelfDelete) {
    return (
      <Card>
        <Text style={styles.name}>Delete account</Text>
        <Text style={styles.muted}>Staff accounts are managed by your daycare. Ask your daycare administrator to remove your account.</Text>
      </Card>
    );
  }

  async function deleteAccount() {
    setError("");
    if (!password) {
      setError("Enter your password to confirm.");
      return;
    }
    setDeleting(true);
    try {
      await authApi.deleteAccount(password);
      await logoutMobile();
      router.replace("/login");
    } catch (err) {
      setError(getApiError(err).message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Card>
      <Text style={styles.name}>Delete account</Text>
      <Text style={styles.muted}>Permanently delete your Barbaari parent account. Attendance records kept by your daycare are not affected.</Text>
      {confirming ? (
        <>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Confirm with your password"
            secureTextEntry
            autoCapitalize="none"
            style={styles.input}
            placeholderTextColor={colors.muted}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button disabled={deleting} onPress={deleteAccount}>{deleting ? "Deleting..." : "Permanently delete account"}</Button>
          <Button variant="outline" disabled={deleting} onPress={() => { setConfirming(false); setPassword(""); setError(""); }}>Cancel</Button>
        </>
      ) : (
        <Button variant="outline" onPress={() => setConfirming(true)}>Delete account</Button>
      )}
    </Card>
  );
}

function MoreTile({ item }: { item: MoreItem }) {
  return (
    <Pressable onPress={item.onPress} style={styles.tile}>
      <View style={styles.iconWrap}>
        <Ionicons name={item.icon} size={22} color={colors.primary} />
      </View>
      <Text style={styles.tileTitle}>{item.title}</Text>
      <Text style={styles.muted}>{item.subtitle}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { gap: 16 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  tile: { width: "47.8%", minHeight: 136, padding: 14, gap: 8, borderRadius: 22, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  iconWrap: { width: 42, height: 42, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.white },
  tileTitle: { color: colors.text, fontSize: 16, fontWeight: "900" },
  name: { color: colors.text, fontSize: 18, fontWeight: "900" },
  muted: { color: colors.muted, lineHeight: 21 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, color: colors.text, backgroundColor: colors.white },
  error: { color: colors.danger, fontWeight: "700" }
});
