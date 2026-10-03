import { useMemo, useState } from "react";
import { getApiError, notificationsApi } from "@barbaari/shared";
import { Checks } from "@phosphor-icons/react";
import { Alert, ErrorState, LoadingState, PageHeader, StatusBadge, clockTime, shortDate, useToast } from "@barbaari/shared/web/ui";
import type { StatusSpec } from "@barbaari/shared/web/status";
import { DataTable } from "../components/DataTable";
import { useAsyncData } from "../hooks/useAsyncData";

const types = ["", "child_checked_in", "child_checked_out", "incident_created", "daily_note_created", "invoice_created", "payment_recorded", "document_uploaded", "message_received", "announcement"];
const priorities = ["", "low", "normal", "high", "urgent"];

const priorityMap: Record<string, StatusSpec> = {
  low: { label: "Low", tone: "muted", icon: "circleDashed" },
  normal: { label: "Normal", tone: "info", icon: "circleDashed" },
  high: { label: "High", tone: "warn", icon: "warning" },
  urgent: { label: "Urgent", tone: "danger", icon: "warning" }
};
const readMap: Record<string, StatusSpec> = { read: { label: "Read", tone: "ok", icon: "check" }, unread: { label: "Unread", tone: "warn", icon: "envelope" } };
const deliveryMap: Record<string, StatusSpec> = { delivered: { label: "Delivered", tone: "ok", icon: "check" }, other: { label: "Pending", tone: "warn", icon: "clock" } };

function label(value?: string | null) {
  return String(value ?? "Not set").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function NotificationsPage() {
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const toast = useToast();
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
    setActionError("");
    try {
      await run();
      toast(message);
      await reload();
    } catch (err) {
      setActionError(getApiError(err).message);
    }
  }

  return (
    <main className="bb-page">
      <PageHeader kicker="Communication" title="Notifications" lede="In-app notifications for parents and staff, with read status, priority and delivery state." actions={
        <>
          <StatusBadge map={{ unread: { label: `${unread} unread`, tone: "warn", icon: "envelope" }, clear: { label: "All read", tone: "ok", icon: "check" } }} value={unread ? "unread" : "clear"} />
          <button className="bb-btn bb-btn-secondary bb-btn-lg" onClick={() => action(() => notificationsApi.markAllRead(), "All visible notifications marked read.")}><Checks />Mark all read</button>
        </>
      } />
      <Alert tone="info">In-app notifications are delivered internally. Email delivery uses the configured mail provider and queue worker.</Alert>
      {actionError ? <Alert tone="danger">{actionError}</Alert> : null}

      <div className="bb-toolbar bb-report-range">
        <label className="bb-field"><span className="bb-label">Type</span><select className="bb-input" value={type} onChange={(event) => setType(event.target.value)}>{types.map((item) => <option key={item || "all"} value={item}>{item ? label(item) : "All types"}</option>)}</select></label>
        <label className="bb-field"><span className="bb-label">Status</span><select className="bb-input" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option><option value="unread">Unread</option><option value="read">Read</option></select></label>
        <label className="bb-field"><span className="bb-label">Priority</span><select className="bb-input" value={priority} onChange={(event) => setPriority(event.target.value)}>{priorities.map((item) => <option key={item || "all"} value={item}>{item ? label(item) : "All priorities"}</option>)}</select></label>
        <button type="button" className="bb-btn bb-btn-ghost" onClick={() => { setType(""); setStatus(""); setPriority(""); }}>Clear filters</button>
      </div>

      {loading && !data ? <LoadingState /> : error ? <ErrorState message={error} onRetry={reload} /> : (
        <DataTable rows={rows} emptyTitle="No notifications found." emptyDetail="Notifications appear when a child is checked in or out, or when an incident, note, invoice, document or message is created." columns={[
          { header: "Notification", render: (row: any) => <div style={{ minWidth: 220 }}><strong style={{ fontWeight: row.read_at ? 400 : 600 }}>{row.title}</strong><span className="bb-caption" style={{ display: "block" }}>{row.body}</span></div> },
          { header: "Type", render: (row: any) => <span className="bb-tag">{label(row.type)}</span> },
          { header: "Recipient", render: (row: any) => <div><span>{row.recipientName ?? "Organization"}</span><span className="bb-caption" style={{ display: "block" }}>{label(row.recipientRole)}</span></div> },
          { header: "Priority", render: (row: any) => <StatusBadge size="sm" map={priorityMap} value={row.priority ?? "normal"} /> },
          { header: "Read", render: (row: any) => <StatusBadge size="sm" plain map={readMap} value={row.read_at ? "read" : "unread"} /> },
          { header: "Delivery", render: (row: any) => <div><StatusBadge size="sm" plain map={deliveryMap} value={row.deliveryStatus === "delivered" ? "delivered" : "other"} label={label(row.deliveryStatus)} /><span className="bb-caption" style={{ display: "block" }}>{label(row.deliveryChannel)}</span></div> },
          { header: "Created", render: (row: any) => <span className="bb-caption" style={{ whiteSpace: "nowrap" }}>{row.created_at ? `${shortDate(row.created_at)} · ${clockTime(row.created_at)}` : "Unknown"}</span> },
          { header: "", align: "right", render: (row: any) => <div className="bb-row" style={{ flexWrap: "nowrap", justifyContent: "flex-end", gap: 6 }}><button className="bb-btn bb-btn-ghost" disabled={Boolean(row.read_at)} onClick={() => action(() => notificationsApi.markRead(row.id), "Notification marked read.")}>Mark read</button><button className="bb-btn bb-btn-ghost" onClick={() => action(() => notificationsApi.delete(row.id), "Notification deleted.")}>Delete</button></div> }
        ]} />
      )}
    </main>
  );
}
