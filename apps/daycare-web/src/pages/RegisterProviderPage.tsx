import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { getApiError, registrationApi } from "@barbaari/shared";
import { ErrorAlert, SuccessAlert } from "../components/Alerts";

const emptyForm = {
  facility_type: "family_child_care",
  business_name: "",
  owner_name: "",
  owner_email: "",
  phone: "",
  city: "",
  state: "",
  country: "Kenya",
  address: "",
  timezone: "Africa/Nairobi",
  license_number: "",
  license_status: "not_provided",
  pricing_plan_id: "",
  billing_cycle: "monthly",
  notes: ""
};

function facilityLabel(type: string) {
  return type === "family_child_care" ? "Family Child Care" : "Center Daycare";
}

export function RegisterProviderPage() {
  const [form, setForm] = useState(emptyForm);
  const [plans, setPlans] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    registrationApi.pricingPlans(form.facility_type as "family_child_care" | "center_daycare")
      .then((response) => {
        if (!mounted) return;
        setPlans(response.pricing_plans);
        if (!form.pricing_plan_id && response.pricing_plans[0]) {
          setForm((current) => ({ ...current, pricing_plan_id: response.pricing_plans[0].id }));
        }
      })
      .catch(() => mounted && setPlans([]));
    return () => { mounted = false; };
  }, [form.facility_type]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setSuccess("");
    setError("");
    try {
      const response = await registrationApi.createApplication({
        ...form,
        license_number: form.license_number || null,
        pricing_plan_id: form.pricing_plan_id || null
      });
      setSuccess(response.message);
      setForm(emptyForm);
    } catch (err) {
      setError(getApiError(err).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card wide-auth">
        <div className="auth-brand"><span>B</span><strong>Barbaari</strong></div>
        <h1>Register your provider account</h1>
        <p>Apply for Barbaari attendance-first SaaS access. Super Admin reviews applications before creating the workspace and sending the owner invite.</p>
        <SuccessAlert message={success} />
        <ErrorAlert message={error} />
        <form className="form-grid two" onSubmit={submit}>
          <label className="field-stack full"><span>Facility type</span><select value={form.facility_type} onChange={(event) => setForm({ ...form, facility_type: event.target.value, pricing_plan_id: "" })}><option value="family_child_care">Family Child Care</option><option value="center_daycare">Center Daycare</option></select></label>
          <input value={form.business_name} onChange={(event) => setForm({ ...form, business_name: event.target.value })} placeholder={`${facilityLabel(form.facility_type)} name`} required />
          <input value={form.owner_name} onChange={(event) => setForm({ ...form, owner_name: event.target.value })} placeholder="Owner/admin full name" required />
          <input type="email" value={form.owner_email} onChange={(event) => setForm({ ...form, owner_email: event.target.value })} placeholder="Owner/admin email" required />
          <input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="Phone" />
          <input value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} placeholder="City" />
          <input value={form.state} onChange={(event) => setForm({ ...form, state: event.target.value })} placeholder="State/region" />
          <input value={form.country} onChange={(event) => setForm({ ...form, country: event.target.value })} placeholder="Country" />
          <input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} placeholder="Address" />
          <input value={form.timezone} onChange={(event) => setForm({ ...form, timezone: event.target.value })} placeholder="Timezone, e.g. Africa/Nairobi" />
          <input value={form.license_number} onChange={(event) => setForm({ ...form, license_number: event.target.value })} placeholder="License number optional" />
          <select value={form.license_status} onChange={(event) => setForm({ ...form, license_status: event.target.value })}><option value="not_provided">License not provided</option><option value="pending">Pending</option><option value="verified">Verified</option></select>
          <select value={form.pricing_plan_id} onChange={(event) => setForm({ ...form, pricing_plan_id: event.target.value })}>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} - ${Number(plan.monthly_price).toFixed(0)}/month</option>)}</select>
          <select value={form.billing_cycle} onChange={(event) => setForm({ ...form, billing_cycle: event.target.value })}><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select>
          <textarea className="full" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Notes optional" rows={4} />
          <button className="primary full" disabled={saving}>{saving ? "Submitting..." : "Submit application"}</button>
        </form>
        <a href="/login">Already invited? Log in</a>
      </section>
    </main>
  );
}
