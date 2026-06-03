import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { getApiError, organizationApi } from "@barbaari/shared";
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
  address: string;
  city: string;
  state: string;
  country: string;
  timezone: string;
  license_number: string;
  license_status: string;
  latitude: string;
  longitude: string;
  attendance_radius_meters: string;
};

const empty: OrgForm = { name: "", legal_name: "", phone: "", email: "", website: "", address: "", city: "", state: "", country: "", timezone: "Africa/Nairobi", license_number: "", license_status: "not_provided", latitude: "", longitude: "", attendance_radius_meters: "100" };

export function SettingsPage() {
  const { data, loading, error, reload } = useAsyncData(async () => (await organizationApi.get()).organization, []);
  const [form, setForm] = useState<OrgForm>(empty);
  const [success, setSuccess] = useState("");
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    setForm({
      name: data.name ?? "",
      legal_name: data.legal_name ?? "",
      phone: data.phone ?? "",
      email: data.email ?? "",
      website: data.website ?? "",
      address: data.address ?? "",
      city: data.city ?? "",
      state: data.state ?? "",
      country: data.country ?? "",
      timezone: data.timezone ?? data.attendance_timezone ?? "Africa/Nairobi",
      license_number: data.license_number ?? "",
      license_status: data.license_status ?? (data.license_number ? "pending" : "not_provided"),
      latitude: data.latitude == null ? "" : String(data.latitude),
      longitude: data.longitude == null ? "" : String(data.longitude),
      attendance_radius_meters: String(data.attendance_radius_meters ?? data.checkin_radius_meters ?? 100),
    });
  }, [data]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSuccess("");
    setActionError("");
    setSaving(true);
    try {
      await organizationApi.update({
        ...form,
        latitude: form.latitude === "" ? null : Number(form.latitude),
        longitude: form.longitude === "" ? null : Number(form.longitude),
        attendance_radius_meters: Number(form.attendance_radius_meters || 100),
      });
      setSuccess("Organization profile updated.");
      await reload();
    } catch (err) {
      setActionError(getApiError(err).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="page">
      <PageHeader eyebrow="Organization" title="Organization profile" description="Manage daycare business details and licensing information." />
      <SuccessAlert message={success} />
      <ErrorAlert message={actionError} />
      {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={reload} /> : data ? (
        <form onSubmit={submit} className="settings-stack">
          <Panel title="Business Information">
            <div className="form-grid labeled-grid">
              <Field label="Daycare name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} required />
              <Field label="Legal/business name" value={form.legal_name} onChange={(value) => setForm({ ...form, legal_name: value })} />
              <Field label="Phone" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} />
              <Field label="Email" type="email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} />
              <Field label="Website" value={form.website} onChange={(value) => setForm({ ...form, website: value })} />
              <Field label="Address" value={form.address} onChange={(value) => setForm({ ...form, address: value })} />
              <Field label="City" value={form.city} onChange={(value) => setForm({ ...form, city: value })} />
              <Field label="State" value={form.state} onChange={(value) => setForm({ ...form, state: value })} />
              <Field label="Country" value={form.country} onChange={(value) => setForm({ ...form, country: value })} />
              <Field label="License number" value={form.license_number} onChange={(value) => setForm({ ...form, license_number: value })} />
              <label className="field-stack"><span>License status</span><select value={form.license_status} onChange={(event) => setForm({ ...form, license_status: event.target.value })}><option value="not_provided">Not provided</option><option value="pending">Pending</option><option value="verified">Verified</option><option value="rejected">Rejected</option><option value="expired">Expired</option></select></label>
            </div>
          </Panel>
          <Panel title="Status / Settings">
            <div className="form-grid labeled-grid">
              <Field label="Timezone" value={form.timezone} onChange={(value) => setForm({ ...form, timezone: value })} />
              <ReadOnly label="Organization status" value={<Badge tone={data.status === "active" ? "success" : "warning"}>{data.status ?? "active"}</Badge>} />
              <ReadOnly label="Subscription plan" value={data.subscription?.pricing_plan?.name ?? data.plan ?? "Starter"} />
              <ReadOnly label="Subscription status" value={<Badge tone={data.subscription?.status === "active" ? "success" : "warning"}>{data.subscription?.status ?? "active"}</Badge>} />
            </div>
          </Panel>
          <Panel title="Attendance Location">
            <div className="form-grid labeled-grid">
              <Field label="Latitude" type="number" value={form.latitude} onChange={(value) => setForm({ ...form, latitude: value })} />
              <Field label="Longitude" type="number" value={form.longitude} onChange={(value) => setForm({ ...form, longitude: value })} />
              <Field label="Allowed attendance radius (meters)" type="number" value={form.attendance_radius_meters} onChange={(value) => setForm({ ...form, attendance_radius_meters: value })} />
              <p className="muted full">Attendance check-in and check-out require device location and are blocked outside this radius. Set the daycare center coordinates before using live attendance operations.</p>
            </div>
          </Panel>
          <button className="primary settings-submit" disabled={saving}>{saving ? "Saving..." : "Update organization"}</button>
        </form>
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
