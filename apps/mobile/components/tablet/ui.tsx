import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useFonts } from "expo-font";
import type { ComponentProps, ReactNode } from "react";
import { createContext, useContext, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Image, PanResponder, Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import type { ChildStatus } from "../../services/kioskLogic";
import { avatarTints, fontFiles, fonts, t } from "./theme";

/*
 * Reusable building blocks for the tablet kiosk (design/tablet-redesign). Tablet-only:
 * the phone screens keep using components/Ui.tsx.
 */

export type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];
export const logo = require("../../assets/images/barbaari-logo.jpg");

type FontSet = ReturnType<typeof fonts> & { fallback: boolean };
const FontContext = createContext<FontSet>({ ...fonts(false), fallback: true });

/** Loads Source Serif 4 for the tablet screens; renders a quiet splash until it's ready. */
export function TabletFonts({ children }: { children: ReactNode }) {
  const [loaded, error] = useFonts(fontFiles);
  const value = useMemo(() => ({ ...fonts(loaded), fallback: !loaded }), [loaded]);
  if (!loaded && !error) return <View style={{ flex: 1, backgroundColor: t.bg, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={t.accent} /></View>;
  return <FontContext.Provider value={value}>{children}</FontContext.Provider>;
}

/** Text in the tablet type scale. `weight` picks the Source Serif 4 face. */
export function T({ size = 18, weight = "regular", color = t.text, style, children, numberOfLines, center }: { size?: number; weight?: "regular" | "semibold"; color?: string; style?: StyleProp<TextStyle>; children: ReactNode; numberOfLines?: number; center?: boolean }) {
  const f = useContext(FontContext);
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[{ fontFamily: weight === "semibold" ? f.semibold : f.regular, fontWeight: f.fallback && weight === "semibold" ? "600" : undefined, fontSize: size, lineHeight: Math.round(size * 1.3), color }, center && { textAlign: "center" }, style]}
    >
      {children}
    </Text>
  );
}

export function Overline({ children, color = t.accent }: { children: ReactNode; color?: string }) {
  return <T size={12} color={color} style={{ letterSpacing: 1.2, textTransform: "uppercase" }}>{children}</T>;
}

export function Icon({ name, size = 24, color = t.accent }: { name: IconName; size?: number; color?: string }) {
  return <MaterialCommunityIcons name={name} size={size} color={color} />;
}

type ButtonVariant = "primary" | "secondary" | "light" | "ghost-light" | "link";

/** Touch button; every variant is at least 64pt tall except the compact header ones. */
export function TButton({ label, onPress, variant = "primary", icon, iconRight, disabled, busy, compact, style, accessibilityLabel }: { label: string; onPress?: () => void; variant?: ButtonVariant; icon?: IconName; iconRight?: IconName; disabled?: boolean; busy?: boolean; compact?: boolean; style?: StyleProp<ViewStyle>; accessibilityLabel?: string }) {
  const fg = variant === "primary" ? t.white : variant === "light" ? t.accent800 : variant === "ghost-light" ? t.white : variant === "link" ? t.accent : t.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled || !!busy, busy: !!busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        variant === "primary" && { backgroundColor: pressed ? t.accent600 : t.accent },
        variant === "secondary" && { backgroundColor: pressed ? t.neutral200 : "transparent", borderColor: t.divider },
        variant === "light" && { backgroundColor: pressed ? t.accent100 : t.white },
        variant === "ghost-light" && { backgroundColor: pressed ? "rgba(255,255,255,0.12)" : "transparent", borderColor: "rgba(255,255,255,0.6)" },
        variant === "link" && styles.buttonLink,
        (disabled || busy) && { opacity: 0.45 },
        style
      ]}
    >
      {busy ? <ActivityIndicator color={fg} /> : icon ? <Icon name={icon} size={compact ? 20 : 24} color={fg} /> : null}
      <T size={compact ? 16 : 19} weight="semibold" color={fg}>{label}</T>
      {iconRight ? <Icon name={iconRight} size={22} color={fg} /> : null}
    </Pressable>
  );
}

export function initials(name?: string | null) {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "·";
  return ((parts[0][0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : parts[0][1] ?? "")).toUpperCase();
}

function tint(seed: string) {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  return avatarTints[hash % avatarTints.length];
}

export function Avatar({ name, seed, size = 56 }: { name?: string | null; seed?: string | number | null; size?: number }) {
  const colors = tint(String(seed ?? name ?? ""));
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" }} accessibilityElementsHidden importantForAccessibility="no">
      <T size={Math.round(size * 0.34)} weight="semibold" color={colors.fg}>{initials(name)}</T>
    </View>
  );
}

