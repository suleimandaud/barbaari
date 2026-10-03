import { useMemo, useState } from "react";
import { ClipboardText } from "@phosphor-icons/react";
import { attendanceApi, formatAttendanceTime } from "@barbaari/shared";
import { EmptyState, ErrorState, LoadingState, PageHeader, Pagination, SearchInput, usePaged } from "@barbaari/shared/web/ui";
import { useAsyncData } from "../hooks/useAsyncData";

const words = (value?: string | null) => String(value ?? "").replace(/_/g, " ").replace(/^\w/, (letter) => letter.toUpperCase());

export function AuditLogsPage() {
  const { data, loading, error, reload } = useAsyncData(async () => (await attendanceApi.auditLogs()).audit_logs ?? [], []);
  const [query, setQuery] = useState("");
  const [action, setAction] = useState("");
  const logs = (data ?? []) as any[];
  const actions = useMemo(() => [...new Set(logs.map((log) => String(log.action ?? "")).filter(Boolean))].sort(), [logs]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return logs.filter((log) => (!action || log.action === action) && (!q || `${log.childName ?? ""} ${log.childCode ?? ""} ${log.editedBy ?? ""} ${log.reason ?? ""}`.toLowerCase().includes(q)));
  }, [logs, query, action]);
  const { page, setPage, pageCount, rows: pageRows } = usePaged(rows, 25, `${query}|${action}`);

  return (
    <main className="bb-page">
      <PageHeader kicker="Compliance" title="Audit log" lede="Every check-in, checkout, correction and absence, with who recorded it and why." />
      <div className="bb-toolbar">
        <div style={{ flex: "1 1 260px", maxWidth: 380 }}><SearchInput value={query} onChange={setQuery} placeholder="Child, staff member or reason" /></div>
        <label className="bb-field" style={{ minWidth: 200 }}>
          <span className="bb-sr-only">Action</span>
          <select className="bb-input" value={action} onChange={(event) => setAction(event.target.value)}>
            <option value="">All actions</option>
            {actions.map((item) => <option key={item} value={item}>{words(item)}</option>)}
          </select>
        </label>
      </div>
      {loading && !data ? <LoadingState /> : error ? <ErrorState message={error} onRetry={reload} /> : !rows.length ? (
        <EmptyState icon={ClipboardText} title={logs.length ? "No entries match" : "No audit entries yet"}>{logs.length ? "Try another search or action." : "Attendance changes are logged here as they happen."}</EmptyState>
      ) : (
        <>
          <ol className="bb-feed wide">
            {pageRows.map((log) => (
              <li key={log.id}>
                <span className="bb-caption">{log.editedAtLocal ? `${log.date ?? ""} · ${formatAttendanceTime(log.editedAtLocal, log.timezone)}` : log.edited_at ? new Date(log.edited_at).toLocaleString() : ""}</span>
                <span className="bb-tag">{words(log.action)}</span>
                <div>
                  <strong>{log.childName ?? "Attendance record"}</strong><span className="bb-caption"> · {log.childCode ? `ID ${log.childCode}` : "No child code"} · {log.classroom ?? "Unassigned"}</span>
                  <span className="sub">{log.reason}{log.editedBy ? ` · by ${log.editedBy}` : log.edited_by_user_id ? ` · by user #${log.edited_by_user_id}` : ""}</span>
                </div>
              </li>
            ))}
          </ol>
          <Pagination page={page} pageCount={pageCount} total={rows.length} pageSize={25} onChange={setPage} />
        </>
      )}
    </main>
  );
}
