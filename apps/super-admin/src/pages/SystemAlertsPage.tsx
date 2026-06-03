import type { FormEvent } from "react";
import { useState } from "react";
import { superAdminApi } from "@barbaari/shared";
import { Alert, Badge, DataTable, ErrorState, Header, LoadingState, Modal } from "../components/Ui";
import { useAsyncData } from "../hooks/useAsyncData";
import { dateShort, errorMessage, titleize } from "../utils/format";

const severities = ["info", "warning", "critical"];
const types = ["payment_failure", "api_error", "downtime", "database_warning", "security", "general"];

export function SystemAlertsPage() {
  const [filters, setFilters] = useState({ severity: "", type: "", status: "" });
  const { data, loading, error, reload } = useAsyncData(async () => (await superAdminApi.filteredSystemAlerts(filters)).system_alerts, [filters.severity, filters.type, filters.status]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", body: "", severity: "info", type: "general" });
  const [success, setSuccess] = useState("");
  const [actionError, setActionError] = useState("");

  async function action(run: () => Promise<unknown>, message: string) {
    setActionError("");
    setSuccess("");
    try {
      await run();
      setSuccess(message);
      await reload();
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    await action(async () => {
      await superAdminApi.createSystemAlert(form);
      setForm({ title: "", body: "", severity: "info", type: "general" });
      setOpen(false);
    }, "System alert created.");
  }

  return <section className="page">
    <Header eyebrow="Reliability" title="System alerts" action={<button className="primary" onClick={() => setOpen(true)}>Create Alert</button>} />
    <Alert message={success} />
    <Alert message={actionError} tone="danger" />
    <div className="panel filters">
      <select value={filters.severity} onChange={(event) => setFilters({ ...filters, severity: event.target.value })}><option value="">All severities</option>{severities.map((item) => <option key={item} value={item}>{titleize(item)}</option>)}</select>
      <select value={filters.type} onChange={(event) => setFilters({ ...filters, type: event.target.value })}><option value="">All types</option>{types.map((item) => <option key={item} value={item}>{titleize(item)}</option>)}</select>
      <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">All statuses</option><option value="open">Open</option><option value="resolved">Resolved</option></select>
    </div>
    {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={reload} /> : <DataTable rows={data ?? []} columns={[
      { header: "Alert", render: (row: any) => <><strong>{row.title}</strong><br /><small>{row.body}</small></> },
      { header: "Severity", render: (row: any) => <Badge tone={row.severity === "critical" ? "danger" : row.severity === "warning" ? "warning" : "primary"}>{row.severity}</Badge> },
      { header: "Type", render: (row: any) => titleize(row.type) },
      { header: "Status", render: (row: any) => row.resolved_at ? <Badge tone="success">Resolved</Badge> : <Badge tone="danger">Open</Badge> },
      { header: "Created", render: (row: any) => dateShort(row.created_at) },
      { header: "Actions", render: (row: any) => row.resolved_at ? <button className="secondary" onClick={() => action(() => superAdminApi.reopenSystemAlert(row.id), "Alert reopened.")}>Reopen</button> : <button className="secondary" onClick={() => action(() => superAdminApi.resolveSystemAlert(row.id), "Alert resolved.")}>Resolve</button> }
    ]} />}
    {open ? <Modal title="Create system alert" onClose={() => setOpen(false)}>
      <form className="form-grid two" onSubmit={create}>
        <input className="full" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Title" required />
        <select value={form.severity} onChange={(event) => setForm({ ...form, severity: event.target.value })}>{severities.map((item) => <option key={item} value={item}>{titleize(item)}</option>)}</select>
        <select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>{types.map((item) => <option key={item} value={item}>{titleize(item)}</option>)}</select>
        <textarea className="full" value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} placeholder="Body/message" />
        <button className="primary">Create alert</button>
      </form>
    </Modal> : null}
  </section>;
}
