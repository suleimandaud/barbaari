import { useState } from "react";
import { Alert, Dialog, Field } from "@barbaari/shared/web/ui";

/** Replaces window.prompt for tablet PIN resets. Same 4–8 digit rule the API enforces. */
export function PinDialog({ title, description, onClose, onSave }: { title: string; description?: string; onClose: () => void; onSave: (pin: string) => Promise<void> }) {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const valid = /^\d{4,8}$/.test(pin);

  async function save() {
    if (!valid) { setError("PIN must be 4–8 digits."); return; }
    if (pin !== confirm) { setError("The two PINs don’t match."); return; }
    setSaving(true);
    setError("");
    try {
      await onSave(pin);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The PIN could not be saved.");
      setSaving(false);
    }
  }

  return (
    <Dialog title={title} onClose={onClose} actions={<><button className="bb-btn bb-btn-secondary" onClick={onClose}>Cancel</button><button className="bb-btn bb-btn-primary" disabled={saving || !pin || !confirm} onClick={save}>{saving ? "Saving…" : "Save PIN"}</button></>}>
      <div className="bb-stack" style={{ gap: 15 }}>
        {description ? <p>{description}</p> : null}
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <div className="bb-form-grid">
          <Field label="New PIN" hint="4–8 digits"><input className="bb-input" type="password" inputMode="numeric" autoComplete="new-password" maxLength={8} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))} aria-invalid={Boolean(pin) && !valid} /></Field>
          <Field label="Confirm PIN"><input className="bb-input" type="password" inputMode="numeric" autoComplete="new-password" maxLength={8} value={confirm} onChange={(event) => setConfirm(event.target.value.replace(/\D/g, ""))} /></Field>
        </div>
      </div>
    </Dialog>
  );
}
