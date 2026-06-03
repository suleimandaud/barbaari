import { useMemo, useState } from "react";
import { absenceApi, attendanceApi, reportsApi } from "@barbaari/shared";
import { ErrorAlert, SuccessAlert } from "../components/Alerts";
import { DataTable } from "../components/DataTable";
import { PageHeader, Panel } from "../components/Page";
import { Badge, ErrorState, LoadingState } from "../components/Status";
import { useAsyncData } from "../hooks/useAsyncData";

function statusOf(record: any) {
  return record.status ?? (record.checkOutTime ? "checked_out" : "checked_in");
}

function absenceLabel(value: string) {
  return String(value ?? "absence").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function ReportsPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const { data, loading, error, reload } = useAsyncData(async () => {
    const [attendance, absences, auditLogs] = await Promise.all([
      attendanceApi.managerList(),
      absenceApi.list(),
      attendanceApi.auditLogs()
    ]);
    return { attendance: attendance.attendance ?? [], absences: absences.absence_records ?? [], auditLogs: auditLogs.audit_logs ?? [] };
  }, []);

  const reportRows = useMemo(() => {
    const attendance = (data?.attendance ?? []).filter((record: any) => (!fromDate || record.date >= fromDate) && (!toDate || record.date <= toDate));
    const absences = (data?.absences ?? []).filter((record: any) => {
      const date = record.absenceDate ?? record.absence_date;
      return (!fromDate || date >= fromDate) && (!toDate || date <= toDate);
    });
    return [
      { report: "Daily attendance", value: attendance.length, detail: "All check-in/check-out records in range" },
      { report: "Present children", value: attendance.filter((record: any) => statusOf(record) === "checked_in" && !record.checkOutTime).length, detail: "Children currently checked in" },
      { report: "Checked out children", value: attendance.filter((record: any) => record.checkOutTime || statusOf(record) === "checked_out").length, detail: "Completed checkout records" },
      { report: "Early checkouts", value: attendance.filter((record: any) => statusOf(record) === "checked_out_early").length, detail: "Early departures" },
      { report: "Absences", value: absences.length, detail: "Excused, unexcused, sick, vacation, no-show, and other absences" },
      { report: "Missing checkouts", value: attendance.filter((record: any) => statusOf(record) === "missing_checkout").length, detail: "Records that need checkout review" },
      { report: "Corrections", value: attendance.filter((record: any) => record.corrected).length, detail: "Attendance records with corrections" },
      { report: "Signature records", value: attendance.filter((record: any) => record.hasSignature || record.signatureName || record.signature_name).length, detail: "Signed guardian, pickup, or staff-assisted records" },
      { report: "Audit history", value: data?.auditLogs?.length ?? 0, detail: "Attendance audit log entries" },
      { report: "Classroom summary", value: new Set(attendance.map((record: any) => record.classroom).filter(Boolean)).size, detail: "Classrooms represented in the selected range" }
    ];
  }, [data, fromDate, toDate]);

  async function exportAttendance() {
    setMessage("");
    setErrorMessage("");
    try {
      await reportsApi.attendanceExport();
      setMessage("Attendance export requested. The backend will return the available attendance export.");
    } catch {
      setErrorMessage("Attendance export is not available right now.");
    }
  }

  return (
    <section className="page">
      <PageHeader eyebrow="Attendance reporting" title="Attendance Reports" description="Daily attendance, present, checked-out, early checkout, absence, missing checkout, signature, audit, and classroom summary reports." action={<button className="secondary" onClick={exportAttendance}>Export attendance</button>} />
      <SuccessAlert message={message} />
      <ErrorAlert message={errorMessage} />
      <Panel title="Date range">
        <div className="form-grid">
          <label className="field-stack"><span>From</span><input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label>
          <label className="field-stack"><span>To</span><input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></label>
          <button className="secondary" onClick={() => { setFromDate(""); setToDate(""); }}>Clear date range</button>
        </div>
      </Panel>
      {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={reload} /> : (
        <>
          <Panel title="Summary">
            <DataTable rows={reportRows} columns={[
              { header: "Attendance report", render: (row: any) => <strong>{row.report}</strong> },
              { header: "Count", render: (row: any) => <Badge tone={row.value ? "primary" : "neutral"}>{row.value}</Badge> },
              { header: "Detail", render: (row: any) => row.detail }
            ]} />
          </Panel>
          <Panel title="Absence Records By Type">
            <DataTable rows={(data?.absences ?? []).filter((record: any) => {
              const date = record.absenceDate ?? record.absence_date;
              return (!fromDate || date >= fromDate) && (!toDate || date <= toDate);
            })} emptyTitle="No absences in this range." emptyDetail="Absence records with types appear here." columns={[
              { header: "Child", render: (row: any) => <strong>{row.childName}</strong> },
              { header: "Date", render: (row: any) => row.absenceDate ?? row.absence_date },
              { header: "Type", render: (row: any) => <Badge tone={(row.absenceType ?? row.absence_type) === "no_show" ? "warning" : "neutral"}>{absenceLabel(row.absenceType ?? row.absence_type)}</Badge> },
              { header: "Reason", render: (row: any) => row.reason ?? "No reason entered" },
              { header: "Status", render: (row: any) => row.status }
            ]} />
          </Panel>
        </>
      )}
    </section>
  );
}
