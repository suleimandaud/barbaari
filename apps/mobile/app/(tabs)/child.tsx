import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, documentsApi } from "@barbaari/shared";
import type { Child } from "@barbaari/shared";
import { AccessDenied, Badge, Button, Card, Screen, SectionTitle } from "../../components/Ui";
import { useApiResource } from "../../hooks/useApiResource";
import { useMobileSession } from "../../hooks/useMobileSession";
import { getToken } from "../../services/auth";
import { mobileApi } from "../../services/mobileApi";

export default function ChildProfile() {
  const { area } = useMobileSession();
  const { data, loading, error } = useApiResource(async () => {
    if (area === "staff") return { children: [], documents: [] };
    return mobileApi.parentHome();
  }, [area]);
  if (area === "staff") return <AccessDenied message="Child profiles in this tab are for parent accounts. Staff should use the Staff tab for assigned classroom children." />;
  const children = (data?.children ?? []) as Child[];
  const documents = data?.documents ?? [];

  async function downloadDocument(document: any) {
    try {
      const token = await getToken();
      const fileName = String(document.fileName ?? document.original_name ?? `${document.title}.download`).replace(/[^a-zA-Z0-9._-]/g, "-");
      const target = `${FileSystem.documentDirectory}${fileName}`;
      await FileSystem.downloadAsync(documentsApi.downloadUrl(document.id), target, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      Alert.alert("Document downloaded", `Saved to app storage as ${fileName}.`);
    } catch {
      Alert.alert("Download failed", "The document could not be downloaded. Please try again when connected to the daycare backend.");
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <SectionTitle eyebrow="Child profile" title="Children and care details" />
        {loading ? <Card><Text style={styles.muted}>Loading child profile...</Text></Card> : null}
        {error ? <Card><Text style={styles.muted}>{error}</Text></Card> : null}
        {children.map((child) => (
          <Card key={child.id}>
            <View style={styles.row}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{child.avatar}</Text></View>
              <View style={styles.fill}>
                <Text style={styles.name}>{child.name}</Text>
                <Text style={styles.muted}>{child.classroom} · {child.age}</Text>
              </View>
              <Badge tone={child.attendanceStatus === "checked_in" ? "success" : "neutral"}>{child.attendanceStatus.replace("_", " ")}</Badge>
            </View>
            <Text style={styles.muted}><Ionicons name="people-outline" size={16} color={colors.primary} /> Guardians: {child.guardianNames?.join(", ") || "None"}</Text>
            <Text style={styles.muted}>Allergies: {child.allergies?.length ? child.allergies.join(", ") : "None recorded"}</Text>
            <Text style={styles.muted}>Documents</Text>
            {documents.filter((doc: any) => !doc.child_id || String(doc.child_id) === String(child.id)).map((doc: any) => (
              <View key={doc.id} style={styles.documentRow}>
                <View style={styles.fill}>
                  <Text style={styles.documentTitle}>{doc.title}</Text>
                  <Text style={styles.muted}>{doc.fileName ?? doc.original_name ?? "Stored file"}</Text>
                </View>
                <Button variant="outline" onPress={() => downloadDocument(doc)}>Download</Button>
              </View>
            ))}
            {!documents.filter((doc: any) => !doc.child_id || String(doc.child_id) === String(child.id)).length ? <Text style={styles.muted}>No documents available</Text> : null}
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
  avatar: { width: 52, height: 52, borderRadius: 18, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "white", fontWeight: "900" },
  name: { color: colors.text, fontSize: 18, fontWeight: "900" },
  muted: { color: colors.muted, lineHeight: 21 },
  documentRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 8 },
  documentTitle: { color: colors.text, fontWeight: "900" }
});
