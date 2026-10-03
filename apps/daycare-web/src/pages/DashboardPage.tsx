import { Link } from "react-router-dom";
import { ArrowRight, Clock, ClockCountdown, DeviceTablet, MinusCircle, PencilSimpleLine, Receipt, SignIn, SignOut, Warning } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { absenceApi, attendanceApi, childrenApi, classroomsApi, daycarePlatformBillingApi, devicesApi, mergedAttendance, organizationApi } from "@barbaari/shared";
import { EmptyState, ErrorState, LoadingState, Meter, SectionHead, Stat, clockTime, money, recordTime, shortDate } from "@barbaari/shared/web/ui";
import { useAsyncData } from "../hooks/useAsyncData";
import { useShell } from "../hooks/useShell";

function recordStatus(record: any) {
  return record?.status ?? (record?.checkOutTime ? "checked_out" : "checked_in");
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function isToday(value?: string) {
  return value === todayKey();
}

function childClassroomId(child: any, classrooms: any[]) {
  if (child.classroomId) return String(child.classroomId);
  return String(classrooms.find((room) => room.name === child.classroom)?.id ?? "");
}

function greeting(date = new Date()) {
  const hour = date.getHours();
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

const activityIcons: Record<string, Icon> = {
  check_in: SignIn, guardian_check_in: SignIn, check_out: SignOut, guardian_check_out: SignOut,
  correction: PencilSimpleLine, "absence.created": MinusCircle, "absence.updated": MinusCircle
};

function activityTitle(log: any) {
  const child = log.childName ?? "A child";
  switch (log.action) {
    case "check_in": case "guardian_check_in": return `${child} checked in`;
    case "check_out": case "guardian_check_out": return `${child} checked out`;
    case "correction": return `${child}: attendance corrected`;
    case "absence.created": return `${child} marked absent`;
    case "absence.updated": return `${child}: absence updated`;
    default: return `${child} · ${String(log.action ?? "activity").replace(/[._]/g, " ")}`;
  }
}

type AttentionItem = { key: string; icon: Icon; tone: "danger" | "warn"; title: string; detail: string; action: { label: string; to: string; primary?: boolean; secondary?: boolean } };

export function DashboardPage() {
  const { user, organization: shellOrganization } = useShell();
  const canSeePlatformBilling = ["daycare_admin", "manager"].includes(user?.role);
  const { data, loading, error, reload } = useAsyncData(async () => {
    const today = todayKey();
    // Only what this page renders: today's records, plus every still-open check-in (the
    // "missing checkout" item spans all dates), today's absences, and the latest 6 audit
    // events — instead of the organization's entire attendance and audit history.
    const [attendance, absences, children, classrooms, devices, auditLogs, organization] = await Promise.all([
      mergedAttendance([{ date: today }, { open: 1 }]),
      absenceApi.list({ date: today }),
      childrenApi.managerList(),
      classroomsApi.list(),
      devicesApi.list(),
      attendanceApi.auditLogs({ limit: 6 }),
      organizationApi.get()
    ]);
    return {
      attendance,
      absences: absences.absence_records ?? [],
      children: children.children ?? [],
      classrooms: classrooms.classrooms ?? [],
      devices: devices.devices ?? [],
      auditLogs: auditLogs.audit_logs ?? [],
      organization: organization.organization
    };
  }, []);
  // Separate so the role (which arrives with the shell) never re-runs the attendance load.
  // Admin/manager only — the same call the route guard already makes — and a failure here
  // must never block the attendance dashboard.
  const { data: billing } = useAsyncData(
    async () => (canSeePlatformBilling ? daycarePlatformBillingApi.subscription().catch(() => null) : null),
    [canSeePlatformBilling]
  );

  if (loading && !data) return <main className="bb-page"><LoadingState /></main>;
  if (error || !data) return <main className="bb-page"><ErrorState message={error} onRetry={reload} /></main>;

  const now = new Date();
  const todayAttendance = data.attendance.filter((record: any) => isToday(record.date));
  const todayAbsences = data.absences.filter((record: any) => isToday(record.absenceDate ?? record.absence_date));
  const present = todayAttendance.filter((record: any) => recordStatus(record) === "checked_in" && !record.checkOutTime);
  const checkedOut = todayAttendance.filter((record: any) => record.checkOutTime || recordStatus(record) === "checked_out");
  const earlyCheckouts = todayAttendance.filter((record: any) => recordStatus(record) === "checked_out_early");
  const missingCheckouts = data.attendance.filter((record: any) => recordStatus(record) === "missing_checkout");
  const arrivedOrAbsentIds = new Set([...todayAttendance.map((record: any) => String(record.childId)), ...todayAbsences.map((record: any) => String(record.childId))]);
  const notArrived = data.children.filter((child: any) => !arrivedOrAbsentIds.has(String(child.id)));
  const recentAudit = data.auditLogs.slice(0, 6);
  const offlineDevices = data.devices.filter((device: any) => !["active", "online"].includes(String(device.status)));
  const isFamilyChildCare = data.organization?.facility_type === "family_child_care";
  const expected = data.children.length;
  const orgName = data.organization?.name ?? shellOrganization?.name ?? "";
  const firstName = String(user?.name ?? "").split(" ")[0];
  const unpaidInvoice = billing?.unpaid_invoice;

  const classroomSummary = data.classrooms.map((room: any) => {
    const children = data.children.filter((child: any) => childClassroomId(child, data.classrooms) === String(room.id));
    const childIds = new Set(children.map((child: any) => String(child.id)));
    const roomPresent = present.filter((record: any) => childIds.has(String(record.childId))).length;
    const roomOut = checkedOut.filter((record: any) => childIds.has(String(record.childId))).length;
    const roomAbsent = todayAbsences.filter((record: any) => childIds.has(String(record.childId))).length;
    const roomNotArrived = notArrived.filter((child: any) => childIds.has(String(child.id))).length;
    return { room, children: children.length, present: roomPresent, out: roomOut, absent: roomAbsent, notArrived: roomNotArrived };
  });

  const attention: AttentionItem[] = [
    ...missingCheckouts.slice(0, 3).map((record: any) => ({
      key: `missing-${record.id}`, icon: Warning, tone: "danger" as const,
      title: `${record.childName} was never checked out`,
      detail: `Checked in ${shortDate(record.date, { weekday: "long" })}${recordTime(record, "in") ? ` at ${recordTime(record, "in")}` : ""}${isFamilyChildCare ? "" : ` · ${record.classroom}`}`,
      action: { label: "Resolve", to: "/attendance-operations?tab=missing", secondary: true }
    })),
    ...(notArrived.length ? [{
      key: "not-arrived", icon: Clock, tone: "warn" as const,
      title: `${notArrived.length} expected ${notArrived.length === 1 ? "child hasn’t" : "children haven’t"} checked in`,
      detail: notArrived.slice(0, 3).map((child: any) => child.name).join(", ") + (notArrived.length > 3 ? ` and ${notArrived.length - 3} more` : ""),
      action: { label: "View", to: "/attendance-operations?tab=live", secondary: true }
    }] : []),
    ...earlyCheckouts.slice(0, 3).map((record: any) => ({
      key: `early-${record.id}`, icon: ClockCountdown, tone: "warn" as const,
      title: `${record.childName} left early`,
      detail: `${recordTime(record, "out")}${record.signedBy ? ` · signed by ${record.signedBy}` : ""}`,
      action: { label: "Review", to: "/attendance-operations?tab=early" }
    })),
    ...(offlineDevices.length ? [{
      key: "devices", icon: DeviceTablet, tone: "warn" as const,
      title: `${offlineDevices.length} of ${data.devices.length} tablets ${offlineDevices.length === 1 ? "is" : "are"} offline`,
      detail: offlineDevices.map((device: any) => device.name).join(", "),
      action: { label: "Devices", to: "/devices" }
    }] : []),
    ...(unpaidInvoice ? [{
      key: "invoice", icon: Receipt, tone: "danger" as const,
      title: unpaidInvoice.status === "overdue" ? "1 Barbaari invoice is overdue" : "A Barbaari invoice is due",
      detail: `${unpaidInvoice.invoice_number} · ${money(unpaidInvoice.balance_due, unpaidInvoice.currency)} · due ${shortDate(unpaidInvoice.due_date)}`,
      action: { label: "Pay invoice", to: "/subscription-billing", primary: true }
    }] : [])
  ];

  const bar = [
    { key: "present", value: present.length, color: "var(--bb-brand)", label: "Present" },
    { key: "out", value: checkedOut.length, color: "var(--bb-neutral-400)", label: "Checked out" },
    { key: "absent", value: todayAbsences.length, color: "#93A5B9", label: "Absent" },
    { key: "notArrived", value: notArrived.length, color: "repeating-linear-gradient(135deg, #B8741C 0 3px, #F0DDB6 3px 6px)", label: "Not arrived" }
  ];
  const barTotal = Math.max(1, bar.reduce((sum, part) => sum + part.value, 0));

  return (
    <main className="bb-page">
      <header className="bb-page-header">
        <div>
          <span className="bb-kicker">{now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}{orgName ? ` · ${orgName}` : ""} · {now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span>
          <h1>{firstName ? `${greeting(now)}, ${firstName}` : greeting(now)}</h1>
        </div>
        <div className="bb-actions">
          <Link className="bb-btn bb-btn-secondary bb-btn-lg" to="/attendance-operations?tab=absences&record=1"><MinusCircle />Record absence</Link>
          {/* <Link className="bb-btn bb-btn-primary bb-btn-lg" to="/attendance-operations?tab=kiosk"><DeviceTablet />Open tablet mode</Link> */}
        </div>
      </header>

      <div className="bb-grid-main-side" style={{ marginBottom: 70 }}>
        <section aria-labelledby="today-attendance">
          <span id="today-attendance" className="bb-overline accent">Today’s attendance</span>
          <div className="bb-hero-figure">
            <strong className="bb-num">{present.length}</strong>
            <span>{present.length === 1 ? "child is here right now" : "children are here right now"}</span>
          </div>
          <div className="bb-stackbar" role="img" aria-label={bar.map((part) => `${part.value} ${part.label.toLowerCase()}`).join(", ")}>
            {bar.filter((part) => part.value > 0).map((part) => <i key={part.key} style={{ flexGrow: part.value / barTotal, background: part.color }} />)}
          </div>
          <p className="bb-caption" style={{ marginTop: 10 }}>{expected} {expected === 1 ? "child" : "children"} expected today</p>
          <div className="bb-stats" style={{ marginTop: 30, marginBottom: 0, gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
            <Stat value={present.length} label="Present" icon="check" labelTone="ok" />
            <Stat value={checkedOut.length} label="Checked out" icon="signOut" />
            <Stat value={todayAbsences.length} label="Absent" icon="minus" />
            <Stat value={notArrived.length} label="Not arrived" icon="clock" labelTone="warn" />
          </div>
        </section>

        <section aria-labelledby="needs-attention">
          <h2 id="needs-attention" style={{ fontSize: 25, marginBottom: 10 }}>Needs attention</h2>
          {attention.length ? (
            <div className="bb-list">
              {attention.map((item) => (
                <div className="bb-list-row" key={item.key}>
                  <item.icon size={24} color={item.tone === "danger" ? "var(--bb-error)" : "var(--bb-warning)"} aria-hidden />
                  <div className="grow"><strong>{item.title}</strong><span className="sub bb-truncate">{item.detail}</span></div>
                  <Link className={`bb-btn ${item.action.primary ? "bb-btn-primary" : item.action.secondary ? "bb-btn-secondary" : "bb-btn-ghost"}`} to={item.action.to}>{item.action.label}</Link>
                </div>
              ))}
            </div>
          ) : <EmptyState compact title="Nothing needs attention">Every expected child is accounted for.</EmptyState>}
        </section>
      </div>

      <div className="bb-grid-3">
        {isFamilyChildCare ? (
          <section>
            <SectionHead as="h3" title="Children" />
            <div className="bb-dash-room">
              <div className="bb-row" style={{ justifyContent: "space-between" }}><strong>{expected} enrolled</strong><span className="bb-num">{present.length} of {expected}</span></div>
              <Meter value={present.length} max={expected} />
              <span className="bb-caption">{todayAbsences.length} absent · {notArrived.length} not arrived</span>
            </div>
          </section>
        ) : (
          <section>
            <SectionHead as="h3" title="Classrooms" />
            {classroomSummary.length ? classroomSummary.map(({ room, children, present: roomPresent, out, absent, notArrived: roomNotArrived }: any) => (
              <div className="bb-dash-room" key={room.id}>
                <div className="bb-row" style={{ justifyContent: "space-between" }}><strong>{room.name}</strong><span className="bb-num">{roomPresent} of {children}</span></div>
                <Meter value={roomPresent} max={children} label={`${roomPresent} of ${children} present`} />
                <span className="bb-caption">{[absent ? `${absent} absent` : "", roomNotArrived ? `${roomNotArrived} not arrived` : "", out ? `${out} checked out` : ""].filter(Boolean).join(" · ") || "Everyone accounted for"}</span>
              </div>
            )) : <p className="bb-muted">No classrooms yet.</p>}
          </section>
        )}

        <section>
          <SectionHead as="h3" title="Recent activity" />
          {recentAudit.length ? recentAudit.map((log: any) => {
            const Glyph = activityIcons[log.action] ?? PencilSimpleLine;
            return (
              <div className="bb-activity" key={log.id}>
                <time className="bb-num">{clockTime(log.editedAtLocal ?? log.edited_at, log.timezone)}</time>
                <Glyph size={20} color="var(--bb-accent)" aria-hidden />
                <div><strong>{activityTitle(log)}</strong><span>{[log.editedBy ? `by ${log.editedBy}` : "", log.action === "correction" ? log.reason : ""].filter(Boolean).join(" · ")}</span></div>
              </div>
            );
          }) : <p className="bb-muted">No attendance activity yet today.</p>}
        </section>

        <section>
          <SectionHead as="h3" title="Absent today" />
          {todayAbsences.length ? todayAbsences.slice(0, 5).map((record: any) => (
            <div className="bb-absent" key={record.id}>
              <strong>{record.childName}</strong>
              <span>{[String(record.absenceType ?? record.absence_type ?? "absence").replace(/_/g, " ").replace(/^\w/, (letter: string) => letter.toUpperCase()), record.reason ? `“${record.reason}”` : "no reason entered", isFamilyChildCare ? "" : record.classroom].filter(Boolean).join(" · ")}</span>
            </div>
          )) : <p className="bb-muted">No absences recorded today.</p>}
          <Link className="bb-btn bb-btn-ghost" style={{ marginTop: 10, paddingInline: 5 }} to="/attendance-operations?tab=absences">All absences<ArrowRight size={16} /></Link>
        </section>
      </div>
    </main>
  );
}
