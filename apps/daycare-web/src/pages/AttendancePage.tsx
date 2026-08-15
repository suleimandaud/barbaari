import { useMemo, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { absenceApi, attendanceApi, authApi, childrenApi, classroomsApi, formatAttendanceTime, getApiError, organizationApi } from "@barbaari/shared";
import { PageHeader, Panel } from "../components/Page";
import { DataTable } from "../components/DataTable";
import { Badge, ErrorState, LoadingState } from "../components/Status";
import { ErrorAlert, SuccessAlert } from "../components/Alerts";
import { ChildSelect, ClassroomSelect } from "../components/Selects";
import { Modal } from "../components/Modal";
import { useAsyncData } from "../hooks/useAsyncData";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { childLabel, friendlyError } from "../utils/labels";

const attendanceTabs = [
  ["live", "Live Status"],
  ["kiosk", "Kiosk / Tablet"],
  ["records", "Records"],
  ["absences", "Absences"],
  ["early", "Early Checkouts"],
  ["missing", "Missing Checkouts"],
  ["corrections", "Corrections"]
] as const;

const absenceTypes = [
  ["excused", "Excused"],
  ["unexcused", "Unexcused"],
  ["sick", "Sick"],
  ["vacation", "Vacation"],
  ["no_show", "No-show"],
  ["other", "Other"]
] as const;

function initialTab(value: string | null) {
  if (value === "checked_in" || value === "checked_out") return "records";
  if (value && attendanceTabs.some(([id]) => id === value)) return value;
  return "live";
}

function initialRecordTab(value: string | null) {
  if (value === "absences" || value === "early" || value === "missing" || value === "corrections") return value;
  return "all";
}

function absenceLabel(value: string) {
  return absenceTypes.find(([id]) => id === value)?.[1] ?? value.replace(/_/g, " ");
}

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
      reject(new Error("This browser cannot provide device location. Use a location-enabled device or browser."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      (error) => reject(new Error(geolocationErrorMessage(error))),
      { timeout: 8000, maximumAge: 30000, enableHighAccuracy: true }
    );
  });
}

