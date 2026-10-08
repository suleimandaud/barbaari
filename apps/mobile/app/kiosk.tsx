import { Ionicons } from "@expo/vector-icons";
import type React from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { SubscriptionRequiredScreen } from "../components/SubscriptionRequiredScreen";
import { TabletKiosk } from "../components/tablet/TabletKiosk";
import { useKioskFlow } from "../hooks/useKioskFlow";
import { useIsTablet } from "../hooks/useIsTablet";
import { absenceLabel, absenceTypes, actionLabels, statusFor, type Action, type ChildStatus } from "../services/kioskLogic";

// Redesign 2026 tokens (design/redesign-2026/tokens.md), kept local to the phone kiosk so
// the shared mobile `colors` used by the phone screens stay exactly as they were.
const k = {
  brand: "#2F8F98", accent: "#237680", accent600: "#1E6A73", accent100: "#E7F4F5",
  text: "#173236", bg: "#F8F6F1", surface: "#EFECE4", divider: "#D9E0DF", neutral200: "#E7E4DD",
  neutral700: "#53656A", neutral800: "#3A4B4E", white: "#FFFFFF",
  okBg: "#E1EFE6", okFg: "#22573A", mutedBg: "#E7E4DD", mutedFg: "#3A4B4E", absentBg: "#E4EAF1", absentFg: "#30445A",
  warnBg: "#FAEFD6", warnFg: "#6E4C0E", dangerBg: "#F7E1DC", dangerFg: "#8A2E22"
};
// Source Serif 4 isn't bundled in the app, so the kiosk uses the platform serif.
const serif = Platform.select({ ios: "Georgia", android: "serif", default: undefined });

const actionTone: Record<Action, string> = {
  in: k.accent,
  out: k.neutral700,
  absent: k.warnFg
};

// Every status shows an icon plus a word (design rule).
const statusStyle: Record<ChildStatus, { bg: string; fg: string; icon: keyof typeof Ionicons.glyphMap; label: string }> = {
  "not checked in": { bg: k.mutedBg, fg: k.mutedFg, icon: "ellipse-outline", label: "Not arrived" },
  "checked in": { bg: k.okBg, fg: k.okFg, icon: "checkmark-circle-outline", label: "Present" },
  "checked out": { bg: k.mutedBg, fg: k.mutedFg, icon: "exit-outline", label: "Checked out" },
  "early checkout": { bg: k.warnBg, fg: k.warnFg, icon: "time-outline", label: "Early checkout" },
  "missing checkout": { bg: k.dangerBg, fg: k.dangerFg, icon: "warning-outline", label: "Missing checkout" },
  absent: { bg: k.absentBg, fg: k.absentFg, icon: "remove-circle-outline", label: "Absent" }
};

/**
 * Tablets (iPad, or a screen whose shortest side is at least 600pt) get the tablet kiosk
 * from design/tablet-redesign; phones keep this layout. Both run the same useKioskFlow
 * state machine, so unlock, signer PIN, location and submission behave identically.
 */
export default function Kiosk() {
  const isTablet = useIsTablet();
  return isTablet ? <TabletKiosk /> : <PhoneKiosk />;
}

