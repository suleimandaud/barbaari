import { useMemo, useState } from "react";
import { authApi, getApiError, tabletApi } from "@barbaari/shared";
import { ErrorAlert, SuccessAlert } from "../components/Alerts";
import { Badge } from "../components/Status";
import { useOnlineStatus } from "../hooks/useOnlineStatus";

type Mode = "guardian" | "staff" | "admin";
type Action = "check_in" | "check_out" | "absence";
type Step = "unlock" | "classroom" | "child" | "action" | "signer" | "pin" | "signature" | "confirmation";

const absenceTypes = [
  ["excused", "Excused"],
  ["unexcused", "Unexcused"],
  ["sick", "Sick"],
  ["vacation", "Vacation"],
  ["no_show", "No-show"],
  ["other", "Other"]
] as const;

function geolocationErrorMessage(error: GeolocationPositionError): string {
  // A GPS timeout or hardware-unavailable reading is common (weak signal indoors) and
  // should not be reported the same as an actual permission denial — that sends staff
  // hunting through permission settings that are already fine.
  if (error.code === error.PERMISSION_DENIED) return "Location access is blocked for this browser. Please allow location access and try again.";
  if (error.code === error.POSITION_UNAVAILABLE) return "This device could not determine its location. Please try again or move to an area with a clearer signal.";
  if (error.code === error.TIMEOUT) return "Getting your location took too long. Please try again.";
  return "We could not determine your location. Please try again.";
}

function browserLocation(): Promise<{ latitude: number; longitude: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("This browser cannot provide device location."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      (error) => reject(new Error(geolocationErrorMessage(error))),
      { timeout: 8000, maximumAge: 30000, enableHighAccuracy: true }
    );
  });
}

function actionLabel(action?: Action) {
  if (action === "check_in") return "Check-in";
  if (action === "check_out") return "Check-out";
  if (action === "absence") return "Absence";
  return "Attendance";
}

function modeLabel(mode?: Mode) {
  if (mode === "guardian") return "Parent / Guardian";
  if (mode === "staff") return "Staff";
  if (mode === "admin") return "Admin";
  return "Tablet";
}

