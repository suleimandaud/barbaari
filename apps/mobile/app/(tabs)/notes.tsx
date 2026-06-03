import { useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { colors } from "@barbaari/shared";
import type { Child } from "@barbaari/shared";
import { Button, Card, Screen, SectionTitle } from "../../components/Ui";
import { useApiResource } from "../../hooks/useApiResource";
import { useMobileSession } from "../../hooks/useMobileSession";
import { mobileApi } from "../../services/mobileApi";

export default function Notes() {
  const { area } = useMobileSession();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const { data, loading, error, reload } = useApiResource(async () => {
    const [notes, staffChildren] = await Promise.all([
      mobileApi.notes(),
      area === "staff" ? mobileApi.staffChildren() : Promise.resolve({ children: [] })
    ]);
    return { notes: notes.daily_notes, children: staffChildren.children as Child[] };
  }, [area]);

  async function saveNote(child: Child) {
    const note = drafts[child.id] || "";
    if (!note.trim()) return;
    await mobileApi.createNote({ child_id: child.id, note });
    setDrafts({ ...drafts, [child.id]: "" });
    await reload();
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <SectionTitle eyebrow="Daily notes" title={area === "staff" ? "Classroom care notes" : "Care notes from daycare"} />
        {area === "staff" ? (
          <Card>
            <Text style={styles.name}>Add a note</Text>
            {(data?.children ?? []).map((child) => (
              <View key={child.id} style={styles.childNote}>
                <Text style={styles.name}>{child.name}</Text>
                <TextInput value={drafts[child.id] ?? ""} onChangeText={(value) => setDrafts({ ...drafts, [child.id]: value })} multiline placeholder="Daily note" placeholderTextColor={colors.muted} style={styles.note} />
                <Button onPress={() => saveNote(child)}>Save note</Button>
              </View>
            ))}
          </Card>
        ) : null}
        {loading ? <Card><Text style={styles.muted}>Loading notes...</Text></Card> : null}
        {error ? <Card><Text style={styles.muted}>{error}</Text></Card> : null}
        {(data?.notes ?? []).map((item: any) => <Card key={item.id}><Text style={styles.name}>{item.childName ?? item.child?.name ?? "Child"}</Text><Text style={styles.muted}>{item.date}</Text><Text style={styles.muted}>{item.note}</Text></Card>)}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { gap: 16 },
  name: { color: colors.text, fontSize: 18, fontWeight: "900" },
  muted: { color: colors.muted, lineHeight: 21 },
  childNote: { gap: 8, paddingVertical: 8 },
  note: { minHeight: 92, borderRadius: 16, padding: 14, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, color: colors.text, textAlignVertical: "top" }
});
