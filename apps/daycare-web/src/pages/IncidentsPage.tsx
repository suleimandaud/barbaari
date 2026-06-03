import type { FormEvent } from "react";
import { useState } from "react";
import { childrenApi, getApiError, incidentApi } from "@barbaari/shared";
import { PageHeader, Panel } from "../components/Page";
import { DataTable } from "../components/DataTable";
import { Badge, ErrorState, LoadingState } from "../components/Status";
import { ErrorAlert, SuccessAlert } from "../components/Alerts";
import { ChildSelect } from "../components/Selects";
import { useAsyncData } from "../hooks/useAsyncData";
import { friendlyError } from "../utils/labels";

export function IncidentsPage() {
  const { data, loading, error, reload } = useAsyncData(async () => {
    const [incidents, children] = await Promise.all([incidentApi.list(), childrenApi.managerList()]);
    return { incidents: incidents.incidents, children: children.children };
  }, []);
  const [childId, setChildId] = useState("");
  const [severity, setSeverity] = useState<"low" | "medium" | "high">("low");
  const [summary, setSummary] = useState("");
  const [details, setDetails] = useState("");
  const [actionTaken, setActionTaken] = useState("");
  const [notifyParent, setNotifyParent] = useState(true);
  const [success, setSuccess] = useState("");
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setActionError("");
    setSuccess("");
    if (!childId) {
      setActionError("Please select a child from the list.");
      return;
    }
    setSaving(true);
    try {
      const fullSummary = [summary, details && `Details: ${details}`, actionTaken && `Action taken: ${actionTaken}`].filter(Boolean).join("\n");
      const response = await incidentApi.create({ child_id: childId, severity, summary: fullSummary, status: notifyParent ? "sent" : "draft" });
      if (notifyParent && response.incident?.id) await incidentApi.notifyParent(response.incident.id);
      setSuccess("Incident report created.");
      setChildId("");
      setSummary("");
      setDetails("");
      setActionTaken("");
      await reload();
    } catch (err) {
      setActionError(friendlyError(getApiError(err).message));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="page">
      <PageHeader eyebrow="Reports" title="Incident reports" />
      <SuccessAlert message={success} />
      <ErrorAlert message={actionError} />
      <Panel title="Create incident report">
        <form className="form-grid" onSubmit={submit}>
          <div className="full"><ChildSelect children={data?.children ?? []} value={childId} onChange={setChildId} /></div>
          <select value={severity} onChange={(event) => setSeverity(event.target.value as "low" | "medium" | "high")}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High / critical</option>
          </select>
          <input value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="Summary" required />
          <textarea className="full" value={details} onChange={(event) => setDetails(event.target.value)} placeholder="Details" />
          <textarea className="full" value={actionTaken} onChange={(event) => setActionTaken(event.target.value)} placeholder="Action taken" />
          <label><input type="checkbox" checked={notifyParent} onChange={(event) => setNotifyParent(event.target.checked)} /> Notify parent</label>
          <button className="primary" disabled={saving}>{saving ? "Saving..." : "Create incident"}</button>
        </form>
      </Panel>
      {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={reload} /> : (
        <DataTable rows={data?.incidents ?? []} columns={[
          { header: "Child", render: (row: any) => <><strong>{row.childName}</strong><br /><small>{row.childCode ? `ID: ${row.childCode}` : "No child code"}</small></> },
          { header: "Classroom", render: (row: any) => row.classroom },
          { header: "Severity", render: (row: any) => <Badge tone={row.severity === "high" ? "danger" : row.severity === "medium" ? "warning" : "success"}>{row.severity}</Badge> },
          { header: "Status", render: (row: any) => <Badge>{row.status}</Badge> },
          { header: "Summary", render: (row: any) => row.summary },
          { header: "Staff", render: (row: any) => row.staffName }
        ]} />
      )}
    </section>
  );
}
