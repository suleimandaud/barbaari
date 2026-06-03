import React, { useState } from "react";
import { getApiError } from "@barbaari/shared";
import { Badge } from "./Status";

export type Field = { name: string; label: string; type?: string; placeholder?: string; options?: Array<{ label: string; value: string | number }> };

export function ApiForm({ fields, submitLabel, initial = {}, onSubmit }: { fields: Field[]; submitLabel: string; initial?: Record<string, any>; onSubmit: (values: Record<string, any>) => Promise<void> }) {
  const [values, setValues] = useState<Record<string, any>>(initial);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSubmit(values);
      setValues(initial);
    } catch (err) {
      setError(getApiError(err).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="panel" onSubmit={handleSubmit}>
      <div className="filter-row" style={{ gridTemplateColumns: `repeat(${Math.min(fields.length, 3)}, minmax(180px, 1fr)) auto` }}>
        {fields.map((field) => field.options ? (
          <select key={field.name} value={values[field.name] ?? ""} onChange={(event) => setValues({ ...values, [field.name]: event.target.value })}>
            <option value="">{field.label}</option>
            {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        ) : (
          <input key={field.name} type={field.type ?? "text"} value={values[field.name] ?? ""} placeholder={field.placeholder ?? field.label} onChange={(event) => setValues({ ...values, [field.name]: field.type === "number" ? Number(event.target.value) : event.target.value })} />
        ))}
        <button className="primary" disabled={saving}>{saving ? "Saving..." : submitLabel}</button>
      </div>
      {error ? <Badge tone="danger">{error}</Badge> : null}
    </form>
  );
}