function PhoneKiosk() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { step, setStep, mode, setMode, email, setEmail, pin, setPin, pinVerificationId, setPinVerificationId, unlocked, setUnlocked, unlockedUser, setUnlockedUser, data, setData, selectedClassroomId, setSelectedClassroomId, classroomScopeChosen, setClassroomScopeChosen, selectedChildId, setSelectedChildId, selectedAction, setSelectedAction, signers, setSigners, selectedSignerKey, setSelectedSignerKey, signatureName, setSignatureName, absenceType, setAbsenceType, absenceReason, setAbsenceReason, absenceNotes, setAbsenceNotes, points, setPoints, saving, setSaving, message, setMessage, loadError, setLoadError, confirmation, setConfirmation, signatureBox, panResponder, selectedChild, selectedSigner, classroomChildren, user, refresh, loadTabletData, unlockWithPin, selectChild, addPoint, chooseSigner, verifySelectedSignerPin, submitAttendance, startOver, lockTablet, selectedChildStatus, visibleActions } = useKioskFlow();

  const isCompact = width < 760;
  const isNarrow = width < 520;
  const horizontalPadding = isNarrow ? 12 : isCompact ? 16 : 20;
  const contentWidth = Math.min(Math.max(width - (horizontalPadding * 2), 340), isCompact ? 860 : 1080);
  const modeLabel = mode === "staff" ? "Staff Mode" : "Admin Mode";
  const credentialPlaceholder = mode === "staff" ? "Staff PIN" : "Admin/manager PIN or password";
  const emailPlaceholder = mode === "staff" ? "Staff email" : "Admin or manager email";
  const unlockButton = mode === "staff" ? "Continue as staff" : "Unlock admin mode";

  return (
    <SafeAreaView edges={["top", "bottom", "left", "right"]} style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.keyboard}>
      <View style={[styles.header, { width: contentWidth, marginTop: Math.max(8, insets.top ? 4 : 14), flexDirection: isCompact ? "column" : "row", alignItems: isCompact ? "stretch" : "center" }]}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>Barbaari attendance · {modeLabel}</Text>
          <Text style={[styles.heading, { fontSize: isCompact ? 28 : 34 }]}>Tablet mode</Text>
        </View>
        <TouchableOpacity style={styles.startOver} onPress={unlocked ? lockTablet : startOver}><Ionicons name={unlocked ? "lock-closed-outline" : "refresh"} size={22} color={k.text} /><Text style={styles.startOverText}>{unlocked ? "Lock tablet" : "Start over"}</Text></TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={[styles.content, { width: contentWidth, paddingBottom: Math.max(34, insets.bottom + 28) }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {message ? <Text style={styles.warning}>{message}</Text> : null}
        {loadError ? <Text style={styles.warning}>{loadError}</Text> : null}

        {step === "welcome" ? (
          <View style={styles.panel}>
            {!unlocked ? (
              <View style={styles.unlock}>
                <Text style={[styles.stepTitle, { fontSize: isCompact ? 28 : 34 }]}>Unlock provider tablet</Text>
                <Text style={styles.detail}>Admins open the tablet. Teachers, or parents and guardians are selected later as signers and verify with their tablet PIN.</Text>



                <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder={emailPlaceholder} autoCapitalize="none" keyboardType="email-address" />
                <TextInput style={styles.input} value={pin} onChangeText={setPin} placeholder={credentialPlaceholder} secureTextEntry />
                <KButton disabled={saving} onPress={unlockWithPin}>{saving ? "Unlocking..." : unlockButton}</KButton>
              </View>
            ) : (
              <View style={styles.unlock}>
                <Text style={styles.unlockedText}>{modeLabel} unlocked by: {unlockedUser?.name ?? user?.name ?? "User"}</Text>
                <KButton disabled={saving} onPress={() => loadTabletData(mode)}>{saving ? "Loading tablet..." : (data?.uses_classrooms === false || data?.facility_type === "family_child_care" ? "Continue to children" : "Continue to classrooms")}</KButton>
              </View>
            )}
          </View>
        ) : null}

        {step === "subscription" ? (
          <SubscriptionRequiredScreen onBack={() => { setStep("welcome"); setUnlocked(false); setUnlockedUser(null); setData(null); }} />
        ) : null}

        {step === "classroom" && data ? (
          <View style={styles.panel}>
            <Text style={[styles.stepTitle, { fontSize: isCompact ? 28 : 34 }]}>Select classroom</Text>
            {data.scopeLabel ? <Text style={styles.unlockedText}>{data.scopeLabel}</Text> : null}
            {mode === "staff" ? <Text style={styles.warning}>Showing assigned classroom only</Text> : null}
            <View style={styles.grid}>
              <Tile active={!selectedClassroomId} title="All classrooms" detail={`${data.children.length} visible children`} onPress={() => setSelectedClassroomId("")} />
              {data.classrooms.map((room) => <Tile key={room.id} active={selectedClassroomId === String(room.id)} title={room.name} detail={`${room.children_count ?? data.children.filter((child) => String(child.classroomId) === String(room.id) || child.classroom === room.name).length} children`} onPress={() => setSelectedClassroomId(String(room.id))} />)}
            </View>
            <KButton onPress={() => { setClassroomScopeChosen(true); setStep("child"); }}>Continue</KButton>
          </View>
        ) : null}

        {step === "child" && data ? (
          <View style={styles.panel}>
            <Text style={[styles.stepTitle, { fontSize: isCompact ? 28 : 34 }]}>Select child</Text>
            <View style={styles.childGrid}>
              {classroomChildren.map((child) => <TouchableOpacity key={child.id} style={styles.childCard} onPress={() => selectChild(child)}>
                <Text style={styles.childName}>{child.name}</Text>
                <Text style={styles.detail}>{child.childCode ?? child.child_code ?? "No child code"} - {(data?.facility_type === "family_child_care" || data?.facilityType === "family_child_care") ? "Family child care" : (child.classroom ?? "Unassigned")}</Text>
                <Text style={styles.detail}>{child.age ?? child.dateOfBirth ?? child.date_of_birth ?? "Age not listed"}</Text>
                <Text style={styles.detail}>{child.guardianNames?.join(", ") || "Guardians not listed"}</Text>
                <StatusPill status={statusFor(child, data.attendance, data.absences, data.localDate ?? "")} />
              </TouchableOpacity>)}
            </View>
          </View>
        ) : null}

        {step === "action" ? (
          <StepPanel title="Choose action">
            <View style={styles.statusRow}><Text style={styles.childName}>{selectedChild?.name}</Text>{selectedChildStatus ? <StatusPill status={selectedChildStatus} /> : <Text style={styles.detail}>status unknown</Text>}</View>
            {visibleActions.length === 0 ? (
              <>
                <Text style={styles.warning}>
                  {selectedChildStatus === "absent"
                    ? "This child was already marked absent today."
                    : "This child's attendance for today is already resolved. No further tablet action is available."}
                </Text>
                <KButton variant="outline" onPress={startOver}>Back to children</KButton>
              </>
            ) : (
              <>
                <View style={styles.grid}>
                  {visibleActions.map((action) => <Tile key={action} color={actionTone[action]} active={selectedAction === action} title={actionLabels[action]} detail={action === "absent" ? "Record absence type and notes." : "Attendance operation."} onPress={() => setSelectedAction(action)} />)}
                </View>
                <View style={styles.actions}>
                  {/* Wrong-child recovery point (see spec): this is the last step before
                      the controlled verification flow (signer -> PIN -> signature) begins,
                      so it's the one place a "change child" back action belongs. Reuses
                      startOver(), the same reset already used by the "already resolved"
                      branch above, rather than a second navigation path. */}
                  <KButton variant="outline" onPress={startOver}>Back to children</KButton>
                  <KButton onPress={() => setStep("signer")}>Continue</KButton>
                </View>
              </>
            )}
          </StepPanel>
        ) : null}

        {step === "signer" ? (
          <StepPanel title="Select signer">
            <View style={styles.grid}>
              {signers.map((signer) => <Tile key={`${signer.type}:${signer.id}`} active={selectedSignerKey === `${signer.type}:${signer.id}`} title={signer.name} detail={`${signer.relationship ?? signer.type} - ${signer.pin_configured ? "PIN configured" : "PIN missing"}`} onPress={() => chooseSigner(`${signer.type}:${signer.id}`)} blocked={!signer.can_pickup} />)}
            </View>
            <KButton onPress={() => selectedSignerKey ? setStep("verify") : Alert.alert("Choose signer", "Select an authorized signer first.")}>Continue</KButton>
          </StepPanel>
        ) : null}

        {step === "verify" ? (
          <StepPanel title="Enter signer PIN">
            <Text style={styles.detail}>{selectedSigner?.name ?? "Selected signer"} must enter their tablet PIN before signature capture.</Text>
            <TextInput style={styles.input} value={pin} onChangeText={setPin} placeholder="Signer PIN" secureTextEntry keyboardType="number-pad" />
            {selectedAction === "absent" ? <View style={styles.absenceBox}>
              <Text style={styles.tileTitle}>Absence type</Text>
              <View style={styles.grid}>{absenceTypes.map(([value, label]) => <Tile key={value} active={absenceType === value} title={label} detail="Save this type on the absence record." onPress={() => setAbsenceType(value)} />)}</View>
              <TextInput style={styles.input} value={absenceReason} onChangeText={setAbsenceReason} placeholder="Reason, e.g. parent reported child is sick" />
              <TextInput style={[styles.input, styles.notesInput]} value={absenceNotes} onChangeText={setAbsenceNotes} placeholder="Optional notes" multiline />
            </View> : null}
            <KButton disabled={saving} onPress={verifySelectedSignerPin}>{saving ? "Verifying..." : "Verify PIN and continue"}</KButton>
          </StepPanel>
        ) : null}

        {step === "signature" ? (
          <StepPanel title="Signature">
            <Text style={styles.detail}>{selectedChild?.name} - {actionLabels[selectedAction]} - {selectedSigner?.name ?? "Selected staff"}</Text>
            <TextInput style={styles.input} value={signatureName} onChangeText={setSignatureName} placeholder="Typed signer name" />
            <View style={[styles.signatureBox, { height: isCompact ? 240 : 300 }]} onLayout={(event) => { signatureBox.current = event.nativeEvent.layout; }} {...panResponder.panHandlers}>
              {points.map((point, index) => <View key={`${point.x}-${point.y}-${index}`} style={[styles.signatureDot, { left: point.x, top: point.y }]} />)}
              {!points.length ? <Text style={styles.signatureHint}>Draw signature here</Text> : null}
            </View>
            <View style={styles.actions}>
              <KButton variant="outline" onPress={() => setPoints([])}>Clear signature</KButton>
              <KButton disabled={saving} onPress={submitAttendance}>{saving ? "Saving..." : "Submit"}</KButton>
            </View>
          </StepPanel>
        ) : null}

        {step === "confirm" && confirmation ? (
          <View style={[styles.panel, styles.donePanel]}>
            <View style={styles.doneCheck}><Ionicons name="checkmark" size={72} color={k.brand} /></View>
            <Text style={[styles.doneTitle, { fontSize: isCompact ? 34 : 48 }]}>Attendance saved</Text>
            <Text style={styles.doneLead}>{confirmation.child}</Text>
            <Text style={styles.doneDetail}>{confirmation.action} at {confirmation.time}</Text>
            <Text style={styles.doneDetail}>Actor: {confirmation.actor}</Text>
            <Text style={styles.doneDetail}>Signer: {confirmation.signer}</Text>
            {confirmation.absenceType ? <Text style={styles.doneDetail}>Absence type: {confirmation.absenceType}</Text> : null}
            <Text style={styles.doneDetail}>Verification: {String(confirmation.verification).replace("_", " ")}</Text>
            <KButton variant="light" onPress={startOver}>Start another attendance action</KButton>
          </View>
        ) : null}
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function KButton({ children, onPress, disabled, variant = "primary" }: { children: React.ReactNode; onPress?: () => void; disabled?: boolean; variant?: "primary" | "secondary" | "outline" | "light" }) {
  const secondary = variant === "secondary" || variant === "outline";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, secondary ? styles.buttonSecondary : variant === "light" ? styles.buttonLight : styles.buttonPrimary, pressed && !disabled && (secondary ? styles.buttonSecondaryPressed : styles.buttonPrimaryPressed), disabled && styles.buttonDisabled]}
    >
      <Text style={[styles.buttonText, secondary && styles.buttonTextSecondary, variant === "light" && styles.buttonTextLight]}>{children}</Text>
    </Pressable>
  );
}

