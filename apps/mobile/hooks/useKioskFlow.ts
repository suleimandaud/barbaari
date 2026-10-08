import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, PanResponder } from "react-native";
import { DEFAULT_ATTENDANCE_TIMEZONE, formatAttendanceTime, getApiError } from "@barbaari/shared";
import { useMobileSession } from "./useMobileSession";
import { unlockTablet, unlockTabletForRole } from "../services/auth";
import { mobileApi } from "../services/mobileApi";
import type { MobileUser } from "../services/auth";
import {
  absenceLabel, actionLabels, actionsForStatus, assertOnline, deviceLocation, isSubscriptionRequiredError, statusFor,
  type AbsenceType, type Action, type ChildStatus, type Point, type Step
} from "../services/kioskLogic";

export type KioskNotify = (title: string, message?: string) => void;

/**
 * The tablet/kiosk attendance state machine, shared by the phone kiosk layout and the
 * tablet layout so both run the exact same unlock, bootstrap, signer PIN, location,
 * online and submission logic. Moved verbatim from app/kiosk.tsx; the only seam added is
 * `notify` (defaults to Alert.alert) so the tablet layout can show errors inline.
 */
export function useKioskFlow(notify: KioskNotify = (title, message) => Alert.alert(title, message)) {
  const { user, refresh } = useMobileSession();
  const [step, setStep] = useState<Step>("welcome");
  const [mode, setMode] = useState<"staff" | "admin">("admin");
  const [email, setEmail] = useState(user?.email ?? "");
  const [pin, setPin] = useState("");
  const [pinVerificationId, setPinVerificationId] = useState<number | undefined>();
  const [unlocked, setUnlocked] = useState(false);
  const [unlockedUser, setUnlockedUser] = useState<MobileUser | null>(null);
  const [data, setData] = useState<{ children: any[]; classrooms: any[]; attendance: any[]; absences: any[]; staff?: any[]; timezone?: string; localDate?: string; scopeLabel?: string; facility_type?: string; facilityType?: string; uses_classrooms?: boolean } | null>(null);
  const [selectedClassroomId, setSelectedClassroomId] = useState("");
  // "" is a valid, deliberate choice (the "All classrooms" tile), so it can't double as
  // "no choice made yet" — this tracks whether the classroom step has been passed at
  // least once this unlocked session, so auto-reset knows to skip straight to the
  // children list instead of re-prompting for a classroom after every single child.
  const [classroomScopeChosen, setClassroomScopeChosen] = useState(false);
  const [selectedChildId, setSelectedChildId] = useState("");
  const [selectedAction, setSelectedAction] = useState<Action>("in");
  const [signers, setSigners] = useState<any[]>([]);
  const [selectedSignerKey, setSelectedSignerKey] = useState("");
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
    return signers.find((signer) => `${signer.type}:${signer.id}` === selectedSignerKey);
  }, [selectedSignerKey, signers]);

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

  // Separate from the 5s post-success reset above: a mid-flow idle tablet (someone walks
  // away while a child/signer/PIN entry/signature is on screen) must not sit there
  // indefinitely showing that child's and signer's information. Any interaction with the
  // tracked fields below restarts the clock; only these steps carry sensitive per-child
  // state worth guarding, so "welcome"/"classroom"/"subscription" are exempt.
  useEffect(() => {
    const sensitiveSteps: Step[] = ["action", "signer", "verify", "signature"];
    if (!sensitiveSteps.includes(step)) return;
    const timer = setTimeout(() => startOver(), 90000);
    return () => clearTimeout(timer);
  }, [step, selectedChildId, selectedAction, selectedSignerKey, pin, signatureName, points.length, absenceType, absenceReason, absenceNotes]);

  async function loadTabletData(selectedMode = mode) {
    setSaving(true);
    setMessage("");
    setLoadError("");
    try {
      const response = await mobileApi.tabletBootstrap(selectedMode);
      const usesClassrooms = response.uses_classrooms !== false && response.facility_type !== "family_child_care" && response.facilityType !== "family_child_care";
      if (!response.children.length) {
        setData(response);
        setLoadError("No children are available for this account.");
        return;
      }
      setData(response);
      setStep(usesClassrooms ? "classroom" : "child");
    } catch (err) {
      // Every tablet call is behind EnsureActiveSubscription, so a 402 here can happen
      // even after a successful unlock (e.g. the org's subscription lapses mid-session,
      // or a retry after unlock). Never cache past this — re-check on every call, every
      // time, and never let stale local state imply access that the backend just revoked.
      if (isSubscriptionRequiredError(err)) {
        setStep("subscription");
        return;
      }
      setLoadError("Could not load attendance tablet records. Check backend connection or account permissions.");
      setStep("welcome");
    } finally {
      setSaving(false);
    }
  }

  // `roleMode` (tablet layout): let the backend choose staff/admin mode from the account's
  // role instead of the locally selected `mode`. The phone layout calls this with no options.
  async function unlockWithPin(options: { roleMode?: boolean } = {}) {
    if (!email.trim() || !pin.trim()) {
      notify("Unlock required", mode === "staff" ? "Enter staff email and PIN." : "Enter admin or manager email and PIN or password.");
      return;
    }
    setSaving(true);
    setMessage("");
    setLoadError("");
    try {
      const response = options.roleMode ? await unlockTabletForRole(email.trim(), pin.trim()) : await unlockTablet(mode, email.trim(), pin.trim());
      const unlockedMode: "staff" | "admin" = options.roleMode ? (response.mode === "staff" ? "staff" : "admin") : mode;
      if (options.roleMode) setMode(unlockedMode);
      setUnlockedUser(response.user);
      setUnlocked(true);
      setPin("");
      await refresh();
      await loadTabletData(unlockedMode);
    } catch (err) {
      if (isSubscriptionRequiredError(err)) {
        setStep("subscription");
        return;
      }
      const apiError = getApiError(err);
      const formMessage = apiError.errors?.pin?.[0] ?? apiError.errors?.password_or_pin?.[0] ?? apiError.errors?.guardian?.[0] ?? apiError.errors?.email?.[0];
      notify("Unlock failed", formMessage ?? apiError.message ?? "The selected mode credentials were not accepted.");
    } finally {
      setSaving(false);
    }
  }

  async function selectChild(child: any) {
    setSelectedChildId(String(child.id));
    setSaving(true);
    try {
      const response = await mobileApi.tabletSigners(child.id);
      setSigners(response.signers ?? []);
      setSelectedSignerKey("");
      setSignatureName("");
      setPoints([]);
      const status = statusFor(child, data?.attendance ?? [], data?.absences ?? [], data?.localDate ?? "");
      const allowed = actionsForStatus(status);
      setSelectedAction(allowed[0] ?? "in");
      setStep("action");
    } catch (err) {
      if (isSubscriptionRequiredError(err)) {
        setStep("subscription");
        return;
      }
      notify("Could not load signers", "Authorized guardians and pickup people could not be loaded.");
    } finally {
      setSaving(false);
    }
  }

  function addPoint(x: number, y: number) {
    setPoints((existing) => [...existing.slice(-180), { x, y }]);
  }

  function chooseSigner(key: string) {
    setSelectedSignerKey(key);
    const signer = signers.find((item) => `${item.type}:${item.id}` === key);
    setSignatureName(signer?.name ?? "");
  }

  async function verifySelectedSignerPin() {
    if (!selectedChild || !selectedSigner) return;
    if (!selectedSigner.pin_configured) {
      notify("PIN missing", "This signer does not have a tablet PIN yet. Please set a PIN first.");
      return;
    }
    if (!pin.trim()) {
      notify("Signer PIN required", "Enter the selected signer's tablet PIN.");
      return;
    }
    setSaving(true);
    try {
      const response = await mobileApi.verifySignerPin({
        child_id: selectedChild.id,
        signer_type: selectedSigner.type,
        signer_id: selectedSigner.id,
        pin: pin.trim()
      });
      setPinVerificationId(response.pin_verification_id);
      setSignatureName(selectedSigner.name ?? "");
      setPin("");
      setStep("signature");
    } catch (err) {
      if (isSubscriptionRequiredError(err)) {
        setStep("subscription");
        return;
      }
      notify("PIN not verified", getApiError(err).message || "Incorrect signer PIN.");
    } finally {
      setSaving(false);
    }
  }

  async function submitAttendance() {
    if (!selectedChild) return;
    if (!selectedSigner) {
      notify("Authorized signer required", "Choose a linked guardian, assigned staff member, or owner/admin signer.");
      return;
    }
    if (!pinVerificationId) {
      notify("Signer PIN required", "Verify the selected signer PIN before capturing the signature.");
      return;
    }
    if (selectedSigner && selectedSigner.type !== "staff" && !selectedSigner.can_pickup) {
      notify("Unauthorized pickup blocked", "This person is linked to the child but is not active for pickup signing.");
      return;
    }
    if (!signatureName.trim() || points.length < 4) {
      notify("Signature required", "Type the signer name and draw a signature before submitting.");
      return;
    }

    setSaving(true);
    try {
      // Checked before anything else — GPS/PIN verification succeeding while offline
      // would just fail confusingly at the final save. Never queue and retry later: a
      // queued-then-replayed attendance write risks a duplicate or a stale-location save,
      // exactly what the backend's idempotency/geofence checks exist to prevent.
      await assertOnline();
      if (selectedAction === "absent") {
        // The backend requires device location for tablet absence records too (same
        // geofence rule as check-in/out; the web tablet portal already sends it). Without
        // it every kiosk absence was rejected with 422 "Device location is required".
        const location = await deviceLocation();
        await mobileApi.markAbsent({ ...location, child_id: selectedChild.id, absence_date: data?.localDate ?? new Date().toISOString().slice(0, 10), absence_type: absenceType, reason: absenceReason.trim() || `Marked ${absenceLabel(absenceType).toLowerCase()} from tablet kiosk`, notes: absenceNotes.trim() || "Tablet attendance flow", signer_type: selectedSigner.type === "guardian" ? "guardian" : "staff", guardian_id: selectedSigner.type === "guardian" ? selectedSigner.id : undefined, assisting_staff_id: selectedSigner.type === "staff" || selectedSigner.type === "admin" ? selectedSigner.id : undefined, signer_name: selectedSigner.name, verification_method: "pin", pin_verification_id: pinVerificationId, signature_name: signatureName.trim() });
      } else {
        const effectiveSigner = selectedSigner;
        const signerType = effectiveSigner.type === "authorized_pickup" ? "authorized_pickup" : (effectiveSigner.type === "staff" || effectiveSigner.type === "admin") ? "staff" : "guardian";
        const location = await deviceLocation();
        const payload: Record<string, unknown> = {
          child_id: selectedChild.id,
          signer_type: signerType,
          signer_name: effectiveSigner.name,
          verification_method: "pin",
          signature_name: signatureName.trim(),
          signature_data: JSON.stringify({ points, box: signatureBox.current }),
          signature_reference: "tablet-drawn-signature",
          pin_verification_id: pinVerificationId,
          mode,
          ...location
        };
        if (effectiveSigner.type === "guardian") payload.guardian_id = effectiveSigner.id;
        if (effectiveSigner.type === "authorized_pickup") payload.pickup_authorization_id = effectiveSigner.id;
        if (effectiveSigner.type === "staff" || effectiveSigner.type === "admin") payload.assisting_staff_id = effectiveSigner.id;
        if (selectedAction === "in") await mobileApi.guardianCheckIn(payload);
        else await mobileApi.guardianCheckOut(payload);
      }
      setConfirmation({ child: selectedChild.name, action: actionLabels[selectedAction], at: new Date().toISOString(), time: formatAttendanceTime(new Date(), data?.timezone ?? DEFAULT_ATTENDANCE_TIMEZONE), actor: unlockedUser?.name ?? user?.name ?? "Actor", signer: selectedSigner?.name ?? "Signer", verification: "pin + signature", absenceType: selectedAction === "absent" ? absenceLabel(absenceType) : undefined });
      setStep("confirm");
      const response = await mobileApi.tabletBootstrap(mode);
      setData(response);
    } catch (err) {
      if (isSubscriptionRequiredError(err)) {
        setStep("subscription");
        return;
      }
      notify("Attendance not saved", getApiError(err).message || "Check the child status, signer authorization, location permission, and verification method, then try again.");
    } finally {
      setSaving(false);
      setPin("");
    }
  }

  function startOver() {
    // Return to the children list, per spec — not the classroom list and not the unlock
    // screen. A classroom already selected this session stays selected (re-picking a
    // classroom after every single child would be a poor kiosk experience for a teacher
    // working through their whole room); the tablet stays unlocked between actions, only
    // "Lock tablet" (below) ends the unlocked session.
    const usesClassrooms = unlocked && data && data.uses_classrooms !== false && data.facility_type !== "family_child_care" && data.facilityType !== "family_child_care";
    setStep(unlocked && data ? (usesClassrooms && !classroomScopeChosen ? "classroom" : "child") : "welcome");
    setSelectedChildId("");
    setSelectedAction("in");
    setSigners([]);
    setSelectedSignerKey("");
    setPinVerificationId(undefined);
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
    setStep("welcome");
    setSelectedClassroomId("");
    setClassroomScopeChosen(false);
    setUnlocked(false);
    setUnlockedUser(null);
    setData(null);
    setPin("");
  }


  const selectedChildStatus: ChildStatus | null = selectedChild && data
    ? statusFor(selectedChild, data.attendance, data.absences, data.localDate ?? "")
    : null;
  const visibleActions = selectedChildStatus ? actionsForStatus(selectedChildStatus) : [];

  return {
    step,
    setStep,
    mode,
    setMode,
    email,
    setEmail,
    pin,
    setPin,
    pinVerificationId,
    setPinVerificationId,
    unlocked,
    setUnlocked,
    unlockedUser,
    setUnlockedUser,
    data,
    setData,
    selectedClassroomId,
    setSelectedClassroomId,
    classroomScopeChosen,
    setClassroomScopeChosen,
    selectedChildId,
    setSelectedChildId,
    selectedAction,
    setSelectedAction,
    signers,
    setSigners,
    selectedSignerKey,
    setSelectedSignerKey,
    signatureName,
    setSignatureName,
    absenceType,
    setAbsenceType,
    absenceReason,
    setAbsenceReason,
    absenceNotes,
    setAbsenceNotes,
    points,
    setPoints,
    saving,
    setSaving,
    message,
    setMessage,
    loadError,
    setLoadError,
    confirmation,
    setConfirmation,
    signatureBox,
    panResponder,
    selectedChild,
    selectedSigner,
    classroomChildren,
    user,
    refresh,
    loadTabletData,
    unlockWithPin,
    selectChild,
    addPoint,
    chooseSigner,
    verifySelectedSignerPin,
    submitAttendance,
    startOver,
    lockTablet,
    selectedChildStatus,
    visibleActions
  };
}

export type KioskFlow = ReturnType<typeof useKioskFlow>;
