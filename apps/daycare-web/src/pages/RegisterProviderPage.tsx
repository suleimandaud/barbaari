import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { getApiError, registrationApi } from "@barbaari/shared";
import { Link } from "react-router-dom";
import { CheckCircle } from "@phosphor-icons/react";
import { Alert, AuthFrame, Segmented } from "@barbaari/shared/web/ui";

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

  const input = (key: keyof typeof emptyForm, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, onChange?: (value: string) => void) => (
    <label className="bb-field" style={props.style}>
      <span className="bb-label">{label}</span>
      <input className="bb-input" {...props} style={undefined} value={form[key]} onChange={(event) => (onChange ? onChange(event.target.value) : setForm({ ...form, [key]: event.target.value }))} />
    </label>
  );
  const full = { style: { gridColumn: "1 / -1" } };

  return (
    <AuthFrame wide foot={<span>Already invited? <Link to="/login">Sign in</Link></span>}>
      <div>
        <h1>Register your organization</h1>
        <p className="bb-lede" style={{ marginTop: 8 }}>Apply for Barbaari. The Barbaari team reviews every application before creating your workspace and sending the owner invite.</p>
      </div>
      {success ? <Alert tone="ok">{success}</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <form className="bb-auth-form" onSubmit={submit}>
        <section className="bb-stack">
          <span className="bb-label">Facility type</span>
          <Segmented label="Facility type" value={form.facility_type as "family_child_care" | "center_daycare"} onChange={(value) => setForm({ ...form, facility_type: value, pricing_plan_id: "" })} items={[{ key: "family_child_care", label: "Family Child Care" }, { key: "center_daycare", label: "Center Daycare" }]} />
          <p className="bb-caption">{form.facility_type === "family_child_care"
            ? "Family Child Care is for home-based providers. It uses children, guardians, attendance, signatures, geofence verification, reports, and billing without classrooms. Starter is the only available plan for this facility type."
            : "Center Daycare supports classrooms, staff access, classroom attendance, tablet/kiosk mode, reports, and subscription billing."}</p>
        </section>

        <h2 className="bb-report-h" style={{ marginBottom: 0 }}>Owner account</h2>
        <div className="bb-form-grid">
          {input("business_name", `${facilityLabel(form.facility_type)} name`, { required: true, ...full })}
          {input("owner_name", "Owner / admin full name", { required: true, autoComplete: "name" })}
          {input("owner_email", "Owner / admin email", { type: "email", required: true, autoComplete: "email" })}
          {input("password", "Password", { type: "password", minLength: 8, required: true, autoComplete: "new-password" })}
          {input("password_confirmation", "Confirm password", { type: "password", minLength: 8, required: true, autoComplete: "new-password" })}
          {input("phone", "Phone", { autoComplete: "tel" })}
        </div>
        <p className="bb-caption" style={{ marginTop: -8 }}>You will use this email and password to sign in after your application is approved.</p>

        <h2 className="bb-report-h" style={{ marginBottom: 0 }}>Physical address</h2>
        <div className="bb-form-grid">
          {input("address_line1", "Street address", { required: true, ...full }, (value) => setAddressField("address_line1", value))}
          {input("address_line2", "Unit / apartment / suite (optional)", {}, (value) => setAddressField("address_line2", value))}
          {input("city", "City", { required: true }, (value) => setAddressField("city", value))}
          {input("state", "State", { maxLength: 2, required: true }, (value) => setAddressField("state", value.toUpperCase()))}
          {input("postal_code", "ZIP code", { required: true }, (value) => setAddressField("postal_code", value))}
          {input("country", "Country", { maxLength: 2, required: true }, (value) => setAddressField("country", value.toUpperCase()))}
          {input("attendance_radius_meters", "Allowed attendance radius (meters)", { type: "number", min: 25, max: 5000, required: true })}
        </div>
        <div><button className="bb-btn bb-btn-secondary" type="button" disabled={validatingAddress} onClick={validateAddress}>{validatingAddress ? "Validating…" : "Validate address"}</button></div>
        {validatedAddress ? (
          <div className="bb-alert ok">
            <CheckCircle size={20} />
            <div>
              <strong>{validatedAddress.standardized_address}</strong>
              <span>Address validated. Location will be used for tablet attendance geofence.{validatedAddress.latitude && validatedAddress.longitude ? " Location coordinates saved." : ""}</span>
              {validatedAddress.timezone ? <span>Timezone: {validatedAddress.timezone} · automatically detected from the attendance address</span> : null}
            </div>
          </div>
        ) : null}

        <h2 className="bb-report-h" style={{ marginBottom: 0 }}>License and plan</h2>
        <div className="bb-form-grid">
          {input("license_number", "License number (optional)")}
          <label className="bb-field"><span className="bb-label">License status</span><select className="bb-input" value={form.license_status} onChange={(event) => setForm({ ...form, license_status: event.target.value })}><option value="not_provided">License not provided</option><option value="pending">Pending</option><option value="verified">Verified</option></select></label>
          <label className="bb-field" style={{ gridColumn: "1 / -1" }}><span className="bb-label">Desired plan</span><select className="bb-input" value={form.pricing_plan_id} onChange={(event) => setForm({ ...form, pricing_plan_id: event.target.value })}>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · ${Number(plan.monthly_price).toFixed(0)}/month ({plan.child_limit} children, {plan.staff_limit} staff, {plan.device_limit} tablets)</option>)}</select></label>
          <label className="bb-field"><span className="bb-label">Billing cycle</span><select className="bb-input" value={form.billing_cycle} onChange={(event) => setForm({ ...form, billing_cycle: event.target.value })}><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></label>
        </div>
        {selectedPlan ? (
          <div className="bb-panel">
            <p className="bb-overline">Selected plan</p>
            <div className="bb-row" style={{ justifyContent: "space-between", margin: "8px 0 10px" }}><strong style={{ fontSize: 24 }}>{selectedPlan.name}</strong><strong className="bb-num" style={{ fontSize: 20 }}>{selectedPrice}</strong></div>
            <div className="bb-row" style={{ gap: 8 }}>
              <span className="bb-tag accent">{selectedPlan.child_limit} children</span>
              <span className="bb-tag accent">{selectedPlan.staff_limit} staff</span>
              <span className="bb-tag accent">{selectedPlan.device_limit} tablet devices</span>
            </div>
            {planFeatures(selectedPlan) ? <p style={{ marginTop: 10 }}>{planFeatures(selectedPlan)}</p> : null}
            {form.facility_type === "family_child_care" ? <p className="bb-caption" style={{ marginTop: 6 }}>Family Child Care registration is available on Starter only.</p> : null}
          </div>
        ) : null}
        <label className="bb-field"><span className="bb-label">Notes (optional)</span><textarea className="bb-input" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} rows={4} /></label>
        <button className="bb-btn bb-btn-primary bb-btn-lg bb-btn-block" disabled={saving}>{saving ? "Submitting…" : "Submit application"}</button>
      </form>
    </AuthFrame>
  );
}