const statusSpecs: Record<ChildStatus, { tone: keyof typeof toneColors; icon: IconName; label: string }> = {
  "not checked in": { tone: "warn", icon: "clock-outline", label: "Not arrived" },
  "checked in": { tone: "ok", icon: "check-circle-outline", label: "Present" },
  "checked out": { tone: "muted", icon: "logout", label: "Checked out" },
  "early checkout": { tone: "warn", icon: "clock-fast", label: "Early checkout" },
  "missing checkout": { tone: "danger", icon: "alert-outline", label: "Missing checkout" },
  absent: { tone: "absent", icon: "minus-circle-outline", label: "Absent" }
};
const toneColors = { ok: t.ok, muted: t.muted, absent: t.absent, warn: t.warn, danger: t.danger, info: t.info };

/** Status always shows an icon plus a word. */
export function StatusPill({ status, large, suffix }: { status: ChildStatus; large?: boolean; suffix?: string }) {
  const spec = statusSpecs[status];
  const colors = toneColors[spec.tone];
  return (
    <View style={[styles.pill, { backgroundColor: colors.bg }, large && styles.pillLarge]} accessibilityLabel={spec.label + (suffix ?? "")}>
      <Icon name={spec.icon} size={large ? 18 : 16} color={colors.fg} />
      <T size={large ? 16 : 15} color={colors.fg}>{spec.label}{suffix ?? ""}</T>
    </View>
  );
}