function StatusPill({ status }: { status: ChildStatus }) {
  const spec = statusStyle[status];
  return (
    <View style={[styles.pill, { backgroundColor: spec.bg }]} accessibilityLabel={spec.label}>
      <Ionicons name={spec.icon} size={18} color={spec.fg} />
      <Text style={[styles.pillText, { color: spec.fg }]}>{spec.label}</Text>
    </View>
  );
}

function StepPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.panel}><Text style={styles.stepTitle}>{title}</Text>{children}</View>;
}

function Tile({ title, detail, active, blocked, icon, color, onPress }: { title: string; detail: string; active?: boolean; blocked?: boolean; icon?: keyof typeof Ionicons.glyphMap; color?: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.tile, active && styles.tileActive, blocked && styles.tileBlocked]} onPress={onPress}>
      {icon ? <View style={[styles.tileIcon, { backgroundColor: active ? k.accent : color ?? k.neutral200 }]}><Ionicons name={icon} size={24} color={active ? k.white : k.accent} /></View> : null}
      {color && !icon ? <View style={[styles.colorBar, { backgroundColor: color }]} /> : null}
      <Text style={styles.tileTitle}>{title}</Text>
      <Text style={styles.detail}>{detail}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: k.bg },
  keyboard: { flex: 1, alignItems: "center", backgroundColor: k.bg },
  header: { paddingHorizontal: 4, paddingTop: 12, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: k.divider, justifyContent: "space-between", gap: 16 },
  headerCopy: { minWidth: 0, gap: 4 },
  eyebrow: { color: k.neutral800, fontSize: 16, fontFamily: serif },
  heading: { color: k.text, fontSize: 34, fontWeight: "600", fontFamily: serif },
  startOver: { minHeight: 56, paddingHorizontal: 20, borderRadius: 2, backgroundColor: "transparent", borderWidth: 1, borderColor: k.divider, flexDirection: "row", alignItems: "center", justifyContent: "center", alignSelf: "flex-start", gap: 10 },
  startOverText: { color: k.text, fontSize: 17, fontWeight: "600", fontFamily: serif },
  content: { gap: 18, paddingTop: 24, paddingBottom: 32 },
  panel: { gap: 22, paddingVertical: 8 },
  stepTitle: { color: k.text, fontSize: 34, fontWeight: "600", fontFamily: serif },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  tile: { flexGrow: 1, flexShrink: 1, flexBasis: 230, minWidth: 0, minHeight: 120, justifyContent: "center", gap: 8, padding: 20, borderRadius: 4, backgroundColor: k.surface, borderWidth: 2, borderColor: "transparent" },
  tileActive: { borderColor: k.accent, backgroundColor: k.accent100 },
  tileBlocked: { opacity: 0.55 },
  tileIcon: { width: 48, height: 48, borderRadius: 4, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  colorBar: { width: 42, height: 5, borderRadius: 2, marginBottom: 4 },
  tileTitle: { color: k.text, fontSize: 21, fontWeight: "600", flexShrink: 1, fontFamily: serif },
  detail: { color: k.neutral800, fontSize: 17, lineHeight: 25, fontFamily: serif },
  unlock: { gap: 16, maxWidth: 560 },
  input: { minHeight: 64, paddingHorizontal: 18, borderRadius: 2, backgroundColor: k.white, borderWidth: 1, borderColor: k.divider, color: k.text, fontSize: 20, fontFamily: serif },
  notesInput: { minHeight: 110, paddingTop: 16, textAlignVertical: "top" },
  warning: { padding: 16, borderRadius: 4, backgroundColor: k.warnBg, color: k.warnFg, fontSize: 16, lineHeight: 23, fontFamily: serif },
  unlockedText: { padding: 16, borderRadius: 4, backgroundColor: k.okBg, color: k.okFg, fontSize: 18, fontFamily: serif },
  childGrid: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  childCard: { flexGrow: 1, flexShrink: 1, flexBasis: 260, minWidth: 0, minHeight: 188, gap: 8, padding: 22, borderRadius: 4, backgroundColor: k.surface, borderWidth: 2, borderColor: "transparent" },
  childName: { color: k.text, fontSize: 24, fontWeight: "600", fontFamily: serif },
  statusRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 14 },
  pill: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 2 },
  pillText: { fontSize: 15, fontFamily: serif },
  absenceBox: { gap: 16, padding: 18, borderRadius: 4, backgroundColor: k.surface },
  signatureBox: { height: 300, borderRadius: 4, borderWidth: 1.5, borderStyle: "dashed", borderColor: "#5FB0B8", backgroundColor: k.white, overflow: "hidden" },
  signatureDot: { position: "absolute", width: 7, height: 7, borderRadius: 4, backgroundColor: k.text },
  signatureHint: { position: "absolute", alignSelf: "center", top: 120, color: k.neutral700, fontSize: 20, fontFamily: serif },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "flex-end", alignItems: "center" },
  confirmLine: { color: k.text, fontSize: 24, fontWeight: "600", fontFamily: serif },
  button: { minHeight: 64, paddingHorizontal: 26, borderRadius: 2, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "transparent" },
  buttonPrimary: { backgroundColor: k.accent },
  buttonPrimaryPressed: { backgroundColor: k.accent600 },
  buttonSecondary: { backgroundColor: "transparent", borderColor: k.divider },
  buttonSecondaryPressed: { backgroundColor: k.neutral200 },
  buttonLight: { backgroundColor: k.white },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { color: k.white, fontSize: 19, fontWeight: "600", fontFamily: serif },
  buttonTextSecondary: { color: k.text },
  buttonTextLight: { color: "#174F55" },
  donePanel: { alignItems: "center", gap: 14, paddingVertical: 48, paddingHorizontal: 24, borderRadius: 4, backgroundColor: k.brand },
  doneCheck: { width: 140, height: 140, borderRadius: 70, backgroundColor: k.white, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  doneTitle: { color: k.white, fontWeight: "600", textAlign: "center", fontFamily: serif },
  doneLead: { color: k.white, fontSize: 24, textAlign: "center", fontFamily: serif },
  doneDetail: { color: k.white, opacity: 0.92, fontSize: 17, textAlign: "center", fontFamily: serif }
});