export function TabletPortalPage() {
  const isOnline = useOnlineStatus();
  const [mode, setMode] = useState<Mode | undefined>();
  const [email, setEmail] = useState("");
  const [credential, setCredential] = useState("");
  const [session, setSession] = useState<any | null>(null);
  const [data, setData] = useState<any | null>(null);
  const [step, setStep] = useState<Step>("unlock");
  const [classroomId, setClassroomId] = useState("");
  const [childId, setChildId] = useState("");
  const [selectedAction, setSelectedAction] = useState<Action | undefined>();
  const [signerId, setSignerId] = useState("");
  const [signers, setSigners] = useState<any[]>([]);
  const [pin, setPin] = useState("");
  const [pinVerificationId, setPinVerificationId] = useState<number | undefined>();
  const [signatureName, setSignatureName] = useState("");
  const [absenceType, setAbsenceType] = useState("no_show");
  const [absenceReason, setAbsenceReason] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const usesClassrooms = Boolean(data?.uses_classrooms);
  const selectedChild = useMemo(() => (data?.children ?? []).find((child: any) => String(child.id) === String(childId)), [data, childId]);
  const selectedSigner = useMemo(() => signers.find((signer) => String(signer.id) === String(signerId)), [signers, signerId]);
  const visibleChildren = useMemo(() => {
    const children = data?.children ?? [];
    if (!usesClassrooms) return children;
    return children.filter((child: any) => String(child.classroomId ?? "") === String(classroomId));
  }, [data, usesClassrooms, classroomId]);

  async function reloadBootstrap(nextMode = mode) {
    const bootstrap = await tabletApi.bootstrap(nextMode);
    setData(bootstrap);
    return bootstrap;
  }

  async function unlock() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await authApi.tabletUnlock({ email, password_or_pin: credential, purpose: "tablet_attendance" });
      const nextMode = response.mode as Mode;
      const bootstrap = await tabletApi.bootstrap(nextMode);
      setMode(nextMode);
      setSession(response);
      setData(bootstrap);
      setClassroomId("");
      setChildId("");
      setSignerId("");
      setSelectedAction(undefined);
      setStep(bootstrap.uses_classrooms ? "classroom" : "child");
      setMessage(`Unlocked ${modeLabel(nextMode)} attendance for ${response.user?.organization?.name ?? "organization"}.`);
    } catch (err) {
      const apiError = getApiError(err);
      setError(apiError.status === 402 ? "This organization is not subscribed/active. Please contact the administrator." : apiError.message);
    } finally {
      setSaving(false);
    }
  }

  function chooseChild(child: any) {
    setChildId(child.id);
    setSelectedAction(undefined);
    setSigners([]);
    setSignerId("");
    setPin("");
    setPinVerificationId(undefined);
    setSignatureName("");
    setStep("action");
  }

  async function chooseAction(action: Action) {
    if (!selectedChild) return;
    setSaving(true);
    setError("");
    setSelectedAction(action);
    setSignerId("");
    setPin("");
    setPinVerificationId(undefined);
    setSignatureName("");
    try {
      const response = await tabletApi.signers(selectedChild.id);
      const nextSigners = response.signers ?? [];
      setSigners(nextSigners);
      setStep("signer");
      if (nextSigners.length === 0) setError("No authorized signers are available for this child.");
    } catch (err) {
      setError(getApiError(err).message);
    } finally {
      setSaving(false);
    }
  }

  function continueToPin(signer: any) {
    setError("");
    if (!signer?.pin_configured) {
      setError("This signer does not have a tablet PIN yet. Please set a PIN first.");
      return;
    }
    setPin("");
    setPinVerificationId(undefined);
    setStep("pin");
  }

  async function verifyPin() {
    if (!selectedChild || !selectedSigner) return;
    setSaving(true);
    setError("");
    try {
      const response = await tabletApi.verifySignerPin({
        child_id: selectedChild.id,
        signer_type: selectedSigner.type,
        signer_id: selectedSigner.id,
        pin
      });
      setPinVerificationId(response.pin_verification_id);
      setSignatureName(selectedSigner.name ?? "");
      setStep("signature");
    } catch (err) {
      setError(getApiError(err).message);
    } finally {
      setSaving(false);
    }
  }

  function attendanceSignerPayload() {
    const signerType = selectedSigner?.type === "guardian" ? "guardian" : "staff";
    return {
      signer_type: signerType,
      signer_name: selectedSigner?.name,
      guardian_id: selectedSigner?.type === "guardian" ? selectedSigner.id : undefined,
      assisting_staff_id: selectedSigner?.type === "staff" || selectedSigner?.type === "admin" ? selectedSigner.id : undefined
    };
  }

  async function submitAction() {
    if (!selectedChild || !selectedAction || !selectedSigner || !pinVerificationId) return;
    setSaving(true);
    setError("");
    setMessage("");
    if (!isOnline) {
      setError("You're offline. Please reconnect before saving attendance.");
      setSaving(false);
      return;
    }
    try {
      const signerPayload = attendanceSignerPayload();
      const location = await browserLocation();
      if (selectedAction === "absence") {
        await tabletApi.markAbsent({
          child_id: selectedChild.id,
          absence_date: data?.localDate ?? new Date().toISOString().slice(0, 10),
          absence_type: absenceType,
          reason: absenceReason || "Marked absent from tablet portal",
          notes: absenceReason || undefined,
          verification_method: "pin",
          pin_verification_id: pinVerificationId,
          signature_name: signatureName,
          ...signerPayload,
          ...location
        });
      } else {
        const payload: Record<string, unknown> = {
          child_id: selectedChild.id,
          verification_method: "pin",
          pin_verification_id: pinVerificationId,
          signature_name: signatureName,
          signature_reference: "tablet-web-signature",
          ...signerPayload,
          ...location
        };
        if (selectedAction === "check_in") await tabletApi.guardianCheckIn(payload);
        else await tabletApi.guardianCheckOut(payload);
      }
      await reloadBootstrap(mode);
      setMessage(`${selectedChild.name} ${actionLabel(selectedAction).toLowerCase()} saved with ${selectedSigner.name}'s PIN and signature.`);
      setStep("confirmation");
    } catch (err) {
      setError(getApiError(err).message);
    } finally {
      setSaving(false);
    }
  }

  function reset(lock = false) {
    setError("");
    setMessage("");
    setChildId("");
    setSignerId("");
    setSigners([]);
    setPin("");
    setPinVerificationId(undefined);
    setSignatureName("");
    setSelectedAction(undefined);
    if (lock) {
      setSession(null);
      setData(null);
      setEmail("");
      setCredential("");
      setMode(undefined);
      setStep("unlock");
      return;
    }
    setStep(data?.uses_classrooms ? "classroom" : "child");
  }

  return (
    <main className="tablet-portal">
      <section className="tablet-shell">
        <header className="tablet-header">
          <div>
            <span>Barbaari Attendance</span>
            <h1>{data?.organization?.name ?? session?.user?.organization?.name ?? "Tablet / Kiosk"}</h1>
            <p>{data ? `${data.facility_type === "family_child_care" ? "Family Child Care" : "Center Daycare"} · ${modeLabel(mode)} · ${data.scopeLabel}` : "Unlock this provider account before attendance records load."}</p>
          </div>
          {session ? <button className="secondary" onClick={() => reset(true)}>Lock tablet</button> : null}
        </header>

        {!isOnline ? <div className="alert-banner warning">You're offline. Attendance actions require a connection — reconnect before checking children in or out.</div> : null}
        <SuccessAlert message={message} />
        <ErrorAlert message={error} />

        {step === "unlock" ? (
          <section className="kiosk-card">
            <h2>Unlock tablet</h2>
            <p className="muted">Enter an active provider staff, teacher, owner, or admin account. Guardians are selected later as attendance signers and verify with their tablet PIN.</p>
            <div className="form-grid two">
              <label className="field-stack"><span>Email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
              <label className="field-stack"><span>Password or tablet PIN</span><input type="password" value={credential} onChange={(event) => setCredential(event.target.value)} /></label>
              <button className="primary full" disabled={saving || !email || !credential} onClick={unlock}>{saving ? "Unlocking..." : "Unlock tablet"}</button>
            </div>
          </section>
        ) : null}

        {step === "classroom" && data ? (
          <section className="kiosk-card">
            <h2>Select classroom</h2>
            <div className="kiosk-choice-grid">
              {(data.classrooms ?? []).map((room: any) => (
                <button key={room.id} className="kiosk-choice" onClick={() => { setClassroomId(String(room.id)); setStep("child"); }}>
                  {room.name}
                  <small>{room.children_count ?? room.childrenCount ?? 0} visible children</small>
                </button>
              ))}
            </div>
            {(data.classrooms ?? []).length === 0 ? <p className="muted">No classrooms are available for this account.</p> : null}
          </section>
        ) : null}

        {step === "child" && data ? (
          <section className="kiosk-card">
            <h2>Select child</h2>
            {!usesClassrooms ? <Badge>Family child care: start from children</Badge> : null}
            <div className="kiosk-choice-grid children">
              {visibleChildren.map((child: any) => (
                <button key={child.id} className="kiosk-choice" onClick={() => chooseChild(child)}>
                  {child.name}
                  <small>{child.childCode ?? child.child_code} · {child.classroom ?? "Family child care"} · {child.attendanceStatus}</small>
                </button>
              ))}
            </div>
            {visibleChildren.length === 0 ? <p className="muted">No children are visible for this tablet account.</p> : null}
            <div className="kiosk-actions">{usesClassrooms ? <button className="secondary" onClick={() => setStep("classroom")}>Back to classrooms</button> : null}</div>
          </section>
        ) : null}

        {step === "action" && selectedChild ? (
          <section className="kiosk-card">
            <h2>{selectedChild.name}</h2>
            <p className="muted">{selectedChild.childCode ?? selectedChild.child_code} · {selectedChild.classroom ?? "Family child care"} · {selectedChild.attendanceStatus}</p>
            <div className="kiosk-choice-grid">
              <button className="kiosk-choice selected" disabled={saving} onClick={() => chooseAction("check_in")}>Check-in<small>Verify signer PIN, capture signature, then save.</small></button>
              <button className="kiosk-choice" disabled={saving} onClick={() => chooseAction("check_out")}>Check-out<small>Verify signer PIN, capture signature, then save.</small></button>
              <button className="kiosk-choice" disabled={saving} onClick={() => chooseAction("absence")}>Absence<small>Record absence type with signer PIN and signature.</small></button>
            </div>
            <div className="kiosk-actions"><button className="secondary" onClick={() => setStep("child")}>Back to children</button></div>
          </section>
        ) : null}

        {step === "signer" && selectedChild ? (
          <section className="kiosk-card">
            <h2>Select signer</h2>
            <p className="muted">{actionLabel(selectedAction)} for {selectedChild.name}</p>
            <div className="kiosk-choice-grid">
              {signers.map((signer) => (
                <button key={`${signer.type}-${signer.id}`} className={`kiosk-choice ${String(signerId) === String(signer.id) ? "selected" : ""}`} onClick={() => { setSignerId(String(signer.id)); continueToPin(signer); }}>
                  {signer.name}
                  <small>{signer.relationship ?? signer.type} · {signer.pin_configured ? "PIN configured" : "PIN missing"}</small>
                </button>
              ))}
            </div>
            {signers.length === 0 ? <p className="muted">No authorized signers are available for this child.</p> : null}
            <div className="kiosk-actions"><button className="secondary" onClick={() => setStep("action")}>Back to actions</button></div>
          </section>
        ) : null}

        {step === "pin" && selectedChild && selectedSigner ? (
          <section className="kiosk-card">
            <h2>Enter signer PIN</h2>
            <p className="muted">{selectedSigner.name} is signing {actionLabel(selectedAction).toLowerCase()} for {selectedChild.name}.</p>
            <label className="kiosk-input"><span>Signer PIN</span><input type="password" inputMode="numeric" value={pin} onChange={(event) => setPin(event.target.value)} /></label>
            <div className="kiosk-actions">
              <button className="secondary" onClick={() => setStep("signer")}>Back to signers</button>
              <button className="primary" disabled={saving || !pin} onClick={verifyPin}>{saving ? "Verifying..." : "Verify PIN"}</button>
            </div>
          </section>
        ) : null}

        {step === "signature" && selectedChild && selectedSigner ? (
          <section className="kiosk-card">
            <h2>Capture signature</h2>
            <p className="muted">{selectedSigner.name} confirmed by PIN. Signature is required before saving {actionLabel(selectedAction).toLowerCase()}.</p>
            {selectedAction === "absence" ? (
              <div className="form-grid two">
                <label className="field-stack"><span>Absence type</span><select value={absenceType} onChange={(event) => setAbsenceType(event.target.value)}>{absenceTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label className="field-stack"><span>Reason optional</span><input value={absenceReason} onChange={(event) => setAbsenceReason(event.target.value)} /></label>
              </div>
            ) : null}
            <div className="signature-pad">
              <div>
                <strong>{selectedChild.name}</strong>
                <span>{actionLabel(selectedAction)}</span>
              </div>
              <label className="kiosk-input"><span>Signer name / signature</span><input value={signatureName} onChange={(event) => setSignatureName(event.target.value)} /></label>
            </div>
            <div className="kiosk-actions">
              <button className="secondary" onClick={() => setStep("pin")}>Back to PIN</button>
              <button className="primary" disabled={saving || !signatureName} onClick={submitAction}>{saving ? "Saving..." : "Submit attendance"}</button>
            </div>
          </section>
        ) : null}

        {step === "confirmation" ? (
          <section className="kiosk-card confirmation">
            <h2>Done</h2>
            <p>{message}</p>
            <button className="primary" onClick={() => reset(false)}>Start new action</button>
          </section>
        ) : null}
      </section>
    </main>
  );
}
