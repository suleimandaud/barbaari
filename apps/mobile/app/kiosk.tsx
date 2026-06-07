import { Ionicons } from "@expo/vector-icons";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, KeyboardAvoidingView, PanResponder, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { DEFAULT_ATTENDANCE_TIMEZONE, colors, formatAttendanceTime, getApiError } from "@barbaari/shared";
import { Button, Badge } from "../components/Ui";
import { useMobileSession } from "../hooks/useMobileSession";
import { unlockTablet } from "../services/auth";
import { mobileApi } from "../services/mobileApi";
import type { MobileUser } from "../services/auth";

type Step = "welcome" | "classroom" | "child" | "action" | "signer" | "verify" | "signature" | "confirm";
type Action = "in" | "out" | "absent" | "early";
type Point = { x: number; y: number };
type AbsenceType = "excused" | "unexcused" | "sick" | "vacation" | "no_show" | "other";

const actionLabels: Record<Action, string> = {
  in: "Check in",
  out: "Check out",
  absent: "Mark absent",
  early: "Early checkout"
};

const absenceTypes: Array<[AbsenceType, string]> = [
  ["excused", "Excused"],
  ["unexcused", "Unexcused"],
  ["sick", "Sick"],
  ["vacation", "Vacation"],
  ["no_show", "No-show"],
  ["other", "Other"]
];

const actionTone: Record<Action, string> = {
  in: colors.primary,
  out: colors.neutral,
  absent: colors.tertiary,
  early: colors.secondary
};

function absenceLabel(value: AbsenceType) {
  return absenceTypes.find(([id]) => id === value)?.[1] ?? value.replace("_", " ");
}

function statusFor(child: any, attendance: any[], absences: any[], localDate: string) {
  const record = attendance.find((item) => String(item.childId) === String(child.id) && item.date === localDate);
  const absence = absences.find((item) => String(item.childId) === String(child.id) && (item.absenceDate ?? item.absence_date) === localDate);
  if (absence) return "absent";
  if (!record) return "not checked in";
  if (record.status === "missing_checkout") return "missing checkout";
  if (record.status === "checked_out_early") return "early checkout";
  if (record.checkOutTime || record.status === "checked_out") return "checked out";
  return "checked in";
}

