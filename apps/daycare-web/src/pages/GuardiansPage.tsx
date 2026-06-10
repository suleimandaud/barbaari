import type { FormEvent } from "react";
import { useState } from "react";
import { childrenApi, getApiError, guardiansApi } from "@barbaari/shared";
import { PageHeader, Panel } from "../components/Page";
import { DataTable } from "../components/DataTable";
import { Badge, ErrorState, LoadingState } from "../components/Status";
import { ErrorAlert, SuccessAlert } from "../components/Alerts";
import { ChildSelect, GuardianSelect } from "../components/Selects";
import { useAsyncData } from "../hooks/useAsyncData";
import { childCode, friendlyError, guardianLabel } from "../utils/labels";

export function GuardiansPage() {
  const { data, loading, error, reload } = useAsyncData(async () => {
    const [guardians, children] = await Promise.all([guardiansApi.list(), childrenApi.managerList()]);
    return { guardians: guardians.guardians, children: children.children };
  }, []);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [relationship, setRelationship] = useState("");
  const [createChildId, setCreateChildId] = useState("");
  const [pin, setPin] = useState("");
  const [linkChildId, setLinkChildId] = useState("");
  const [linkGuardianId, setLinkGuardianId] = useState("");
  const [success, setSuccess] = useState("");
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);

  async function runAction(action: () => Promise<void>, message: string) {
    setSaving(true);
    setSuccess("");
    setActionError("");
    try {
      await action();
      setSuccess(message);
      await reload();
    } catch (err) {
      setActionError(friendlyError(getApiError(err).message));
    } finally {
      setSaving(false);
    }
  }

  async function createGuardian(event: FormEvent) {
    event.preventDefault();
    await runAction(async () => {
      await guardiansApi.create({ name, phone, relationship, can_pickup: true, child_id: createChildId || undefined, pin: pin || undefined });
      setName("");
      setPhone("");
      setRelationship("");
      setCreateChildId("");
      setPin("");
    }, "Guardian created.");
  }

  async function linkGuardian(event: FormEvent) {
    event.preventDefault();
    if (!linkChildId) {
      setActionError("Please select a child from the list.");
      return;
    }
    if (!linkGuardianId) {
      setActionError("Please select a guardian from the list.");
      return;
    }
    await runAction(async () => {
      await childrenApi.linkGuardian(linkChildId, { guardian_id: linkGuardianId, pickup_authorized: true });
      setLinkChildId("");
      setLinkGuardianId("");
    }, "Guardian linked to child.");
  }

  async function resetGuardianPin(row: any) {
    const nextPin = window.prompt("Enter a new 4-8 digit guardian tablet PIN.");
    if (!nextPin) return;
    if (!/^\d{4,8}$/.test(nextPin)) {
      setActionError("PIN must be 4-8 digits.");
      return;
    }
    setSaving(true);
    setSuccess("");
    setActionError("");
    try {
      const response = await guardiansApi.resetPin(row.id, nextPin);
      setSuccess(response.message);
      await reload();
    } catch (err) {
      setActionError(friendlyError(getApiError(err).message));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="page">
      <PageHeader eyebrow="Family records" title="Guardians" />
      <SuccessAlert message={success} />
      <ErrorAlert message={actionError} />
      <Panel title="Create guardian">
        <form className="form-grid" onSubmit={createGuardian}>
          <label className="field-stack"><span>Guardian name</span><input value={name} onChange={(event) => setName(event.target.value)} required /></label>
          <label className="field-stack"><span>Phone</span><input value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
          <label className="field-stack"><span>Relationship</span><input value={relationship} onChange={(event) => setRelationship(event.target.value)} /></label>
          <label className="field-stack"><span>Tablet PIN (optional)</span><input type="password" inputMode="numeric" value={pin} onChange={(event) => setPin(event.target.value)} placeholder="4-8 digits" /></label>
          <div className="full"><ChildSelect children={data?.children ?? []} value={createChildId} onChange={setCreateChildId} label="Link child now" placeholder="No child selected" /></div>
          <p className="muted full">Tablet PINs are used for attendance kiosk verification.</p>
          <button className="primary" disabled={saving}>{saving ? "Saving..." : "Create guardian"}</button>
        </form>
      </Panel>
      <Panel title="Link guardian to child">
        <form className="form-grid" onSubmit={linkGuardian}>
          <div className="full"><ChildSelect children={data?.children ?? []} value={linkChildId} onChange={setLinkChildId} /></div>
          <div className="full"><GuardianSelect guardians={data?.guardians ?? []} value={linkGuardianId} onChange={setLinkGuardianId} /></div>
          <button className="primary" disabled={saving}>{saving ? "Saving..." : "Link guardian"}</button>
        </form>
      </Panel>
      {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={reload} /> : (
        <DataTable rows={data?.guardians ?? []} columns={[
          { header: "Guardian", render: (row: any) => <><strong>{row.name}</strong><br /><small>{guardianLabel(row)}</small></> },
          { header: "Relationship", render: (row: any) => row.relationship ?? "Not set" },
          { header: "Phone", render: (row: any) => row.phone ?? "Not set" },
          { header: "Children", render: (row: any) => row.children?.length ? row.children.map((child: any) => `${child.name ?? `${child.first_name} ${child.last_name}`} (${childCode(child)})`).join(", ") : "Not linked" },
          { header: "Pickup", render: (row: any) => <Badge tone={row.can_pickup ? "success" : "neutral"}>{row.can_pickup ? "Authorized" : "Not authorized"}</Badge> },
          { header: "Status", render: (row: any) => <Badge tone={row.status === "active" ? "success" : row.status === "inactive" ? "neutral" : "warning"}>{String(row.status ?? "active").replace(/_/g, " ")}</Badge> },
          { header: "PIN", render: (row: any) => <Badge tone={row.pin_configured ? "success" : "warning"}>{row.pin_configured ? "PIN configured" : "PIN missing"}</Badge> },
          { header: "Actions", render: (row: any) => <div className="row-actions"><button className="secondary" onClick={() => resetGuardianPin(row)}>Reset PIN</button></div> }
        ]} />
      )}
    </section>
  );
}
