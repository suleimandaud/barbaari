import { router } from "expo-router";
import { ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { t } from "./theme";
import { BrandPanel, Icon, Overline, T, TabletFonts, TButton, type IconName } from "./ui";

/*
 * 3g · Welcome (design/tablet-redesign) — first screen on tablets. "Get started" opens the
 * same /kiosk route as before, where a staff member unlocks the tablet.
 */
const features: Array<{ icon: IconName; title: string; body: string }> = [
  { icon: "account-group-outline", title: "Parent check-in & check-out", body: "Find the child, choose the guardian, done." },
  { icon: "draw-pen", title: "Digital signature", body: "Every drop-off and pickup is signed on screen." },
  { icon: "clock-outline", title: "Attendance & time", body: "Times go straight to the daycare’s attendance records." },
  { icon: "shield-check-outline", title: "Secure verification", body: "Staff unlock with a PIN. Guardians confirm with their own PIN." }
];

export function TabletWelcome() {
  return <TabletFonts><WelcomeContent /></TabletFonts>;
}

function WelcomeContent() {
  const { width, height } = useWindowDimensions();
  const landscape = width >= height && width >= 900;
  return (
    <SafeAreaView edges={["top", "bottom", "left", "right"]} style={styles.safe}>
      <View style={[styles.split, !landscape && { flexDirection: "column" }]}>
        <BrandPanel horizontal={!landscape} eyebrow="Barbaari" title="Attendance tablet" body="Fast, secure check-in and check-out at the daycare entrance." />
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
          <View style={{ gap: 8 }}>
            <Overline>What this tablet does</Overline>
            <T size={32} weight="semibold" style={{ lineHeight: 40 }}>Set up once. Then families sign in and out here every day.</T>
          </View>
          <View style={{ gap: 22 }}>
            {features.map((feature) => (
              <View key={feature.title} style={styles.feature}>
                <Icon name={feature.icon} size={30} />
                <View style={{ flex: 1, gap: 2 }}>
                  <T size={20} weight="semibold">{feature.title}</T>
                  <T size={16} color={t.neutral700}>{feature.body}</T>
                </View>
              </View>
            ))}
          </View>
          <View style={styles.footer}>
            <TButton label="Get started" iconRight="arrow-right" onPress={() => router.push("/kiosk")} style={{ minWidth: 226 }} />
            <T size={15} color={t.neutral800} style={{ flexShrink: 1 }}>A staff member signs in next</T>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: t.bg },
  split: { flex: 1, flexDirection: "row" },
  content: { flexGrow: 1, justifyContent: "center", gap: 44, paddingHorizontal: 70, paddingVertical: 60 },
  feature: { flexDirection: "row", alignItems: "flex-start", gap: 18 },
  footer: { flexDirection: "row", alignItems: "center", gap: 24, flexWrap: "wrap" }
});