function deviceLocation(): Promise<{ latitude: number; longitude: number }> {
  return new Promise((resolve, reject) => {
    const geo = globalThis.navigator?.geolocation;
    if (!geo) {
      reject(new Error("Device location is required for attendance. Enable location services for this tablet."));
      return;
    }
    geo.getCurrentPosition(
      (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      () => reject(new Error("Location permission is required for attendance. Allow location access and try again.")),
      { timeout: 10000, maximumAge: 30000, enableHighAccuracy: true }
    );
  });
}

export default function Kiosk() {
  const { user, refresh } = useMobileSession();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>("welcome");
  const [mode, setMode] = useState<"guardian" | "staff" | "admin">("guardian");
  const [email, setEmail] = useState(user?.email ?? "");
  const [pin, setPin] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [unlockedUser, setUnlockedUser] = useState<MobileUser | null>(null);
  const [data, setData] = useState<{ children: any[]; classrooms: any[]; attendance: any[]; absences: any[]; staff?: any[]; timezone?: string; localDate?: string; scopeLabel?: string; facility_type?: string; facilityType?: string; uses_classrooms?: boolean } | null>(null);
  const [selectedClassroomId, setSelectedClassroomId] = useState("");
  const [selectedChildId, setSelectedChildId] = useState("");
  const [selectedAction, setSelectedAction] = useState<Action>("in");
  const [signers, setSigners] = useState<any[]>([]);
  const [selectedSignerKey, setSelectedSignerKey] = useState("");
  const [assistingStaffId, setAssistingStaffId] = useState("");
  const [verification, setVerification] = useState<"secure_login" | "pin" | "digital_signature">("digital_signature");
  const [signatureName, setSignatureName] = useState("");
  const [absenceType, setAbsenceType] = useState<AbsenceType>("no_show");
  const [absenceReason, setAbsenceReason] = useState("");
  const [absenceNotes, setAbsenceNotes] = useState("");
  const [points, setPoints] = useState<Point[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  const [confirmation, setConfirmation] = useState<any | null>(null);
  const signatureBox = useRef({ width: 1, height: 1 });

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (event) => addPoint(event.nativeEvent.locationX, event.nativeEvent.locationY),
    onPanResponderMove: (event) => addPoint(event.nativeEvent.locationX, event.nativeEvent.locationY)
  }), []);

  const selectedChild = useMemo(() => data?.children.find((child) => String(child.id) === selectedChildId), [data?.children, selectedChildId]);
  const selectedSigner = useMemo(() => {
    if (selectedSignerKey === "staff:admin") return { id: "admin", type: "staff", name: unlockedUser?.name ?? "Admin-assisted", can_pickup: true };
    if (selectedSignerKey.startsWith("staff:")) {
      const staffId = selectedSignerKey.replace("staff:", "");
      const assistingStaff = (data?.staff ?? []).find((staff) => String(staff.id) === staffId);
      if (assistingStaff) return { id: assistingStaff.id, type: "staff", name: assistingStaff.name ?? "Staff-assisted", can_pickup: true };
    }
    return signers.find((signer) => `${signer.type}:${signer.id}` === selectedSignerKey);
  }, [data?.staff, selectedSignerKey, signers, unlockedUser?.name]);

  const classroomChildren = useMemo(() => {
    const children = data?.children ?? [];
    if (!selectedClassroomId) return children;
    return children.filter((child) => String(child.classroomId) === selectedClassroomId || String(child.classroom_id) === selectedClassroomId || child.classroom === data?.classrooms.find((room) => String(room.id) === selectedClassroomId)?.name);
  }, [data, selectedClassroomId]);

  useEffect(() => {
    if (user && !email) setEmail(user.email);
  }, [email, user]);

  useEffect(() => {
    if (!confirmation) return;
    const timer = setTimeout(() => startOver(), 5000);
    return () => clearTimeout(timer);
  }, [confirmation]);

  async function loadTabletData(selectedMode = mode) {
    setSaving(true);
    setMessage("");
    setLoadError("");
    try {
      const response = await mobileApi.tabletBootstrap(selectedMode);
      const usesClassrooms = response.uses_classrooms !== false && response.facility_type !== "family_child_care" && response.facilityType !== "family_child_care";
      if (!response.children.length) {
        setData(response);
        setLoadError(selectedMode === "guardian" ? "No linked children are available for this parent/guardian account." : "No children are available for this account.");
        return;
      }
      setData(response);
      setStep(usesClassrooms ? "classroom" : "child");
    } catch {
      setLoadError("Could not load attendance tablet records. Check backend connection or account permissions.");
      setStep("welcome");
    } finally {
      setSaving(false);
    }
  }

  async function unlockWithPin() {
    if (!email.trim() || !pin.trim()) {
      Alert.alert("Unlock required", mode === "guardian" ? "Enter parent/guardian email and password or PIN." : mode === "staff" ? "Enter staff email and PIN." : "Enter admin or manager email and PIN.");
      return;
    }
    setSaving(true);
    setMessage("");
    setLoadError("");
    try {
      const response = await unlockTablet(mode, email.trim(), pin.trim());
      setUnlockedUser(response.user);
      setUnlocked(true);
      setPin("");
      await refresh();
      await loadTabletData(mode);
    } catch (err) {
      const apiError = getApiError(err);
      const formMessage = apiError.errors?.pin?.[0] ?? apiError.errors?.password_or_pin?.[0] ?? apiError.errors?.guardian?.[0] ?? apiError.errors?.email?.[0];
      Alert.alert("Unlock failed", formMessage ?? apiError.message ?? "The selected mode credentials were not accepted.");
    } finally {
      setSaving(false);
    }
  }

  async function selectChild(child: any) {
    setSelectedChildId(String(child.id));
    setSaving(true);
    try {
      const response = await mobileApi.tabletPickupSigners(child.id);
      setSigners(response.signers ?? []);
      setSelectedSignerKey("");
      setSignatureName("");
      setPoints([]);
      setStep("action");
    } catch {
      Alert.alert("Could not load signers", "Authorized guardians and pickup people could not be loaded.");
    } finally {
      setSaving(false);
    }
  }

  function addPoint(x: number, y: number) {
    setPoints((existing) => [...existing.slice(-180), { x, y }]);
  }

  function chooseSigner(key: string) {
    setSelectedSignerKey(key);
    if (key === "staff:staff") {
      setSignatureName(user?.name ?? "Staff-assisted");
      return;
    }
    const signer = signers.find((item) => `${item.type}:${item.id}` === key);
    setSignatureName(signer?.name ?? "");
  }

  function chooseAssistingStaff(staff: any) {
    setAssistingStaffId(String(staff.id));
    setSelectedSignerKey(`staff:${staff.id}`);
    setSignatureName(staff.name ?? "Staff-assisted");
    setPoints([]);
  }

  async function submitAttendance() {
    if (!selectedChild) return;
    const assistingStaff = (data?.staff ?? []).find((staff) => String(staff.id) === assistingStaffId);
    if (mode === "staff" && !assistingStaff) {
      Alert.alert("Assisting staff required", "Choose the staff member helping with this attendance action.");
      return;
    }
    if (mode === "staff" && assistingStaff?.classroomId && String(assistingStaff.classroomId) !== String(selectedChild.classroomId)) {
      Alert.alert("Classroom permission", "Selected staff can only assist their assigned classroom.");
      return;
    }
    if (selectedAction !== "absent" && mode !== "staff" && !selectedSigner) {
      Alert.alert("Authorized signer required", "Choose a parent, guardian, authorized pickup, or staff-assisted signer.");
      return;
    }
    if (selectedSigner && selectedSigner.type !== "staff" && !selectedSigner.can_pickup) {
      Alert.alert("Unauthorized pickup blocked", "This person is linked to the child but is not active for pickup signing.");
      return;
    }
    if (selectedAction !== "absent" && (!signatureName.trim() || points.length < 4)) {
      Alert.alert("Signature required", "Type the signer name and draw a signature before submitting.");
      return;
    }

    setSaving(true);
    try {
      if (selectedAction === "absent") {
        if (mode === "guardian") {
          Alert.alert("Not allowed", "Parent / guardian mode cannot mark absences.");
          return;
        }
        await mobileApi.markAbsent({ child_id: selectedChild.id, absence_date: data?.localDate ?? new Date().toISOString().slice(0, 10), absence_type: absenceType, reason: absenceReason.trim() || `Marked ${absenceLabel(absenceType).toLowerCase()} from tablet kiosk`, notes: absenceNotes.trim() || (assistingStaff ? `Tablet attendance flow. Assisting staff: ${assistingStaff.name}` : "Tablet attendance flow"), assisting_staff_id: assistingStaff?.id });
      } else {
        let pinVerificationId: number | undefined;
        if (verification === "pin") {
          const pinResponse = await mobileApi.verifyPin({ pin, purpose: "tablet_attendance" });
          pinVerificationId = pinResponse.pin_verification_id;
        }
        const effectiveSigner = mode === "staff" ? { id: assistingStaff.id, type: "staff", name: assistingStaff.name } : selectedSigner;
        const signerType = effectiveSigner.type === "authorized_pickup" ? "authorized_pickup" : effectiveSigner.type === "staff" ? "staff" : "guardian";
        const location = await deviceLocation();
        const payload: Record<string, unknown> = {
          child_id: selectedChild.id,
          signer_type: signerType,
          signer_name: effectiveSigner.name,
          verification_method: verification,
          signature_name: signatureName.trim(),
          signature_data: JSON.stringify({ points, box: signatureBox.current }),
          signature_reference: "tablet-drawn-signature",
          pin_verification_id: pinVerificationId,
          mode,
          ...location
        };
        if (effectiveSigner.type === "guardian") payload.guardian_id = effectiveSigner.id;
        if (effectiveSigner.type === "authorized_pickup") payload.pickup_authorization_id = effectiveSigner.id;
        if (mode === "staff") payload.assisting_staff_id = assistingStaff.id;
        if (selectedAction === "in") await mobileApi.guardianCheckIn(payload);
        else await mobileApi.guardianCheckOut({ ...payload, early_checkout: selectedAction === "early" });
      }
      setConfirmation({ child: selectedChild.name, action: actionLabels[selectedAction], time: formatAttendanceTime(new Date(), data?.timezone ?? DEFAULT_ATTENDANCE_TIMEZONE), actor: unlockedUser?.name ?? user?.name ?? "Actor", signer: assistingStaff?.name ?? selectedSigner?.name ?? unlockedUser?.name ?? "Signer", verification, absenceType: selectedAction === "absent" ? absenceLabel(absenceType) : undefined });
      setStep("confirm");
      const response = await mobileApi.tabletBootstrap(mode);
      setData(response);
    } catch (err) {
      Alert.alert("Attendance not saved", getApiError(err).message || "Check the child status, signer authorization, location permission, and verification method, then try again.");
    } finally {
      setSaving(false);
      setPin("");
    }
  }

  function startOver() {
    setStep("welcome");
    setSelectedClassroomId("");
    setSelectedChildId("");
    setSelectedAction("in");
    setSigners([]);
    setSelectedSignerKey("");
    setAssistingStaffId("");
    setSignatureName("");
    setAbsenceType("no_show");
    setAbsenceReason("");
    setAbsenceNotes("");
    setPoints([]);
    setConfirmation(null);
    setMessage("");
    setLoadError("");
  }

  function lockTablet() {
    startOver();
    setUnlocked(false);
    setUnlockedUser(null);
    setData(null);
    setPin("");
  }

  const isCompact = width < 760;
  const isNarrow = width < 520;
  const horizontalPadding = isNarrow ? 12 : isCompact ? 16 : 20;
  const contentWidth = Math.min(Math.max(width - (horizontalPadding * 2), 340), isCompact ? 860 : 1080);
  const modeLabel = mode === "guardian" ? "Parent / Guardian Mode" : mode === "staff" ? "Staff Mode" : "Admin Mode";
  const credentialPlaceholder = mode === "guardian" ? "Password or PIN" : mode === "staff" ? "Staff PIN" : "Admin/manager PIN";
  const emailPlaceholder = mode === "guardian" ? "Parent/guardian email" : mode === "staff" ? "Staff email" : "Admin or manager email";
  const unlockButton = mode === "guardian" ? "Continue as parent/guardian" : mode === "staff" ? "Continue as staff" : "Unlock admin mode";
  const visibleActions = (mode === "guardian" ? ["in", "out", "early"] : ["in", "out", "absent", "early"]) as Action[];
  const verificationOptions = mode === "guardian"
    ? [
        ["digital_signature", "Drawn signature", "Capture typed name and drawn signature."]
      ]
    : [
        ["secure_login", "Secure login", "Use the active tablet session."],
        ["pin", "PIN verification", "Confirm account PIN before saving."],
        ["digital_signature", "Drawn signature", "Capture typed name and drawn signature."]
      ];

  return (
    <SafeAreaView edges={["top", "bottom", "left", "right"]} style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.keyboard}>
      <View style={[styles.header, { width: contentWidth, marginTop: Math.max(8, insets.top ? 4 : 14), flexDirection: isCompact ? "column" : "row", alignItems: isCompact ? "stretch" : "center" }]}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>Barbaari Attendance</Text>
          <Text style={[styles.heading, { fontSize: isCompact ? 30 : 38 }]}>Tablet / Kiosk Mode</Text>
          <Text style={styles.detail}>{modeLabel}</Text>
        </View>
        <TouchableOpacity style={styles.startOver} onPress={unlocked ? lockTablet : startOver}><Ionicons name="refresh" size={18} color={colors.primary} /><Text style={styles.startOverText}>{unlocked ? "Lock tablet" : "Start over"}</Text></TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={[styles.content, { width: contentWidth, paddingBottom: Math.max(34, insets.bottom + 28) }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {message ? <Text style={styles.warning}>{message}</Text> : null}
        {loadError ? <Text style={styles.warning}>{loadError}</Text> : null}

        {step === "welcome" ? (
          <View style={styles.panel}>
            {!unlocked ? (
              <View style={styles.unlock}>
                <Text style={[styles.stepTitle, { fontSize: isCompact ? 28 : 34 }]}>Choose mode</Text>
                <View style={styles.grid}>
                  <Tile icon="people" active={mode === "guardian"} title="Parent / Guardian" detail="Linked children only, with drawn signer signature." onPress={() => { setMode("guardian"); setSelectedAction("in"); setVerification("digital_signature"); setPin(""); }} />
                  <Tile icon="school" active={mode === "staff"} title="Staff" detail="Assigned classroom attendance for teachers and staff." onPress={() => { setMode("staff"); setSelectedAction("in"); setVerification("digital_signature"); setPin(""); }} />
                  <Tile icon="settings" active={mode === "admin"} title="Admin" detail="Full organization tablet attendance controls." onPress={() => { setMode("admin"); setSelectedAction("in"); setVerification("digital_signature"); setPin(""); }} />
                </View>
                <Text style={styles.unlockedText}>{modeLabel}</Text>
                <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder={emailPlaceholder} autoCapitalize="none" keyboardType="email-address" />
                <TextInput style={styles.input} value={pin} onChangeText={setPin} placeholder={credentialPlaceholder} secureTextEntry />
                <Button onPress={unlockWithPin}>{saving ? "Unlocking..." : unlockButton}</Button>
              </View>
            ) : (
              <View style={styles.unlock}>
                <Text style={styles.unlockedText}>{modeLabel} unlocked by: {unlockedUser?.name ?? user?.name ?? "User"}</Text>
                <Button onPress={() => loadTabletData(mode)}>{saving ? "Loading..." : (data?.uses_classrooms === false || data?.facility_type === "family_child_care" ? "Continue to children" : "Continue to classrooms")}</Button>
              </View>
            )}
          </View>
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
            <Button onPress={() => setStep("child")}>Continue</Button>
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
                <Badge tone={statusFor(child, data.attendance, data.absences, data.localDate ?? "") === "checked in" ? "success" : "neutral"}>{statusFor(child, data.attendance, data.absences, data.localDate ?? "")}</Badge>
              </TouchableOpacity>)}
            </View>
          </View>
        ) : null}

        {step === "action" ? (
          <StepPanel title="Choose action">
            <View style={styles.grid}>
              {visibleActions.map((action) => <Tile key={action} color={actionTone[action]} active={selectedAction === action} title={actionLabels[action]} detail={action === "early" ? "Pickup before scheduled time." : action === "absent" ? "Record absence type and notes." : "Attendance operation."} onPress={() => setSelectedAction(action)} />)}
            </View>
            <Button onPress={() => setStep(selectedAction === "absent" && mode !== "staff" ? "verify" : "signer")}>Continue</Button>
          </StepPanel>
        ) : null}

        {step === "signer" ? (
          <StepPanel title="Select signer">
            <View style={styles.grid}>
              {mode === "staff"
                ? (data?.staff ?? []).filter((staff) => staff.status === "active").map((staff) => <Tile key={staff.id} active={assistingStaffId === String(staff.id)} title={staff.name} detail={`${staff.title ?? staff.role} - ${staff.classroom ?? "All classrooms"}`} onPress={() => chooseAssistingStaff(staff)} />)
                : signers.map((signer) => <Tile key={`${signer.type}:${signer.id}`} active={selectedSignerKey === `${signer.type}:${signer.id}`} title={signer.name} detail={`${signer.relationship ?? signer.type} - ${signer.can_pickup ? "Authorized" : "Blocked"}`} onPress={() => chooseSigner(`${signer.type}:${signer.id}`)} blocked={!signer.can_pickup} />)}
              {mode === "admin" ? <Tile active={selectedSignerKey === "staff:admin"} title="Admin/manager assisted" detail="Unlocked admin or manager records this action." onPress={() => { setSelectedSignerKey("staff:admin"); setSignatureName(unlockedUser?.name ?? "Admin-assisted"); }} /> : null}
            </View>
            <Button onPress={() => selectedSignerKey ? setStep("verify") : Alert.alert("Choose signer", mode === "staff" ? "Select the assisting staff member first." : "Select an authorized signer first.")}>Continue</Button>
          </StepPanel>
        ) : null}

        {step === "verify" ? (
          <StepPanel title="Verification">
            <View style={styles.grid}>
              {verificationOptions.map(([value, title, detail]) => <Tile key={value} active={verification === value} title={title} detail={detail} onPress={() => setVerification(value as typeof verification)} />)}
            </View>
            {verification === "pin" ? <TextInput style={styles.input} value={pin} onChangeText={setPin} placeholder="Staff PIN" secureTextEntry keyboardType="number-pad" /> : null}
            {selectedAction === "absent" ? <View style={styles.absenceBox}>
              <Text style={styles.tileTitle}>Absence type</Text>
              <View style={styles.grid}>{absenceTypes.map(([value, label]) => <Tile key={value} active={absenceType === value} title={label} detail="Save this type on the absence record." onPress={() => setAbsenceType(value)} />)}</View>
              <TextInput style={styles.input} value={absenceReason} onChangeText={setAbsenceReason} placeholder="Reason, e.g. parent reported child is sick" />
              <TextInput style={[styles.input, styles.notesInput]} value={absenceNotes} onChangeText={setAbsenceNotes} placeholder="Optional notes" multiline />
            </View> : null}
            <Button onPress={() => selectedAction === "absent" ? submitAttendance() : setStep("signature")}>{selectedAction === "absent" ? "Submit absence" : "Continue"}</Button>
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
              <Button variant="outline" onPress={() => setPoints([])}>Clear signature</Button>
              <Button onPress={submitAttendance}>{saving ? "Saving..." : "Submit"}</Button>
            </View>
          </StepPanel>
        ) : null}

        {step === "confirm" && confirmation ? (
          <View style={styles.panel}>
            <Ionicons name="checkmark-circle" size={64} color={colors.success} />
            <Text style={[styles.stepTitle, { fontSize: isCompact ? 28 : 34 }]}>Attendance saved</Text>
            <Text style={styles.confirmLine}>{confirmation.child}</Text>
            <Text style={styles.detail}>{confirmation.action} at {confirmation.time}</Text>
            <Text style={styles.detail}>Actor: {confirmation.actor}</Text>
            <Text style={styles.detail}>Signer: {confirmation.signer}</Text>
            {confirmation.absenceType ? <Text style={styles.detail}>Absence type: {confirmation.absenceType}</Text> : null}
            <Text style={styles.detail}>Verification: {String(confirmation.verification).replace("_", " ")}</Text>
            <Button onPress={startOver}>Start another attendance action</Button>
          </View>
        ) : null}
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function StepPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.panel}><Text style={styles.stepTitle}>{title}</Text>{children}</View>;
}

