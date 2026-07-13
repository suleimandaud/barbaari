import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { authApi, getApiError, organizationApi } from "@barbaari/shared";
import { useAsyncData } from "../hooks/useAsyncData";
import { ErrorState, LoadingState, Badge } from "../components/Status";
import { PageHeader, Panel } from "../components/Page";
import { ErrorAlert, SuccessAlert } from "../components/Alerts";

type OrgForm = {
  name: string;
  legal_name: string;
  phone: string;
  email: string;
  website: string;
  license_number: string;
  license_status: string;
};

type LocationForm = {
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  attendance_radius_meters: string;
};

const empty: OrgForm = { name: "", legal_name: "", phone: "", email: "", website: "", license_number: "", license_status: "not_provided" };
const emptyLocation: LocationForm = { address_line1: "", address_line2: "", city: "", state: "", postal_code: "", country: "US", attendance_radius_meters: "100" };

export function SettingsPage() {
  const { data: pageData, loading, error, reload } = useAsyncData(async () => {
    const [organization, me] = await Promise.all([organizationApi.get(), authApi.me()]);
    return { organization: organization.organization, user: me.user };
  }, []);
  const data = pageData?.organization;
  const currentUser = pageData?.user;
  const [form, setForm] = useState<OrgForm>(empty);
  const [locationForm, setLocationForm] = useState<LocationForm>(emptyLocation);
  const [validatedLocation, setValidatedLocation] = useState<any | null>(null);
  const [ownerPin, setOwnerPin] = useState("");
  const [ownerPinConfirm, setOwnerPinConfirm] = useState("");
  const [success, setSuccess] = useState("");
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);
  const [validatingLocation, setValidatingLocation] = useState(false);
  const [savingLocation, setSavingLocation] = useState(false);
  const [pinSaving, setPinSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    setForm({
      name: data.name ?? "",
      legal_name: data.legal_name ?? "",
      phone: data.phone ?? "",
      email: data.email ?? "",
      website: data.website ?? "",
      license_number: data.license_number ?? "",
      license_status: data.license_status ?? (data.license_number ? "pending" : "not_provided"),
    });
    setLocationForm({
      address_line1: data.address_line1 ?? "",
      address_line2: data.address_line2 ?? "",
      city: data.city ?? "",
      state: data.state ?? "",
      postal_code: data.postal_code ?? "",
      country: data.country ?? "US",
      attendance_radius_meters: String(data.attendance_radius_meters ?? data.checkin_radius_meters ?? 100),
    });
    setValidatedLocation(null);
  }, [data]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSuccess("");
    setActionError("");
    setSaving(true);
    try {
      await organizationApi.update(form);
      setSuccess("Organization profile updated.");
      await reload();
    } catch (err) {
      setActionError(getApiError(err).message);
    } finally {
      setSaving(false);
    }
  }

  function setLocationField(field: keyof LocationForm, value: string) {
    setLocationForm((current) => ({ ...current, [field]: field === "state" || field === "country" ? value.toUpperCase() : value }));
    setValidatedLocation(null);
  }

  function locationPayload() {
    return {
      address_line1: locationForm.address_line1,
      address_line2: locationForm.address_line2 || null,
      city: locationForm.city,
      state: locationForm.state,
      postal_code: locationForm.postal_code,
      country: locationForm.country || "US",
      radius: Number(locationForm.attendance_radius_meters || 100),
    };
  }

  async function validateLocationAddress() {
    setSuccess("");
    setActionError("");
    setValidatingLocation(true);
    try {
      const response = await organizationApi.validateAttendanceLocation(locationPayload());
      setValidatedLocation(response);
      setLocationForm((current) => ({
        ...current,
        address_line1: response.address_line1 ?? current.address_line1,
        address_line2: response.address_line2 ?? "",
        city: response.city ?? current.city,
        state: response.state ?? current.state,
        postal_code: response.postal_code ?? current.postal_code,
        country: response.country ?? "US",
      }));
      setSuccess(response.message ?? "Address validated. This location will be used for tablet attendance geofence.");
    } catch (err) {
      setValidatedLocation(null);
      setActionError(getApiError(err).message || "We could not validate this address. Please check the street, city, state, and ZIP code.");
    } finally {
      setValidatingLocation(false);
    }
  }

  async function saveAttendanceLocation() {
    setSuccess("");
    setActionError("");
    if (!validatedLocation) {
      setActionError("Please validate the address before saving attendance location.");
      return;
    }
    setSavingLocation(true);
    try {
      const response = await organizationApi.updateAttendanceLocation(locationPayload());
      setSuccess(response.message ?? "Attendance location updated.");
      await reload();
    } catch (err) {
      setActionError(getApiError(err).message);
    } finally {
      setSavingLocation(false);
    }
  }

  async function submitOwnerPin(event: FormEvent) {
    event.preventDefault();
    setSuccess("");
    setActionError("");
    if (!/^\d{4,8}$/.test(ownerPin)) {
      setActionError("Owner tablet PIN must be 4-8 digits.");
      return;
    }
    if (ownerPin !== ownerPinConfirm) {
      setActionError("PIN confirmation does not match.");
      return;
    }
    setPinSaving(true);
    try {
      await organizationApi.updateOwnerTabletPin(ownerPin);
      setOwnerPin("");
      setOwnerPinConfirm("");
      setSuccess("Owner tablet PIN updated. The owner/admin signer is ready for tablet verification.");
      await reload();
    } catch (err) {
      setActionError(getApiError(err).message);
    } finally {
      setPinSaving(false);
    }
  }

  const canManageAttendanceLocation = ["daycare_admin", "manager"].includes(currentUser?.role ?? "");
  const hasCurrentAddress = Boolean(data?.standardized_address || data?.address_line1);
  const hasLegacyCoordinates = !hasCurrentAddress && data?.latitude != null && data?.longitude != null;
  const detectedTimezone = validatedLocation?.timezone ?? data?.timezone ?? data?.attendance_timezone ?? null;

  return (
    <section className="page">
      <PageHeader eyebrow="Organization" title="Organization profile" description="Manage provider business details, licensing information, and attendance location." />
      <SuccessAlert message={success} />
      <ErrorAlert message={actionError} />
      {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={reload} /> : data ? (
        <div className="settings-stack">
          <form onSubmit={submit} className="settings-stack">
            <Panel title="Business Information">
              <div className="form-grid labeled-grid">
                <Field label="Daycare name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} required />
                <Field label="Legal/business name" value={form.legal_name} onChange={(value) => setForm({ ...form, legal_name: value })} />
                <Field label="Phone" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} />
                <Field label="Email" type="email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} />
                <Field label="Website" value={form.website} onChange={(value) => setForm({ ...form, website: value })} />
                <Field label="License number" value={form.license_number} onChange={(value) => setForm({ ...form, license_number: value })} />
                <label className="field-stack"><span>License status</span><select value={form.license_status} onChange={(event) => setForm({ ...form, license_status: event.target.value })}><option value="not_provided">Not provided</option><option value="pending">Pending</option><option value="verified">Verified</option><option value="rejected">Rejected</option><option value="expired">Expired</option></select></label>
              </div>
            </Panel>
            <Panel title="Status / Settings">
              <div className="form-grid labeled-grid">
                <ReadOnly label="Facility type" value={String(data.facility_type ?? "center_daycare").replace(/_/g, " ")} />
                <ReadOnly label="Organization status" value={<Badge tone={data.status === "active" ? "success" : "warning"}>{data.status ?? "active"}</Badge>} />
                <ReadOnly label="Subscription plan" value={data.subscription?.pricing_plan?.name ?? data.plan ?? "Starter"} />
                <ReadOnly label="Subscription status" value={<Badge tone={data.subscription?.status === "active" ? "success" : "warning"}>{data.subscription?.status ?? "active"}</Badge>} />
              </div>
            </Panel>
            <Panel title="Attendance Location">
              {hasCurrentAddress ? <p className="muted">Current saved address: {data.standardized_address || [data.address_line1, data.address_line2, data.city, data.state, data.postal_code].filter(Boolean).join(", ")}</p> : null}
              {hasLegacyCoordinates ? <p className="muted">Current coordinates are saved. Update by entering a physical address below.</p> : null}
              {!canManageAttendanceLocation ? (
                <p className="muted">Only provider admins and managers can update attendance location.</p>
              ) : (
                <div className="form-grid labeled-grid">
                  <Field label="Street address" value={locationForm.address_line1} onChange={(value) => setLocationField("address_line1", value)} required />
                  <Field label="Unit / Apartment / Suite" value={locationForm.address_line2} onChange={(value) => setLocationField("address_line2", value)} />
                  <Field label="City" value={locationForm.city} onChange={(value) => setLocationField("city", value)} required />
                  <Field label="State" value={locationForm.state} onChange={(value) => setLocationField("state", value)} required />
                  <Field label="ZIP Code" value={locationForm.postal_code} onChange={(value) => setLocationField("postal_code", value)} required />
                  <Field label="Country" value={locationForm.country} onChange={(value) => setLocationField("country", value)} required />
                  <Field label="Allowed attendance radius (meters)" type="number" value={locationForm.attendance_radius_meters} onChange={(value) => setLocationField("attendance_radius_meters", value)} required />
                  <div className="full actions">
                    <button className="secondary" type="button" disabled={validatingLocation} onClick={validateLocationAddress}>{validatingLocation ? "Validating..." : "Validate Address"}</button>
                    <button className="primary" type="button" disabled={savingLocation || !validatedLocation} onClick={saveAttendanceLocation}>{savingLocation ? "Saving..." : "Save Attendance Location"}</button>
                  </div>
                  {validatedLocation ? (
                    <div className="field-stack readonly-field full">
                      <span>Standardized address</span>
                      <strong>{validatedLocation.standardized_address}</strong>
                      <small>Coordinates saved after validation.</small>
                    </div>
                  ) : null}
                  {detectedTimezone ? (
                    <div className="field-stack readonly-field full">
                      <span>Timezone</span>
                      <strong>{detectedTimezone}</strong>
                      <small>✓ Automatically detected from attendance address</small>
                    </div>
                  ) : null}
                  <p className="muted full">Attendance check-in and check-out require device location and are blocked outside this radius. This address will be used for tablet attendance geofence.</p>
                </div>
              )}
            </Panel>
            <button className="primary settings-submit" disabled={saving}>{saving ? "Saving..." : "Update organization"}</button>
          </form>
          {data.facility_type === "family_child_care" ? (
            <Panel title="Owner Tablet PIN">
              <form className="form-grid labeled-grid" onSubmit={submitOwnerPin}>
                <ReadOnly label="Current PIN status" value={<Badge tone={currentUser?.tablet_pin_configured ? "success" : "warning"}>{currentUser?.tablet_pin_configured ? "PIN configured" : "PIN missing"}</Badge>} />
                <Field label="New owner tablet PIN" type="password" value={ownerPin} onChange={setOwnerPin} required />
                <Field label="Confirm owner tablet PIN" type="password" value={ownerPinConfirm} onChange={setOwnerPinConfirm} required />
                <p className="muted full">This PIN is used only when the owner/admin is selected as an attendance signer in Family Child Care tablet mode. It does not change your login password.</p>
                <button className="primary" disabled={pinSaving}>{pinSaving ? "Saving PIN..." : "Save owner tablet PIN"}</button>
              </form>
            </Panel>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function Field({ label, value, onChange, type = "text", required = false }: { label: string; value: string; type?: string; required?: boolean; onChange: (value: string) => void }) {
  return <label className="field-stack"><span>{label}</span><input type={type} value={value} required={required} onChange={(event) => onChange(event.target.value)} /></label>;
}

function ReadOnly({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="field-stack readonly-field"><span>{label}</span><strong>{value}</strong></div>;
}
