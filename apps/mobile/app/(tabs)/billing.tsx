import { Ionicons } from "@expo/vector-icons";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { colors } from "@barbaari/shared";
import type { Invoice } from "@barbaari/shared";
import { AccessDenied, Badge, Card, Screen, SectionTitle } from "../../components/Ui";
import { useApiResource } from "../../hooks/useApiResource";
import { useMobileSession } from "../../hooks/useMobileSession";
import { mobileApi } from "../../services/mobileApi";

export default function Billing() {
  const { area } = useMobileSession();
  const { data, loading, error } = useApiResource(async () => {
    if (area === "staff") return { invoices: [], payments: [] };
    const [invoices, payments] = await Promise.all([mobileApi.invoices(), mobileApi.payments()]);
    return { invoices: invoices.invoices as Invoice[], payments: payments.payments };
  }, [area]);
  if (area === "staff") return <AccessDenied message="Billing and receipts are parent-only mobile screens. Staff billing controls belong in the web dashboard." />;
  const invoices = data?.invoices ?? [];
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <SectionTitle eyebrow="Payments" title="Invoices and receipts" />
        {loading ? <Card><Text style={styles.muted}>Loading invoices...</Text></Card> : null}
        {error ? <Card><Text style={styles.muted}>{error}</Text></Card> : null}
        {invoices.map((invoice) => (
          <Card key={invoice.id}>
            <View style={styles.row}>
              <Ionicons name="receipt-outline" size={24} color={colors.primary} />
              <View style={styles.fill}>
                <Text style={styles.name}>${invoice.amount}</Text>
                <Text style={styles.muted}>{invoice.childName} · due {invoice.dueDate}</Text>
              </View>
              <Badge tone={invoice.status === "paid" ? "success" : invoice.status === "overdue" ? "danger" : "warning"}>{invoice.status}</Badge>
            </View>
            <Text style={styles.muted}>{invoice.status === "paid" ? "Receipt history is available from the daycare billing office." : "Contact the daycare office for parent invoice payment options."}</Text>
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
  name: { color: colors.text, fontSize: 22, fontWeight: "900" },
  muted: { color: colors.muted, lineHeight: 21 },
  actions: { flexDirection: "row", gap: 10 }
});
