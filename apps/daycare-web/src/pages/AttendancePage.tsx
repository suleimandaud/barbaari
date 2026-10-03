import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft, CalendarBlank, CaretLeft, CaretRight, Check, CheckSquare, DeviceTablet, Eraser, Export, IdentificationBadge, Info, LockSimple, MinusCircle, SignIn, SignOut } from "@phosphor-icons/react";
import { absenceApi, attendanceApi, authApi, childrenApi, classroomsApi, getApiError, mergedAttendance, organizationApi } from "@barbaari/shared";
import {
  Alert, Avatar, Dialog, Drawer, EmptyState, LogoTile, ErrorState, Field, LoadingState, OfflineBanner, PageHeader, PinPad, SearchInput, Segmented, Stat, Status, StatusBadge,
  Tabs, clockTime, recordTime, shortDate, useToast
} from "@barbaari/shared/web/ui";
import { accountStatuses, attendanceStatuses, resolveStatus, type StatusSpec } from "@barbaari/shared/web/status";
import { DataTable } from "../components/DataTable";
import { ChildSelect, ClassroomSelect } from "../components/Selects";
import { useAsyncData } from "../hooks/useAsyncData";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { friendlyError } from "../utils/labels";

type TabKey = "live" | "absences" | "early" | "missing" | "corrections";

const absenceTypes = [
  ["excused", "Excused"],
  ["unexcused", "Unexcused"],
  ["sick", "Sick"],
  ["vacation", "Vacation"],
  ["no_show", "No-show"],
  ["other", "Other"]
] as const;

/** Old tab/view names (and the sidebar's ?tab=kiosk) keep working. */
function initialTab(value: string | null): TabKey {
  if (value === "absences" || value === "early" || value === "missing" || value === "corrections") return value;
  return "live";
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

/** Minutes after midnight in the organization's timezone, for the day timeline. */
function minutesInZone(iso?: string | null, timeZone?: string) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: timeZone || undefined }).formatToParts(date);
    const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
    const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
    return (hour % 24) * 60 + minute;
  } catch {
    return date.getHours() * 60 + date.getMinutes();
  }
}

const DAY_START = 7 * 60;
const DAY_SPAN = 11 * 60;
const toPercent = (minutes: number) => `${Math.max(0, Math.min(100, ((minutes - DAY_START) / DAY_SPAN) * 100)).toFixed(2)}%`;

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

type RosterRow = { child: any; record?: any; absence?: any; statusKey: string; spec: StatusSpec; sub: string };