function Tile({ title, detail, active, blocked, icon, color, onPress }: { title: string; detail: string; active?: boolean; blocked?: boolean; icon?: keyof typeof Ionicons.glyphMap; color?: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.tile, active && styles.tileActive, blocked && styles.tileBlocked]} onPress={onPress}>
      {icon ? <View style={[styles.tileIcon, { backgroundColor: active ? colors.primary : color ?? colors.cardStrong }]}><Ionicons name={icon} size={24} color={active ? colors.white : colors.primary} /></View> : null}
      {color && !icon ? <View style={[styles.colorBar, { backgroundColor: color }]} /> : null}
      <Text style={styles.tileTitle}>{title}</Text>
      <Text style={styles.detail}>{detail}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F3FBFD" },
  keyboard: { flex: 1, alignItems: "center", backgroundColor: "#F3FBFD" },
  header: { paddingHorizontal: 22, paddingTop: 20, paddingBottom: 18, borderRadius: 28, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, justifyContent: "space-between", gap: 16, shadowColor: colors.primary, shadowOpacity: 0.12, shadowRadius: 24, shadowOffset: { width: 0, height: 10 } },
  headerCopy: { minWidth: 0 },
  eyebrow: { color: colors.primary, fontWeight: "900", textTransform: "uppercase" },
  heading: { color: "#0E2A33", fontSize: 38, fontWeight: "900" },
  startOver: { minHeight: 48, paddingHorizontal: 16, borderRadius: 999, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", justifyContent: "center", alignSelf: "flex-start", gap: 8 },
  startOverText: { color: colors.primary, fontWeight: "900" },
  content: { gap: 18, paddingTop: 18, paddingBottom: 32 },
  panel: { gap: 20, padding: 22, borderRadius: 30, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, shadowColor: colors.primary, shadowOpacity: 0.12, shadowRadius: 24, shadowOffset: { width: 0, height: 12 } },
  stepTitle: { color: "#0E2A33", fontSize: 34, fontWeight: "900" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  tile: { flexGrow: 1, flexShrink: 1, flexBasis: 230, minWidth: 0, minHeight: 122, justifyContent: "center", gap: 8, padding: 18, borderRadius: 24, backgroundColor: colors.white, borderWidth: 2, borderColor: colors.border, shadowColor: "#0E2A33", shadowOpacity: 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: 8 } },
  tileActive: { borderColor: colors.primary, backgroundColor: "#E9F7F9" },
  tileBlocked: { opacity: 0.55 },
  tileIcon: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  colorBar: { width: 42, height: 7, borderRadius: 999, marginBottom: 4 },
  tileTitle: { color: "#0E2A33", fontSize: 20, fontWeight: "900", flexShrink: 1 },
  detail: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  unlock: { gap: 14 },
  input: { minHeight: 58, paddingHorizontal: 16, borderRadius: 18, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, color: colors.text, fontSize: 18, fontWeight: "800" },
  notesInput: { minHeight: 104, paddingTop: 16, textAlignVertical: "top" },
  warning: { padding: 14, borderRadius: 18, backgroundColor: "#FFF4CA", color: "#9A6A09", fontWeight: "900" },
  unlockedText: { padding: 14, borderRadius: 18, backgroundColor: "#DCF6EB", color: colors.success, fontSize: 18, fontWeight: "900" },
  childGrid: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  childCard: { flexGrow: 1, flexShrink: 1, flexBasis: 280, minWidth: 0, minHeight: 190, gap: 8, padding: 20, borderRadius: 24, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, shadowColor: "#0E2A33", shadowOpacity: 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: 8 } },
  childName: { color: "#0E2A33", fontSize: 23, fontWeight: "900" },
  absenceBox: { gap: 14, padding: 16, borderRadius: 22, backgroundColor: "#FFF9DD", borderWidth: 1, borderColor: "#F4DF8B" },
  signatureBox: { height: 300, borderRadius: 24, borderWidth: 2, borderStyle: "dashed", borderColor: colors.primary, backgroundColor: colors.white, overflow: "hidden" },
  signatureDot: { position: "absolute", width: 7, height: 7, borderRadius: 4, backgroundColor: colors.text },
  signatureHint: { position: "absolute", alignSelf: "center", top: 120, color: colors.muted, fontSize: 20, fontWeight: "900" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "flex-end", alignItems: "center" },
  confirmLine: { color: "#0E2A33", fontSize: 24, fontWeight: "900" }
});
