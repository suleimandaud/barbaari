import React, { useState } from "react";
import { getApiError } from "@barbaari/shared";
import { Alert } from "@barbaari/shared/web/ui";

export type Field = { name: string; label: string; type?: string; placeholder?: string; options?: Array<{ label: string; value: string | number }> };

export function ApiForm({ fields, submitLabel, initial = {}, onSubmit, title }: { fields: Field[]; submitLabel: string; initial?: Record<string, any>; onSubmit: (values: Record<string, any>) => Promise<void>; title?: string }) {
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
    <form className="bb-panel bb-api-form" onSubmit={handleSubmit}>
      {title ? <h3>{title}</h3> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="bb-api-form-row">
        {fields.map((field) => (
          <label key={field.name} className="bb-field">
            <span className="bb-label">{field.label}</span>
            {field.options ? (
              <select className="bb-input white" value={values[field.name] ?? ""} onChange={(event) => setValues({ ...values, [field.name]: event.target.value })}>
                <option value="">{field.placeholder ?? `Choose ${field.label.toLowerCase()}`}</option>
                {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            ) : (
              <input className="bb-input white" type={field.type ?? "text"} value={values[field.name] ?? ""} placeholder={field.placeholder ?? ""} onChange={(event) => setValues({ ...values, [field.name]: field.type === "number" ? Number(event.target.value) : event.target.value })} />
            )}
          </label>
        ))}
        <button className="bb-btn bb-btn-primary bb-btn-lg" disabled={saving}>{saving ? "Saving…" : submitLabel}</button>
      </div>
    </form>
  );
}
