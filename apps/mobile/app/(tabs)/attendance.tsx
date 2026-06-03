import { Ionicons } from "@expo/vector-icons";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors } from "@barbaari/shared";
import type { AttendanceRecord } from "@barbaari/shared";
import { Badge, Button, Card, Screen, SectionTitle } from "../../components/Ui";
import { useApiResource } from "../../hooks/useApiResource";
import { useMobileSession } from "../../hooks/useMobileSession";
import { mobileApi } from "../../services/mobileApi";
import { attendanceSummary } from "../../utils/attendanceSummary";

export default function Attendance() {
  const { area } = useMobileSession();
  const { data, loading, error } = useApiResource(async () => {
    const [attendance, absences, children] = await Promise.all([mobileApi.attendance(), mobileApi.absences(), mobileApi.children()]);
    return { attendance: attendance.attendance as AttendanceRecord[], absences: absences.absence_records as any[], children: children.children as any[] };
  }, []);
  const attendanceRecords = data?.attendance ?? [];
  const absenceRecords = data?.absences ?? [];
  const firstChild = data?.children?.[0];
  const summaries = (data?.children ?? []).map((child: any) => ({ child, summary: attendanceSummary(child, attendanceRecords, absenceRecords) }));

  async function parentSign(direction: "in" | "out") {
    if (!firstChild) return;
    try {
      const signers = await mobileApi.pickupSigners(firstChild.id);
      const signer = signers.signers.find((item: any) => item.type === "guardian" && item.can_pickup);
      if (!signer) {
        Alert.alert("No signer found", "No authorized guardian is linked to this child.");
        return;
      }
      const payload = {
        child_id: firstChild.id,
        signer_type: "parent",
        guardian_id: signer.id,
        signer_name: signer.name,
        verification_method: "digital_signature",
        signature_name: signer.name
      };
      if (direction === "in") await mobileApi.guardianCheckIn(payload);
      else await mobileApi.guardianCheckOut(payload);
      Alert.alert("Attendance signed", `${firstChild.name} was signed ${direction === "in" ? "in" : "out"} by ${signer.name}.`);
    } catch (err) {
      Alert.alert("Could not sign attendance", "Please check attendance status and try again.");
    }
  }
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <SectionTitle eyebrow="Attendance" title="Real-time status and history" />
        {area === "parent" && firstChild ? (
          <Card>
            <Text style={styles.name}>Guardian signing</Text>
            <Text style={styles.muted}>Sign attendance for {firstChild.name}. Your linked guardian identity and typed signature are saved with the record.</Text>
            <View style={styles.times}>
              <Button onPress={() => parentSign("in")}>Sign check-in</Button>
              <Button variant="outline" onPress={() => parentSign("out")}>Sign check-out</Button>
            </View>
          </Card>
        ) : null}
        {loading ? <Card><Text style={styles.muted}>Loading attendance...</Text></Card> : null}
        {error ? <Card><Text style={styles.muted}>{error}</Text></Card> : null}
        {summaries.map(({ child, summary }: any) => (
          <Card key={`summary-${child.id}`}>
            <View style={styles.row}>
              <Ionicons name="today-outline" size={22} color={colors.primary} />
              <View style={styles.fill}>
                <Text style={styles.name}>{child.name}</Text>
                <Text style={styles.muted}>{summary.dateLabel} attendance</Text>
              </View>
              <Badge tone={summary.tone}>{summary.label}</Badge>
            </View>
            {summary.lines.map((line: string) => <Text key={line} style={styles.muted}>{line}</Text>)}
          </Card>
        ))}
        {attendanceRecords.map((record) => (
          <Card key={record.id}>
            <View style={styles.row}>
              <Ionicons name="calendar-outline" size={22} color={colors.primary} />
              <View style={styles.fill}>
                <Text style={styles.name}>{record.childName}</Text>
                <Text style={styles.muted}>{record.date} · {record.classroom}</Text>
              </View>
              <Badge tone={record.checkOutTime ? "neutral" : "success"}>{record.checkOutTime ? "checked out" : "checked in"}</Badge>
            </View>
            <View style={styles.times}>
              <Text style={styles.time}>In: {record.checkInTime ?? "Not recorded"}</Text>
              <Text style={styles.time}>Out: {record.checkOutTime ?? "Pending"}</Text>
            </View>
            <Text style={styles.muted}>Signed by {record.signedBy} using {record.verificationMethod.replace("_", " ")} verification.</Text>
            {record.corrected && <Badge tone="warning">Audit correction linked to original record</Badge>}
          </Card>
        ))}
        <SectionTitle eyebrow="Absences" title="Absence history" />
        {absenceRecords.map((record) => (
          <Card key={record.id}>
            <View style={styles.row}>
              <Ionicons name="remove-circle-outline" size={22} color={colors.secondary} />
              <View style={styles.fill}>
                <Text style={styles.name}>{record.childName}</Text>
                <Text style={styles.muted}>{record.absenceDate ?? record.absence_date} · {record.classroom}</Text>
              </View>
              <Badge tone={record.status === "cancelled" ? "danger" : "warning"}>{record.status}</Badge>
            </View>
            <Text style={styles.time}>{(record.absenceType ?? record.absence_type ?? "absence").replace("_", " ")}</Text>
            <Text style={styles.muted}>{record.reason ?? "No reason entered"}</Text>
          </Card>
        ))}
        {!loading && !error && !attendanceRecords.length && !absenceRecords.length ? <Card><Text style={styles.muted}>No attendance or absence history yet.</Text></Card> : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { gap: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  fill: { flex: 1 },
  name: { color: colors.text, fontSize: 18, fontWeight: "900" },
  muted: { color: colors.muted, lineHeight: 21 },
  times: { flexDirection: "row", gap: 10 },
  time: { flex: 1, padding: 12, borderRadius: 16, backgroundColor: colors.white, color: colors.text, fontWeight: "900" }
});
