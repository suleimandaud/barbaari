import type { FormEvent } from "react";
import { useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Archive, ArrowLeft, CheckCircle, Clock, ClockCountdown, DotsThree, DownloadSimple, FilePdf, FileText, LinkSimple, MinusCircle, PencilSimple, Plus, SignIn, SignOut, UploadSimple, Warning } from "@phosphor-icons/react";
import { absenceApi, attendanceApi, billingApi, childrenApi, classroomsApi, dailyNotesApi, documentsApi, getApiError, guardiansApi, incidentApi, organizationApi } from "@barbaari/shared";
import { Alert, Avatar, Dialog, EmptyState, ErrorState, Field, LoadingState, PageHeader, SectionHead, Status, StatusBadge, Tabs, clockTime, money, recordTime, shortDate, useToast } from "@barbaari/shared/web/ui";
import { attendanceStatuses, incidentSeverities, incidentStatuses, invoiceStatuses, resolveStatus } from "@barbaari/shared/web/status";
import { DataTable } from "../components/DataTable";
import { ClassroomSelect, GuardianSelect } from "../components/Selects";
import { useAsyncData } from "../hooks/useAsyncData";
import { childCode, friendlyError } from "../utils/labels";
import { ageLabel } from "../utils/people";
import { downloadDocument, fileKind, fileSize, splitIncidentSummary } from "../utils/documents";

type Tab = "overview" | "attendance" | "guardians" | "documents" | "notes" | "incidents" | "billing";

function browserLocation(): Promise<{ latitude: number; longitude: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("This browser cannot provide device location. Use a location-enabled device or browser."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      (error) => reject(new Error(error.code === error.PERMISSION_DENIED ? "Location access is blocked for this browser. Please allow location access and try again." : "We could not determine your location. Please try again.")),
      { timeout: 8000, maximumAge: 30000, enableHighAccuracy: true }
    );
  });
}

function recentWeekdays(count: number) {
  const days: string[] = [];
  const cursor = new Date();
  while (days.length < count) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) days.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() - 1);
  }
  return days;
}

