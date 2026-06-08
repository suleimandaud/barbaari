import { useMemo, useState } from "react";
import { authApi, getApiError, tabletApi } from "@barbaari/shared";
import { ErrorAlert, SuccessAlert } from "../components/Alerts";
import { Badge } from "../components/Status";

type Mode = "guardian" | "staff" | "admin";
type Step = "unlock" | "classroom" | "child" | "signer" | "action" | "confirmation";

const modeCopy: Record<Mode, { title: string; description: string; email: string; credential: string; button: string }> = {
  guardian: {
    title: "Parent / Guardian",
    description: "Parents and authorized guardians sign linked children in or out.",
    email: "Parent or guardian email",
    credential: "Password or tablet PIN",
    button: "Continue as parent / guardian"
  },
  staff: {
    title: "Staff",
    description: "Teachers and staff manage attendance for assigned children.",
    email: "Staff email",
    credential: "Staff PIN",
    button: "Continue as staff"
  },
  admin: {
    title: "Admin",
    description: "Owners, daycare admins, and managers run the full tablet kiosk.",
    email: "Admin or manager email",
    credential: "Password or tablet PIN",
    button: "Unlock tablet"
  }
};

const absenceTypes = [
  ["excused", "Excused"],
  ["unexcused", "Unexcused"],
  ["sick", "Sick"],
  ["vacation", "Vacation"],
  ["no_show", "No-show"],
  ["other", "Other"]
] as const;

function browserLocation(): Promise<{ latitude: number; longitude: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("This browser cannot provide device location."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => reject(new Error("Location permission is required for attendance.")),
      { timeout: 8000, maximumAge: 30000, enableHighAccuracy: true }
    );
  });
}

