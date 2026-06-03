import { ReactNode } from "react";
import { Pressable, PressableProps, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@barbaari/shared";

export function Screen({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={[styles.screen, { paddingBottom: insets.bottom + 104 }]}>
      {children}
    </SafeAreaView>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export function Button({ children, onPress, variant = "primary", ...pressableProps }: PressableProps & { children: ReactNode; variant?: "primary" | "secondary" | "outline" }) {
  const variantStyle = {
    primary: styles.primaryButton,
    secondary: styles.secondaryButton,
    outline: styles.outlineButton
  }[variant];

  return (
    <Pressable {...pressableProps} onPress={onPress} style={(state) => [styles.button, variantStyle, typeof pressableProps.style === "function" ? pressableProps.style(state) : pressableProps.style]}>
      <Text style={[styles.buttonText, variant !== "primary" && styles.buttonTextSecondary]}>{children}</Text>
    </Pressable>
  );
}

export function Badge({ children, tone = "primary" }: { children: ReactNode; tone?: "primary" | "secondary" | "warning" | "success" | "danger" | "neutral" }) {
  return <Text style={[styles.badge, styles[tone]]}>{children}</Text>;
}

export function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return <View style={styles.sectionTitle}><Text style={styles.eyebrow}>{eyebrow}</Text><Text style={styles.title}>{title}</Text></View>;
}

export function AccessDenied({ message = "This screen is not available for your mobile role." }: { message?: string }) {
  return <Screen><Card><Text style={styles.deniedTitle}>Use the right workspace</Text><Text style={styles.deniedText}>{message}</Text></Card></Screen>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, gap: 16, paddingHorizontal: 20, paddingTop: 18, backgroundColor: colors.background },
  card: { padding: 16, borderRadius: 24, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, gap: 9 },
  button: { minHeight: 48, borderRadius: 999, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  primaryButton: { backgroundColor: colors.primary },
  secondaryButton: { backgroundColor: colors.white },
  outlineButton: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.primary },
  buttonText: { color: "white", fontWeight: "900" },
  buttonTextSecondary: { color: colors.primary },
  badge: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, overflow: "hidden", fontSize: 12, fontWeight: "900", textTransform: "capitalize" },
  primary: { backgroundColor: colors.primary, color: "white" },
  secondary: { backgroundColor: "#FFE2D9", color: colors.neutral },
  warning: { backgroundColor: "#FFF4CA", color: "#9A6A09" },
  success: { backgroundColor: "#DCF6EB", color: "#1D805A" },
  danger: { backgroundColor: "#FFE1E1", color: "#B23A3A" },
  neutral: { backgroundColor: "#E3EBEE", color: colors.neutral },
  sectionTitle: { gap: 2 },
  eyebrow: { color: colors.primary, fontWeight: "900" },
  title: { color: colors.text, fontSize: 30, fontWeight: "900" },
  deniedTitle: { color: colors.text, fontSize: 20, fontWeight: "900" },
  deniedText: { color: colors.muted, lineHeight: 21 }
});