export function AttendancePage() {
  const isOnline = useOnlineStatus();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data, loading, error, reload } = useAsyncData(async () => {
    const [attendance, absences, children, classrooms, auditLogs, organization] = await Promise.all([
      attendanceApi.managerList(),
      absenceApi.list(),
      childrenApi.managerList(),
      classroomsApi.list(),
      attendanceApi.auditLogs(),
      organizationApi.get()
    ]);
    return { attendance: attendance.attendance, absences: absences.absence_records, children: children.children, classrooms: classrooms.classrooms, auditLogs: auditLogs.audit_logs, organization: organization.organization };
  }, []);
  const today = new Date().toISOString().slice(0, 10);
  const nowForInput = useMemo(() => new Date().toISOString().slice(0, 16), []);
  const [actionDate, setActionDate] = useState(today);
  const [actionClassroomId, setActionClassroomId] = useState("");
  const [actionChildId, setActionChildId] = useState("");
  const [filterDate, setFilterDate] = useState(today);
  const [filterClassroomId, setFilterClassroomId] = useState("");
  const [filterChildId, setFilterChildId] = useState("");
  const [status, setStatus] = useState("");
  const [absenceType, setAbsenceType] = useState("sick");
  const [absenceReason, setAbsenceReason] = useState("");
  const [absenceNotes, setAbsenceNotes] = useState("");
  const [absenceFilterType, setAbsenceFilterType] = useState("");
  const [absenceFilterStatus, setAbsenceFilterStatus] = useState("");
  const [recordTab, setRecordTab] = useState(initialRecordTab(searchParams.get("tab") ?? searchParams.get("view")));
  const [selectedRecord, setSelectedRecord] = useState<any | null>(null);
  const [showAuditFor, setShowAuditFor] = useState<any | null>(null);
  const [signingChild, setSigningChild] = useState<any | null>(null);
  const [signers, setSigners] = useState<any[]>([]);
  const [signerValue, setSignerValue] = useState("");
  const [signatureName, setSignatureName] = useState("");
  const [signingDirection, setSigningDirection] = useState<"in" | "out">("in");
  const [kioskOpen, setKioskOpen] = useState(false);
  const [kioskStep, setKioskStep] = useState(1);
  const [kioskClassroomId, setKioskClassroomId] = useState("");
  const [kioskChildId, setKioskChildId] = useState("");
  const [kioskAction, setKioskAction] = useState<"in" | "out" | "absent">("in");
  const [kioskSignerValue, setKioskSignerValue] = useState("staff:staff");
  const [kioskSigners, setKioskSigners] = useState<any[]>([]);
  const [kioskMethod, setKioskMethod] = useState("digital_signature");
  const [kioskPin, setKioskPin] = useState("");
  const [kioskSignatureName, setKioskSignatureName] = useState("");
  const [kioskSignatureDrawn, setKioskSignatureDrawn] = useState(false);
  const [kioskAbsenceType, setKioskAbsenceType] = useState("no_show");
  const [kioskAbsenceReason, setKioskAbsenceReason] = useState("");
  const [kioskAbsenceNotes, setKioskAbsenceNotes] = useState("");
  const [kioskSuccess, setKioskSuccess] = useState("");
  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const [newIn, setNewIn] = useState("");
  const [newOut, setNewOut] = useState("");
  const [reason, setReason] = useState("");
  const [success, setSuccess] = useState("");
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState(initialTab(searchParams.get("tab") ?? searchParams.get("view")));

  const childById = useMemo(() => new Map((data?.children ?? []).map((child: any) => [String(child.id), child])), [data?.children]);
  const classroomByName = useMemo(() => new Map((data?.classrooms ?? []).map((room: any) => [room.name, room])), [data?.classrooms]);
  const isFamilyChildCare = data?.organization?.facility_type === "family_child_care";
  const actionChildren = useMemo(() => {
    return actionClassroomId ? (data?.children ?? []).filter((child: any) => String(child.classroomId) === actionClassroomId) : data?.children ?? [];
  }, [actionClassroomId, data?.children]);
  const kioskChildren = useMemo(() => {
    return kioskClassroomId ? (data?.children ?? []).filter((child: any) => String(child.classroomId) === kioskClassroomId) : data?.children ?? [];
  }, [data?.children, kioskClassroomId]);

  const filteredRows = useMemo(() => {
    return (data?.attendance ?? []).filter((record: any) => {
      const child = childById.get(String(record.childId));
      const room = classroomByName.get(record.classroom);
      const rowStatus = record.status ?? (record.checkOutTime ? "checked_out" : "checked_in");
      const tabMatches = recordTab === "all" || activeTab === "records" || activeTab === "live" || activeTab === "kiosk"
        || (recordTab === "checked_in" && rowStatus === "checked_in")
        || (recordTab === "checked_out" && rowStatus === "checked_out")
        || ((recordTab === "early" || activeTab === "early") && rowStatus === "checked_out_early")
        || ((recordTab === "missing" || activeTab === "missing") && rowStatus === "missing_checkout")
        || ((recordTab === "corrections" || activeTab === "corrections") && record.corrected);
      return (!filterDate || record.date === filterDate)
        && (!filterClassroomId || String(room?.id) === filterClassroomId)
        && (!filterChildId || String(record.childId) === filterChildId)
        && (!status || rowStatus === status)
        && tabMatches
        && (!filterChildId || child);
    });
  }, [activeTab, data?.attendance, childById, classroomByName, filterDate, filterClassroomId, filterChildId, recordTab, status]);

  const filteredAbsences = useMemo(() => {
    if (!["all", "absences"].includes(recordTab) && activeTab !== "absences" && activeTab !== "live" && activeTab !== "kiosk") return [];
    return (data?.absences ?? []).filter((record: any) => {
      return (!filterDate || record.absenceDate === filterDate || record.absence_date === filterDate)
        && (!filterClassroomId || String(record.classroomId) === filterClassroomId)
        && (!filterChildId || String(record.childId) === filterChildId)
        && (!absenceFilterType || record.absenceType === absenceFilterType || record.absence_type === absenceFilterType)
        && (!absenceFilterStatus || record.status === absenceFilterStatus);
    });
  }, [absenceFilterStatus, absenceFilterType, activeTab, data?.absences, filterChildId, filterClassroomId, filterDate, recordTab]);

  const liveStats = useMemo(() => {
    const todayAttendance = (data?.attendance ?? []).filter((record: any) => record.date === today);
    const todayAbsences = (data?.absences ?? []).filter((record: any) => (record.absenceDate ?? record.absence_date) === today);
    const checkedIn = todayAttendance.filter((record: any) => (record.status ?? (record.checkOutTime ? "checked_out" : "checked_in")) === "checked_in" && !record.checkOutTime);
    const checkedOut = todayAttendance.filter((record: any) => record.checkOutTime || (record.status ?? "") === "checked_out");
    const early = todayAttendance.filter((record: any) => (record.status ?? "") === "checked_out_early");
    const missing = todayAttendance.filter((record: any) => (record.status ?? "") === "missing_checkout");
    return { checkedIn, checkedOut, early, missing, absences: todayAbsences };
  }, [data?.absences, data?.attendance, today]);

  async function runAction(action: () => Promise<void>, message: string) {
    setSaving(true);
    setActionError("");
    setSuccess("");
    if (!isOnline) {
      setActionError("You're offline. Please reconnect and try again.");
      setSaving(false);
      return;
    }
    try {
      await action();
      setSuccess(message);
      setSelectedRecord(null);
      setShowAuditFor(null);
      setSigningChild(null);
      setReason("");
      setNewIn("");
      setNewOut("");
      setAbsenceReason("");
      setAbsenceNotes("");
      await reload();
    } catch (err) {
      setActionError(friendlyError(getApiError(err).message));
    } finally {
      setSaving(false);
    }
  }

  function markSelectedAbsent() {
    const child = selectedActionChild();
    if (!child) {
      setActionError("Please select a child from the list.");
      return;
    }
    void runAction(() => absenceApi.create({
      child_id: child.id,
      absence_date: actionDate,
      absence_type: absenceType,
      reason: absenceReason || undefined,
      notes: absenceNotes || undefined
    }).then(() => undefined), `${child.name} marked absent.`);
  }

  function selectedActionChild() {
    return childById.get(String(actionChildId));
  }

  async function checkSelected(direction: "in" | "out") {
    const child = selectedActionChild();
    if (!child) {
      setActionError("Please select a child from the list.");
      return;
    }
    const call = direction === "in" ? attendanceApi.checkIn : attendanceApi.checkOut;
    try {
      const loc = await browserLocation();
      void runAction(() => call(child.id, "staff", "secure_login", undefined, loc).then(() => undefined), `${child.name} checked ${direction}.`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Location permission is required for attendance.");
    }
  }

  function clearFilters() {
    setFilterDate("");
    setFilterClassroomId("");
    setFilterChildId("");
    setStatus("");
    setAbsenceFilterType("");
    setAbsenceFilterStatus("");
    setRecordTab("all");
    setActiveTab("records");
    setSearchParams({});
  }

  function chooseRecordTab(value: string) {
    setRecordTab(value);
    setActiveTab(value === "absences" || value === "early" || value === "missing" || value === "corrections" ? value : "records");
    setSearchParams(value === "all" ? { tab: "records" } : { tab: value === "all" ? "records" : value });
    if (value === "checked_in") setStatus("checked_in");
    else if (value === "checked_out") setStatus("checked_out");
    else if (value === "early") setStatus("checked_out_early");
    else if (value === "missing") setStatus("missing_checkout");
    else setStatus("");
  }

  function chooseOperationTab(value: string) {
    setActiveTab(value);
    setSearchParams({ tab: value });
    if (value === "absences") setRecordTab("absences");
    else if (value === "early") {
      setRecordTab("early");
      setStatus("checked_out_early");
    } else if (value === "missing") {
      setRecordTab("missing");
      setStatus("missing_checkout");
    } else if (value === "corrections") setRecordTab("corrections");
    else {
      setRecordTab("all");
      if (value !== "records") setStatus("");
    }
  }

  function openCorrection(record: any) {
    setSelectedRecord(record);
    setNewIn(record.checkInTime ?? "");
    setNewOut(record.checkOutTime ?? "");
    setReason("");
    setActionError("");
  }

  async function openSigningModal() {
    const child = selectedActionChild();
    if (!child) {
      setActionError("Please select a child from the list.");
      return;
    }
    setSaving(true);
    setActionError("");
    try {
      const response = await childrenApi.pickupSigners(child.id);
      setSigners(response.signers ?? []);
      setSigningChild(child);
      setSignerValue("");
      setSignatureName("");
      setSigningDirection("in");
    } catch (err) {
      setActionError(friendlyError(getApiError(err).message));
    } finally {
      setSaving(false);
    }
  }

  function selectedSigner() {
    return signers.find((signer) => `${signer.type}:${signer.id}` === signerValue);
  }

  function selectedKioskChild() {
    return childById.get(String(kioskChildId));
  }

  function selectedKioskSigner() {
    if (kioskSignerValue === "staff:staff") return { id: "staff", type: "staff", name: "Staff-assisted", can_pickup: true };
    return kioskSigners.find((signer) => `${signer.type}:${signer.id}` === kioskSignerValue);
  }

  function submitGuardianSigning() {
    const signer = selectedSigner();
    if (!signingChild || !signer) {
      setActionError("Please choose an authorized signer.");
      return;
    }
    void runAction(async () => {
      const loc = await browserLocation();
      const payload: Record<string, unknown> = {
        child_id: signingChild.id,
        signer_type: signer.type === "authorized_pickup" ? "authorized_pickup" : "guardian",
        signer_name: signer.name,
        verification_method: "digital_signature",
        signature_name: signatureName || signer.name,
        ...loc
      };
      if (signer.type === "authorized_pickup") payload.pickup_authorization_id = signer.id;
      else payload.guardian_id = signer.id;
      const call = signingDirection === "in" ? attendanceApi.guardianCheckIn : attendanceApi.guardianCheckOut;
      await call(payload);
    }, `${signingChild.name} signed ${signingDirection === "in" ? "in" : "out"} by ${signer.name}.`);
  }

  async function openKioskMode() {
    setKioskOpen(true);
    setKioskStep(isFamilyChildCare ? 2 : 1);
    setKioskClassroomId("");
    setKioskChildId("");
    setKioskAction("in");
    setKioskSignerValue("staff:staff");
    setKioskSigners([]);
    setKioskMethod("digital_signature");
    setKioskPin("");
    setKioskSignatureName("");
    setKioskSignatureDrawn(false);
    setKioskAbsenceType("no_show");
    setKioskAbsenceReason("");
    setKioskAbsenceNotes("");
    setKioskSuccess("");
    setActionError("");
  }

  async function loadKioskSigners(nextStep = 4) {
    const child = selectedKioskChild();
    if (!child) {
      setActionError("Please select a child from the list.");
      return;
    }
    setSaving(true);
    setActionError("");
    try {
      const response = await childrenApi.pickupSigners(child.id);
      setKioskSigners(response.signers ?? []);
      setKioskSignerValue("staff:staff");
      setKioskSignatureName("");
      setKioskStep(nextStep);
    } catch (err) {
      setActionError(friendlyError(getApiError(err).message));
    } finally {
      setSaving(false);
    }
  }

  function continueFromKioskAction() {
    if (!selectedKioskChild()) {
      setActionError("Please select a child from the list.");
      return;
    }
    if (kioskAction === "absent") {
      setKioskStep(6);
      return;
    }
    void loadKioskSigners(4);
  }

  function chooseKioskSigner(value: string) {
    setKioskSignerValue(value);
    if (value === "staff:staff") {
      setKioskSignatureName("Staff-assisted");
      clearKioskSignature();
      return;
    }
    const signer = kioskSigners.find((item) => `${item.type}:${item.id}` === value);
    setKioskSignatureName(signer?.name ?? "");
    clearKioskSignature();
  }

  function prepareSignatureCanvas() {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.floor(rect.width * ratio));
    const height = Math.max(1, Math.floor(rect.height * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.scale(ratio, ratio);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.lineWidth = 4;
        ctx.strokeStyle = "#20343b";
      }
    }
    return canvas;
  }

  function canvasPoint(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = prepareSignatureCanvas();
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function startSignature(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = prepareSignatureCanvas();
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    const point = canvasPoint(event);
    drawingRef.current = true;
    canvas?.setPointerCapture(event.pointerId);
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
  }

  function drawSignature(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const canvas = prepareSignatureCanvas();
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    const point = canvasPoint(event);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    setKioskSignatureDrawn(true);
  }

  function endSignature(event?: PointerEvent<HTMLCanvasElement>) {
    drawingRef.current = false;
    if (event) signatureCanvasRef.current?.releasePointerCapture(event.pointerId);
  }

  function clearKioskSignature() {
    const canvas = signatureCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setKioskSignatureDrawn(false);
  }

  function kioskSignatureData() {
    if (!kioskSignatureDrawn) return "";
    return signatureCanvasRef.current?.toDataURL("image/png") ?? "";
  }

  async function submitKiosk() {
    const child = selectedKioskChild();
    if (!child) {
      setActionError("Please select a child from the list.");
      return;
    }
    setSaving(true);
    setActionError("");
    setKioskSuccess("");
    if (!isOnline) {
      setActionError("You're offline. Please reconnect and try again.");
      setSaving(false);
      return;
    }
    try {
      if (kioskAction === "absent") {
        await absenceApi.create({
          child_id: child.id,
          absence_date: today,
          absence_type: kioskAbsenceType,
          reason: kioskAbsenceReason || "Marked absent from kiosk/tablet mode",
          notes: kioskAbsenceNotes || "Recorded by staff in kiosk/tablet attendance mode"
        });
        setKioskSuccess(`${child.name} was marked absent for today (${absenceLabel(kioskAbsenceType)}).`);
        setKioskStep(7);
        await reload();
        return;
      }

      const signer = selectedKioskSigner();
      if (!signer) {
        setActionError("Please choose an authorized signer.");
        return;
      }
      if (signer.type !== "staff" && !signer.can_pickup) {
        setActionError("This person is not authorized to sign attendance for this child.");
        return;
      }
      if (!kioskSignatureName.trim()) {
        setActionError("Please enter the signer name as the typed signature.");
        return;
      }
      if (!kioskSignatureDrawn) {
        setActionError("Please draw a signature before saving attendance.");
        return;
      }
      if (signer.type !== "staff" && kioskSignatureName.trim().toLowerCase() !== String(signer.name).trim().toLowerCase()) {
        setActionError("Typed signature must match the selected authorized signer.");
        return;
      }

      let pinVerificationId: number | undefined;
      if (kioskMethod === "pin") {
        if (!kioskPin.trim()) {
          setActionError("Please enter the staff PIN before using PIN verification.");
          return;
        }
        const pinResponse = await authApi.verifyPin({ pin: kioskPin, purpose: "kiosk_attendance" });
        pinVerificationId = pinResponse.pin_verification_id;
      }

      const loc = await browserLocation();
      const payload: Record<string, unknown> = {
        child_id: child.id,
        signer_type: signer.type === "authorized_pickup" ? "authorized_pickup" : signer.type === "staff" ? "staff" : "guardian",
        signer_name: signer.name,
        verification_method: kioskMethod === "signature" ? "digital_signature" : kioskMethod,
        signature_name: kioskSignatureName,
        signature_data: kioskSignatureData(),
        signature_reference: "kiosk-tablet-drawn-signature",
        pin_verification_id: pinVerificationId,
        ...loc
      };
      if (signer.type === "authorized_pickup") payload.pickup_authorization_id = signer.id;
      if (signer.type === "guardian") payload.guardian_id = signer.id;

      const call = kioskAction === "in" ? attendanceApi.guardianCheckIn : attendanceApi.guardianCheckOut;
      await call(payload);
      setKioskSuccess(`${child.name} was signed ${kioskAction === "in" ? "in" : "out"} by ${signer.name}.`);
      setKioskStep(7);
      setKioskPin("");
      clearKioskSignature();
      await reload();
    } catch (err) {
      setActionError(friendlyError(getApiError(err).message));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="page">
      <PageHeader eyebrow="Compliance core" title="Attendance Operations" description={isFamilyChildCare ? "Manage child-based check-ins, check-outs, absences, signatures, geofence verification, and attendance records in one workspace." : "Manage live check-ins, tablet/kiosk mode, absences, early checkouts, missing checkouts, and attendance records in one workspace."} action={<button className="primary" onClick={openKioskMode}>Open tablet / kiosk mode</button>} />
      {!isOnline ? <div className="alert-banner warning">You're offline. Attendance actions require a connection — reconnect before recording check-ins or check-outs.</div> : null}
      <SuccessAlert message={success} />
      <ErrorAlert message={actionError} />

      <div className="record-tabs operation-tabs" role="tablist" aria-label="Attendance operations tabs">
        {attendanceTabs.map(([value, label]) => <button key={value} className={activeTab === value ? "active" : ""} onClick={() => chooseOperationTab(value)}>{label}</button>)}
      </div>

      {activeTab === "live" ? <Panel title="Live Status">
        <div className="metric-grid attendance-metrics">
          <div className="metric-card"><span>Currently checked in</span><strong>{liveStats.checkedIn.length}</strong><small>Children inside now</small></div>
          <div className="metric-card neutral"><span>Checked out today</span><strong>{liveStats.checkedOut.length}</strong><small>Completed pickups</small></div>
          <div className="metric-card tertiary"><span>Absent today</span><strong>{liveStats.absences.length}</strong><small>Recorded absences</small></div>
          <div className="metric-card danger"><span>Missing checkout</span><strong>{liveStats.missing.length}</strong><small>Needs correction</small></div>
          <div className="metric-card secondary"><span>Early checkout</span><strong>{liveStats.early.length}</strong><small>Left before day end</small></div>
        </div>
        <div className="dashboard-grid lower">
          <div className="card-list">
            <h2>Recent check-ins</h2>
            {liveStats.checkedIn.slice(0, 6).map((record: any) => <div className="alert-item" key={record.id}><strong>{record.childName}</strong><span>{record.classroom} - {record.checkInTime}</span></div>)}
            {!liveStats.checkedIn.length ? <div className="alert-item"><strong>No active check-ins</strong><span>Children checked in today appear here.</span></div> : null}
          </div>
          <div className="card-list">
            <h2>Recent check-outs</h2>
            {liveStats.checkedOut.slice(0, 6).map((record: any) => <div className="alert-item" key={record.id}><strong>{record.childName}</strong><span>{record.classroom} - {record.checkOutTime}</span></div>)}
            {!liveStats.checkedOut.length ? <div className="alert-item"><strong>No check-outs yet</strong><span>Completed pickups appear here.</span></div> : null}
          </div>
        </div>
      </Panel> : null}

      {activeTab === "kiosk" ? <Panel title="Kiosk / Tablet">
        <div className="compliance-strip">
          <article><strong>Parent / Guardian</strong><span>Linked children only, drawn signature for check-in/out.</span></article>
          <article><strong>Staff</strong><span>{isFamilyChildCare ? "Provider/staff attendance support for visible children." : "Assigned classroom only with staff PIN unlock."}</span></article>
          <article><strong>Admin</strong><span>{isFamilyChildCare ? "All children for family child care attendance operations." : "All classrooms and children for full attendance operations."}</span></article>
        </div>
        <div className="attendance-buttons"><button className="primary" onClick={openKioskMode}>Open Tablet / Kiosk Mode</button><button className="secondary" onClick={() => location.href = "/devices"}>View device status</button></div>
      </Panel> : null}

      {["records", "absences", "early", "missing", "corrections"].includes(activeTab) ? <Panel title="Attendance Actions">
        <div className="form-grid attendance-grid">
          {!isFamilyChildCare ? <ClassroomSelect classrooms={data?.classrooms ?? []} value={actionClassroomId} onChange={(id) => { setActionClassroomId(id); setActionChildId(""); }} /> : null}
          <ChildSelect children={actionChildren} value={actionChildId} onChange={setActionChildId} />
          <label className="field-stack"><span>Date</span><input type="date" value={actionDate} onChange={(event) => setActionDate(event.target.value)} /></label>
          <div className="attendance-buttons">
            <button className="primary" disabled={saving || !actionChildId} onClick={() => checkSelected("in")}>Check in selected child</button>
            <button className="secondary" disabled={saving || !actionChildId} onClick={() => checkSelected("out")}>Check out selected child</button>
            <button className="secondary" disabled={saving || !actionChildId} onClick={openSigningModal}>Guardian / pickup signing</button>
          </div>
        </div>
      </Panel> : null}

      {activeTab === "absences" ? <Panel title="Absence Tracking">
        <div className="form-grid attendance-grid">
          {!isFamilyChildCare ? <ClassroomSelect classrooms={data?.classrooms ?? []} value={actionClassroomId} onChange={(id) => { setActionClassroomId(id); setActionChildId(""); }} label="Classroom" /> : null}
          <ChildSelect children={actionChildren} value={actionChildId} onChange={setActionChildId} label="Absent child" />
          <label className="field-stack"><span>Absence date</span><input type="date" value={actionDate} onChange={(event) => setActionDate(event.target.value)} /></label>
          <label className="field-stack"><span>Absence type</span><select value={absenceType} onChange={(event) => setAbsenceType(event.target.value)}>
            {absenceTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label>
          <label className="field-stack"><span>Reason</span><input value={absenceReason} onChange={(event) => setAbsenceReason(event.target.value)} placeholder="Parent called in sick, vacation, no-show..." /></label>
          <label className="field-stack full"><span>Notes</span><textarea value={absenceNotes} onChange={(event) => setAbsenceNotes(event.target.value)} placeholder="Optional internal notes" /></label>
          <button className="secondary" disabled={saving || !actionChildId || !actionDate} onClick={markSelectedAbsent}>Mark selected child absent</button>
        </div>
      </Panel> : null}

      {["records", "absences", "early", "missing", "corrections"].includes(activeTab) ? <Panel title="Filters">
        <div className="record-tabs" role="tablist" aria-label="Attendance record filters">
          {[
            ["all", "All records"],
            ["checked_in", "Checked in"],
            ["checked_out", "Checked out"],
            ["absences", "Absences"],
            ["early", "Early checkouts"],
            ["missing", "Missing checkouts"],
            ["corrections", "Corrections"]
          ].map(([value, label]) => <button key={value} className={recordTab === value ? "active" : ""} onClick={() => chooseRecordTab(value)}>{label}</button>)}
        </div>
        <div className="form-grid attendance-grid">
          <label className="field-stack"><span>Date filter</span><input type="date" value={filterDate} onChange={(event) => setFilterDate(event.target.value)} /></label>
          {!isFamilyChildCare ? <ClassroomSelect classrooms={data?.classrooms ?? []} value={filterClassroomId} onChange={setFilterClassroomId} label="Classroom filter" /> : null}
          <ChildSelect children={data?.children ?? []} value={filterChildId} onChange={setFilterChildId} label="Child search" />
          <label className="field-stack"><span>Status filter</span><select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">All statuses</option>
            <option value="checked_in">Checked in</option>
            <option value="checked_out">Checked out</option>
            <option value="checked_out_early">Checked out early</option>
            <option value="missing_checkout">Missing checkout</option>
          </select></label>
          <label className="field-stack"><span>Absence type</span><select value={absenceFilterType} onChange={(event) => setAbsenceFilterType(event.target.value)}>
            <option value="">All absence types</option>
            {absenceTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label>
          <label className="field-stack"><span>Absence status</span><select value={absenceFilterStatus} onChange={(event) => setAbsenceFilterStatus(event.target.value)}>
            <option value="">All absence statuses</option>
            <option value="recorded">Recorded</option>
            <option value="reviewed">Reviewed</option>
            <option value="cancelled">Cancelled</option>
          </select></label>
          <button className="secondary" onClick={clearFilters}>Clear filters</button>
        </div>
      </Panel> : null}

      {["records", "early", "missing", "corrections"].includes(activeTab) ? <Panel title={activeTab === "early" ? "Early Checkouts" : activeTab === "missing" ? "Missing Checkouts" : activeTab === "corrections" ? "Corrections" : "Attendance Records"}>
        {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={reload} /> : (
          <DataTable rows={filteredRows} emptyTitle="No attendance records for this filter." emptyDetail="Select a child above to check in, or clear filters." columns={[
            { header: "Child", render: (row: any) => {
              const child = childById.get(String(row.childId));
              return <><strong>{row.childName}</strong><br /><small>{child ? childLabel(child) : `ID: ${row.childCode ?? "No child code"}`}</small></>;
            } },
            { header: "Child code", render: (row: any) => <Badge>{row.childCode ?? row.child_code ?? "Uncoded"}</Badge> },
            ...(!isFamilyChildCare ? [{ header: "Classroom", render: (row: any) => row.classroom }] : []),
            { header: "Date", render: (row: any) => row.date },
            { header: "Check-in", render: (row: any) => row.checkInTime ?? "Not recorded" },
            { header: "Check-out", render: (row: any) => row.checkOutTime ?? "Pending" },
            { header: "Status", render: (row: any) => {
              const value = row.status ?? (row.checkOutTime ? "checked_out" : "checked_in");
              return <Badge tone={value === "checked_in" ? "success" : value === "checked_out_early" ? "warning" : value === "missing_checkout" ? "danger" : "neutral"}>{row.statusLabel ?? String(value).replace(/_/g, " ")}</Badge>;
            } },
            { header: "Signed by", render: (row: any) => row.signedBy },
            { header: "Verification", render: (row: any) => <><span>{row.verificationMethod?.replace("_", " ")}</span>{row.hasSignature ? <><br /><small>Signature saved</small></> : null}</> },
            { header: "Actions", render: (row: any) => <div className="row-actions"><button className="action-link" onClick={() => runAction(async () => { const loc = await browserLocation(); await attendanceApi.checkIn(row.childId, "staff", "secure_login", undefined, loc); }, `${row.childName} checked in.`)}>Check in</button><button className="action-link" onClick={() => runAction(async () => { const loc = await browserLocation(); await attendanceApi.checkOut(row.childId, "staff", "secure_login", undefined, loc); }, `${row.childName} checked out.`)}>Check out</button><button className="action-link" onClick={() => openCorrection(row)}>Correct</button><button className="action-link" onClick={() => setShowAuditFor(row)}>View audit</button></div> }
          ]} />
        )}
      </Panel> : null}

      {activeTab === "absences" ? <Panel title="Absence Records">
        {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={reload} /> : (
          <DataTable rows={filteredAbsences} emptyTitle="No absence records for this filter." emptyDetail="Select a child above to mark absent, or clear filters." columns={[
            { header: "Child", render: (row: any) => {
              const child = childById.get(String(row.childId));
              return <><strong>{row.childName}</strong><br /><small>{child ? childLabel(child) : `ID: ${row.childCode ?? "No child code"}`}</small></>;
            } },
            { header: "Child code", render: (row: any) => <Badge>{row.childCode ?? row.child_code ?? "Uncoded"}</Badge> },
            ...(!isFamilyChildCare ? [{ header: "Classroom", render: (row: any) => row.classroom }] : []),
            { header: "Date", render: (row: any) => row.absenceDate ?? row.absence_date },
            { header: "Type", render: (row: any) => <Badge tone={row.absenceType === "no_show" || row.absence_type === "no_show" ? "warning" : "neutral"}>{absenceLabel(row.absenceType ?? row.absence_type ?? "")}</Badge> },
            { header: "Reason", render: (row: any) => row.reason ?? "No reason entered" },
            { header: "Status", render: (row: any) => <Badge tone={row.status === "cancelled" ? "danger" : "primary"}>{row.status}</Badge> },
            { header: "Entered by", render: (row: any) => row.enteredBy ?? "Staff" },
            { header: "Actions", render: (row: any) => <div className="row-actions"><button className="action-link" disabled={row.status === "cancelled"} onClick={() => runAction(() => absenceApi.update(row.id, { status: "reviewed" }).then(() => undefined), "Absence reviewed.")}>Review</button><button className="action-link" disabled={row.status === "cancelled"} onClick={() => runAction(() => absenceApi.cancel(row.id).then(() => undefined), "Absence cancelled.")}>Cancel</button></div> }
          ]} />
        )}
      </Panel> : null}

      {selectedRecord ? (
        <Modal title="Correct attendance record" onClose={() => setSelectedRecord(null)}>
          <div className="record-summary">
            <strong>{selectedRecord.childName} - {selectedRecord.childCode ?? "Uncoded"}</strong>
            <span>{selectedRecord.classroom} - {selectedRecord.date}</span>
            <span>Current check-in: {selectedRecord.checkInTime ?? "Not recorded"} | Current check-out: {selectedRecord.checkOutTime ?? "Pending"}</span>
          </div>
          <div className="form-grid">
            <label className="field-stack"><span>New check-in time</span><input type="datetime-local" max={nowForInput} value={newIn.length <= 5 ? `${selectedRecord.date}T${newIn}` : newIn} onChange={(event) => setNewIn(event.target.value)} /></label>
            <label className="field-stack"><span>New check-out time</span><input type="datetime-local" max={nowForInput} value={newOut.length <= 5 && newOut ? `${selectedRecord.date}T${newOut}` : newOut} onChange={(event) => setNewOut(event.target.value)} /></label>
            <textarea className="full" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Correction reason required" />
            <button className="primary" disabled={saving || !reason.trim()} onClick={() => runAction(() => attendanceApi.correct(selectedRecord.id, { reason, check_in_time: newIn || undefined, check_out_time: newOut || undefined }).then(() => undefined), "Attendance correction saved.")}>Save correction</button>
          </div>
        </Modal>
      ) : null}

      {showAuditFor ? (
        <Modal title={`Audit log: ${showAuditFor.childName}`} onClose={() => setShowAuditFor(null)}>
          <DataTable rows={(data?.auditLogs ?? []).filter((log: any) => String(log.attendance_record_id) === String(showAuditFor.id))} emptyTitle="No audit entries for this record." emptyDetail="Corrections and check-in/out edits will appear here." columns={[
            { header: "Action", render: (row: any) => row.action },
            { header: "Reason", render: (row: any) => row.reason },
            { header: "Edited by", render: (row: any) => row.editedBy ?? row.editedByEmail ?? "System" },
            { header: "Edited at", render: (row: any) => row.editedAtLocal ? `${row.date ?? ""} ${formatAttendanceTime(row.editedAtLocal, row.timezone)}` : new Date(row.edited_at).toLocaleString() }
          ]} />
        </Modal>
      ) : null}

      {signingChild ? (
        <Modal title={`Guardian / pickup signing: ${signingChild.name}`} onClose={() => setSigningChild(null)}>
          <div className="record-summary">
            <strong>{childLabel(signingChild)}</strong>
            <span>Use this for staff-assisted tablet or front-desk signing. The selected signer identity and typed signature are saved with attendance.</span>
          </div>
          <div className="form-grid">
            <label className="field-stack"><span>Action</span><select value={signingDirection} onChange={(event) => setSigningDirection(event.target.value as "in" | "out")}>
              <option value="in">Sign check-in</option>
              <option value="out">Sign check-out</option>
            </select></label>
            <label className="field-stack"><span>Authorized signer</span><select value={signerValue} onChange={(event) => {
              setSignerValue(event.target.value);
              const signer = signers.find((item) => `${item.type}:${item.id}` === event.target.value);
              setSignatureName(signer?.name ?? "");
            }}>
              <option value="">Choose guardian or authorized pickup</option>
              {signers.map((signer) => <option key={`${signer.type}:${signer.id}`} value={`${signer.type}:${signer.id}`}>{signer.name} - {signer.relationship ?? signer.type} - {signer.can_pickup ? "Pickup allowed" : "Pickup not allowed"}</option>)}
            </select></label>
            <label className="field-stack"><span>Typed signature</span><input value={signatureName} onChange={(event) => setSignatureName(event.target.value)} placeholder="Signer types their full name" /></label>
            <button className="primary" disabled={saving || !signerValue || !signatureName.trim()} onClick={submitGuardianSigning}>Save signed attendance</button>
          </div>
        </Modal>
      ) : null}

      {kioskOpen ? (
        <div className="kiosk-overlay">
          <div className="kiosk-shell">
            <header className="kiosk-header">
              <div><span>Kiosk / Tablet Mode</span><h1>Attendance signing</h1><p>Large touch-friendly flow for front-desk or classroom tablet use.</p></div>
              <button className="secondary" onClick={() => setKioskOpen(false)}>Exit kiosk</button>
            </header>
            <div className="kiosk-progress">
              {(isFamilyChildCare ? ["Child", "Action", "Signer", "Verify", "Signature", "Done"] : ["Classroom", "Child", "Action", "Signer", "Verify", "Signature", "Done"]).map((label, index) => <span key={label} className={kioskStep >= index + (isFamilyChildCare ? 2 : 1) ? "active" : ""}>{label}</span>)}
            </div>
            <ErrorAlert message={actionError} />
            <SuccessAlert message={kioskSuccess} />

            {!isFamilyChildCare && kioskStep === 1 ? <section className="kiosk-card"><h2>Select classroom</h2><div className="kiosk-choice-grid">{(data?.classrooms ?? []).map((room: any) => <button key={room.id} className={String(room.id) === kioskClassroomId ? "kiosk-choice selected" : "kiosk-choice"} onClick={() => { setKioskClassroomId(String(room.id)); setKioskChildId(""); }}>{room.name}<small>Capacity {room.capacity ?? "n/a"}</small></button>)}</div><button className="primary" disabled={!kioskClassroomId} onClick={() => setKioskStep(2)}>Continue</button></section> : null}

            {kioskStep === 2 ? <section className="kiosk-card"><h2>Select child</h2><div className="kiosk-choice-grid children">{kioskChildren.map((child: any) => <button key={child.id} className={String(child.id) === kioskChildId ? "kiosk-choice selected" : "kiosk-choice"} onClick={() => setKioskChildId(String(child.id))}>{child.name}<small>{isFamilyChildCare ? "Family child care" : child.classroom} - ID: {child.childCode ?? child.child_code}</small></button>)}</div><div className="kiosk-actions">{!isFamilyChildCare ? <button className="secondary" onClick={() => setKioskStep(1)}>Back</button> : null}<button className="primary" disabled={!kioskChildId} onClick={() => setKioskStep(3)}>Continue</button></div></section> : null}

            {kioskStep === 3 ? <section className="kiosk-card"><h2>Choose action</h2><div className="kiosk-choice-grid">{[{ id: "in", label: "Check in" }, { id: "out", label: "Check out" }, { id: "absent", label: "Mark absent" }].map((action) => <button key={action.id} className={kioskAction === action.id ? "kiosk-choice selected" : "kiosk-choice"} onClick={() => setKioskAction(action.id as "in" | "out" | "absent")}>{action.label}</button>)}</div><div className="kiosk-actions"><button className="secondary" onClick={() => setKioskStep(2)}>Back</button><button className="primary" onClick={continueFromKioskAction}>Continue</button></div></section> : null}

            {kioskStep === 4 ? <section className="kiosk-card"><h2>Select signer</h2><div className="kiosk-choice-grid children"><button className={kioskSignerValue === "staff:staff" ? "kiosk-choice selected" : "kiosk-choice"} onClick={() => chooseKioskSigner("staff:staff")}>Staff-assisted<small>Logged-in staff signs and records verification</small></button>{kioskSigners.map((signer) => <button key={`${signer.type}:${signer.id}`} className={kioskSignerValue === `${signer.type}:${signer.id}` ? "kiosk-choice selected" : "kiosk-choice"} onClick={() => chooseKioskSigner(`${signer.type}:${signer.id}`)}>{signer.name}<small>{signer.relationship ?? signer.type} - {signer.can_pickup ? "Authorized" : "Not authorized"}</small></button>)}</div><div className="kiosk-actions"><button className="secondary" onClick={() => setKioskStep(3)}>Back</button><button className="primary" disabled={!kioskSignerValue} onClick={() => setKioskStep(5)}>Continue</button></div></section> : null}

            {kioskStep === 5 ? <section className="kiosk-card"><h2>Verification method</h2><div className="kiosk-choice-grid">{[{ id: "secure_login", label: "Secure login", detail: "Use the logged-in staff session" }, { id: "pin", label: "PIN", detail: "Verify staff PIN before saving" }, { id: "signature", label: "Signature", detail: "Drawn signature saved securely" }].map((method) => <button key={method.id} className={kioskMethod === method.id ? "kiosk-choice selected" : "kiosk-choice"} onClick={() => setKioskMethod(method.id)}>{method.label}<small>{method.detail}</small></button>)}</div>{kioskMethod === "pin" ? <label className="kiosk-input"><span>Staff PIN</span><input type="password" inputMode="numeric" maxLength={8} value={kioskPin} onChange={(event) => setKioskPin(event.target.value)} placeholder="Enter staff PIN" /></label> : null}<div className="kiosk-actions"><button className="secondary" onClick={() => setKioskStep(4)}>Back</button><button className="primary" onClick={() => setKioskStep(6)}>Continue</button></div></section> : null}

            {kioskStep === 6 ? <section className="kiosk-card"><h2>{kioskAction === "absent" ? "Confirm absence" : "Draw signature"}</h2><div className="record-summary"><strong>{selectedKioskChild() ? childLabel(selectedKioskChild()) : "No child selected"}</strong><span>Action: {kioskAction === "in" ? "Check in" : kioskAction === "out" ? "Check out" : "Mark absent"}</span>{selectedKioskSigner() ? <span>Signer: {selectedKioskSigner()?.name}</span> : null}</div>{kioskAction === "absent" ? <div className="form-grid">
              <label className="field-stack"><span>Absence type</span><select value={kioskAbsenceType} onChange={(event) => setKioskAbsenceType(event.target.value)}>{absenceTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="field-stack"><span>Reason</span><input value={kioskAbsenceReason} onChange={(event) => setKioskAbsenceReason(event.target.value)} placeholder="Parent reported sick, vacation, no-show..." /></label>
              <label className="field-stack full"><span>Notes</span><textarea value={kioskAbsenceNotes} onChange={(event) => setKioskAbsenceNotes(event.target.value)} placeholder="Optional internal notes" /></label>
            </div> : <><label className="kiosk-input"><span>Signer typed name</span><input value={kioskSignatureName} onChange={(event) => setKioskSignatureName(event.target.value)} placeholder="Full legal name" /></label><div className="signature-pad"><div><strong>Draw signature</strong><span>{kioskSignatureDrawn ? "Signature captured" : "Use finger, stylus, or mouse"}</span></div><canvas ref={signatureCanvasRef} onPointerDown={startSignature} onPointerMove={drawSignature} onPointerUp={endSignature} onPointerLeave={endSignature} /><button className="secondary" type="button" onClick={clearKioskSignature}>Clear signature</button></div></>}<div className="kiosk-actions"><button className="secondary" onClick={() => setKioskStep(kioskAction === "absent" ? 3 : 5)}>Back</button><button className="primary" disabled={saving} onClick={submitKiosk}>{kioskAction === "absent" ? `Mark ${absenceLabel(kioskAbsenceType).toLowerCase()} absence` : "Save signed attendance"}</button></div></section> : null}

            {kioskStep === 7 ? <section className="kiosk-card confirmation"><h2>Saved</h2><p>{kioskSuccess}</p><div className="kiosk-actions"><button className="secondary" onClick={() => setKioskOpen(false)}>Exit kiosk</button><button className="primary" onClick={openKioskMode}>Start another attendance action</button></div></section> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
