import React, { useState } from "react";
import { getApiError } from "@barbaari/shared";
import {
  Alert as KitAlert, Dialog, EmptyState as KitEmpty, ErrorState as KitError, LoadingState as KitLoading, PageHeader, Status
} from "@barbaari/shared/web/ui";
import { accountStatuses, invoiceStatuses, subscriptionStatuses, type StatusIcon, type StatusSpec, type StatusTone } from "@barbaari/shared/web/status";

// Known status words get their design-system spec (tone, icon and label) regardless of the
// tone a page passes, so "pending_invite" renders as "Invite pending" with the right colour.
const knownStatuses: Record<string, StatusSpec> = { ...invoiceStatuses, ...subscriptionStatuses, ...accountStatuses };

/*
 * Super-admin page primitives, now rendered through the shared Barbaari design system
 * (packages/shared/web). Signatures are unchanged so every page keeps working as before.
 */

export function Header({ eyebrow, title, action, lede }: { eyebrow: string; title: string; action?: React.ReactNode; lede?: React.ReactNode }) {
  return <PageHeader kicker={eyebrow} title={title} lede={lede} actions={action} />;
}

export function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="bb-section bb-admin-section">
      <div className="bb-section-head"><h2>{title}</h2>{action}</div>
      {children}
    </section>
  );
}

const tones: Record<string, [StatusTone, StatusIcon]> = {
  success: ["ok", "check"], active: ["ok", "check"],
  danger: ["danger", "warning"], warning: ["warn", "clock"], tertiary: ["warn", "clock"],
  neutral: ["muted", "circleDashed"], primary: ["info", "info"], secondary: ["info", "info"], info: ["info", "info"]
};

/** Status badge: always an icon plus a word, per the design system. */
export function Badge({ children, tone = "primary" }: { children: React.ReactNode; tone?: string }) {
  const key = typeof children === "string" ? children.trim().toLowerCase().replace(/[\s-]+/g, "_") : "";
  if (key && knownStatuses[key]) return <Status size="sm" spec={knownStatuses[key]} />;
  const [statusTone, icon] = tones[tone] ?? tones.primary;
  const label = typeof children === "string" && /_/.test(children) ? children.replace(/_/g, " ").replace(/^\w/, (letter) => letter.toUpperCase()) : children;
  return <Status size="sm" spec={{ label: label as string, tone: statusTone, icon }} />;
}

export function Alert({ message, tone = "success" }: { message?: string; tone?: "success" | "danger" | "warning" }) {
  if (!message) return null;
  return <KitAlert tone={tone === "success" ? "ok" : tone === "warning" ? "warn" : "danger"}>{message}</KitAlert>;
}

export function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return <Dialog title={title} onClose={onClose} wide>{children}</Dialog>;
}

export function LoadingState() { return <KitLoading label="Loading platform data" />; }
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) { return <KitError message={message} onRetry={onRetry} />; }
export function EmptyState({ title = "No records yet", detail = "Records will appear here once they are added." }: { title?: string; detail?: string }) {
  return <KitEmpty compact title={title}>{detail}</KitEmpty>;
}

export type Column<T> = { header: string; render: (row: T) => React.ReactNode; align?: "right" };
export function DataTable<T>({ rows, columns, onRowClick, emptyTitle, emptyDetail }: { rows: T[]; columns: Column<T>[]; onRowClick?: (row: T) => void; emptyTitle?: string; emptyDetail?: string }) {
  if (!rows.length) return <EmptyState title={emptyTitle} detail={emptyDetail} />;
  return (
    <div className="bb-table-wrap">
      <table className="bb-table">
        <thead><tr>{columns.map((column) => <th key={column.header} className={column.align === "right" ? "right" : undefined}>{column.header}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={String((row as any).id ?? index)} className={onRowClick ? "clickable" : undefined} onClick={onRowClick ? () => onRowClick(row) : undefined}>
              {columns.map((column) => <td key={column.header} className={column.align === "right" ? "right" : undefined}>{column.render(row)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ApiForm({ fields, submitLabel, onSubmit }: { fields: Array<{ name: string; label: string; type?: string }>; submitLabel: string; onSubmit: (values: Record<string, any>) => Promise<void> }) {
  const [values, setValues] = useState<Record<string, any>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    try { await onSubmit(values); setValues({}); } catch (err) { setError(getApiError(err).message); } finally { setSaving(false); }
  }
  return (
    <form className="bb-panel bb-api-form" onSubmit={submit}>
      {error ? <KitAlert tone="danger">{error}</KitAlert> : null}
      <div className="bb-api-form-row">
        {fields.map((field) => (
          <label key={field.name} className="bb-field">
            <span className="bb-label">{field.label}</span>
            <input className="bb-input white" type={field.type ?? "text"} value={values[field.name] ?? ""} onChange={(event) => setValues({ ...values, [field.name]: field.type === "number" ? Number(event.target.value) : event.target.value })} />
          </label>
        ))}
        <button className="bb-btn bb-btn-primary bb-btn-lg" disabled={saving}>{saving ? "Saving…" : submitLabel}</button>
      </div>
    </form>
  );
}
