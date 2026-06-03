import type { FormEvent } from "react";
import { useState } from "react";
import { superAdminApi } from "@barbaari/shared";
import { Alert, Badge, DataTable, ErrorState, Header, LoadingState, Modal } from "../components/Ui";
import { useAsyncData } from "../hooks/useAsyncData";
import { errorMessage, money, titleize } from "../utils/format";

const emptyPlan = { name: "", code: "", monthly_price: "0", yearly_price: "0", currency: "USD", child_limit: "", staff_limit: "", device_limit: "", features: "", status: "active", featured: false, stripe_product_id: "", stripe_monthly_price_id: "", stripe_yearly_price_id: "" };

export function PricingPlansPage() {
  const { data, loading, error, reload } = useAsyncData(async () => (await superAdminApi.pricingPlans()).pricing_plans, []);
  const [form, setForm] = useState<any>(emptyPlan);
  const [editing, setEditing] = useState<any | null>(null);
  const [success, setSuccess] = useState("");
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);

  function open(plan?: any) {
    setEditing(plan ?? {});
    setForm(plan ? { ...plan, features: (plan.features ?? []).join(", ") } : emptyPlan);
    setSuccess("");
    setActionError("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setActionError("");
    try {
      const payload = {
        name: form.name,
        code: form.code || undefined,
        monthly_price: Number(form.monthly_price),
        yearly_price: Number(form.yearly_price),
        currency: form.currency || "USD",
        child_limit: form.child_limit === "" ? null : Number(form.child_limit),
        staff_limit: form.staff_limit === "" ? null : Number(form.staff_limit),
        device_limit: form.device_limit === "" ? null : Number(form.device_limit),
        features: String(form.features).split(",").map((item) => item.trim()).filter(Boolean),
        status: form.status,
        featured: Boolean(form.featured),
        stripe_product_id: form.stripe_product_id || null,
        stripe_monthly_price_id: form.stripe_monthly_price_id || null,
        stripe_yearly_price_id: form.stripe_yearly_price_id || null,
      };
      if (editing?.id) await superAdminApi.updatePricingPlan(editing.id, payload);
      else await superAdminApi.createPricingPlan(payload);
      setSuccess(editing?.id ? "Pricing plan updated." : "Pricing plan created.");
      setEditing(null);
      await reload();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function toggle(plan: any) {
    setActionError("");
    try {
      if (plan.status === "active") await superAdminApi.deactivatePricingPlan(plan.id);
      else await superAdminApi.activatePricingPlan(plan.id);
      setSuccess(plan.status === "active" ? "Plan deactivated." : "Plan reactivated.");
      await reload();
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  return <section className="page">
    <Header eyebrow="Packaging" title="Pricing plans" action={<button className="primary" onClick={() => open()}>Create Plan</button>} />
    <Alert message={success} />
    <Alert message={actionError} tone="danger" />
    {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={reload} /> : <DataTable rows={data ?? []} columns={[
      { header: "Plan", render: (row: any) => <><strong>{row.name}</strong><br />{row.featured ? <Badge tone="warning">Featured</Badge> : null}</> },
      { header: "Monthly", render: (row: any) => `${row.currency ?? "USD"} ${money(row.monthly_price)}` },
      { header: "Yearly", render: (row: any) => `${row.currency ?? "USD"} ${money(row.yearly_price)}` },
      { header: "Limits", render: (row: any) => <span>{row.child_limit ?? "Unlimited"} children / {row.staff_limit ?? "Unlimited"} staff / {row.device_limit ?? "Unlimited"} devices</span> },
      { header: "Features", render: (row: any) => <div className="feature-list">{(row.features ?? []).map((feature: string) => <Badge key={feature}>{titleize(feature)}</Badge>)}</div> },
      { header: "Status", render: (row: any) => <Badge tone={row.status === "active" ? "success" : "danger"}>{row.status}</Badge> },
      { header: "Actions", render: (row: any) => <div className="row-actions"><button className="secondary" onClick={() => open(row)}>Edit</button><button className="secondary" onClick={() => toggle(row)}>{row.status === "active" ? "Deactivate" : "Activate"}</button></div> }
    ]} />}
    {editing ? <Modal title={editing.id ? "Edit pricing plan" : "Create pricing plan"} onClose={() => setEditing(null)}>
      <form className="form-grid two" onSubmit={submit}>
        <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Plan name" required />
        <input value={form.code ?? ""} onChange={(event) => setForm({ ...form, code: event.target.value })} placeholder="Code / slug" />
        <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="active">Active</option><option value="inactive">Inactive</option></select>
        <input value={form.currency ?? "USD"} onChange={(event) => setForm({ ...form, currency: event.target.value.toUpperCase() })} placeholder="Currency" maxLength={3} />
        <input type="number" step="0.01" value={form.monthly_price} onChange={(event) => setForm({ ...form, monthly_price: event.target.value })} placeholder="Monthly price" required />
        <input type="number" step="0.01" value={form.yearly_price} onChange={(event) => setForm({ ...form, yearly_price: event.target.value })} placeholder="Yearly price" />
        <input type="number" value={form.child_limit ?? ""} onChange={(event) => setForm({ ...form, child_limit: event.target.value })} placeholder="Child limit" />
        <input type="number" value={form.staff_limit ?? ""} onChange={(event) => setForm({ ...form, staff_limit: event.target.value })} placeholder="Staff limit" />
        <input type="number" value={form.device_limit ?? ""} onChange={(event) => setForm({ ...form, device_limit: event.target.value })} placeholder="Device limit" />
        <input className="full" value={form.features} onChange={(event) => setForm({ ...form, features: event.target.value })} placeholder="Features, comma separated" />
        <input value={form.stripe_product_id ?? ""} onChange={(event) => setForm({ ...form, stripe_product_id: event.target.value })} placeholder="Stripe product ID (test mode optional)" />
        <input value={form.stripe_monthly_price_id ?? ""} onChange={(event) => setForm({ ...form, stripe_monthly_price_id: event.target.value })} placeholder="Stripe monthly price ID" />
        <input value={form.stripe_yearly_price_id ?? ""} onChange={(event) => setForm({ ...form, stripe_yearly_price_id: event.target.value })} placeholder="Stripe yearly price ID" />
        <label className="stack"><span>Featured</span><select value={form.featured ? "yes" : "no"} onChange={(event) => setForm({ ...form, featured: event.target.value === "yes" })}><option value="no">No</option><option value="yes">Yes</option></select></label>
        <button className="primary" disabled={saving}>{saving ? "Saving..." : "Save plan"}</button>
      </form>
    </Modal> : null}
  </section>;
}