export function InlineAlert({ tone = "danger", title, message, onDismiss }: { tone?: "danger" | "warn" | "info" | "ok"; title: string; message?: string; onDismiss?: () => void }) {
  const colors = toneColors[tone];
  return (
    <View style={[styles.alert, { backgroundColor: colors.bg }]} accessibilityRole="alert">
      <Icon name={tone === "ok" ? "check-circle-outline" : tone === "info" ? "information-outline" : "alert-circle-outline"} size={24} color={colors.fg} />
      <View style={{ flex: 1, gap: 2 }}>
        <T size={17} weight="semibold" color={colors.fg}>{title}</T>
        {message ? <T size={16} color={colors.fg}>{message}</T> : null}
      </View>
      {onDismiss ? <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" onPress={onDismiss} hitSlop={12} style={{ padding: 6 }}><Icon name="close" size={22} color={colors.fg} /></Pressable> : null}
    </View>
  );
}

/** Segmented control (room filter, absence type). Each segment is a 64pt target. */
export function Segmented<K extends string>({ items, value, onChange, label }: { items: Array<{ key: K; label: string }>; value: K; onChange: (key: K) => void; label: string }) {
  return (
    <View style={styles.segmented} accessibilityRole="tablist" accessibilityLabel={label}>
      {items.map((item, index) => {
        const on = item.key === value;
        return (
          <Pressable key={item.key} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => onChange(item.key)} style={[styles.segment, index > 0 && styles.segmentDivider, on && { backgroundColor: t.accent }]}>
            <T size={18} color={on ? t.white : t.text} weight={on ? "semibold" : "regular"}>{item.label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SearchField({ value, onChangeText, placeholder }: { value: string; onChangeText: (value: string) => void; placeholder: string }) {
  const f = useContext(FontContext);
  return (
    <View style={styles.search}>
      <Icon name="magnify" size={28} color={t.neutral800} />
      <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={t.neutral600} style={[styles.searchInput, { fontFamily: f.regular }]} accessibilityLabel={placeholder} autoCorrect={false} returnKeyType="search" />
      {value ? <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => onChangeText("")} hitSlop={12}><Icon name="close-circle" size={22} color={t.neutral600} /></Pressable> : null}
    </View>
  );
}

export function Field({ label, value, onChangeText, placeholder, secure, keyboardType, autoCapitalize = "none", autoComplete, multiline }: { label: string; value: string; onChangeText: (value: string) => void; placeholder?: string; secure?: boolean; keyboardType?: ComponentProps<typeof TextInput>["keyboardType"]; autoCapitalize?: ComponentProps<typeof TextInput>["autoCapitalize"]; autoComplete?: ComponentProps<typeof TextInput>["autoComplete"]; multiline?: boolean }) {
  const f = useContext(FontContext);
  return (
    <View style={{ gap: 8 }}>
      <T size={14} color={t.neutral700}>{label}</T>
      <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={t.neutral600} secureTextEntry={secure} keyboardType={keyboardType} autoCapitalize={autoCapitalize} autoComplete={autoComplete} autoCorrect={false} multiline={multiline} accessibilityLabel={label} style={[styles.input, multiline && { minHeight: 110, paddingTop: 16, textAlignVertical: "top" }, { fontFamily: f.regular }]} />
    </View>
  );
}

/** PIN entry: dots plus a 3×4 keypad. Digits only, 4–8 long (backend rule). */
export function PinPad({ value, onChange, title, subtitle, keySize = 104 }: { value: string; onChange: (value: string) => void; title: string; subtitle?: string; keySize?: number }) {
  const dots = Math.max(4, value.length);
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];
  return (
    <View style={styles.pinpad}>
      <T size={26} weight="semibold" center>{title}</T>
      {subtitle ? <T size={17} color={t.neutral800} center style={{ marginTop: -10 }}>{subtitle}</T> : null}
      <View style={styles.pinDots} accessibilityLabel={`${value.length} digits entered`} accessibilityRole="text">
        {Array.from({ length: dots }, (_, index) => <View key={index} style={[styles.pinDot, index < value.length && styles.pinDotOn]} />)}
      </View>
      <View style={[styles.pinKeys, { width: keySize * 3 + 28 }]}>
        {keys.map((key) => key === "" ? <View key="blank" style={{ width: keySize, height: Math.round(keySize * 0.73) }} /> : (
          <Pressable
            key={key}
            accessibilityRole="button"
            accessibilityLabel={key === "del" ? "Delete digit" : key}
            onPress={() => (key === "del" ? onChange(value.slice(0, -1)) : value.length < 8 && onChange(value + key))}
            style={({ pressed }) => [styles.pinKey, { width: keySize, height: Math.round(keySize * 0.73), backgroundColor: pressed ? t.accent100 : t.surface }]}
          >
            {key === "del" ? <Icon name="backspace-outline" size={30} color={t.text} /> : <T size={30}>{key}</T>}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/** Teal brand column (440pt, full height) on the welcome and unlock screens; a top band in portrait. */
export function BrandPanel({ eyebrow, title, body, horizontal }: { eyebrow: string; title: string; body: string; horizontal?: boolean }) {
  if (horizontal) {
    return (
      <View style={[styles.brand, styles.brandHorizontal]}>
        <Image source={logo} style={{ width: 96, height: 96, borderRadius: t.radius }} accessibilityLabel="Barbaari" />
        <View style={{ flex: 1, gap: 6 }}>
          <T size={16} color={t.white} style={{ opacity: 0.9 }}>{eyebrow}</T>
          <T size={32} weight="semibold" color={t.white}>{title}</T>
          <T size={17} color={t.white}>{body}</T>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.brand}>
      <Image source={logo} style={{ width: 170, height: 170, borderRadius: t.radius, marginLeft: -20 }} accessibilityLabel="Barbaari" />
      <View style={{ gap: 12 }}>
        <T size={17} color={t.white} style={{ opacity: 0.9 }}>{eyebrow}</T>
        <T size={44} weight="semibold" color={t.white} style={{ lineHeight: 48 }}>{title}</T>
        <T size={18} color={t.white} style={{ lineHeight: 26 }}>{body}</T>
      </View>
    </View>
  );
}

/** Top bar for the in-flow steps: Back · step trail · right slot. */
export function StepBar({ onBack, current, right }: { onBack?: () => void; current: 0 | 1 | 2 | 3 | 4; right?: ReactNode }) {
  const steps = ["Child", "Action", "Signer", "Sign", "Done"];
  return (
    <View style={styles.stepBar}>
      <View style={{ flex: 1, alignItems: "flex-start" }}>{onBack ? <TButton compact variant="secondary" icon="arrow-left" label="Back" onPress={onBack} /> : null}</View>
      <Text accessibilityLabel={`Step ${current + 1} of 5: ${steps[current]}`}>
        {steps.map((label, index) => <T key={label} size={17} weight={index === current ? "semibold" : "regular"} color={index === current ? t.text : t.neutral800}>{index ? " · " : ""}{label}</T>)}
      </Text>
      <View style={{ flex: 1, alignItems: "flex-end" }}>{right}</View>
    </View>
  );
}

type Stroke = Array<{ x: number; y: number }>;

/**
 * Finger signature. Strokes are drawn as connected segments (no extra drawing library);
 * every point is also forwarded to `onPoint` so the existing kiosk payload
 * (signature_data = { points, box }) is built exactly as before.
 */
export function SignaturePad({ onPoint, onLayoutBox, onClearRef, height = 380 }: { onPoint: (x: number, y: number) => void; onLayoutBox: (box: { width: number; height: number }) => void; onClearRef: (clear: () => void) => void; height?: number }) {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const current = useRef<Stroke | null>(null);
  onClearRef(() => { current.current = null; setStrokes([]); });

  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (event) => {
      const point = { x: event.nativeEvent.locationX, y: event.nativeEvent.locationY };
      current.current = [point];
      setStrokes((existing) => [...existing, [point]]);
      onPoint(point.x, point.y);
    },
    onPanResponderMove: (event) => {
      const point = { x: event.nativeEvent.locationX, y: event.nativeEvent.locationY };
      const stroke = current.current;
      if (!stroke) return;
      const last = stroke[stroke.length - 1];
      if (Math.abs(last.x - point.x) + Math.abs(last.y - point.y) < 2) return;
      stroke.push(point);
      setStrokes((existing) => [...existing.slice(0, -1), [...stroke]]);
      onPoint(point.x, point.y);
    },
    onPanResponderRelease: () => { current.current = null; }
  }), [onPoint]);

  const segments: ReactNode[] = [];
  strokes.forEach((stroke, strokeIndex) => {
    if (stroke.length === 1) {
      segments.push(<View key={`${strokeIndex}-dot`} pointerEvents="none" style={[styles.inkDot, { left: stroke[0].x - 2, top: stroke[0].y - 2 }]} />);
    }
    for (let index = 1; index < stroke.length; index += 1) {
      const a = stroke[index - 1];
      const b = stroke[index];
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      segments.push(
        <View
          key={`${strokeIndex}-${index}`}
          pointerEvents="none"
          style={[styles.ink, { width: length + 3, left: (a.x + b.x) / 2 - (length + 3) / 2, top: (a.y + b.y) / 2 - 2, transform: [{ rotate: `${angle}rad` }] }]}
        />
      );
    }
  });

  return (
    <View style={[styles.signature, { height }]} accessibilityLabel="Signature pad. Sign above the line with your finger.">
      <View style={StyleSheet.absoluteFill} onLayout={(event) => onLayoutBox(event.nativeEvent.layout)} {...responder.panHandlers}>
        {segments}
      </View>
      <View pointerEvents="none" style={styles.signatureLine} />
      <View pointerEvents="none" style={styles.signatureHint}><T size={15} color={t.neutral800}>{strokes.length ? "Signature captured" : "Sign above the line with your finger"}</T></View>
    </View>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: t.touch + 4, paddingHorizontal: 28, borderRadius: t.radiusSm, borderWidth: 1, borderColor: "transparent", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12 },
  buttonCompact: { minHeight: 52, paddingHorizontal: 20, gap: 8 },
  buttonLink: { minHeight: 52, paddingHorizontal: 12 },
  pill: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: t.radiusSm },
  pillLarge: { paddingHorizontal: 12, paddingVertical: 6 },
  alert: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 16, borderRadius: t.radius, marginBottom: 20 },
  segmented: { flexDirection: "row", borderWidth: 1, borderColor: t.divider, borderRadius: t.radiusSm, overflow: "hidden", alignSelf: "flex-start" },
  segment: { minHeight: t.touch, paddingHorizontal: 20, alignItems: "center", justifyContent: "center", backgroundColor: t.bg },
  segmentDivider: { borderLeftWidth: 1, borderLeftColor: t.divider },
  search: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: t.touch, paddingHorizontal: 18, backgroundColor: t.white, borderWidth: 1, borderColor: t.divider, borderRadius: t.radiusSm },
  searchInput: { flex: 1, fontSize: 22, color: t.text, paddingVertical: 14 },
  input: { minHeight: t.touch, paddingHorizontal: 18, borderRadius: t.radiusSm, backgroundColor: t.white, borderWidth: 1, borderColor: t.divider, color: t.text, fontSize: 20 },
  pinpad: { alignItems: "center", gap: 22 },
  pinDots: { flexDirection: "row", gap: 18 },
  pinDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: t.neutral600 },
  pinDotOn: { backgroundColor: t.text, borderColor: t.text },
  pinKeys: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  pinKey: { borderRadius: t.radius, alignItems: "center", justifyContent: "center" },
  brand: { width: 440, alignSelf: "stretch", backgroundColor: t.brand, justifyContent: "space-between", padding: 50, gap: 40 },
  brandHorizontal: { width: "auto", flexDirection: "row", alignItems: "center", justifyContent: "flex-start", padding: 28, gap: 24 },
  stepBar: { flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 36 },
  signature: { backgroundColor: t.white, borderWidth: 1, borderColor: t.divider, borderRadius: t.radius, overflow: "hidden" },
  signatureLine: { position: "absolute", left: 60, right: 60, bottom: 70, height: 1.5, backgroundColor: t.neutral400 },
  signatureHint: { position: "absolute", left: 60, bottom: 38 },
  ink: { position: "absolute", height: 4, borderRadius: 2, backgroundColor: t.text },
  inkDot: { position: "absolute", width: 5, height: 5, borderRadius: 3, backgroundColor: t.text }
});
