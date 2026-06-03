import { Ionicons } from "@expo/vector-icons";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { colors } from "@barbaari/shared";
import type { IncidentReport } from "@barbaari/shared";
import { Badge, Button, Card, Screen, SectionTitle } from "../../components/Ui";
import { useApiResource } from "../../hooks/useApiResource";
import { mobileApi } from "../../services/mobileApi";

export default function Messages() {
  const { data, loading, error, reload } = useApiResource(async () => {
    const [incidents, messages] = await Promise.all([mobileApi.incidents(), mobileApi.messages()]);
    return { incidents: incidents.incidents as IncidentReport[], messages: messages.conversations };
  }, []);
  const incidents = data?.incidents ?? [];
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <SectionTitle eyebrow="Communication" title="Messages and incident reports" />
        {loading ? <Card><Text style={styles.muted}>Loading communication...</Text></Card> : null}
        {error ? <Card><Text style={styles.muted}>{error}</Text></Card> : null}
        <Card>
          <Text style={styles.name}>Message daycare staff</Text>
          <TextInput multiline placeholder="Write a message to your child’s classroom..." placeholderTextColor={colors.muted} style={styles.messageInput} />
          <Button onPress={async () => { await mobileApi.sendMessage({ body: "Parent message from mobile app" }); await reload(); }}>Send message</Button>
        </Card>
        {incidents.map((incident) => (
          <Card key={incident.id}>
            <View style={styles.row}>
              <Ionicons name="alert-circle-outline" size={24} color={colors.secondary} />
              <View style={styles.fill}>
                <Text style={styles.name}>{incident.childName}</Text>
                <Text style={styles.muted}>{incident.occurredAt} · {incident.staffName}</Text>
              </View>
              <Badge tone={incident.severity === "medium" ? "warning" : "success"}>{incident.severity}</Badge>
            </View>
            <Text style={styles.muted}>{incident.summary}</Text>
          </Card>
        ))}
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
  messageInput: { minHeight: 110, padding: 14, borderRadius: 18, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, color: colors.text, textAlignVertical: "top" }
});
