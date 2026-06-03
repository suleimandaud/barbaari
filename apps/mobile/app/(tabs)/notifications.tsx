import { ScrollView, StyleSheet, Text, View } from "react-native";
import { colors } from "@barbaari/shared";
import { Badge, Button, Card, Screen, SectionTitle } from "../../components/Ui";
import { useApiResource } from "../../hooks/useApiResource";
import { mobileApi } from "../../services/mobileApi";

function label(value?: string | null) {
  return String(value ?? "normal").replace(/_/g, " ");
}

export default function Notifications() {
  const { data, loading, error, reload } = useApiResource(async () => (await mobileApi.notifications()).notifications, []);
  const unread = (data ?? []).filter((item: any) => !item.read_at).length;
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <SectionTitle eyebrow="Notifications" title="Updates" />
        <Card>
          <View style={styles.row}>
            <Text style={styles.name}>{unread} unread</Text>
            <Button variant="secondary" onPress={async () => { await mobileApi.markAllNotificationsRead(); await reload(); }}>Mark all read</Button>
          </View>
          <Text style={styles.muted}>In-app notifications are delivered internally. Email delivery uses the configured mail provider.</Text>
        </Card>
        {loading ? <Card><Text style={styles.muted}>Loading notifications...</Text></Card> : null}
        {error ? <Card><Text style={styles.muted}>{error}</Text></Card> : null}
        {(data ?? []).map((item: any) => (
          <Card key={item.id}>
            <View style={styles.row}><Text style={styles.name}>{item.title}</Text><Badge tone={item.read_at ? "success" : "warning"}>{item.read_at ? "read" : "unread"}</Badge></View>
            <Text style={styles.muted}>{item.body}</Text>
            <View style={styles.badges}>
              <Badge>{label(item.type)}</Badge>
              <Badge tone={item.priority === "high" || item.priority === "urgent" ? "danger" : "neutral"}>{label(item.priority)}</Badge>
              <Badge tone={item.deliveryStatus === "delivered" ? "success" : "warning"}>{label(item.deliveryStatus)}</Badge>
            </View>
            {!item.read_at ? <Button variant="secondary" onPress={async () => { await mobileApi.markNotificationRead(item.id); await reload(); }}>Mark read</Button> : null}
          </Card>
        ))}
        {!loading && !error && !(data ?? []).length ? <Card><Text style={styles.muted}>No notifications yet.</Text></Card> : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { gap: 16 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  name: { color: colors.text, fontSize: 18, fontWeight: "900", flex: 1 },
  muted: { color: colors.muted, lineHeight: 21 },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 8 }
});