export function AttendancePage() {
  const isOnline = useOnlineStatus();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const today = new Date().toISOString().slice(0, 10);
  const [filterDate, setFilterDate] = useState(today);
  const { data, loading, error, reload } = useAsyncData(async () => {
    // Every view on this page is keyed to either the selected date or today. Open check-ins are
    // added so missing checkouts from earlier days are visible on the Missing checkouts tab.
    const dates = filterDate ? [...new Set([filterDate, today])] : [];
    const [attendance, absenceLists, children, classrooms, organization] = await Promise.all([
      dates.length ? mergedAttendance([...dates.map((date) => ({ date })), { open: 1 as const }]) : attendanceApi.managerList().then((result) => result.attendance),
      Promise.all(dates.length ? dates.map((date) => absenceApi.list({ date })) : [absenceApi.list()]),
      childrenApi.managerList(),
      classroomsApi.list(),
      organizationApi.get()
    ]);
    const absences = [...new Map(absenceLists.flatMap((list) => list.absence_records ?? []).map((record: any) => [String(record.id), record])).values()];
    return { attendance, absences, children: children.children, classrooms: classrooms.classrooms, organization: organization.organization };
  }, [filterDate, today]);
  const nowForInput = useMemo(() => new Date().toISOString().slice(0, 16), []);
  const [actionDate, setActionDate] = useState(today);
  const [actionClassroomId, setActionClassroomId] = useState("");
  const [actionChildId, setActionChildId] = useState("");
  const [roomFilter, setRoomFilter] = useState("all");
  const [childSearch, setChildSearch] = useState("");
  const [absenceType, setAbsenceType] = useState("sick");
  const [absenceReason, setAbsenceReason] = useState("");
  const [absenceNotes, setAbsenceNotes] = useState("");
  const [absenceFilterType, setAbsenceFilterType] = useState("");
  const [absenceFilterStatus, setAbsenceFilterStatus] = useState("");
  const [selectedRecord, setSelectedRecord] = useState<any | null>(null);
  const [detailsFor, setDetailsFor] = useState<RosterRow | null>(null);
  const [absenceFormOpen, setAbsenceFormOpen] = useState(searchParams.get("record") === "1");
  const [showAuditFor, setShowAuditFor] = useState<any | null>(null);
  // Audit entries are fetched for the one record being inspected, rather than loading the
  // organization's whole audit history up front on every page load and every action.
  const [recordAuditLogs, setRecordAuditLogs] = useState<{ recordId: string; logs: any[] } | null>(null);
  useEffect(() => {
    if (!showAuditFor) return;
    let active = true;
    const recordId = String(showAuditFor.id);
    attendanceApi.auditLogs({ attendance_record_id: recordId })
      .then((response) => { if (active) setRecordAuditLogs({ recordId, logs: response.audit_logs ?? [] }); })
      .catch(() => { if (active) setRecordAuditLogs({ recordId, logs: [] }); });
    return () => { active = false; };
  }, [showAuditFor]);
  const [signingChild, setSigningChild] = useState<any | null>(null);
  const [signers, setSigners] = useState<any[]>([]);
  const [signerValue, setSignerValue] = useState("");
  const [signatureName, setSignatureName] = useState("");
  const [signingDirection, setSigningDirection] = useState<"in" | "out">("in");
  const [kioskOpen, setKioskOpen] = useState(false);
  const [kioskStep, setKioskStep] = useState(2);
  const [kioskClassroomId, setKioskClassroomId] = useState("");
  const [kioskChildId, setKioskChildId] = useState("");
  const [kioskSearch, setKioskSearch] = useState("");
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
  const [kioskCountdown, setKioskCountdown] = useState(0);
  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const [newIn, setNewIn] = useState("");
  const [newOut, setNewOut] = useState("");
  const [reason, setReason] = useState("");
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab(searchParams.get("tab") ?? searchParams.get("view")));

  const childById = useMemo(() => new Map((data?.children ?? []).map((child: any) => [String(child.id), child])), [data?.children]);
  const isFamilyChildCare = data?.organization?.facility_type === "family_child_care";
  const orgTimezone = data?.attendance?.[0]?.timezone ?? data?.organization?.attendance_timezone ?? data?.organization?.timezone;
  const actionChildren = useMemo(() => {
    return actionClassroomId ? (data?.children ?? []).filter((child: any) => String(child.classroomId) === actionClassroomId) : data?.children ?? [];
  }, [actionClassroomId, data?.children]);

  // The sidebar's "Tablet mode" link lands here with ?tab=kiosk and opens the kiosk directly.
  useEffect(() => {
    if (searchParams.get("tab") === "kiosk" && data && !kioskOpen) openKioskMode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, data]);

  const dayRecords = useMemo(() => (data?.attendance ?? []).filter((record: any) => !filterDate || record.date === filterDate), [data?.attendance, filterDate]);
  const dayAbsences = useMemo(() => (data?.absences ?? []).filter((record: any) => (!filterDate || (record.absenceDate ?? record.absence_date) === filterDate) && record.status !== "cancelled"), [data?.absences, filterDate]);

  const roster = useMemo<RosterRow[]>(() => {
    const recordByChild = new Map(dayRecords.map((record: any) => [String(record.childId), record]));
    const absenceByChild = new Map(dayAbsences.map((absence: any) => [String(absence.childId), absence]));
    // A check-in from an earlier day that was never closed still needs resolving today.
    const openByChild = new Map((data?.attendance ?? []).filter((record: any) => record.status === "missing_checkout").map((record: any) => [String(record.childId), record]));
    const query = childSearch.trim().toLowerCase();
    return (data?.children ?? [])
      .filter((child: any) => roomFilter === "all" || String(child.classroomId) === roomFilter)
      .filter((child: any) => !query || `${child.name} ${child.childCode ?? ""}`.toLowerCase().includes(query))
      .map((child: any) => {
        const absence = absenceByChild.get(String(child.id));
        const record = recordByChild.get(String(child.id)) ?? (!absence && filterDate === today ? openByChild.get(String(child.id)) : undefined);
        let statusKey = "not_checked_in";
        let sub = filterDate === today ? "Not checked in yet" : "No attendance record";
        if (record) {
          statusKey = record.status ?? (record.checkOutTime ? "checked_out" : "checked_in");
          if (statusKey === "checked_in") sub = `In ${recordTime(record, "in")}`;
          else if (statusKey === "missing_checkout") sub = `Open since ${shortDate(record.date, { weekday: "short" })} ${recordTime(record, "in")}`;
          else sub = `Out ${recordTime(record, "out")}`;
        } else if (absence) {
          statusKey = "absent";
          sub = absence.reason || absenceLabel(absence.absenceType ?? absence.absence_type ?? "");
        }
        return { child, record, absence, statusKey, spec: resolveStatus(attendanceStatuses, statusKey), sub };
      });
  }, [data?.children, dayRecords, dayAbsences, roomFilter, childSearch, filterDate, today]);

  const stats = useMemo(() => {
    const count = (key: string) => roster.filter((row) => row.statusKey === key).length;
    return {
      expected: roster.length,
      checkedIn: roster.filter((row) => row.record?.checkInTime || row.record?.checkInAt).length,
      present: count("checked_in") + count("missing_checkout"),
      checkedOut: count("checked_out") + count("checked_out_early"),
      absent: count("absent"),
      notArrived: count("not_checked_in")
    };
  }, [roster]);

  // The room filter and child search apply to every tab, not only the live roster.
  const matchesFilters = useMemo(() => {
    const query = childSearch.trim().toLowerCase();
    return (row: any) => {
      const child = childById.get(String(row.childId));
      const roomOk = roomFilter === "all" || String(child?.classroomId ?? row.classroomId) === roomFilter;
      const searchOk = !query || `${row.childName ?? ""} ${row.childCode ?? row.child_code ?? ""}`.toLowerCase().includes(query);
      return roomOk && searchOk;
    };
  }, [childById, roomFilter, childSearch]);
  const earlyRecords = useMemo(() => dayRecords.filter((record: any) => record.status === "checked_out_early").filter(matchesFilters), [dayRecords, matchesFilters]);
  const missingRecords = useMemo(() => (data?.attendance ?? []).filter((record: any) => record.status === "missing_checkout").filter(matchesFilters), [data?.attendance, matchesFilters]);
  const correctedRecords = useMemo(() => dayRecords.filter((record: any) => record.corrected).filter(matchesFilters), [dayRecords, matchesFilters]);
  const filteredAbsences = useMemo(() => (data?.absences ?? []).filter((record: any) => (!filterDate || (record.absenceDate ?? record.absence_date) === filterDate)
    && (!absenceFilterType || (record.absenceType ?? record.absence_type) === absenceFilterType)
    && (!absenceFilterStatus || record.status === absenceFilterStatus)).filter(matchesFilters), [data?.absences, filterDate, absenceFilterType, absenceFilterStatus, matchesFilters]);

  async function runAction(action: () => Promise<void>, message: string) {
    setSaving(true);
    setActionError("");
    if (!isOnline) {
      setActionError("You're offline. Please reconnect and try again.");
      setSaving(false);
      return;
    }
    try {
      await action();
      toast(message);
      setSelectedRecord(null);
      setShowAuditFor(null);
      setSigningChild(null);
      setDetailsFor(null);
      setAbsenceFormOpen(false);
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
    const child = childById.get(String(actionChildId));
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

  function checkChild(child: any, direction: "in" | "out") {
    const call = direction === "in" ? attendanceApi.checkIn : attendanceApi.checkOut;
    void runAction(async () => {
      const loc = await browserLocation();
      await call(child.id, "staff", "secure_login", undefined, loc);
    }, `${child.name} checked ${direction}.`);
  }

  function chooseTab(value: TabKey) {
    setActiveTab(value);
    setSearchParams(value === "live" ? {} : { tab: value });
  }

  function openCorrection(record: any) {
    setDetailsFor(null);
    setSelectedRecord(record);
    setNewIn(record.checkInTime ?? "");
    setNewOut(record.checkOutTime ?? "");
    setReason("");
    setActionError("");
  }

  async function openSigningModal(child: any, direction: "in" | "out" = "in") {
    setSaving(true);
    setActionError("");
    try {
      const response = await childrenApi.pickupSigners(child.id);
      setSigners(response.signers ?? []);
      setDetailsFor(null);
      setSigningChild(child);
      setSignerValue("");
      setSignatureName("");
      setSigningDirection(direction);
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

  function openKioskMode() {
    setKioskOpen(true);
    setKioskStep(2);
    setKioskClassroomId("");
    setKioskChildId("");
    setKioskSearch("");
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
    setKioskCountdown(0);
    setActionError("");
  }

  function closeKiosk() {
    setKioskOpen(false);
    if (searchParams.get("tab") === "kiosk") setSearchParams({});
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
      setKioskSignatureName("Staff-assisted");
      setKioskStep(nextStep);
    } catch (err) {
      setActionError(friendlyError(getApiError(err).message));
    } finally {
      setSaving(false);
    }
  }

  function chooseKioskAction(action: "in" | "out" | "absent") {
    setKioskAction(action);
    setActionError("");
    if (action === "absent") {
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
        ctx.strokeStyle = "#173236";
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

  // Done screen returns to the child list on its own, as in the tablet design (3f).
  useEffect(() => {
    if (!kioskOpen || kioskStep !== 7) return;
    setKioskCountdown(8);
    const timer = window.setInterval(() => {
      setKioskCountdown((value) => {
        if (value <= 1) {
          window.clearInterval(timer);
          openKioskMode();
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kioskOpen, kioskStep]);

  const rooms = (data?.classrooms ?? []) as any[];
  const nowMinutes = filterDate === today ? minutesInZone(new Date().toISOString(), orgTimezone) : null;
  const tabs = [
    { key: "live" as const, label: "Live" },
    { key: "absences" as const, label: "Absences", count: dayAbsences.length },
    { key: "early" as const, label: "Early checkouts", count: earlyRecords.length },
    { key: "missing" as const, label: "Missing checkouts", count: missingRecords.length, alert: missingRecords.length > 0 },
    { key: "corrections" as const, label: "Corrections", ...(correctedRecords.length ? { count: correctedRecords.length } : {}) }
  ];

  const recordColumns = [
    { header: "Child", render: (row: any) => <div className="bb-person"><Avatar name={row.childName} seed={row.childId} /><div><strong>{row.childName}</strong><span>{isFamilyChildCare ? row.childCode : `${row.classroom} · ${row.childCode ?? ""}`}</span></div></div> },
    { header: "Date", render: (row: any) => shortDate(row.date, { weekday: "short", day: "numeric", month: "short" }) },
    { header: "In", render: (row: any) => recordTime(row, "in") || "—" },
    { header: "Out", render: (row: any) => recordTime(row, "out") || "—" },
    { header: "Status", render: (row: any) => <StatusBadge map={attendanceStatuses} value={row.status} /> },
    { header: "Signed by", render: (row: any) => <>{row.signedBy}<span className="sub">{String(row.verificationMethod ?? "").replace(/_/g, " ")}{row.hasSignature ? " · signature" : ""}</span></> },
    { header: "", render: (row: any) => <div className="bb-row" style={{ justifyContent: "flex-end", gap: 5 }}><button className="bb-btn bb-btn-secondary" onClick={() => openCorrection(row)}>{row.status === "missing_checkout" ? "Resolve" : "Correct"}</button><button className="bb-btn bb-btn-ghost" onClick={() => setShowAuditFor(row)}>Audit</button></div> }
  ];

  return (
    <main className="bb-page">
      <PageHeader
        kicker="Live check-ins, absences and corrections"
        title="Attendance"
        // actions={<>
        //   <button className="bb-btn bb-btn-secondary bb-btn-lg" onClick={() => runAction(async () => { const result = await attendanceApi.export(); toast(result.message ?? "Attendance export requested."); }, "Attendance export requested.")}><Export />Export</button>
        //   <button className="bb-btn bb-btn-primary bb-btn-lg" onClick={openKioskMode}><DeviceTablet />Tablet mode</button>
        // </>}
      />
      <OfflineBanner online={isOnline} />
      {actionError && !kioskOpen ? <Alert tone="danger" title="That didn’t work">{actionError}</Alert> : null}

      <Tabs items={tabs} value={activeTab} onChange={chooseTab} label="Attendance views" />

      <div className="bb-toolbar">
        <div className="bb-date-step">
          <button className="bb-btn bb-btn-secondary bb-btn-icon" aria-label="Previous day" onClick={() => setFilterDate(shiftDate(filterDate || today, -1))}><CaretLeft size={18} /></button>
          <label className="bb-btn bb-btn-secondary bb-date-btn">
            <CalendarBlank />
            <span>{filterDate ? `${filterDate === today ? "Today, " : ""}${shortDate(filterDate, { weekday: "short", day: "numeric", month: "short" })}` : "All dates"}</span>
            <input type="date" aria-label="Date" value={filterDate} max={today} onChange={(event) => setFilterDate(event.target.value)} />
          </label>
          <button className="bb-btn bb-btn-secondary bb-btn-icon" aria-label="Next day" disabled={!filterDate || filterDate >= today} onClick={() => setFilterDate(shiftDate(filterDate || today, 1))}><CaretRight size={18} /></button>
        </div>
        {!isFamilyChildCare && rooms.length ? <Segmented label="Classroom" value={roomFilter} onChange={setRoomFilter} items={[{ key: "all", label: "All rooms" }, ...rooms.map((room) => ({ key: String(room.id), label: String(room.name).replace(/ Room$/, "") }))]} /> : null}
        <span className="bb-grow" />
        <SearchInput value={childSearch} onChange={setChildSearch} placeholder="Find a child" />
      </div>

      {loading && !data ? <LoadingState /> : error ? <ErrorState message={error} onRetry={reload} /> : null}

      {data && activeTab === "live" ? (
        <>
          <div className="bb-stats" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))" }}>
            <Stat value={stats.expected} label={filterDate === today ? "Expected today" : "Enrolled"} />
            <Stat value={stats.checkedIn} label="Checked in" />
            <Stat value={stats.present} label="Present now" icon="check" labelTone="ok" tone="accent" />
            <Stat value={stats.checkedOut} label="Checked out" icon="signOut" />
            <Stat value={stats.absent} label="Absent" icon="minus" />
            <Stat value={stats.notArrived} label="Not arrived" icon="clock" labelTone="warn" />
          </div>
          {roster.length ? (
            <div className="bb-table-wrap">
              <table className="bb-table bb-roster">
                <thead><tr><th>Child</th><th>Status</th><th className="bb-timeline-head" aria-label="Time on site"><div>{[["7 AM", 7], ["10", 10], ["1 PM", 13], ["4", 16], ["6 PM", 18]].map(([label, hour]) => <span key={label} style={{ left: toPercent(Number(hour) * 60) }}>{label}</span>)}</div></th><th className="right">Action</th></tr></thead>
                <tbody>
                  {roster.map((row) => {
                    const inMin = minutesInZone(row.record?.checkInLocal ?? row.record?.checkInAt, row.record?.timezone ?? orgTimezone);
                    const outMin = minutesInZone(row.record?.checkOutLocal ?? row.record?.checkOutAt, row.record?.timezone ?? orgTimezone);
                    const endMin = outMin ?? nowMinutes;
                    return (
                      <tr key={row.child.id}>
                        <td><button className="bb-person link" style={{ background: "none", border: 0, padding: 0, textAlign: "left" }} onClick={() => setDetailsFor(row)}><Avatar name={row.child.name} seed={row.child.id} /><div><strong>{row.child.name}</strong><span>{isFamilyChildCare ? row.child.childCode : row.child.classroom}</span></div></button></td>
                        <td><Status spec={row.spec} /><span className="sub" style={{ marginTop: 4 }}>{row.sub}</span></td>
                        <td className="bb-timeline-cell">
                          <div className="bb-timeline" aria-hidden>
                            {inMin !== null && endMin !== null && row.record?.date === filterDate ? <i className={outMin !== null ? "out" : undefined} style={{ left: toPercent(inMin), width: `calc(${toPercent(Math.max(endMin, inMin + 5))} - ${toPercent(inMin)})` }} /> : null}
                            {nowMinutes !== null ? <b style={{ left: toPercent(nowMinutes) }} /> : null}
                          </div>
                        </td>
                        <td className="right">
                          {row.statusKey === "checked_in" ? <button className="bb-btn bb-btn-secondary" disabled={saving} onClick={() => checkChild(row.child, "out")}>Check out</button>
                            : row.statusKey === "not_checked_in" && filterDate === today ? <button className="bb-btn bb-btn-primary" disabled={saving} onClick={() => checkChild(row.child, "in")}>Check in</button>
                            : row.statusKey === "missing_checkout" ? <button className="bb-btn bb-btn-secondary" onClick={() => openCorrection(row.record)}>Resolve</button>
                            : <button className="bb-btn bb-btn-ghost" onClick={() => setDetailsFor(row)}>Details</button>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <EmptyState title={childSearch ? "No children match that search" : "No children enrolled yet"}>{childSearch ? "Try a different name or child code." : "Add children to start recording attendance."}</EmptyState>}
          <p className="bb-note"><span className="bb-now-key" aria-hidden />{nowMinutes !== null ? `Now, ${clockTime(new Date().toISOString(), orgTimezone)} · ` : ""}showing {roster.length} of {data.children.length} · teal bar = time on site, grey = picked up</p>
        </>
      ) : null}

      {data && activeTab === "absences" ? (
        <section>
          <div className="bb-toolbar" style={{ marginBottom: 20 }}>
            <select className="bb-input" aria-label="Absence type" value={absenceFilterType} onChange={(event) => setAbsenceFilterType(event.target.value)}>
              <option value="">All absence types</option>
              {absenceTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select className="bb-input" aria-label="Absence status" value={absenceFilterStatus} onChange={(event) => setAbsenceFilterStatus(event.target.value)}>
              <option value="">All statuses</option>
              <option value="recorded">Recorded</option>
              <option value="reviewed">Reviewed</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <span className="bb-grow" />
            <button className="bb-btn bb-btn-primary" onClick={() => { setActionDate(filterDate || today); setAbsenceFormOpen(true); }}><MinusCircle />Record absence</button>
          </div>
          <DataTable rows={filteredAbsences} emptyTitle="No absences for this day" emptyDetail="Recorded absences and no-shows appear here." columns={[
            { header: "Child", render: (row: any) => <div className="bb-person"><Avatar name={row.childName} seed={row.childId} /><div><strong>{row.childName}</strong><span>{isFamilyChildCare ? row.childCode : row.classroom}</span></div></div> },
            { header: "Date", render: (row: any) => shortDate(row.absenceDate ?? row.absence_date, { weekday: "short", day: "numeric", month: "short" }) },
            { header: "Type", render: (row: any) => <span className={`bb-tag${(row.absenceType ?? row.absence_type) === "no_show" ? " accent" : ""}`}>{absenceLabel(row.absenceType ?? row.absence_type ?? "")}</span> },
            { header: "Reason", render: (row: any) => row.reason ?? <span className="bb-muted">No reason entered</span> },
            { header: "Status", render: (row: any) => <StatusBadge map={{ ...accountStatuses, recorded: { label: "Recorded", tone: "absent", icon: "minus" }, reviewed: { label: "Reviewed", tone: "ok", icon: "check" } }} value={row.status} /> },
            { header: "Entered by", render: (row: any) => row.enteredBy ?? "Staff" },
            { header: "", render: (row: any) => <div className="bb-row" style={{ justifyContent: "flex-end", gap: 5, flexWrap: "nowrap" }}><button className="bb-btn bb-btn-secondary" disabled={row.status === "cancelled" || row.status === "reviewed"} onClick={() => runAction(() => absenceApi.update(row.id, { status: "reviewed" }).then(() => undefined), "Absence reviewed.")}>Review</button><button className="bb-btn bb-btn-ghost" disabled={row.status === "cancelled"} onClick={() => runAction(() => absenceApi.cancel(row.id).then(() => undefined), "Absence cancelled.")}>Cancel</button></div> }
          ]} />
        </section>
      ) : null}

      {absenceFormOpen && data ? (
        <Drawer title="Record an absence" onClose={() => setAbsenceFormOpen(false)} footer={<><button className="bb-btn bb-btn-secondary bb-btn-lg" onClick={() => setAbsenceFormOpen(false)}>Cancel</button><button className="bb-btn bb-btn-primary bb-btn-lg" disabled={saving || !actionChildId || !actionDate} onClick={markSelectedAbsent}><MinusCircle />Mark absent</button></>}>
          {actionError ? <Alert tone="danger">{actionError}</Alert> : null}
          <div className="bb-stack">
            {!isFamilyChildCare ? <ClassroomSelect classrooms={rooms} value={actionClassroomId} onChange={(id) => { setActionClassroomId(id); setActionChildId(""); }} label="Classroom" /> : null}
            <ChildSelect children={actionChildren} value={actionChildId} onChange={setActionChildId} label="Child" placeholder="Choose a child" />
            <Field label="Date"><input className="bb-input" type="date" value={actionDate} onChange={(event) => setActionDate(event.target.value)} /></Field>
            <Field label="Type"><select className="bb-input" value={absenceType} onChange={(event) => setAbsenceType(event.target.value)}>{absenceTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
            <Field label="Reason"><input className="bb-input" value={absenceReason} onChange={(event) => setAbsenceReason(event.target.value)} placeholder="Parent called in sick, vacation, no-show…" /></Field>
            <Field label="Notes (internal)"><textarea className="bb-input" value={absenceNotes} onChange={(event) => setAbsenceNotes(event.target.value)} placeholder="Optional" /></Field>
          </div>
        </Drawer>
      ) : null}

      {data && activeTab === "early" ? <DataTable rows={earlyRecords} columns={recordColumns} emptyTitle="No early checkouts" emptyDetail="Children picked up before the end of the attendance day appear here." /> : null}
      {data && activeTab === "missing" ? <DataTable rows={missingRecords} columns={recordColumns} emptyTitle="No missing checkouts" emptyDetail="Every child who was checked in has been checked out." /> : null}
      {data && activeTab === "corrections" ? <DataTable rows={correctedRecords} columns={recordColumns} emptyTitle="No corrections for this day" emptyDetail="Corrected check-in and check-out times appear here with their reason in the audit log." /> : null}

      {detailsFor ? (
        <Dialog title={detailsFor.child.name} onClose={() => setDetailsFor(null)}>
          <div className="bb-stack" style={{ gap: 15 }}>
            <div className="bb-row"><Status spec={detailsFor.spec} /><span>{detailsFor.sub}</span></div>
            <p className="bb-muted">{[isFamilyChildCare ? "Family child care" : detailsFor.child.classroom, detailsFor.child.childCode].filter(Boolean).join(" · ")}{detailsFor.record?.signedBy ? ` · signed by ${detailsFor.record.signedBy}` : ""}</p>
            <div className="bb-row">
              <button className="bb-btn bb-btn-primary" disabled={saving} onClick={() => checkChild(detailsFor.child, "in")}><SignIn />Check in</button>
              <button className="bb-btn bb-btn-secondary" disabled={saving} onClick={() => checkChild(detailsFor.child, "out")}><SignOut />Check out</button>
              <button className="bb-btn bb-btn-secondary" disabled={saving} onClick={() => openSigningModal(detailsFor.child, detailsFor.record && !detailsFor.record.checkOutTime ? "out" : "in")}>Guardian / pickup signing</button>
            </div>
            <div className="bb-row">
              {detailsFor.record ? <button className="bb-btn bb-btn-secondary" onClick={() => openCorrection(detailsFor.record)}>Correct times</button> : null}
              {detailsFor.record ? <button className="bb-btn bb-btn-ghost" onClick={() => { setShowAuditFor(detailsFor.record); setDetailsFor(null); }}>View audit</button> : null}
              <button className="bb-btn bb-btn-ghost" onClick={() => { setActionChildId(String(detailsFor.child.id)); setActionClassroomId(""); setActionDate(filterDate || today); setDetailsFor(null); chooseTab("absences"); setAbsenceFormOpen(true); }}>Record absence</button>
            </div>
          </div>
        </Dialog>
      ) : null}

      {selectedRecord ? (
        <Dialog title="Correct attendance" onClose={() => setSelectedRecord(null)} actions={<><button className="bb-btn bb-btn-secondary" onClick={() => setSelectedRecord(null)}>Cancel</button><button className="bb-btn bb-btn-primary" disabled={saving || !reason.trim()} onClick={() => runAction(() => attendanceApi.correct(selectedRecord.id, { reason, check_in_time: newIn || undefined, check_out_time: newOut || undefined }).then(() => undefined), "Attendance correction saved.")}>Save correction</button></>}>
          <div className="bb-stack" style={{ gap: 15 }}>
            <p><strong>{selectedRecord.childName}</strong> · {selectedRecord.childCode ?? ""} · {shortDate(selectedRecord.date, { weekday: "long", day: "numeric", month: "long" })}</p>
            <p className="bb-muted">Currently in {recordTime(selectedRecord, "in") || "not recorded"} · out {recordTime(selectedRecord, "out") || "not recorded"}</p>
            {actionError ? <Alert tone="danger">{actionError}</Alert> : null}
            <div className="bb-form-grid">
              <Field label="New check-in time"><input className="bb-input" type="datetime-local" max={nowForInput} value={newIn.length <= 5 ? `${selectedRecord.date}T${newIn}` : newIn} onChange={(event) => setNewIn(event.target.value)} /></Field>
              <Field label="New check-out time"><input className="bb-input" type="datetime-local" max={nowForInput} value={newOut.length <= 5 && newOut ? `${selectedRecord.date}T${newOut}` : newOut} onChange={(event) => setNewOut(event.target.value)} /></Field>
              <Field label="Reason (required, kept in the audit log)" className="full"><textarea className="bb-input" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Parent called ahead, tablet was offline…" /></Field>
            </div>
          </div>
        </Dialog>
      ) : null}

      {showAuditFor ? (
        <Dialog wide title={`Audit history · ${showAuditFor.childName}`} onClose={() => setShowAuditFor(null)}>
          {recordAuditLogs?.recordId !== String(showAuditFor.id) ? <LoadingState rows={3} /> : (
            <DataTable rows={recordAuditLogs.logs.filter((log: any) => String(log.attendance_record_id) === String(showAuditFor.id))} emptyTitle="No audit entries for this record" emptyDetail="Corrections and check-in/out edits will appear here." columns={[
              { header: "When", render: (row: any) => `${shortDate(row.date)} · ${clockTime(row.editedAtLocal ?? row.edited_at, row.timezone)}` },
              { header: "Action", render: (row: any) => String(row.action ?? "").replace(/_/g, " ") },
              { header: "Reason", render: (row: any) => row.reason },
              { header: "By", render: (row: any) => row.editedBy ?? row.editedByEmail ?? "System" }
            ]} />
          )}
        </Dialog>
      ) : null}

      {signingChild ? (
        <Dialog title={`Guardian signing · ${signingChild.name}`} onClose={() => setSigningChild(null)} actions={<><button className="bb-btn bb-btn-secondary" onClick={() => setSigningChild(null)}>Cancel</button><button className="bb-btn bb-btn-primary" disabled={saving || !signerValue || !signatureName.trim()} onClick={submitGuardianSigning}>Save signed attendance</button></>}>
          <div className="bb-stack" style={{ gap: 15 }}>
            <p className="bb-muted">For staff-assisted signing at the front desk. The signer’s identity and typed signature are saved with the attendance record.</p>
            {actionError ? <Alert tone="danger">{actionError}</Alert> : null}
            <Segmented label="Action" value={signingDirection} onChange={setSigningDirection} items={[{ key: "in", label: "Sign check-in" }, { key: "out", label: "Sign check-out" }]} />
            <Field label="Authorized signer"><select className="bb-input" value={signerValue} onChange={(event) => {
              setSignerValue(event.target.value);
              const signer = signers.find((item) => `${item.type}:${item.id}` === event.target.value);
              setSignatureName(signer?.name ?? "");
            }}>
              <option value="">Choose guardian or authorized pickup</option>
              {signers.map((signer) => <option key={`${signer.type}:${signer.id}`} value={`${signer.type}:${signer.id}`}>{signer.name} · {signer.relationship ?? signer.type} · {signer.can_pickup ? "pickup allowed" : "pickup not allowed"}</option>)}
            </select></Field>
            <Field label="Typed signature"><input className="bb-input" value={signatureName} onChange={(event) => setSignatureName(event.target.value)} placeholder="Signer types their full name" /></Field>
          </div>
        </Dialog>
      ) : null}

      {kioskOpen ? (
        <div className="bb-kiosk" role="dialog" aria-modal="true" aria-label="Tablet mode">
          {kioskStep === 7 ? (
            <section className="bb-kiosk-done">
              <span className="bb-kiosk-check"><Check weight="bold" size={78} /></span>
              <h1>{kioskAction === "absent" ? "Absence recorded" : `${selectedKioskChild()?.firstName ?? selectedKioskChild()?.name ?? "Child"} is checked ${kioskAction === "in" ? "in" : "out"}`}</h1>
              <p className="lead">{kioskSuccess}</p>
              <p>{kioskAction === "absent" ? "" : kioskMethod === "pin" ? "Verified with staff PIN and signature" : "Verified with signature"}</p>
              <div className="bb-row" style={{ justifyContent: "center" }}>
                <button className="bb-btn bb-kiosk-light" onClick={openKioskMode}>Next child</button>
                <button className="bb-btn bb-kiosk-ghost" onClick={closeKiosk}>Exit tablet mode</button>
              </div>
              {kioskCountdown ? <p>Returning to the child list in {kioskCountdown} seconds</p> : null}
            </section>
          ) : (
            <div className="bb-kiosk-body">
              <header className="bb-kiosk-top">
                {kioskStep > 2 ? <button className="bb-btn bb-btn-secondary bb-kiosk-btn" onClick={() => { setActionError(""); setKioskStep(kioskStep === 6 && kioskAction === "absent" ? 3 : kioskStep - 1); }}><ArrowLeft size={22} />Back</button>
                  : <div className="bb-gate-brand"><LogoTile /><strong>Tablet mode</strong><span>{data?.organization?.name}</span></div>}
                <span className="bb-kiosk-steps">{["Child", "Action", "Signer", "Sign", "Done"].map((label, index) => {
                  const stepIndex = kioskStep <= 2 ? 0 : kioskStep === 3 ? 1 : kioskStep <= 5 ? 2 : kioskStep === 6 ? 3 : 4;
                  return <span key={label}>{index ? " · " : ""}{index === stepIndex ? <b>{label}</b> : label}</span>;
                })}</span>
                <button className="bb-btn bb-btn-secondary bb-kiosk-btn" onClick={closeKiosk}><LockSimple size={22} />Exit</button>
              </header>
              {!isOnline ? <Alert tone="info">You’re offline. Attendance can’t be saved until the connection returns.</Alert> : null}
              {actionError ? <Alert tone="danger" title="That didn’t work">{actionError}</Alert> : null}

              {kioskStep === 2 ? (
                <section>
                  <h2 className="bb-kiosk-title">Who’s arriving or leaving?</h2>
                  <div className="bb-kiosk-filter">
                    <SearchInput white value={kioskSearch} onChange={setKioskSearch} placeholder="Search by child’s name" />
                    {!isFamilyChildCare && rooms.length ? <Segmented touch label="Classroom" value={kioskClassroomId || "all"} onChange={(value) => setKioskClassroomId(value === "all" ? "" : value)} items={[{ key: "all", label: "All" }, ...rooms.map((room) => ({ key: String(room.id), label: String(room.name).replace(/ Room$/, "") }))]} /> : null}
                  </div>
                  {(() => {
                    const query = kioskSearch.trim().toLowerCase();
                    const list = (data?.children ?? []).filter((child: any) => (!kioskClassroomId || String(child.classroomId) === kioskClassroomId) && (!query || String(child.name).toLowerCase().includes(query)));
                    const todayRecords = new Map((data?.attendance ?? []).filter((record: any) => record.date === today).map((record: any) => [String(record.childId), record]));
                    const todayAbsent = new Set((data?.absences ?? []).filter((absence: any) => (absence.absenceDate ?? absence.absence_date) === today && absence.status !== "cancelled").map((absence: any) => String(absence.childId)));
                    if (!list.length) return <EmptyState title={query ? "No child found" : "No children in this room"}>{query ? "Check the spelling, or choose All rooms." : "Choose another room."}</EmptyState>;
                    return (
                      <div className="bb-kiosk-grid">
                        {list.map((child: any) => {
                          const record = todayRecords.get(String(child.id));
                          const key = record ? record.status : todayAbsent.has(String(child.id)) ? "absent" : "not_checked_in";
                          return (
                            <button key={child.id} className="bb-kiosk-tile" onClick={() => { setKioskChildId(String(child.id)); setKioskStep(3); setActionError(""); }}>
                              <Avatar name={child.name} seed={child.id} size={56} />
                              <strong>{child.name}</strong>
                              <StatusBadge map={attendanceStatuses} value={key} />
                            </button>
                          );
                        })}
                      </div>
                    );
                  })()}
                </section>
              ) : null}

              {kioskStep === 3 && selectedKioskChild() ? (() => {
                const child = selectedKioskChild();
                const record = (data?.attendance ?? []).find((item: any) => item.date === today && String(item.childId) === String(child.id));
                const checkedIn = record && !record.checkOutTime;
                const key = record ? record.status : "not_checked_in";
                return (
                  <section>
                    <div className="bb-kiosk-child">
                      <Avatar name={child.name} seed={child.id} size={112} />
                      <div><h2>{child.name}</h2><p>{[isFamilyChildCare ? "Family child care" : child.classroom, child.age].filter(Boolean).join(" · ")}</p><StatusBadge map={attendanceStatuses} value={key} size="lg" /></div>
                    </div>
                    <div className="bb-kiosk-actions">
                      {checkedIn ? <button className="bb-kiosk-action primary" disabled={saving} onClick={() => chooseKioskAction("out")}><SignOut size={46} />Check out</button>
                        : <button className="bb-kiosk-action primary" disabled={saving} onClick={() => chooseKioskAction("in")}><SignIn size={46} />Check in</button>}
                      <button className="bb-kiosk-action" disabled={saving} onClick={() => chooseKioskAction("absent")}><MinusCircle size={40} />Mark absent</button>
                    </div>
                    <p className="bb-note"><Info size={18} />{checkedIn ? `${child.firstName ?? child.name} is checked in, so check out is shown.` : `Check out appears once ${child.firstName ?? child.name} is checked in.`}</p>
                  </section>
                );
              })() : null}

              {(kioskStep === 4 || kioskStep === 5) ? (
                <section className="bb-kiosk-split">
                  <div>
                    <h2 className="bb-kiosk-title">Who is {kioskAction === "in" ? "dropping" : "picking"} {selectedKioskChild()?.firstName ?? "them"} {kioskAction === "in" ? "off" : "up"}?</h2>
                    <div className="bb-stack" style={{ gap: 12 }}>
                      {kioskSigners.map((signer) => {
                        const value = `${signer.type}:${signer.id}`;
                        const allowed = signer.can_pickup;
                        return (
                          <button key={value} disabled={!allowed} className={`bb-signer${kioskSignerValue === value ? " on" : ""}`} onClick={() => chooseKioskSigner(value)}>
                            <Avatar name={signer.name} seed={value} size={56} />
                            <div><strong>{signer.name}</strong><span>{signer.relationship ?? signer.type}{allowed ? "" : " · not authorized for pickup"}</span></div>
                          </button>
                        );
                      })}
                      <button className={`bb-signer outline${kioskSignerValue === "staff:staff" ? " on" : ""}`} onClick={() => chooseKioskSigner("staff:staff")}>
                        <IdentificationBadge size={36} color="var(--bb-accent)" />
                        <div><strong>Staff-assisted</strong><span>The signed-in staff member signs</span></div>
                      </button>
                    </div>
                  </div>
                  <div>
                    <h3 className="bb-kiosk-subtitle">Verify with</h3>
                    <Segmented touch label="Verification method" value={kioskMethod === "pin" ? "pin" : kioskMethod === "secure_login" ? "secure_login" : "digital_signature"} onChange={(value) => { setKioskMethod(value); setKioskPin(""); }} items={[{ key: "digital_signature", label: "Signature" }, { key: "pin", label: "Staff PIN" }, { key: "secure_login", label: "Secure login" }]} />
                    {kioskMethod === "pin" ? <PinPad value={kioskPin} onChange={setKioskPin} label="Staff, enter your PIN" /> : <p className="bb-note">{kioskMethod === "secure_login" ? "Your signed-in session is recorded as the verification." : "The signer draws their signature on the next screen."}</p>}
                    <button className="bb-btn bb-btn-primary bb-btn-touch bb-btn-block" style={{ marginTop: 30 }} disabled={!kioskSignerValue || (kioskMethod === "pin" && kioskPin.length < 4)} onClick={() => setKioskStep(6)}>Continue</button>
                  </div>
                </section>
              ) : null}

              {kioskStep === 6 && kioskAction === "absent" ? (
                <section style={{ maxWidth: 720 }}>
                  <h2 className="bb-kiosk-title">Mark {selectedKioskChild()?.firstName ?? "child"} absent today</h2>
                  <div className="bb-stack">
                    <Segmented touch label="Absence type" value={kioskAbsenceType} onChange={setKioskAbsenceType} items={absenceTypes.map(([value, label]) => ({ key: value, label }))} />
                    <Field label="Reason"><input className="bb-input white bb-kiosk-input" value={kioskAbsenceReason} onChange={(event) => setKioskAbsenceReason(event.target.value)} placeholder="Parent reported sick, vacation, no-show…" /></Field>
                    <Field label="Notes (internal)"><textarea className="bb-input white" value={kioskAbsenceNotes} onChange={(event) => setKioskAbsenceNotes(event.target.value)} placeholder="Optional" /></Field>
                    <button className="bb-btn bb-btn-primary bb-btn-touch" disabled={saving} onClick={submitKiosk}><MinusCircle size={26} />Mark {absenceLabel(kioskAbsenceType).toLowerCase()} absence</button>
                  </div>
                </section>
              ) : null}

              {kioskStep === 6 && kioskAction !== "absent" ? (
                <section>
                  <h2 className="bb-kiosk-title" style={{ marginBottom: 8 }}>Sign to check {kioskAction === "in" ? "in" : "out"} {selectedKioskChild()?.firstName ?? ""}</h2>
                  <p className="bb-kiosk-meta">{selectedKioskSigner()?.name} · {new Date().toLocaleString(undefined, { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" })}</p>
                  <Field label="Typed name (must match the signer)"><input className="bb-input white bb-kiosk-input" value={kioskSignatureName} onChange={(event) => setKioskSignatureName(event.target.value)} placeholder="Full name" /></Field>
                  <div className="bb-signature">
                    <canvas ref={signatureCanvasRef} onPointerDown={startSignature} onPointerMove={drawSignature} onPointerUp={endSignature} onPointerLeave={endSignature} aria-label="Signature pad" />
                    <div className="line" />
                    <span>{kioskSignatureDrawn ? "Signature captured" : "Sign above the line with your finger"}</span>
                  </div>
                  <div className="bb-row" style={{ justifyContent: "space-between", marginTop: 20 }}>
                    <button className="bb-btn bb-btn-secondary bb-btn-touch" type="button" onClick={clearKioskSignature}><Eraser size={24} />Clear</button>
                    <button className="bb-btn bb-btn-primary bb-btn-touch" disabled={saving} onClick={submitKiosk}><CheckSquare size={26} />{saving ? "Saving…" : `Confirm check-${kioskAction === "in" ? "in" : "out"}`}</button>
                  </div>
                </section>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </main>
  );
}
