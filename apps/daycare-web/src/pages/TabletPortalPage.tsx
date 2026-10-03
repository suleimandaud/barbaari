import { useMemo, useState } from "react";
import { ArrowLeft, Check, CheckSquare, IdentificationBadge, LockSimple, MinusCircle, SignIn, SignOut } from "@phosphor-icons/react";
import { authApi, getApiError, tabletApi } from "@barbaari/shared";
import { Alert, Avatar, EmptyState, Field, LogoTile, PasswordInput, PinPad, SearchInput, Segmented, StatusBadge } from "@barbaari/shared/web/ui";
import { attendanceStatuses } from "@barbaari/shared/web/status";
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
  const [unlockWithPassword, setUnlockWithPassword] = useState(false);
  const [childSearch, setChildSearch] = useState("");

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

  const orgName = data?.organization?.name ?? session?.user?.organization?.name ?? "";
  const stepIndex = step === "classroom" || step === "child" ? 0 : step === "action" ? 1 : step === "signer" || step === "pin" ? 2 : step === "signature" ? 3 : 4;
  const back: Partial<Record<Step, Step>> = { child: usesClassrooms ? "classroom" : undefined, action: "child", signer: "action", pin: "signer", signature: "pin" };
  const firstName = (name?: string) => String(name ?? "").split(" ")[0];
  const offline = !isOnline ? <Alert tone="info">You’re offline. Attendance actions require a connection — reconnect before checking children in or out.</Alert> : null;

  if (step === "unlock") {
    return (
      <main className="bb-unlock">
        <section className="bb-unlock-brand">
          <LogoTile size={120} />
          <div>
            <p>Barbaari attendance{orgName ? ` · ${orgName}` : ""}</p>
            <h1>Tablet mode is locked</h1>
            <p>Parents and guardians: please ask a staff member to open the tablet. You’ll sign with your own PIN.</p>
          </div>
        </section>
        <section className="bb-unlock-form">
          <form className="bb-stack" style={{ width: "min(100%, 360px)", gap: 20 }} onSubmit={(event) => { event.preventDefault(); if (email && credential) void unlock(); }}>
            <h2 style={{ textAlign: "center", fontSize: 26 }}>{unlockWithPassword ? "Staff sign-in" : "Staff PIN"}</h2>
            <p className="bb-caption" style={{ textAlign: "center", fontSize: 15, marginTop: -12 }}>Staff, teacher, owner or admin accounts only.</p>
            {offline}
            {error ? <Alert tone="danger">{error}</Alert> : null}
            <Field label="Email" htmlFor="unlock-email"><input id="unlock-email" className="bb-input bb-kiosk-input" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} /></Field>
            {unlockWithPassword
              ? <Field label="Password" htmlFor="unlock-password"><PasswordInput id="unlock-password" value={credential} onChange={setCredential} autoComplete="current-password" /></Field>
              : <PinPad value={credential} onChange={(value) => setCredential(value.replace(/\D/g, ""))} label="Enter your PIN to unlock" length={Math.max(4, credential.length)} />}
            <button className="bb-btn bb-btn-primary bb-btn-touch bb-btn-block" disabled={saving || !email || !credential}>{saving ? "Unlocking…" : "Unlock tablet"}</button>
            <button type="button" className="bb-btn bb-btn-ghost" onClick={() => { setUnlockWithPassword((current) => !current); setCredential(""); }}>{unlockWithPassword ? "Use tablet PIN instead" : "Sign in with password instead"}</button>
          </form>
        </section>
      </main>
    );
  }

  if (step === "confirmation") {
    return (
      <main className="bb-kiosk" style={{ position: "static", minHeight: "100dvh" }}>
        <section className="bb-kiosk-done" style={{ minHeight: "100dvh" }}>
          <span className="bb-kiosk-check"><Check weight="bold" size={78} /></span>
          <h1>{selectedAction === "absence" ? "Absence recorded" : `${firstName(selectedChild?.name) || "Child"} is checked ${selectedAction === "check_in" ? "in" : "out"}`}</h1>
          <p className="lead">{message}</p>
          <div className="bb-row" style={{ justifyContent: "center" }}>
            <button className="bb-btn bb-kiosk-light" onClick={() => reset(false)}>Next child</button>
            <button className="bb-btn bb-kiosk-ghost" onClick={() => reset(true)}>Lock tablet</button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="bb-kiosk" style={{ position: "static", minHeight: "100dvh" }}>
      <div className="bb-kiosk-body">
        <header className="bb-kiosk-top">
          {back[step] ? <button className="bb-btn bb-btn-secondary bb-kiosk-btn" onClick={() => { setError(""); setStep(back[step]!); }}><ArrowLeft size={22} />Back</button>
            : <div className="bb-gate-brand"><LogoTile /><strong>Tablet mode</strong><span>{orgName}{data?.scopeLabel ? ` · ${data.scopeLabel}` : ""}</span></div>}
          <span className="bb-kiosk-steps">{["Child", "Action", "Signer", "Sign", "Done"].map((label, index) => <span key={label}>{index ? " · " : ""}{index === stepIndex ? <b>{label}</b> : label}</span>)}</span>
          <button className="bb-btn bb-btn-secondary bb-kiosk-btn" onClick={() => reset(true)}><LockSimple size={22} />Lock tablet</button>
        </header>
        {offline}
        {message && step !== "signature" ? <Alert tone="ok">{message}</Alert> : null}
        {error ? <Alert tone="danger" title="That didn’t work">{error}</Alert> : null}

        {step === "classroom" && data ? (
          <section>
            <h2 className="bb-kiosk-title">Choose a classroom</h2>
            {(data.classrooms ?? []).length ? (
              <div className="bb-kiosk-grid">
                {(data.classrooms ?? []).map((room: any) => (
                  <button key={room.id} className="bb-kiosk-tile" onClick={() => { setClassroomId(String(room.id)); setStep("child"); }}>
                    <strong>{room.name}</strong>
                    <span className="bb-caption" style={{ fontSize: 16 }}>{room.children_count ?? room.childrenCount ?? 0} children</span>
                  </button>
                ))}
              </div>
            ) : <EmptyState title="No classrooms">No classrooms are available for this account.</EmptyState>}
          </section>
        ) : null}

        {step === "child" && data ? (() => {
          const query = childSearch.trim().toLowerCase();
          const list = visibleChildren.filter((child: any) => !query || String(child.name).toLowerCase().includes(query));
          return (
            <section>
              <h2 className="bb-kiosk-title">Who’s arriving or leaving?</h2>
              <div className="bb-kiosk-filter"><SearchInput white value={childSearch} onChange={setChildSearch} placeholder="Search by child’s name" /></div>
              {list.length ? (
                <div className="bb-kiosk-grid">
                  {list.map((child: any) => (
                    <button key={child.id} className="bb-kiosk-tile" onClick={() => chooseChild(child)}>
                      <Avatar name={child.name} seed={child.id} size={56} />
                      <strong>{child.name}</strong>
                      <StatusBadge map={attendanceStatuses} value={child.attendanceStatus ?? "not_checked_in"} />
                    </button>
                  ))}
                </div>
              ) : <EmptyState title={query ? "No child found" : "No children"}>{query ? "Check the spelling and try again." : "No children are visible for this tablet account."}</EmptyState>}
            </section>
          );
        })() : null}

        {step === "action" && selectedChild ? (
          <section>
            <div className="bb-kiosk-child">
              <Avatar name={selectedChild.name} seed={selectedChild.id} size={112} />
              <div>
                <h2>{selectedChild.name}</h2>
                <p>{[selectedChild.childCode ?? selectedChild.child_code, selectedChild.classroom ?? "Family child care"].filter(Boolean).join(" · ")}</p>
                <StatusBadge size="lg" map={attendanceStatuses} value={selectedChild.attendanceStatus ?? "not_checked_in"} />
              </div>
            </div>
            <div className="bb-kiosk-actions" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
              <button className="bb-kiosk-action primary" disabled={saving} onClick={() => chooseAction("check_in")}><SignIn size={46} />Check in</button>
              <button className="bb-kiosk-action" disabled={saving} onClick={() => chooseAction("check_out")}><SignOut size={46} />Check out</button>
              <button className="bb-kiosk-action" disabled={saving} onClick={() => chooseAction("absence")}><MinusCircle size={40} />Mark absent</button>
            </div>
          </section>
        ) : null}

        {step === "signer" && selectedChild ? (
          <section style={{ maxWidth: 760 }}>
            <h2 className="bb-kiosk-title">{selectedAction === "absence" ? `Who is reporting ${firstName(selectedChild.name)}’s absence?` : `Who is ${selectedAction === "check_in" ? "dropping" : "picking"} ${firstName(selectedChild.name)} ${selectedAction === "check_in" ? "off" : "up"}?`}</h2>
            <div className="bb-stack" style={{ gap: 12 }}>
              {signers.map((signer) => (
                <button key={`${signer.type}-${signer.id}`} className={`bb-signer${signer.type === "guardian" ? "" : " outline"}${String(signerId) === String(signer.id) ? " on" : ""}`} onClick={() => { setSignerId(String(signer.id)); continueToPin(signer); }}>
                  {signer.type === "guardian" ? <Avatar name={signer.name} seed={`${signer.type}-${signer.id}`} size={56} /> : <IdentificationBadge size={36} color="var(--bb-accent)" />}
                  <div><strong>{signer.name}</strong><span>{signer.relationship ?? signer.type} · {signer.pin_configured ? "PIN set" : "PIN missing — set one first"}</span></div>
                </button>
              ))}
            </div>
            {signers.length === 0 ? <EmptyState compact title="No signers">No authorized signers are available for this child.</EmptyState> : null}
          </section>
        ) : null}

        {step === "pin" && selectedChild && selectedSigner ? (
          <section className="bb-kiosk-split">
            <div>
              <h2 className="bb-kiosk-title">{selectedSigner.name}, enter your PIN</h2>
              <p className="bb-kiosk-meta">Signing {actionLabel(selectedAction).toLowerCase()} for {selectedChild.name}.</p>
            </div>
            <div>
              <PinPad value={pin} onChange={setPin} label="Signer PIN" length={Math.max(4, pin.length)} />
              <button className="bb-btn bb-btn-primary bb-btn-touch bb-btn-block" style={{ marginTop: 30 }} disabled={saving || pin.length < 4} onClick={verifyPin}>{saving ? "Verifying…" : "Verify PIN"}</button>
            </div>
          </section>
        ) : null}

        {step === "signature" && selectedChild && selectedSigner ? (
          <section style={{ maxWidth: 760 }}>
            <h2 className="bb-kiosk-title" style={{ marginBottom: 8 }}>{selectedAction === "absence" ? `Mark ${firstName(selectedChild.name)} absent today` : `Sign to check ${selectedAction === "check_in" ? "in" : "out"} ${firstName(selectedChild.name)}`}</h2>
            <p className="bb-kiosk-meta">{selectedSigner.name} confirmed by PIN · {new Date().toLocaleString(undefined, { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" })}</p>
            <div className="bb-stack">
              {selectedAction === "absence" ? (
                <>
                  <Segmented touch label="Absence type" value={absenceType} onChange={setAbsenceType} items={absenceTypes.map(([value, label]) => ({ key: value, label }))} />
                  <Field label="Reason (optional)"><input className="bb-input white bb-kiosk-input" value={absenceReason} onChange={(event) => setAbsenceReason(event.target.value)} placeholder="Sick, vacation, appointment…" /></Field>
                </>
              ) : null}
              <Field label="Signer name / signature"><input className="bb-input white bb-kiosk-input" value={signatureName} onChange={(event) => setSignatureName(event.target.value)} placeholder="Full name" /></Field>
              <button className="bb-btn bb-btn-primary bb-btn-touch" disabled={saving || !signatureName} onClick={submitAction}><CheckSquare size={26} />{saving ? "Saving…" : selectedAction === "absence" ? "Record absence" : `Confirm check-${selectedAction === "check_in" ? "in" : "out"}`}</button>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
