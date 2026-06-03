import { attendanceApi, formatAttendanceTime } from "@barbaari/shared";
import { Badge } from "../components/Status";
import { ResourcePage } from "./ResourcePage";

export function AuditLogsPage() {
  return <ResourcePage eyebrow="Compliance" title="Attendance audit logs" loader={async () => (await attendanceApi.auditLogs()).audit_logs} columns={[
    { header: "Child", render: (row: any) => <><strong>{row.childName ?? "Attendance record"}</strong><br /><small>{row.childCode ? `ID: ${row.childCode}` : "No child code"} - {row.classroom ?? "Unassigned"} - {row.date ?? "No date"}</small></> },
    { header: "Action", render: (row: any) => <Badge>{row.action}</Badge> },
    { header: "Reason", render: (row: any) => row.reason },
    { header: "Edited by", render: (row: any) => row.edited_by_user_id },
    { header: "Edited at", render: (row: any) => row.editedAtLocal ? `${row.date ?? ""} ${formatAttendanceTime(row.editedAtLocal, row.timezone)}` : row.edited_at ? new Date(row.edited_at).toLocaleString() : "" }
  ]} />;
}
