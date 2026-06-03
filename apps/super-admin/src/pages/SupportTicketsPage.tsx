import type { FormEvent } from "react";
import { useState } from "react";
import { superAdminApi } from "@barbaari/shared";
import { Alert, Badge, DataTable, ErrorState, Header, LoadingState, Modal } from "../components/Ui";
import { useAsyncData } from "../hooks/useAsyncData";
import { dateShort, errorMessage, titleize } from "../utils/format";

const priorities = ["low", "normal", "high", "urgent"];
const statuses = ["open", "in_progress", "resolved", "closed"];

export function SupportTicketsPage() {
  const { data, loading, error, reload } = useAsyncData(async () => {
    const [tickets, organizations, users] = await Promise.all([superAdminApi.supportTickets(), superAdminApi.organizations(), superAdminApi.users()]);
    return { tickets: tickets.support_tickets, organizations: organizations.organizations, users: users.users };
  }, []);
  const [modal, setModal] = useState<"create" | "detail" | null>(null);
  const [selected, setSelected] = useState<any | null>(null);
  const [form, setForm] = useState({ organization_id: "", subject: "", description: "", priority: "normal", status: "open", assigned_to: "" });
  const [comment, setComment] = useState("");
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
      await superAdminApi.createSupportTicket({ ...form, organization_id: form.organization_id || null, assigned_to: form.assigned_to || null });
      setForm({ organization_id: "", subject: "", description: "", priority: "normal", status: "open", assigned_to: "" });
      setModal(null);
    }, "Support ticket created.");
  }

  return <section className="page">
    <Header eyebrow="Support" title="Support tickets" action={<button className="primary" onClick={() => setModal("create")}>Create Ticket</button>} />
    <Alert message={success} />
    <Alert message={actionError} tone="danger" />
    {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={reload} /> : <DataTable rows={data?.tickets ?? []} columns={[
      { header: "Subject", render: (row: any) => <><strong>{row.subject}</strong><br /><small>{row.organization?.name ?? "Platform"}</small></> },
      { header: "Priority", render: (row: any) => <Badge tone={row.priority === "urgent" ? "danger" : row.priority === "high" ? "warning" : "primary"}>{row.priority}</Badge> },
      { header: "Status", render: (row: any) => <Badge tone={row.status === "closed" ? "success" : row.status === "in_progress" ? "warning" : "primary"}>{titleize(row.status)}</Badge> },
      { header: "Assignee", render: (row: any) => row.assignee?.name ?? "Unassigned" },
      { header: "Created", render: (row: any) => dateShort(row.created_at) },
      { header: "Actions", render: (row: any) => <button className="secondary" onClick={() => { setSelected(row); setForm({ organization_id: row.organization_id ?? "", subject: row.subject, description: row.description ?? "", priority: row.priority, status: row.status, assigned_to: row.assigned_to ?? "" }); setModal("detail"); }}>Open</button> }
    ]} />}
    {modal === "create" ? <Modal title="Create support ticket" onClose={() => setModal(null)}>
      <TicketForm form={form} setForm={setForm} organizations={data?.organizations ?? []} users={data?.users ?? []} onSubmit={create} submitLabel="Create ticket" />
    </Modal> : null}
    {modal === "detail" && selected ? <Modal title={selected.subject} onClose={() => setModal(null)}>
      <TicketForm form={form} setForm={setForm} organizations={data?.organizations ?? []} users={data?.users ?? []} onSubmit={(event: FormEvent) => { event.preventDefault(); void action(() => superAdminApi.updateSupportTicket(selected.id, { ...form, organization_id: form.organization_id || null, assigned_to: form.assigned_to || null }), "Ticket updated."); }} submitLabel="Save ticket" />
      <div className="actions">
        {statuses.map((status) => <button key={status} className="secondary" onClick={() => action(() => superAdminApi.updateSupportTicketStatus(selected.id, status), `Ticket marked ${titleize(status)}.`)}>{titleize(status)}</button>)}
        <button className="primary" onClick={() => action(() => superAdminApi.closeSupportTicket(selected.id), "Ticket closed.")}>Close ticket</button>
      </div>
      <div className="panel"><div className="panel-head"><h2>Comments</h2></div><div className="log-list">{(selected.comments ?? []).map((item: any) => <div className="log" key={item.id}><strong>{item.user?.name ?? "Support"}</strong><span>{item.body}</span><small>{dateShort(item.created_at)}</small></div>)}</div><div className="form-grid"><textarea className="full" value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Reply/comment" /><button className="primary" disabled={!comment.trim()} onClick={() => action(async () => { await superAdminApi.commentSupportTicket(selected.id, comment); setComment(""); const fresh = await superAdminApi.supportTickets(); setSelected(fresh.support_tickets.find((ticket: any) => String(ticket.id) === String(selected.id)) ?? selected); }, "Comment added.")}>Add reply</button></div></div>
    </Modal> : null}
  </section>;
}

function TicketForm({ form, setForm, organizations, users, onSubmit, submitLabel }: any) {
  return <form className="form-grid two" onSubmit={onSubmit}>
    <select value={form.organization_id} onChange={(event) => setForm({ ...form, organization_id: event.target.value })}><option value="">Platform ticket</option>{organizations.map((org: any) => <option key={org.id} value={org.id}>{org.name}</option>)}</select>
    <select value={form.assigned_to} onChange={(event) => setForm({ ...form, assigned_to: event.target.value })}><option value="">Unassigned</option>{users.filter((user: any) => ["super_admin", "support_staff"].includes(user.role)).map((user: any) => <option key={user.id} value={user.id}>{user.name}</option>)}</select>
    <input className="full" value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} placeholder="Subject" required />
    <select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>{priorities.map((priority) => <option key={priority} value={priority}>{titleize(priority)}</option>)}</select>
    <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>{statuses.map((status) => <option key={status} value={status}>{titleize(status)}</option>)}</select>
    <textarea className="full" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Description" />
    <button className="primary">{submitLabel}</button>
  </form>;
}