export function TabletPortalPage() {
  const [mode, setMode] = useState<Mode>("guardian");
  const [email, setEmail] = useState("");
  const [credential, setCredential] = useState("");
  const [session, setSession] = useState<any | null>(null);
  const [data, setData] = useState<any | null>(null);
  const [step, setStep] = useState<Step>("unlock");
  const [classroomId, setClassroomId] = useState("all");
  const [childId, setChildId] = useState("");
  const [signerId, setSignerId] = useState("");
  const [signers, setSigners] = useState<any[]>([]);
  const [absenceType, setAbsenceType] = useState("no_show");
  const [absenceReason, setAbsenceReason] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const usesClassrooms = Boolean(data?.uses_classrooms);
  const selectedChild = useMemo(() => (data?.children ?? []).find((child: any) => String(child.id) === String(childId)), [data, childId]);
  const visibleChildren = useMemo(() => {
    const children = data?.children ?? [];
    if (!usesClassrooms || classroomId === "all") return children;
    return children.filter((child: any) => String(child.classroomId ?? "") === String(classroomId));
  }, [data, usesClassrooms, classroomId]);

  async function unlock() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const payload: any = { mode, email, purpose: "tablet_attendance" };
      if (mode === "staff") payload.pin = credential;
      else payload.password_or_pin = credential;
      const response = await authApi.tabletUnlock(payload);
      const bootstrap = await tabletApi.bootstrap(mode);
      setSession(response);
      setData(bootstrap);
      setClassroomId("all");
      setChildId("");
      setSignerId("");
      setStep(bootstrap.uses_classrooms ? "classroom" : "child");
      setMessage(`Unlocked ${modeCopy[mode].title} mode for ${response.user?.organization?.name ?? "organization"}.`);
    } catch (err) {
      const apiError = getApiError(err);
      setError(apiError.status === 402 ? "This organization is not subscribed/active. Please contact the administrator." : apiError.message);
    } finally {
      setSaving(false);
    }
  }

  async function chooseChild(child: any) {
    setChildId(child.id);
    setSignerId("");
    setSigners([]);
    setError("");
    if (mode === "guardian") {
      try {
        const response = await tabletApi.pickupSigners(child.id);
        const guardianSigners = response.signers ?? [];
        setSigners(guardianSigners);
        setSignerId(guardianSigners[0]?.id ? String(guardianSigners[0].id) : "");
      } catch (err) {
        setError(getApiError(err).message);
      }
      setStep("signer");
    } else {
      setStep("action");
    }
  }

  async function runAction(action: "check_in" | "check_out" | "absence") {
    if (!selectedChild) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const location = await browserLocation();
      if (action === "absence") {
        await tabletApi.markAbsent({
          child_id: selectedChild.id,
          absence_date: new Date().toISOString().slice(0, 10),
          absence_type: absenceType,
          reason: absenceReason || "Marked absent from tablet portal",
          notes: absenceReason || undefined
        });
      } else {
        const isGuardian = mode === "guardian";
        const signer = signers.find((item) => String(item.id) === String(signerId));
        const payload: Record<string, unknown> = {
          child_id: selectedChild.id,
          signer_type: isGuardian ? "guardian" : "staff",
          signer_name: isGuardian ? signer?.name : session?.user?.name,
          guardian_id: isGuardian ? signer?.id : undefined,
          verification_method: "digital_signature",
          signature_name: isGuardian ? signer?.name : session?.user?.name,
          signature_reference: "tablet-web-typed-signature",
          ...location
        };
        if (action === "check_in") await tabletApi.guardianCheckIn(payload);
        else await tabletApi.guardianCheckOut(payload);
      }
      const bootstrap = await tabletApi.bootstrap(mode);
      setData(bootstrap);
      setMessage(`${selectedChild.name} ${action.replace("_", " ")} saved.`);
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
    if (lock) {
      setSession(null);
      setData(null);
      setEmail("");
      setCredential("");
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
            <p>{data ? `${data.facility_type === "family_child_care" ? "Family Child Care" : "Center Daycare"} · ${data.scopeLabel}` : "Unlock attendance tablet mode to begin."}</p>
          </div>
          {session ? <button className="secondary" onClick={() => reset(true)}>Lock tablet</button> : null}
        </header>

        <SuccessAlert message={message} />
        <ErrorAlert message={error} />

        {step === "unlock" ? (
          <section className="kiosk-card">
            <h2>Choose tablet mode</h2>
            <div className="kiosk-choice-grid">
              {(Object.keys(modeCopy) as Mode[]).map((item) => (
                <button key={item} className={`kiosk-choice ${mode === item ? "selected" : ""}`} onClick={() => setMode(item)}>
                  {modeCopy[item].title}
                  <small>{modeCopy[item].description}</small>
                </button>
              ))}
            </div>
            <div className="form-grid two">
              <label className="field-stack"><span>{modeCopy[mode].email}</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
              <label className="field-stack"><span>{modeCopy[mode].credential}</span><input type="password" value={credential} onChange={(event) => setCredential(event.target.value)} /></label>
              <button className="primary full" disabled={saving || !email || !credential} onClick={unlock}>{saving ? "Unlocking..." : modeCopy[mode].button}</button>
            </div>
          </section>
        ) : null}

        {step === "classroom" && data ? (
          <section className="kiosk-card">
            <h2>Select classroom</h2>
            <div className="kiosk-choice-grid">
              <button className="kiosk-choice" onClick={() => { setClassroomId("all"); setStep("child"); }}>All classrooms<small>{data.children?.length ?? 0} visible children</small></button>
              {(data.classrooms ?? []).map((room: any) => <button key={room.id} className="kiosk-choice" onClick={() => { setClassroomId(String(room.id)); setStep("child"); }}>{room.name}<small>{room.children_count ?? room.childrenCount ?? 0} children</small></button>)}
            </div>
          </section>
        ) : null}

        {step === "child" && data ? (
          <section className="kiosk-card">
            <h2>Select child</h2>
            {!usesClassrooms ? <Badge>Family child care: no classrooms</Badge> : null}
            <div className="kiosk-choice-grid children">
              {visibleChildren.map((child: any) => <button key={child.id} className="kiosk-choice" onClick={() => chooseChild(child)}>{child.name}<small>{child.childCode ?? child.child_code} · {child.classroom} · {child.attendanceStatus}</small></button>)}
            </div>
            {visibleChildren.length === 0 ? <p className="muted">No children are visible for this tablet mode.</p> : null}
          </section>
        ) : null}

        {step === "signer" && selectedChild ? (
          <section className="kiosk-card">
            <h2>Select signer</h2>
            <p className="muted">{selectedChild.name}</p>
            <select value={signerId} onChange={(event) => setSignerId(event.target.value)}>
              {signers.map((signer) => <option key={signer.id} value={signer.id}>{signer.name} · {signer.relationship ?? signer.type ?? "Guardian"}</option>)}
            </select>
            <div className="kiosk-actions">
              <button className="secondary" onClick={() => setStep("child")}>Back</button>
              <button className="primary" disabled={!signerId} onClick={() => setStep("action")}>Continue</button>
            </div>
          </section>
        ) : null}

        {step === "action" && selectedChild ? (
          <section className="kiosk-card">
            <h2>{selectedChild.name}</h2>
            <p className="muted">{selectedChild.childCode ?? selectedChild.child_code} · {selectedChild.classroom} · {selectedChild.attendanceStatus}</p>
            <div className="kiosk-choice-grid">
              <button className="kiosk-choice selected" disabled={saving} onClick={() => runAction("check_in")}>Check in<small>Records signer, location, and typed signature.</small></button>
              <button className="kiosk-choice" disabled={saving} onClick={() => runAction("check_out")}>Check out<small>Records signer, location, and typed signature.</small></button>
              {mode !== "guardian" ? <div className="child-card">
                <strong>Mark absent</strong>
                <select value={absenceType} onChange={(event) => setAbsenceType(event.target.value)}>{absenceTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
                <input value={absenceReason} onChange={(event) => setAbsenceReason(event.target.value)} placeholder="Reason optional" />
                <button className="secondary" disabled={saving} onClick={() => runAction("absence")}>Save absence</button>
              </div> : null}
            </div>
            <div className="kiosk-actions"><button className="secondary" onClick={() => setStep(usesClassrooms ? "classroom" : "child")}>Back</button></div>
          </section>
        ) : null}

        {step === "confirmation" ? (
          <section className="kiosk-card confirmation">
            <h2>Attendance saved</h2>
            <p>{message}</p>
            <button className="primary" onClick={() => reset(false)}>Start new action</button>
          </section>
        ) : null}
      </section>
    </main>
  );
}
