import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { colors } from "@barbaari/shared";
import type { Child } from "@barbaari/shared";
import { AccessDenied, Badge, Button, Card, Screen, SectionTitle } from "../../components/Ui";
import { useApiResource } from "../../hooks/useApiResource";
import { useMobileSession } from "../../hooks/useMobileSession";
import { mobileApi } from "../../services/mobileApi";

function deviceLocation(): Promise<{ latitude: number; longitude: number }> {
  return new Promise((resolve, reject) => {
    const geo = globalThis.navigator?.geolocation;
    if (!geo) {
      reject(new Error("Device location is required for attendance."));
      return;
    }
    geo.getCurrentPosition(
      (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      () => reject(new Error("Allow location access before recording attendance.")),
      { timeout: 10000, maximumAge: 30000, enableHighAccuracy: true }
    );
  });
}

export default function Staff() {
  const { area } = useMobileSession();
  const { data, loading, error, reload } = useApiResource(async () => {
    if (area === "parent") return [] as Child[];
    return (await mobileApi.staffChildren()).children as Child[];
  }, [area]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [pin, setPin] = useState("");
  const [pinVerificationId, setPinVerificationId] = useState<number | null>(null);
  const [pinVerifiedAt, setPinVerifiedAt] = useState("");
  if (area === "parent") return <AccessDenied message="Staff tools are only available to classroom staff and teachers." />;
  const children = data ?? [];
  async function saveNote(child: Child) {
    const note = drafts[child.id] || "";
    if (!note.trim()) return;
    try {
      await mobileApi.createNote({ child_id: child.id, note });
      setDrafts({ ...drafts, [child.id]: "" });
      await reload();
    } catch (error) {
      Alert.alert("Could not save note", error instanceof Error ? error.message : "Please try again.");
    }
  }

  async function saveIncident(child: Child) {
    const summary = drafts[child.id] || "";
    if (!summary.trim()) return;
    try {
      await mobileApi.createIncident({ child_id: child.id, severity: "low", summary, status: "draft" });
      setDrafts({ ...drafts, [child.id]: "" });
      await reload();
    } catch (error) {
      Alert.alert("Could not create incident", error instanceof Error ? error.message : "Please try again.");
    }
  }

  async function staffSelfCheck(direction: "in" | "out") {
    try {
      if (direction === "in") await mobileApi.staffCheckIn();
      else await mobileApi.staffCheckOut();
      Alert.alert("Saved", direction === "in" ? "You are checked in." : "You are checked out.");
    } catch (error) {
      Alert.alert("Could not save", error instanceof Error ? error.message : "Please try again.");
    }
  }

  async function markAbsent(child: Child) {
    try {
      await mobileApi.createAbsence({
        child_id: child.id,
        absence_date: new Date().toISOString().slice(0, 10),
        absence_type: "no_show",
        reason: "Marked absent from staff mobile app",
        notes: drafts[child.id] || undefined
      });
      setDrafts({ ...drafts, [child.id]: "" });
      await reload();
      Alert.alert("Absence recorded", `${child.name} was marked absent for today.`);
    } catch (error) {
      Alert.alert("Could not record absence", error instanceof Error ? error.message : "Please try again.");
    }
  }

  async function verifyPin() {
    try {
      const response = await mobileApi.verifyPin({ pin, purpose: "attendance" });
      setPinVerificationId(response.pin_verification_id);
      setPinVerifiedAt(response.verified_at);
      setPin("");
      Alert.alert("PIN verified", "Your next PIN attendance action can now be recorded.");
    } catch (error) {
      setPinVerificationId(null);
      Alert.alert("PIN verification failed", "Please check the PIN and try again.");
    }
  }

  async function checkWithVerification(child: Child, direction: "in" | "out") {
    try {
      const method = pinVerificationId ? "pin" : "secure_login";
      const verification = pinVerificationId ?? undefined;
      const loc = await deviceLocation();
      if (direction === "in") await mobileApi.checkChildIn(child.id, "staff", method, verification, loc);
      else await mobileApi.checkChildOut(child.id, "staff", method, verification, loc);
      setPinVerificationId(null);
      setPinVerifiedAt("");
      await reload();
    } catch (error) {
      Alert.alert("Attendance not saved", error instanceof Error ? error.message : "Location permission is required.");
    }
  }
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <SectionTitle eyebrow="Staff mode" title="Blue Room attendance" />
        {loading ? <Card><Text style={styles.muted}>Loading assigned classroom...</Text></Card> : null}
        {error ? <Card><Text style={styles.muted}>{error}</Text></Card> : null}
        <View style={styles.pinCard}>
          <Ionicons name="keypad-outline" size={28} color={colors.primary} />
          <Text style={styles.pinTitle}>PIN verification</Text>
          <Text style={styles.muted}>{pinVerificationId ? `PIN verified at ${pinVerifiedAt}. The next child attendance action will use PIN verification.` : "Verify your staff PIN before using PIN-based child check-in or check-out."}</Text>
          <TextInput keyboardType="number-pad" secureTextEntry maxLength={8} value={pin} onChangeText={setPin} placeholder="Staff PIN" placeholderTextColor={colors.muted} style={styles.pinInput} />
          <Button variant="secondary" onPress={verifyPin}>Verify PIN</Button>
          <Text style={styles.muted}>PIN verification is active for staff attendance actions.</Text>
        </View>
        <View style={styles.actionGrid}>
          <Button onPress={() => staffSelfCheck("in")}>Staff check in</Button>
          <Button variant="secondary" onPress={() => staffSelfCheck("out")}>Staff check out</Button>
        </View>
        {children.map((child) => (
          <Card key={child.id}>
            <View style={styles.row}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{child.avatar}</Text></View>
              <View style={styles.fill}>
                <Text style={styles.name}>{child.name}</Text>
                <Text style={styles.muted}>{child.classroom} · pickup permissions verified</Text>
              </View>
              <Badge tone={child.attendanceStatus === "checked_in" ? "success" : child.attendanceStatus === "late" ? "warning" : "neutral"}>{child.attendanceStatus.replace("_", " ")}</Badge>
            </View>
            <View style={styles.actionGrid}>
              <Button onPress={() => checkWithVerification(child, "in")}>Check in</Button>
              <Button variant="outline" onPress={() => checkWithVerification(child, "out")}>Check out</Button>
            </View>
            <TextInput value={drafts[child.id] ?? ""} onChangeText={(value) => setDrafts({ ...drafts, [child.id]: value })} placeholder="Add daily note or incident summary" placeholderTextColor={colors.muted} style={styles.note} />
            <View style={styles.actionGrid}>
              <Button variant="secondary" onPress={() => saveNote(child)}>Save note</Button>
              <Button variant="outline" onPress={() => saveIncident(child)}>Create incident</Button>
            </View>
            <Button variant="outline" onPress={() => markAbsent(child)}>Mark absent</Button>
          </Card>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { gap: 16 },
  pinCard: { gap: 10, padding: 16, borderRadius: 24, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  pinTitle: { color: colors.text, fontSize: 20, fontWeight: "900" },
  pinInput: { minHeight: 52, borderRadius: 18, paddingHorizontal: 15, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, color: colors.text },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  fill: { flex: 1 },
  avatar: { width: 48, height: 48, borderRadius: 17, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "white", fontWeight: "900" },
  name: { color: colors.text, fontSize: 18, fontWeight: "900" },
  muted: { color: colors.muted, lineHeight: 21 },
  actionGrid: { flexDirection: "row", gap: 10 },
  note: { minHeight: 48, borderRadius: 16, paddingHorizontal: 14, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, color: colors.text }
});
