import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors } from "@barbaari/shared";
import type { AttendanceRecord, Child, IncidentReport } from "@barbaari/shared";
import { Badge, Button, Card, Screen, SectionTitle } from "../../components/Ui";
import { useApiResource } from "../../hooks/useApiResource";
import { useMobileSession } from "../../hooks/useMobileSession";
import { mobileApi } from "../../services/mobileApi";
import { logoutMobile } from "../../services/auth";
import { attendanceSummary } from "../../utils/attendanceSummary";

export default function ParentHome() {
  const { area, user } = useMobileSession();
  if (area === "staff") return <StaffHome name={user?.name ?? "Teacher"} />;
  return <ParentHomeContent />;
}

function ParentHomeContent() {
  const { data, loading, error } = useApiResource(mobileApi.parentHome, []);
  const children = (data?.children ?? []) as Child[];
  const attendance = (data?.attendance ?? []) as AttendanceRecord[];
  const absences = data?.absences ?? [];
  const incidents = (data?.incidents ?? []) as IncidentReport[];
  const notifications = data?.notifications ?? [];

  const child = children[0];
  const summary = child ? attendanceSummary(child, attendance, absences) : null;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <SectionTitle eyebrow="Parent home" title={`Good morning, ${child?.guardianNames?.[0]?.split(" ")[0] ?? "Parent"}`} />
        {loading ? <Card><Text style={styles.muted}>Loading backend data...</Text></Card> : null}
        {error ? <Card><Text style={styles.muted}>{error}</Text></Card> : null}
        {!child && !loading ? <Card><Text style={styles.muted}>No children were returned by the API.</Text></Card> : null}
        {child ? (
        <Card>
          <View style={styles.childHeader}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{child.avatar}</Text></View>
            <View style={styles.fill}>
              <Text style={styles.name}>{child.name}</Text>
              <Text style={styles.muted}>{child.classroom} · {child.age}</Text>
            </View>
            {summary ? <Badge tone={summary.tone}>{summary.label}</Badge> : null}
          </View>
          <View style={styles.attendanceBox}>
            <Ionicons name="time-outline" size={22} color={colors.primary} />
            <View style={styles.fill}>
              <Text style={styles.attendanceText}>{summary?.dateLabel ?? "Today"} attendance</Text>
              {summary?.lines.map((line) => <Text key={line} style={styles.muted}>{line}</Text>)}
            </View>
          </View>
        </Card>
        ) : null}
        <View style={styles.quickGrid}>
          <Quick icon="document-text-outline" label="Documents" value={`${data?.documents?.length ?? 0} files`} onPress={() => router.push("/documents")} />
          <Quick icon="alert-circle-outline" label="Incidents" value={`${incidents.length} reports`} onPress={() => router.push("/incidents")} />
          <Quick icon="receipt-outline" label="Receipts" value="Ready" onPress={() => router.push("/receipts")} />
          <Quick icon="notifications-outline" label="Updates" value={`${notifications.filter((item: any) => !item.read_at).length} unread`} onPress={() => router.push("/notifications")} />
        </View>
        {notifications[0] ? <Card><Text style={styles.cardTitle}>Latest update</Text><Text style={styles.muted}>{notifications[0].title}: {notifications[0].body}</Text></Card> : null}
        <Card>
          <Text style={styles.cardTitle}>Today’s note</Text>
          <Text style={styles.muted}>Ayan ate lunch well, joined story circle, and rested from 12:30 PM to 1:45 PM.</Text>
        </Card>
        <Button onPress={() => Linking.openURL("tel:911")}>Emergency call</Button>
        {notifications[0] && !notifications[0].read_at ? <Button variant="secondary" onPress={() => mobileApi.markNotificationRead(notifications[0].id)}>Mark latest notification read</Button> : null}
        <Button variant="outline" onPress={async () => { await logoutMobile(); router.replace("/login"); }}>Logout</Button>
      </ScrollView>
    </Screen>
  );
}

function StaffHome({ name }: { name: string }) {
  const { data, loading, error, reload } = useApiResource(async () => (await mobileApi.staffChildren()).children as Child[], []);
  const children = data ?? [];
  const classroom = children[0]?.classroom ?? "Assigned classroom";
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <SectionTitle eyebrow="Staff home" title={`Welcome, ${name.split(" ")[0]}`} />
        {loading ? <Card><Text style={styles.muted}>Loading assigned classroom...</Text></Card> : null}
        {error ? <Card><Text style={styles.muted}>{error}</Text></Card> : null}
        <Card>
          <Text style={styles.cardTitle}>{classroom}</Text>
          <Text style={styles.muted}>{children.length} children assigned. Use Staff and Attendance tabs for classroom actions.</Text>
          <View style={styles.actionRow}>
            <Button onPress={() => router.push("/(tabs)/staff")}>Open staff tools</Button>
            <Button variant="secondary" onPress={reload}>Refresh</Button>
          </View>
        </Card>
        {children.slice(0, 4).map((child) => <Card key={child.id}><View style={styles.childHeader}><View style={styles.avatar}><Text style={styles.avatarText}>{child.avatar}</Text></View><View style={styles.fill}><Text style={styles.name}>{child.name}</Text><Text style={styles.muted}>{child.classroom} · {child.age}</Text></View><Badge tone={child.attendanceStatus === "checked_in" ? "success" : "neutral"}>{child.attendanceStatus.replace("_", " ")}</Badge></View></Card>)}
        <Button variant="outline" onPress={async () => { await logoutMobile(); router.replace("/login"); }}>Logout</Button>
      </ScrollView>
    </Screen>
  );
}

function Quick({ icon, label, value, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.quick}>
      <Ionicons name={icon} size={22} color={colors.primary} />
      <Text style={styles.quickLabel}>{label}</Text>
      <Text style={styles.muted}>{value}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { gap: 16 },
  childHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 58, height: 58, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary },
  avatarText: { color: "white", fontWeight: "900", fontSize: 20 },
  fill: { flex: 1 },
  name: { color: colors.text, fontSize: 21, fontWeight: "900" },
  muted: { color: colors.muted, lineHeight: 21 },
  attendanceBox: { flexDirection: "row", alignItems: "center", gap: 10, padding: 13, borderRadius: 18, backgroundColor: colors.white },
  attendanceText: { flex: 1, color: colors.text, fontWeight: "800" },
  quickGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  quick: { width: "47.8%", padding: 14, gap: 6, borderRadius: 20, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  quickLabel: { color: colors.text, fontWeight: "900" },
  cardTitle: { color: colors.text, fontWeight: "900", fontSize: 18 },
  actionRow: { flexDirection: "row", gap: 10 }
});
