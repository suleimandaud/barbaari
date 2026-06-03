import { Link, Redirect } from "expo-router";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { colors } from "@barbaari/shared";
import { Button, Card, Screen, SectionTitle } from "../components/Ui";
import { useMobileSession } from "../hooks/useMobileSession";

export default function Index() {
  const { user, area, loading } = useMobileSession();
  if (loading) return <View style={styles.loading}><ActivityIndicator color={colors.primary} /></View>;

  return (
    <Screen>
      <View style={styles.shell}>
        <SectionTitle eyebrow="Barbaari" title="Attendance Tablet Mode" />
        <Card>
          <Text style={styles.title}>Front-desk attendance kiosk</Text>
          <Text style={styles.copy}>Check children in, check them out, mark absences, capture signer verification, and record drawn signatures from a tablet.</Text>
          <Link href="/kiosk" asChild><Button>Open Tablet / Kiosk Mode</Button></Link>
        </Card>
        <Card>
          <Text style={styles.title}>Existing mobile app</Text>
          <Text style={styles.copy}>Parent and staff mobile screens are still available, but the main demo flow now starts with attendance signing.</Text>
          {user && area !== "unsupported" ? <Link href="/(tabs)" asChild><Button variant="outline">Open Parent / Staff Mobile Mode</Button></Link> : <Link href="/login" asChild><Button variant="outline">Parent / Staff Login</Button></Link>}
        </Card>
        {user && area === "unsupported" ? <Redirect href="/login" /> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  shell: { flex: 1, justifyContent: "center", gap: 18, width: "100%", maxWidth: 820, alignSelf: "center" },
  title: { color: colors.text, fontSize: 24, fontWeight: "900" },
  copy: { color: colors.muted, fontSize: 16, lineHeight: 24 }
});
