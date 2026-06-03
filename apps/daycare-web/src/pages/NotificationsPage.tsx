import { useMemo, useState } from "react";
import { getApiError, notificationsApi } from "@barbaari/shared";
import { ErrorAlert, SuccessAlert } from "../components/Alerts";
import { DataTable } from "../components/DataTable";
import { PageHeader, Panel } from "../components/Page";
import { Badge, ErrorState, LoadingState } from "../components/Status";
import { useAsyncData } from "../hooks/useAsyncData";

const types = ["", "child_checked_in", "child_checked_out", "incident_created", "daily_note_created", "invoice_created", "payment_recorded", "document_uploaded", "message_received", "announcement"];
const priorities = ["", "low", "normal", "high", "urgent"];

function label(value?: string | null) {
  return String(value ?? "Not set").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function NotificationsPage() {
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [success, setSuccess] = useState("");
  const [actionError, setActionError] = useState("");
  const { data, loading, error, reload } = useAsyncData(async () => {
    const [notifications, count] = await Promise.all([
      notificationsApi.list({ type: type || undefined, status: status || undefined, priority: priority || undefined }),
      notificationsApi.unreadCount()
    ]);
    return { notifications: notifications.notifications, unread: count.unread_count };
  }, [type, status, priority]);

  const unread = data?.unread ?? 0;
  const rows = useMemo(() => data?.notifications ?? [], [data?.notifications]);

  async function action(run: () => Promise<unknown>, message: string) {
    setSuccess("");
    setActionError("");
    try {
      await run();
      setSuccess(message);
      await reload();
    } catch (err) {
      setActionError(getApiError(err).message);
    }
  }

  return (
    <section className="page">
      <PageHeader eyebrow="Communication" title="Notifications" description="Track in-app parent and staff notifications, read status, priority, and delivery state." />
      <div className="alert-banner info">In-app notifications are delivered internally. Email delivery uses the configured mail provider and queue worker.</div>
      <SuccessAlert message={success} />
      <ErrorAlert message={actionError} />

      <Panel title="Filters" action={<Badge tone={unread ? "warning" : "success"}>{unread} unread</Badge>}>
        <div className="form-grid">
          <label className="field-stack"><span>Type</span><select value={type} onChange={(event) => setType(event.target.value)}>{types.map((item) => <option key={item || "all"} value={item}>{item ? label(item) : "All types"}</option>)}</select></label>
          <label className="field-stack"><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option><option value="unread">Unread</option><option value="read">Read</option></select></label>
          <label className="field-stack"><span>Priority</span><select value={priority} onChange={(event) => setPriority(event.target.value)}>{priorities.map((item) => <option key={item || "all"} value={item}>{item ? label(item) : "All priorities"}</option>)}</select></label>
          <button className="secondary" onClick={() => { setType(""); setStatus(""); setPriority(""); }}>Clear filters</button>
        </div>
        <div className="actions">
          <button className="secondary" onClick={() => action(() => notificationsApi.markAllRead(), "All visible notifications marked read.")}>Mark all read</button>
        </div>
      </Panel>

      <Panel title="Notification history">
        {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={reload} /> : (
          <DataTable rows={rows} emptyTitle="No notifications found." emptyDetail="Create a test notification or trigger a child event such as check-in, incident, note, invoice, document upload, or message." columns={[
            { header: "Notification", render: (row: any) => <><strong>{row.title}</strong><br /><small>{row.body}</small></> },
            { header: "Type", render: (row: any) => <Badge>{label(row.type)}</Badge> },
            { header: "Recipient", render: (row: any) => <><strong>{row.recipientName ?? "Organization"}</strong><br /><small>{label(row.recipientRole)}</small></> },
            { header: "Priority", render: (row: any) => <Badge tone={row.priority === "urgent" || row.priority === "high" ? "danger" : row.priority === "low" ? "neutral" : "primary"}>{label(row.priority)}</Badge> },
            { header: "Read", render: (row: any) => <Badge tone={row.read_at ? "success" : "warning"}>{row.read_at ? "Read" : "Unread"}</Badge> },
            { header: "Delivery", render: (row: any) => <><Badge tone={row.deliveryStatus === "delivered" ? "success" : "warning"}>{label(row.deliveryStatus)}</Badge><br /><small>{label(row.deliveryChannel)}</small></> },
            { header: "Created", render: (row: any) => row.created_at ? new Date(row.created_at).toLocaleString() : "Unknown" },
            { header: "Actions", render: (row: any) => <div className="row-actions"><button className="action-link" disabled={Boolean(row.read_at)} onClick={() => action(() => notificationsApi.markRead(row.id), "Notification marked read.")}>Mark read</button><button className="action-link" onClick={() => action(() => notificationsApi.delete(row.id), "Notification deleted.")}>Delete</button></div> }
          ]} />
        )}
      </Panel>
    </section>
  );
}
