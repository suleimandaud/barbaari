import { Link } from "react-router-dom";
import { Activity, DoorOpen, FileSignature, TabletSmartphone } from "lucide-react";
import { absenceApi, attendanceApi, childrenApi, classroomsApi, devicesApi, formatAttendanceTime, organizationApi } from "@barbaari/shared";
import { useAsyncData } from "../hooks/useAsyncData";
import { ErrorState, LoadingState } from "../components/Status";
import { PageHeader, Panel } from "../components/Page";
import { childCode } from "../utils/labels";

function recordStatus(record: any) {
  return record?.status ?? (record?.checkOutTime ? "checked_out" : "checked_in");
}

function isToday(value?: string) {
  return value === new Date().toISOString().slice(0, 10);
}

function childClassroomId(child: any, classrooms: any[]) {
  if (child.classroomId) return String(child.classroomId);
  return String(classrooms.find((room) => room.name === child.classroom)?.id ?? "");
}

export function DashboardPage() {
  const { data, loading, error, reload } = useAsyncData(async () => {
    const [attendance, absences, children, classrooms, devices, auditLogs, organization] = await Promise.all([
      attendanceApi.managerList(),
      absenceApi.list(),
      childrenApi.managerList(),
      classroomsApi.list(),
      devicesApi.list(),
      attendanceApi.auditLogs(),
      organizationApi.get()
    ]);
    return {
      attendance: attendance.attendance ?? [],
      absences: absences.absence_records ?? [],
      children: children.children ?? [],
      classrooms: classrooms.classrooms ?? [],
      devices: devices.devices ?? [],
      auditLogs: auditLogs.audit_logs ?? [],
      organization: organization.organization
    };
  }, []);

  if (loading) return <section className="page"><LoadingState /></section>;
  if (error || !data) return <section className="page"><ErrorState message={error} onRetry={reload} /></section>;

  const todayAttendance = data.attendance.filter((record: any) => isToday(record.date));
  const todayAbsences = data.absences.filter((record: any) => isToday(record.absenceDate ?? record.absence_date));
  const present = todayAttendance.filter((record: any) => recordStatus(record) === "checked_in" && !record.checkOutTime);
  const checkedOut = todayAttendance.filter((record: any) => record.checkOutTime || recordStatus(record) === "checked_out");
  const earlyCheckouts = todayAttendance.filter((record: any) => recordStatus(record) === "checked_out_early");
  const missingCheckouts = data.attendance.filter((record: any) => recordStatus(record) === "missing_checkout");
  const arrivedOrAbsentIds = new Set([...todayAttendance.map((record: any) => String(record.childId)), ...todayAbsences.map((record: any) => String(record.childId))]);
  const notArrived = data.children.filter((child: any) => !arrivedOrAbsentIds.has(String(child.id)));
  const recentActions = [...todayAttendance]
    .sort((a: any, b: any) => String(b.updatedAt ?? b.checkOutTime ?? b.checkInTime ?? b.id).localeCompare(String(a.updatedAt ?? a.checkOutTime ?? a.checkInTime ?? a.id)))
    .slice(0, 8);
  const recentAudit = data.auditLogs.slice(0, 6);
  const activeDevices = data.devices.filter((device: any) => device.status === "active" || device.status === "online");
  const isFamilyChildCare = data.organization?.facility_type === "family_child_care";

  const classroomSummary = data.classrooms.map((room: any) => {
    const children = data.children.filter((child: any) => childClassroomId(child, data.classrooms) === String(room.id));
    const childIds = new Set(children.map((child: any) => String(child.id)));
    const roomPresent = present.filter((record: any) => childIds.has(String(record.childId))).length;
    const roomAbsent = todayAbsences.filter((record: any) => childIds.has(String(record.childId))).length;
    return { room, children: children.length, present: roomPresent, absent: roomAbsent, notArrived: Math.max(children.length - roomPresent - roomAbsent, 0) };
  });

  const metrics = [
    ["Present today", present.length, "Children currently inside", "primary"],
    ["Checked out today", checkedOut.length, "Completed pickup records", "secondary"],
    ["Absent today", todayAbsences.length, "Recorded absences and no-shows", "tertiary"],
    ["Early checkouts", earlyCheckouts.length, "Children who left before schedule", "warning"],
    ["Missing checkouts", missingCheckouts.length, "Records needing staff review", "danger"],
    ["Not checked in yet", notArrived.length, "Expected children without arrival", "neutral"],
    ["Tablet status", `${activeDevices.length}/${data.devices.length}`, "Active kiosk/tablet devices", "primary"],
    ["Audit activity", recentAudit.length, "Recent signature or correction events", "secondary"]
  ];

  return (
    <section className="page">
      <PageHeader
        eyebrow="Attendance operations"
        title="Attendance Dashboard"
        description={isFamilyChildCare ? "Live check-in, checkout, absence, signature, location, and tablet status for today." : "Live check-in, checkout, absence, classroom, signature, and kiosk status for today."}
        action={<Link className="primary" to="/attendance"><TabletSmartphone size={18} />Open Tablet / Kiosk Mode</Link>}
      />
      <div className="metric-grid attendance-metrics">
        {metrics.map(([label, value, detail, tone]) => <article className={`metric-card ${tone}`} key={label}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>)}
      </div>

      <div className="dashboard-grid">
        <Panel title="Who is currently inside">
          <div className="alert-list">
            {present.slice(0, 8).map((record: any) => <div className="alert-item" key={record.id}><DoorOpen size={20} /><strong>{record.childName}</strong><span>{isFamilyChildCare ? "Family child care" : record.classroom} - in at {record.checkInTime ?? "time pending"} - {record.childCode ?? "no code"}</span></div>)}
            {!present.length ? <div className="alert-item"><strong>No children checked in right now</strong><span>Today has no active inside records yet.</span></div> : null}
          </div>
        </Panel>

        <Panel title="Needs attention">
          <div className="alert-list">
            {notArrived.slice(0, 5).map((child: any) => <div className="alert-item" key={`not-${child.id}`}><strong>{child.name}</strong><span>Not checked in - {isFamilyChildCare ? "Family child care" : child.classroom ?? "Unassigned"} - {childCode(child)}</span></div>)}
            {earlyCheckouts.slice(0, 3).map((record: any) => <div className="alert-item" key={`early-${record.id}`}><strong>{record.childName}</strong><span>Early checkout at {record.checkOutTime ?? "time pending"}</span></div>)}
            {missingCheckouts.slice(0, 3).map((record: any) => <div className="alert-item danger-row" key={`missing-${record.id}`}><strong>{record.childName}</strong><span>Missing checkout from {record.date}</span></div>)}
          </div>
        </Panel>
      </div>

      <div className="dashboard-grid lower">
        {isFamilyChildCare ? (
          <Panel title="Child attendance summary">
            <div className="classroom-grid">
              <div className="classroom attendance-room"><strong>{data.children.length} enrolled children</strong><span>{present.length} present - {todayAbsences.length} absent - {notArrived.length} not checked in</span><div className="capacity"><i style={{ width: `${data.children.length ? Math.min(100, (present.length / data.children.length) * 100) : 0}%` }} /></div></div>
            </div>
          </Panel>
        ) : (
          <Panel title="Classroom attendance summary">
            <div className="classroom-grid">
              {classroomSummary.map(({ room, children, present, absent, notArrived }: any) => <div className="classroom attendance-room" key={room.id}><strong>{room.name}</strong><span>{present} present - {absent} absent - {notArrived} not checked in</span><div className="capacity"><i style={{ width: `${children ? Math.min(100, (present / children) * 100) : 0}%` }} /></div></div>)}
            </div>
          </Panel>
        )}

        <Panel title="Recent attendance actions">
          <div className="alert-list">
            {recentActions.map((record: any) => <div className="alert-item" key={record.id}><Activity size={20} /><strong>{record.childName}</strong><span>{recordStatus(record).replace(/_/g, " ")} - in {record.checkInTime ?? "pending"} - out {record.checkOutTime ?? "pending"}</span></div>)}
          </div>
        </Panel>
      </div>

      <div className="dashboard-grid lower">
        <Panel title="Recent absences">
          <div className="alert-list">
            {todayAbsences.slice(0, 6).map((record: any) => <div className="alert-item" key={record.id}><strong>{record.childName}</strong><span>{(record.absenceType ?? record.absence_type ?? "absence").replace(/_/g, " ")} - {record.reason ?? "No reason entered"}</span></div>)}
            {!todayAbsences.length ? <div className="alert-item"><strong>No absences recorded today</strong><span>Absence records will appear here after staff entry.</span></div> : null}
          </div>
        </Panel>

        <Panel title="Signature and audit activity">
          <div className="alert-list">
            {recentAudit.map((log: any) => <div className="alert-item" key={log.id}><FileSignature size={20} /><strong>{log.childName ?? log.action}</strong><span>{log.action} - {log.reason ?? "Attendance activity"} - {log.editedAtLocal ? formatAttendanceTime(log.editedAtLocal, log.timezone) : "time pending"}</span></div>)}
            {!recentAudit.length ? <div className="alert-item"><strong>No audit events yet</strong><span>Corrections and signature activity will appear here.</span></div> : null}
          </div>
        </Panel>
      </div>
    </section>
  );
}