export function ChildRecordPage() {
  const { childId = "" } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { data, loading, error, reload } = useAsyncData(async () => {
    const [child, guardians, attendance, absences, notes, documents, incidents, classrooms, organization] = await Promise.all([
      childrenApi.get(childId),
      guardiansApi.list(),
      attendanceApi.managerList({ child_id: childId }),
      absenceApi.list({ child_id: childId }),
      dailyNotesApi.list({ child_id: childId }),
      documentsApi.list(),
      incidentApi.list(),
      classroomsApi.list(),
      organizationApi.get()
    ]);
    // Family invoices are only visible to billing roles; a 403 must not break the record.
    const invoices = await billingApi.managerInvoices().then((result) => result.invoices ?? []).catch(() => null);
    return {
      child: child.child,
      guardians: guardians.guardians ?? [],
      attendance: attendance.attendance ?? [],
      absences: absences.absence_records ?? [],
      notes: notes.daily_notes ?? [],
      documents: documents.documents ?? [],
      incidents: incidents.incidents ?? [],
      classrooms: classrooms.classrooms ?? [],
      organization: organization.organization,
      invoices
    };
  }, [childId]);
  const [tab, setTab] = useState<Tab>("overview");
  const [dialog, setDialog] = useState<null | "edit" | "assign" | "guardian" | "archive" | "note" | "upload" | "menu">(null);
  const [form, setForm] = useState({ first_name: "", last_name: "", date_of_birth: "", classroom_id: "" });
  const [classroomId, setClassroomId] = useState("");
  const [guardianId, setGuardianId] = useState("");
  const [note, setNote] = useState("");
  const [noteDate, setNoteDate] = useState(new Date().toISOString().slice(0, 10));
  const [docTitle, setDocTitle] = useState("");
  const [docType, setDocType] = useState("");
  const [docFile, setDocFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);

  const child = data?.child;
  const isFamilyChildCare = data?.organization?.facility_type === "family_child_care";
  const code = child ? childCode(child) : "";
  const today = new Date().toISOString().slice(0, 10);
  const guardians = useMemo(() => (data?.guardians ?? []).filter((guardian: any) => (guardian.children ?? []).some((item: any) => String(item.id) === String(childId))), [data?.guardians, childId]);
  const attendance = data?.attendance ?? [];
  const todayRecord = attendance.find((record: any) => record.date === today);
  const openRecord = attendance.find((record: any) => record.status === "missing_checkout");
  const todayAbsence = (data?.absences ?? []).find((absence: any) => (absence.absenceDate ?? absence.absence_date) === today && absence.status !== "cancelled");
  const statusKey = todayRecord ? todayRecord.status : openRecord ? "missing_checkout" : todayAbsence ? "absent" : "not_checked_in";
  const isInside = statusKey === "checked_in" || statusKey === "missing_checkout";
  const childDocuments = (data?.documents ?? []).filter((document: any) => String(document.child_id) === String(childId));
  const childIncidents = (data?.incidents ?? []).filter((incident: any) => code && incident.childCode === code);
  const childInvoices = data?.invoices ? data.invoices.filter((invoice: any) => code && invoice.childCode === code) : null;

  async function run(action: () => Promise<void>, message: string) {
    setSaving(true);
    setActionError("");
    try {
      await action();
      toast(message);
      setDialog(null);
      await reload();
    } catch (err) {
      setActionError(friendlyError(getApiError(err).message));
    } finally {
      setSaving(false);
    }
  }

  function open(next: typeof dialog) {
    setActionError("");
    if (next === "edit" && child) setForm({ first_name: child.firstName ?? "", last_name: child.lastName ?? "", date_of_birth: child.dateOfBirth ?? "", classroom_id: child.classroomId ? String(child.classroomId) : "" });
    if (next === "assign" && child) setClassroomId(child.classroomId ? String(child.classroomId) : "");
    if (next === "guardian") setGuardianId("");
    if (next === "note") { setNote(""); setNoteDate(today); }
    if (next === "upload") { setDocTitle(""); setDocType(""); setDocFile(null); }
    setDialog(next);
  }

  function checkInOrOut() {
    if (!child) return;
    const direction = isInside ? "out" : "in";
    const call = direction === "in" ? attendanceApi.checkIn : attendanceApi.checkOut;
    void run(async () => { const loc = await browserLocation(); await call(child.id, "staff", "secure_login", undefined, loc); }, `${child.name} checked ${direction}.`);
  }

  function submitUpload(event: FormEvent) {
    event.preventDefault();
    if (!docFile) { setActionError("Please choose a file to upload."); return; }
    void run(() => documentsApi.upload({ title: docTitle, type: docType || undefined, child_id: childId, file: docFile }).then(() => undefined), "Document uploaded.");
  }

  if (loading && !data) return <main className="bb-page"><LoadingState /></main>;
  if (error || !child) return <main className="bb-page"><PageHeader back={{ label: "Children", onClick: () => navigate("/children") }} title="Child record" /><ErrorState message={error || "This child could not be found."} onRetry={reload} /></main>;

  const week = recentWeekdays(5).map((date) => {
    const record = attendance.find((item: any) => item.date === date);
    const absence = (data?.absences ?? []).find((item: any) => (item.absenceDate ?? item.absence_date) === date && item.status !== "cancelled");
    return { date, record, absence };
  });

  const guardianRows = (
    guardians.length ? (
      <div className="bb-list">
        {guardians.map((guardian: any) => (
          <div className="bb-list-row" key={guardian.id}>
            <Avatar name={guardian.name} seed={guardian.id} size={44} />
            <div className="grow"><strong>{guardian.name}</strong><span className="sub">{[guardian.relationship, guardian.phone].filter(Boolean).join(" · ")}</span></div>
            <span className={guardian.can_pickup ? "bb-tag accent" : "bb-tag"}>{guardian.can_pickup ? "Can pick up" : "No pickup"}</span>
            {guardian.pin_configured ? <span className="bb-tag">PIN set</span> : <Status spec={{ label: "No PIN yet", tone: "warn", icon: "warning" }} size="sm" />}
          </div>
        ))}
      </div>
    ) : <EmptyState compact title="No guardians linked">Link a guardian so they can sign this child in and out on the tablet.</EmptyState>
  );

  const notesList = data?.notes?.length ? data.notes.slice(0, tab === "notes" ? undefined : 3).map((item: any) => (
    <div className="bb-note-item" key={item.id}>
      <span className="bb-caption">{item.date === today ? "Today" : shortDate(item.date, { weekday: "short", day: "numeric", month: "short" })}{item.staffName ? ` · ${item.staffName}` : ""}</span>
      <p>{item.note}</p>
    </div>
  )) : <p className="bb-muted">No daily notes yet.</p>;

  const documentsList = childDocuments.length ? (
    <div className="bb-list">
      {childDocuments.map((document: any) => (
        <div className="bb-list-row" key={document.id}>
          {fileKind(document) === "PDF" ? <FilePdf size={26} color="var(--bb-accent)" /> : <FileText size={26} color="var(--bb-accent)" />}
          <div className="grow"><strong>{document.title}</strong><span className="sub">{[document.type, fileKind(document), shortDate(document.created_at)].filter(Boolean).join(" · ")}</span></div>
          <button className="bb-btn bb-btn-ghost bb-btn-icon" aria-label={`Download ${document.title}`} onClick={() => downloadDocument(document).catch((err) => setActionError(friendlyError(getApiError(err).message)))}><DownloadSimple size={20} /></button>
        </div>
      ))}
    </div>
  ) : <p className="bb-muted">No documents attached to this child.</p>;

  return (
    <main className="bb-page">
      <button type="button" className="bb-back" onClick={() => navigate("/children")}><ArrowLeft size={16} />Children</button>
      <header className="bb-record-head">
        <Avatar name={child.name} seed={child.id} size={112} />
        <div className="bb-record-id">
          <h1>{child.name}</h1>
          <p>{[ageLabel(child.dateOfBirth, child.age), child.dateOfBirth ? `born ${shortDate(child.dateOfBirth, { day: "numeric", month: "long", year: "numeric" })}` : "", isFamilyChildCare ? "" : child.classroom, code].filter(Boolean).join(" · ")}</p>
          <div className="bb-row" style={{ gap: 12 }}>
            <StatusBadge map={attendanceStatuses} value={statusKey} />
            <span>{todayRecord ? `${todayRecord.checkOutTime ? `Checked out at ${recordTime(todayRecord, "out")}` : `Checked in at ${recordTime(todayRecord, "in")}`}${todayRecord.signedBy ? ` by ${todayRecord.signedBy}` : ""}` : openRecord ? `Checked in ${shortDate(openRecord.date, { weekday: "long" })} and never checked out` : todayAbsence ? todayAbsence.reason ?? "" : "Not checked in today"}</span>
          </div>
          {child.allergies?.length ? <p className="bb-allergy"><Warning size={18} />Allergies: {child.allergies.join(", ")}</p> : null}
        </div>
        <div className="bb-actions">
          <div className="bb-menu-wrap">
            <button className="bb-btn bb-btn-secondary bb-btn-icon" aria-label="More actions" aria-expanded={dialog === "menu"} onClick={() => setDialog(dialog === "menu" ? null : "menu")}><DotsThree size={22} /></button>
            {dialog === "menu" ? (
              <div className="bb-menu" role="menu">
                {!isFamilyChildCare ? <button role="menuitem" onClick={() => open("assign")}>Assign classroom</button> : null}
                <button role="menuitem" onClick={() => open("guardian")}>Link guardian</button>
                <button role="menuitem" onClick={() => open("note")}>Add daily note</button>
                <button role="menuitem" onClick={() => open("upload")}>Upload document</button>
                <button role="menuitem" className="danger" onClick={() => open("archive")}>Archive child</button>
              </div>
            ) : null}
          </div>
          <button className="bb-btn bb-btn-secondary bb-btn-lg" onClick={() => open("edit")}><PencilSimple />Edit</button>
          <button className="bb-btn bb-btn-primary bb-btn-lg" disabled={saving} onClick={checkInOrOut}>{isInside ? <><SignOut />Check out</> : <><SignIn />Check in</>}</button>
        </div>
      </header>
      {actionError && !dialog ? <Alert tone="danger">{actionError}</Alert> : null}

      <Tabs value={tab} onChange={setTab} label="Child record" items={[
        { key: "overview", label: "Overview" },
        { key: "attendance", label: "Attendance" },
        { key: "guardians", label: "Guardians" },
        { key: "documents", label: "Documents" },
        { key: "notes", label: "Daily notes" },
        { key: "incidents", label: "Incidents" },
        { key: "billing", label: "Billing" }
      ]} />

      {tab === "overview" ? (
        <div className="bb-grid-2">
          <div>
            <section className="bb-section">
              <SectionHead title="Guardians & authorized pickups" action={<button className="bb-btn bb-btn-ghost" onClick={() => open("guardian")}><LinkSimple size={18} />Link guardian</button>} />
              {guardianRows}
            </section>
            <section className="bb-section">
              <SectionHead title="Daily notes" action={<button className="bb-btn bb-btn-ghost" onClick={() => open("note")}><Plus size={18} />Add note</button>} />
              {notesList}
            </section>
          </div>
          <div>
            <section className="bb-section">
              <SectionHead title="This week" action={<button className="bb-btn bb-btn-ghost" onClick={() => setTab("attendance")}>Full history</button>} />
              <div className="bb-week">
                {week.map(({ date, record, absence }) => {
                  const key = record ? record.status : absence ? "absent" : "none";
                  const spec = key === "none" ? null : resolveStatus(attendanceStatuses, key);
                  const Glyph = key === "checked_in" ? CheckCircle : key === "checked_out" ? SignOut : key === "checked_out_early" ? ClockCountdown : key === "absent" ? MinusCircle : key === "missing_checkout" ? Warning : Clock;
                  return (
                    <div key={date} className="bb-week-day">
                      <span className="bb-caption">{shortDate(date, { weekday: "short" })} {Number(date.slice(8, 10))}</span>
                      <div className={`bb-week-tile ${spec ? spec.tone : "empty"}`} title={spec?.label ?? "No record"}><Glyph size={24} aria-hidden /><span className="bb-sr-only">{spec?.label ?? "No record"}</span></div>
                      <span className="bb-week-time">{record ? `${recordTime(record, "in")} – ${recordTime(record, "out")}` : absence ? `Absent · ${String(absence.absenceType ?? absence.absence_type ?? "").replace(/_/g, " ")}` : "—"}{key === "checked_out_early" ? " early" : ""}</span>
                    </div>
                  );
                })}
              </div>
            </section>
            <section className="bb-section">
              <SectionHead title="Documents" action={<button className="bb-btn bb-btn-ghost" onClick={() => open("upload")}><UploadSimple size={18} />Upload</button>} />
              {documentsList}
            </section>
          </div>
        </div>
      ) : null}

      {tab === "attendance" ? (
        <DataTable rows={attendance} emptyTitle="No attendance yet" emptyDetail="Check-ins and check-outs for this child appear here." columns={[
          { header: "Date", render: (row: any) => shortDate(row.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" }) },
          { header: "In", render: (row: any) => recordTime(row, "in") || "—" },
          { header: "Out", render: (row: any) => recordTime(row, "out") || "—" },
          { header: "Status", render: (row: any) => <StatusBadge map={attendanceStatuses} value={row.status} /> },
          { header: "Signed by", render: (row: any) => <>{row.signedBy}<span className="sub">{String(row.verificationMethod ?? "").replace(/_/g, " ")}{row.hasSignature ? " · signature" : ""}</span></> },
          { header: "", render: (row: any) => row.corrected ? <span className="bb-tag">Corrected</span> : null }
        ]} />
      ) : null}

      {tab === "guardians" ? <section><SectionHead title="Guardians & authorized pickups" action={<button className="bb-btn bb-btn-primary" onClick={() => open("guardian")}><LinkSimple size={18} />Link guardian</button>} />{guardianRows}</section> : null}
      {tab === "documents" ? <section><SectionHead title="Documents" action={<button className="bb-btn bb-btn-primary" onClick={() => open("upload")}><UploadSimple size={18} />Upload</button>} />{documentsList}</section> : null}
      {tab === "notes" ? <section style={{ maxWidth: 820 }}><SectionHead title="Daily notes" action={<button className="bb-btn bb-btn-primary" onClick={() => open("note")}><Plus size={18} />Add note</button>} />{notesList}</section> : null}
      {tab === "incidents" ? (
        <DataTable rows={childIncidents} emptyTitle="No incidents" emptyDetail="Incident reports for this child appear here." columns={[
          { header: "When", render: (row: any) => `${shortDate(row.occurredAt)} · ${clockTime(row.occurredAt)}` },
          { header: "Summary", render: (row: any) => splitIncidentSummary(row.summary).title },
          { header: "Severity", render: (row: any) => <StatusBadge map={incidentSeverities} value={row.severity} /> },
          { header: "Status", render: (row: any) => <StatusBadge map={incidentStatuses} value={row.status} /> },
          { header: "Reported by", render: (row: any) => row.staffName }
        ]} />
      ) : null}
      {tab === "billing" ? (childInvoices === null ? <Alert tone="info">Family billing is only visible to billing roles.</Alert> : (
        <DataTable rows={childInvoices} emptyTitle="No invoices" emptyDetail="Family invoices for this child appear here." columns={[
          { header: "Invoice", render: (row: any) => <strong>{row.id}</strong> },
          { header: "Due", render: (row: any) => shortDate(row.dueDate) },
          { header: "Amount", align: "right", render: (row: any) => money(row.amount) },
          { header: "Status", render: (row: any) => <StatusBadge map={invoiceStatuses} value={row.status} /> }
        ]} />
      )) : null}

      {dialog === "edit" ? (
        <Dialog title={`Edit ${child.name}`} onClose={() => setDialog(null)} actions={<><button className="bb-btn bb-btn-secondary" onClick={() => setDialog(null)}>Cancel</button><button className="bb-btn bb-btn-primary" form="edit-child" disabled={saving}>{saving ? "Saving…" : "Save child"}</button></>}>
          {actionError ? <Alert tone="danger">{actionError}</Alert> : null}
          <form id="edit-child" className="bb-stack" onSubmit={(event) => { event.preventDefault(); void run(() => childrenApi.update(child.id, { ...form, date_of_birth: form.date_of_birth || null, classroom_id: form.classroom_id || null }).then(() => undefined), "Child updated."); }}>
            <div className="bb-form-grid">
              <Field label="First name"><input className="bb-input" value={form.first_name} onChange={(event) => setForm({ ...form, first_name: event.target.value })} required /></Field>
              <Field label="Last name"><input className="bb-input" value={form.last_name} onChange={(event) => setForm({ ...form, last_name: event.target.value })} required /></Field>
            </div>
            <Field label="Date of birth"><input className="bb-input" type="date" value={form.date_of_birth} onChange={(event) => setForm({ ...form, date_of_birth: event.target.value })} /></Field>
            {!isFamilyChildCare ? <ClassroomSelect classrooms={data?.classrooms ?? []} value={form.classroom_id} onChange={(id) => setForm({ ...form, classroom_id: id })} label="Classroom" /> : null}
          </form>
        </Dialog>
      ) : null}

      {dialog === "assign" ? (
        <Dialog title="Assign classroom" onClose={() => setDialog(null)} actions={<><button className="bb-btn bb-btn-secondary" onClick={() => setDialog(null)}>Cancel</button><button className="bb-btn bb-btn-primary" disabled={saving || !classroomId} onClick={() => run(() => childrenApi.assignClassroom(child.id, classroomId).then(() => undefined), "Classroom assigned.")}>Assign</button></>}>
          {actionError ? <Alert tone="danger">{actionError}</Alert> : null}
          <ClassroomSelect classrooms={data?.classrooms ?? []} value={classroomId} onChange={setClassroomId} label="Classroom" />
        </Dialog>
      ) : null}

      {dialog === "guardian" ? (
        <Dialog title="Link a guardian" onClose={() => setDialog(null)} actions={<><button className="bb-btn bb-btn-secondary" onClick={() => setDialog(null)}>Cancel</button><button className="bb-btn bb-btn-primary" disabled={saving || !guardianId} onClick={() => run(() => childrenApi.linkGuardian(child.id, { guardian_id: guardianId, pickup_authorized: true }).then(() => undefined), "Guardian linked.")}>Link guardian</button></>}>
          {actionError ? <Alert tone="danger">{actionError}</Alert> : null}
          <p className="bb-muted" style={{ marginBottom: 15 }}>Linked guardians can pick {child.firstName ?? "this child"} up and sign on the tablet with their own PIN.</p>
          <GuardianSelect guardians={data?.guardians ?? []} value={guardianId} onChange={setGuardianId} label="Guardian" />
        </Dialog>
      ) : null}

      {dialog === "note" ? (
        <Dialog title="Add a daily note" onClose={() => setDialog(null)} actions={<><button className="bb-btn bb-btn-secondary" onClick={() => setDialog(null)}>Cancel</button><button className="bb-btn bb-btn-primary" disabled={saving || !note.trim()} onClick={() => run(() => dailyNotesApi.create({ child_id: child.id, date: noteDate, note }).then(() => undefined), "Daily note saved.")}>Save note</button></>}>
          {actionError ? <Alert tone="danger">{actionError}</Alert> : null}
          <div className="bb-stack">
            <Field label="Date"><input className="bb-input" type="date" value={noteDate} onChange={(event) => setNoteDate(event.target.value)} /></Field>
            <Field label="Note"><textarea className="bb-input" value={note} onChange={(event) => setNote(event.target.value)} placeholder={`How was ${child.firstName ?? "their"} day?`} /></Field>
          </div>
        </Dialog>
      ) : null}

      {dialog === "upload" ? (
        <Dialog title="Upload a document" onClose={() => setDialog(null)} actions={<><button className="bb-btn bb-btn-secondary" onClick={() => setDialog(null)}>Cancel</button><button className="bb-btn bb-btn-primary" form="upload-doc" disabled={saving}>{saving ? "Uploading…" : "Upload document"}</button></>}>
          {actionError ? <Alert tone="danger">{actionError}</Alert> : null}
          <form id="upload-doc" className="bb-stack" onSubmit={submitUpload}>
            <Field label="Title"><input className="bb-input" value={docTitle} onChange={(event) => setDocTitle(event.target.value)} placeholder="e.g. Medication consent" required /></Field>
            <Field label="Type"><input className="bb-input" value={docType} onChange={(event) => setDocType(event.target.value)} placeholder="e.g. health, enrollment" /></Field>
            <Field label="File" hint="PDF, JPG, PNG, DOC, DOCX or TXT, up to 10 MB"><input ref={fileRef} className="bb-input" type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.txt" onChange={(event) => setDocFile(event.target.files?.[0] ?? null)} required /></Field>
          </form>
        </Dialog>
      ) : null}

      {dialog === "archive" ? (
        <Dialog title={`Archive ${child.name}?`} onClose={() => setDialog(null)} actions={<><button className="bb-btn bb-btn-secondary" onClick={() => setDialog(null)}>Keep child</button><button className="bb-btn bb-btn-danger" disabled={saving} onClick={() => run(async () => { await childrenApi.update(child.id, { status: "archived" }); navigate("/children"); }, `${child.name} archived.`)}><Archive size={18} />Archive</button></>}>
          {actionError ? <Alert tone="danger">{actionError}</Alert> : null}
          Their attendance history, documents and notes are kept.
        </Dialog>
      ) : null}
    </main>
  );
}
