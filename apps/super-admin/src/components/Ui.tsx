import React, { useState } from "react";
import { getApiError } from "@barbaari/shared";

export function Header({ eyebrow, title, action }: { eyebrow: string; title: string; action?: React.ReactNode }) {
  return <div className="header"><div><span>{eyebrow}</span><h1>{title}</h1></div>{action}</div>;
}

export function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return <article className="panel"><div className="panel-head"><h2>{title}</h2>{action}</div>{children}</article>;
}

export function Badge({ children, tone = "primary" }: { children: React.ReactNode; tone?: string }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function Alert({ message, tone = "success" }: { message?: string; tone?: "success" | "danger" | "warning" }) {
  if (!message) return null;
  return <div className={`alert ${tone}`}>{message}</div>;
}

export function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="modal-backdrop" role="dialog" aria-modal="true"><div className="modal-panel"><div className="panel-head"><h2>{title}</h2><button className="secondary" onClick={onClose}>Close</button></div>{children}</div></div>;
}

export function LoadingState() { return <section className="panel"><strong>Loading platform data...</strong></section>; }
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) { return <section className="panel"><div className="panel-head"><h2>Error</h2>{onRetry ? <button className="secondary" onClick={onRetry}>Retry</button> : null}</div><span>{message}</span></section>; }
export function EmptyState() { return <section className="panel"><h2>No records yet</h2><span>The backend returned an empty list.</span></section>; }

export type Column<T> = { header: string; render: (row: T) => React.ReactNode };
export function DataTable<T>({ rows, columns }: { rows: T[]; columns: Column<T>[] }) {
  if (!rows.length) return <EmptyState />;
  return <div className="table-wrap"><table><thead><tr>{columns.map((column) => <th key={column.header}>{column.header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={String((row as any).id ?? index)}>{columns.map((column) => <td key={column.header}>{column.render(row)}</td>)}</tr>)}</tbody></table></div>;
}

export function ApiForm({ fields, submitLabel, onSubmit }: { fields: Array<{ name: string; label: string; type?: string }>; submitLabel: string; onSubmit: (values: Record<string, any>) => Promise<void> }) {
  const [values, setValues] = useState<Record<string, any>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    try { await onSubmit(values); setValues({}); } catch (err) { setError(getApiError(err).message); } finally { setSaving(false); }
  }
  return <form className="panel" onSubmit={submit}><div className="actions">{fields.map((field) => <input key={field.name} type={field.type ?? "text"} value={values[field.name] ?? ""} placeholder={field.label} onChange={(event) => setValues({ ...values, [field.name]: field.type === "number" ? Number(event.target.value) : event.target.value })} />)}<button className="primary">{saving ? "Saving..." : submitLabel}</button></div>{error ? <Badge tone="danger">{error}</Badge> : null}</form>;
}
