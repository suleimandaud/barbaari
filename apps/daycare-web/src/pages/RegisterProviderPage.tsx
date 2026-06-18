import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { getApiError, registrationApi } from "@barbaari/shared";
import { ErrorAlert, SuccessAlert } from "../components/Alerts";

const emptyForm = {
  facility_type: "family_child_care",
  business_name: "",
  owner_name: "",
  owner_email: "",
  password: "",
  password_confirmation: "",
  phone: "",
  address_line1: "",
  address_line2: "",
  city: "",
  state: "",
  postal_code: "",
  country: "US",
  address: "",
  attendance_radius_meters: "100",
  address_validation_token: "",
  timezone: "America/New_York",
  license_number: "",
  license_status: "not_provided",
  pricing_plan_id: "",
  billing_cycle: "monthly",
  notes: ""
};

function facilityLabel(type: string) {
  return type === "family_child_care" ? "Family Child Care" : "Center Daycare";
}

function planFeatures(plan: any) {
  const features = Array.isArray(plan.features) ? plan.features : [];
  return features.map((feature: string) => feature.replace(/_/g, " ")).join(", ");
}

export function RegisterProviderPage() {
  const [form, setForm] = useState(emptyForm);
  const [validatedAddress, setValidatedAddress] = useState<any | null>(null);
  const [validatingAddress, setValidatingAddress] = useState(false);
  const [plans, setPlans] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const selectedPlan = plans.find((plan) => String(plan.id) === String(form.pricing_plan_id)) ?? plans[0];
  const selectedPrice = selectedPlan
    ? form.billing_cycle === "yearly"
      ? `$${Number(selectedPlan.yearly_price).toFixed(0)}/year`
      : `$${Number(selectedPlan.monthly_price).toFixed(0)}/month`
    : "";

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

  function setAddressField(field: keyof typeof emptyForm, value: string) {
    setForm((current) => ({ ...current, [field]: value, address_validation_token: "" }));
    setValidatedAddress(null);
  }

  async function validateAddress() {
    setValidatingAddress(true);
    setError("");
    setSuccess("");
    try {
      const response = await registrationApi.validateAddress({
        address_line1: form.address_line1,
        address_line2: form.address_line2 || null,
        city: form.city,
        state: form.state,
        postal_code: form.postal_code,
        country: form.country || "US"
      });
      setValidatedAddress(response);
      setForm((current) => ({
        ...current,
        address_line1: response.address_line1 ?? current.address_line1,
        address_line2: response.address_line2 ?? "",
        city: response.city ?? current.city,
        state: response.state ?? current.state,
        postal_code: response.postal_code ?? current.postal_code,
        country: response.country ?? "US",
        address: response.standardized_address ?? current.address,
        address_validation_token: response.validation_token
      }));
      setSuccess(response.message ?? "Address validated. Location will be used for tablet attendance geofence.");
    } catch (err) {
      setError(getApiError(err).message || "We could not validate this address. Please check the street, city, state, and ZIP code.");
      setValidatedAddress(null);
      setForm((current) => ({ ...current, address_validation_token: "" }));
    } finally {
      setValidatingAddress(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (form.password !== form.password_confirmation) {
      setError("Password and confirmation do not match.");
      return;
    }
    if (!form.address_validation_token) {
      setError("Please validate the address before submitting the application.");
      return;
    }
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
      setValidatedAddress(null);
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
        {form.facility_type === "family_child_care" ? (
          <p className="muted">Family Child Care is for home-based providers. It uses children, guardians, attendance, signatures, geofence verification, reports, and billing without classrooms. Starter is the only available plan for this facility type.</p>
        ) : (
          <p className="muted">Center Daycare supports classrooms, staff access, classroom attendance, tablet/kiosk mode, reports, and subscription billing.</p>
        )}
        <SuccessAlert message={success} />
        <ErrorAlert message={error} />
        <form className="form-grid two" onSubmit={submit}>
          <label className="field-stack full"><span>Facility type</span><select value={form.facility_type} onChange={(event) => setForm({ ...form, facility_type: event.target.value, pricing_plan_id: "" })}><option value="family_child_care">Family Child Care</option><option value="center_daycare">Center Daycare</option></select></label>
          <input value={form.business_name} onChange={(event) => setForm({ ...form, business_name: event.target.value })} placeholder={`${facilityLabel(form.facility_type)} name`} required />
          <input value={form.owner_name} onChange={(event) => setForm({ ...form, owner_name: event.target.value })} placeholder="Owner/admin full name" required />
          <input type="email" value={form.owner_email} onChange={(event) => setForm({ ...form, owner_email: event.target.value })} placeholder="Owner/admin email" required />
          <input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="Password" minLength={8} required autoComplete="new-password" />
          <input type="password" value={form.password_confirmation} onChange={(event) => setForm({ ...form, password_confirmation: event.target.value })} placeholder="Confirm password" minLength={8} required autoComplete="new-password" />
          <p className="muted full">You will use this email and password to log in after your application is approved.</p>
          <input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="Phone" />
          <label className="field-stack full"><span>Physical address</span><input value={form.address_line1} onChange={(event) => setAddressField("address_line1", event.target.value)} placeholder="Street address" required /></label>
          <input value={form.address_line2} onChange={(event) => setAddressField("address_line2", event.target.value)} placeholder="Unit / Apartment / Suite optional" />
          <input value={form.city} onChange={(event) => setAddressField("city", event.target.value)} placeholder="City" required />
          <input value={form.state} onChange={(event) => setAddressField("state", event.target.value.toUpperCase())} placeholder="State" maxLength={2} required />
          <input value={form.postal_code} onChange={(event) => setAddressField("postal_code", event.target.value)} placeholder="ZIP Code" required />
          <input value={form.country} onChange={(event) => setAddressField("country", event.target.value.toUpperCase())} placeholder="Country" maxLength={2} required />
          <input type="number" min="25" max="5000" value={form.attendance_radius_meters} onChange={(event) => setForm({ ...form, attendance_radius_meters: event.target.value })} placeholder="Allowed attendance radius in meters" required />
          <div className="full actions">
            <button className="secondary" type="button" disabled={validatingAddress} onClick={validateAddress}>{validatingAddress ? "Validating..." : "Validate Address"}</button>
          </div>
          {validatedAddress ? (
            <article className="plan-explainer full">
              <div>
                <span>Standardized address</span>
                <strong>{validatedAddress.standardized_address}</strong>
              </div>
              <ul>
                <li>{validatedAddress.city}</li>
                <li>{validatedAddress.state}</li>
                <li>{validatedAddress.postal_code}</li>
              </ul>
              <p>Address validated. Location will be used for tablet attendance geofence.</p>
              {validatedAddress.latitude && validatedAddress.longitude ? <small>Location coordinates saved.</small> : null}
            </article>
          ) : null}
          <input value={form.timezone} onChange={(event) => setForm({ ...form, timezone: event.target.value })} placeholder="Timezone, e.g. America/New_York" />
          <input value={form.license_number} onChange={(event) => setForm({ ...form, license_number: event.target.value })} placeholder="License number optional" />
          <select value={form.license_status} onChange={(event) => setForm({ ...form, license_status: event.target.value })}><option value="not_provided">License not provided</option><option value="pending">Pending</option><option value="verified">Verified</option></select>
          <label className="field-stack full"><span>Desired plan</span><select value={form.pricing_plan_id} onChange={(event) => setForm({ ...form, pricing_plan_id: event.target.value })}>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} - ${Number(plan.monthly_price).toFixed(0)}/month ({plan.child_limit} children, {plan.staff_limit} staff, {plan.device_limit} tablets)</option>)}</select></label>
          <select value={form.billing_cycle} onChange={(event) => setForm({ ...form, billing_cycle: event.target.value })}><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select>
          {selectedPlan ? (
            <article className="plan-explainer full">
              <div>
                <span>Selected plan</span>
                <strong>{selectedPlan.name}</strong>
              </div>
              <div>
                <span>Price</span>
                <strong>{selectedPrice}</strong>
              </div>
              <ul>
                <li>{selectedPlan.child_limit} children</li>
                <li>{selectedPlan.staff_limit} staff</li>
                <li>{selectedPlan.device_limit} tablet devices</li>
              </ul>
              {planFeatures(selectedPlan) ? <p>{planFeatures(selectedPlan)}</p> : null}
              {form.facility_type === "family_child_care" ? <small>Family Child Care registration is available on Starter only.</small> : null}
            </article>
          ) : null}
          <textarea className="full" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Notes optional" rows={4} />
          <button className="primary full" disabled={saving}>{saving ? "Submitting..." : "Submit application"}</button>
        </form>
        <a href="/login">Already invited? Log in</a>
      </section>
    </main>
  );
}
