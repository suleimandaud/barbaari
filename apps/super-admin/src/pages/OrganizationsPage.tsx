import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { superAdminApi } from "@barbaari/shared";
import { Alert, Badge, DataTable, ErrorState, Header, LoadingState, Modal, Panel } from "../components/Ui";
import { useAsyncData } from "../hooks/useAsyncData";
import { errorMessage, money, titleize } from "../utils/format";

type ConfirmAction = {
  organization: any;
  status: "active" | "pending" | "suspended";
  label: string;
};

type TzOption = { value: string; label: string } | "---";

const TIMEZONES: TzOption[] = [
  { value: "America/New_York",   label: "Eastern Time (ET)" },
  { value: "America/Chicago",    label: "Central Time (CT)" },
  { value: "America/Denver",     label: "Mountain Time (MT)" },
  { value: "America/Phoenix",    label: "Mountain Time – Arizona (no DST)" },
  { value: "America/Los_Angeles",label: "Pacific Time (PT)" },
  { value: "America/Anchorage",  label: "Alaska Time (AKT)" },
  { value: "Pacific/Honolulu",   label: "Hawaii Time (HT)" },
  "---",
  { value: "Europe/London",      label: "London (GMT)" },
  { value: "Europe/Paris",       label: "Central European Time" },
  { value: "Africa/Mogadishu",   label: "East Africa Time" },
  { value: "Africa/Nairobi",     label: "East Africa Time (Nairobi)" },
  { value: "Asia/Dubai",         label: "Dubai (GST)" },
  { value: "Australia/Sydney",   label: "Sydney (AEST)" },
  { value: "UTC",                label: "UTC" },
];

const emptyForm = {
  name: "",
  facility_type: "center_daycare",
  legal_name: "",
  phone: "",
  email: "",
  website: "",
  address: "",
  city: "",
  state: "",
  country: "Kenya",
  timezone: "America/New_York",
  license_number: "",
  license_status: "not_provided",
  pricing_plan_id: "",
  billing_cycle: "monthly",
  trial_days: "",
  primary_admin: { name: "", email: "", phone: "" },
  extra_users: [] as Array<{ name: string; email: string; phone: string; role: string }>
};

const steps = ["Organization Details", "Plan", "Admin Users", "Review"];
const userRoles = ["daycare_admin", "manager", "billing_manager", "teacher", "staff"];

export function OrganizationsPage() {
  const navigate = useNavigate();
  const { data, loading, error, reload } = useAsyncData(async () => {
    const [organizations, plans] = await Promise.all([superAdminApi.organizations(), superAdminApi.pricingPlans()]);
    return { organizations: organizations.organizations, plans: plans.pricing_plans };
  }, []);
  const [form, setForm] = useState<any>(emptyForm);
  const [creating, setCreating] = useState(false);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);
  const [success, setSuccess] = useState("");
  const [actionError, setActionError] = useState("");
  const [createdResult, setCreatedResult] = useState<any | null>(null);

  async function createOrganization() {
    setSuccess("");
    setActionError("");
    setSaving(true);
    try {
      const payload = {
        ...form,
        trial_days: form.trial_days === "" ? undefined : Number(form.trial_days),
        extra_users: form.extra_users.filter((user: any) => user.name && user.email),
      };
      const response = await superAdminApi.createOrganization(payload);
      setForm(emptyForm);
      setStep(0);
      setCreatedResult(response);
      setSuccess(`Organization created. ${response.invitations?.length ?? 0} invite link(s) generated.`);
      await reload();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function updateSelectedOrganization() {
    if (!confirm) return;
    setSuccess("");
    setActionError("");
    setSaving(true);
    try {
      await superAdminApi.updateOrganizationStatus(confirm.organization.id, confirm.status);
      setSuccess(`${confirm.organization.name} set to ${titleize(confirm.status)}.`);
      setConfirm(null);
      await reload();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function ask(organization: any, status: ConfirmAction["status"], label: string) {
    setConfirm({ organization, status, label });
  }

  function selectedPlan() {
    return (data?.plans ?? []).find((plan: any) => String(plan.id) === String(form.pricing_plan_id));
  }

  function addUser() {
    setForm({ ...form, extra_users: [...form.extra_users, { name: "", email: "", phone: "", role: "manager" }] });
  }

  function updateExtraUser(index: number, patch: Record<string, string>) {
    setForm({ ...form, extra_users: form.extra_users.map((user: any, itemIndex: number) => itemIndex === index ? { ...user, ...patch } : user) });
  }

  return (
    <section className="page">
      <Header eyebrow="Tenant control" title="Organizations" action={<button className="primary" onClick={() => { setForm({ ...emptyForm, pricing_plan_id: data?.plans?.[0]?.id ?? "" }); setCreatedResult(null); setCreating(true); }}>Onboard Organization</button>} />
      <Alert message={success} />
      <Alert message={actionError} tone="danger" />

      {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={reload} /> : (
        <DataTable rows={data?.organizations ?? []} columns={[
          { header: "Organization", render: (row: any) => <><strong>{row.name}</strong><br /><small>{row.city ?? "No city"}{row.state ? `, ${row.state}` : ""}</small><br /><Badge>{titleize(row.facility_type ?? "center_daycare")}</Badge></> },
          { header: "Status", render: (row: any) => <Badge tone={row.status}>{titleize(row.status)}</Badge> },
          { header: "License", render: (row: any) => <><span>{row.licenseNumber ?? row.license_number ?? "Optional"}</span><br /><Badge tone={row.license_status === "verified" ? "success" : row.license_status === "rejected" ? "danger" : "warning"}>{titleize(row.license_status ?? "not_provided")}</Badge></> },
          { header: "Admin / Users", render: (row: any) => <><strong>{row.primary_admin_email ?? "No admin"}</strong><br /><small>{row.users_count ?? row.staff ?? 0} login users</small></> },
          { header: "Platform billing", render: (row: any) => <><strong>{row.current_plan ?? row.plan ?? "No plan"}</strong><br /><Badge tone={row.subscription_status === "active" ? "success" : row.subscription_status === "suspended" ? "danger" : "warning"}>{titleize(row.subscription_status ?? "No subscription")}</Badge>{row.overdue ? <Badge tone="danger">Overdue</Badge> : null}</> },
          { header: "Balance / MRR", render: (row: any) => <><strong>{money(row.balance_due)}</strong><br /><small>{money(row.mrr)} MRR</small></> },
          { header: "Next invoice", render: (row: any) => row.next_invoice_at ? new Date(row.next_invoice_at).toLocaleDateString() : "n/a" },
          { header: "Actions", render: (row: any) => (
            <div className="row-actions">
              <button className="secondary" onClick={() => navigate(`/organizations/${row.id}`)}>View</button>
              <button className="secondary" onClick={() => ask(row, "active", "approve")}>Approve</button>
              <button className="secondary" disabled={row.status === "suspended"} onClick={() => ask(row, "suspended", "suspend")}>Suspend</button>
              <button className="secondary" disabled={row.status === "active"} onClick={() => ask(row, "active", "reactivate")}>Reactivate</button>
            </div>
          ) }
        ]} />
      )}

      {confirm ? (
        <Modal title={`${titleize(confirm.label)} organization`} onClose={() => setConfirm(null)}>
          <p className="muted">Are you sure you want to {confirm.label} {confirm.organization.name}?</p>
          <div className="actions">
            <button className="primary" disabled={saving} onClick={updateSelectedOrganization}>{saving ? "Saving..." : titleize(confirm.label)}</button>
            <button className="secondary" onClick={() => setConfirm(null)}>Cancel</button>
          </div>
        </Modal>
      ) : null}
      {creating ? (
        <Modal title="Onboard daycare organization" onClose={() => setCreating(false)}>
          {createdResult ? <div className="settings-stack">
            <Panel title="Organization created">
              <p><strong>{createdResult.organization?.name}</strong> is pending setup with {createdResult.subscription?.pricing_plan?.name ?? "selected"} plan.</p>
              <Badge tone="warning">{titleize(createdResult.subscription?.status ?? "pending_activation")}</Badge>
              <p className="muted">{createdResult.demo_invite_note}</p>
            </Panel>
            <Panel title="Demo invite links">
              {(createdResult.invitations ?? []).map((invite: any) => <div className="log" key={invite.id}>
                <strong>{invite.name} - {invite.email}</strong>
                <span>Demo invite link — send this to the daycare user</span>
                <span>{titleize(invite.role)} / expires {invite.expires_at ? new Date(invite.expires_at).toLocaleString() : "n/a"}</span>
                <div className="invite-link-row">
                  <input readOnly value={invite.invite_url} onFocus={(event) => event.currentTarget.select()} />
                  <button className="secondary" onClick={() => navigator.clipboard?.writeText(invite.invite_url)}>Copy invite link</button>
                </div>
                <a className="truncate" href={invite.invite_url} target="_blank" rel="noopener noreferrer">{invite.invite_url}</a>
              </div>)}
            </Panel>
            <button className="primary" onClick={() => setCreating(false)}>Done</button>
          </div> : <>
          <div className="record-tabs stepper-tabs">{steps.map((label, index) => <button key={label} className={step === index ? "active" : ""} onClick={() => setStep(index)}><span>{index + 1}.</span> {label}</button>)}</div>
          {step === 0 ? <div className="form-grid two">
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Daycare name" required />
            <select value={form.facility_type} onChange={(event) => setForm({ ...form, facility_type: event.target.value, pricing_plan_id: "" })}><option value="center_daycare">Center Daycare</option><option value="family_child_care">Family Child Care</option></select>
            <input value={form.legal_name} onChange={(event) => setForm({ ...form, legal_name: event.target.value })} placeholder="Legal/business name optional" />
            <input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="Phone" />
            <input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="Organization email" />
            <input value={form.website} onChange={(event) => setForm({ ...form, website: event.target.value })} placeholder="Website optional" />
            <input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} placeholder="Address" />
            <input value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} placeholder="City" />
            <input value={form.state} onChange={(event) => setForm({ ...form, state: event.target.value })} placeholder="State/region" />
            <input value={form.country} onChange={(event) => setForm({ ...form, country: event.target.value })} placeholder="Country" />
            <select value={form.timezone} onChange={(event) => setForm({ ...form, timezone: event.target.value })}>
              {TIMEZONES.map((tz, i) =>
                tz === "---"
                  ? <option key={`sep-${i}`} disabled>──────────────</option>
                  : <option key={tz.value} value={tz.value}>{tz.label} — {tz.value}</option>
              )}
            </select>
            <input value={form.license_number} onChange={(event) => setForm({ ...form, license_number: event.target.value })} placeholder="License Number (optional)" />
            <select value={form.license_status} onChange={(event) => setForm({ ...form, license_status: event.target.value })}><option value="not_provided">Not provided</option><option value="pending">Pending</option><option value="verified">Verified</option><option value="rejected">Rejected</option><option value="expired">Expired</option></select>
          </div> : null}
          {step === 1 ? <div className="form-grid two">
            <select value={form.pricing_plan_id} onChange={(event) => setForm({ ...form, pricing_plan_id: event.target.value })}>
              <option value="">Choose pricing plan</option>
              {(data?.plans ?? []).filter((plan: any) => form.facility_type === "family_child_care" ? plan.available_for_family_child_care : plan.available_for_center_daycare).map((plan: any) => <option key={plan.id} value={plan.id}>{plan.name} - ${Number(plan.monthly_price).toFixed(0)}/month</option>)}
            </select>
            <select value={form.billing_cycle} onChange={(event) => setForm({ ...form, billing_cycle: event.target.value })}><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select>
            <input type="number" value={form.trial_days} onChange={(event) => setForm({ ...form, trial_days: event.target.value })} placeholder="Trial days optional" />
            <p className="muted full">Subscription will be created as pending activation. An invoice is generated automatically. It becomes active only after payment.</p>
          </div> : null}
          {step === 2 ? <div className="settings-stack">
            <Panel title="Primary admin user">
              <div className="form-grid two">
                <input value={form.primary_admin.name} onChange={(event) => setForm({ ...form, primary_admin: { ...form.primary_admin, name: event.target.value } })} placeholder="Full name" required />
                <input type="email" value={form.primary_admin.email} onChange={(event) => setForm({ ...form, primary_admin: { ...form.primary_admin, email: event.target.value } })} placeholder="Admin email" required />
                <input value={form.primary_admin.phone} onChange={(event) => setForm({ ...form, primary_admin: { ...form.primary_admin, phone: event.target.value } })} placeholder="Phone optional" />
              </div>
              <p className="muted">Invite link will be generated after creation. The admin will create their own password from the invite.</p>
            </Panel>
            <Panel title="Extra users" action={<button className="secondary" onClick={addUser}>Add extra user</button>}>
              {form.extra_users.map((user: any, index: number) => <div className="form-grid two" key={index}>
                <input value={user.name} onChange={(event) => updateExtraUser(index, { name: event.target.value })} placeholder="Name" />
                <input type="email" value={user.email} onChange={(event) => updateExtraUser(index, { email: event.target.value })} placeholder="Email" />
                <select value={user.role} onChange={(event) => updateExtraUser(index, { role: event.target.value })}>{userRoles.map((role) => <option key={role} value={role}>{titleize(role)}</option>)}</select>
              </div>)}
              {!form.extra_users.length ? <p className="muted">No extra users added.</p> : null}
            </Panel>
          </div> : null}
          {step === 3 ? <div className="settings-stack">
            <Panel title="Review">
              <p><strong>{form.name || "Unnamed daycare"}</strong> in {form.city || "No city"} / {form.country || "No country"}</p>
              <p>Facility type: {titleize(form.facility_type)}</p>
              <p>License: {form.license_number || "Not provided"} ({titleize(form.license_status)})</p>
              <p>Plan: {selectedPlan()?.name ?? "No plan selected"} / {titleize(form.billing_cycle)}</p>
              <p>Primary admin invite: {form.primary_admin.name} - {form.primary_admin.email}</p>
              <p>Extra users: {form.extra_users.filter((user: any) => user.name && user.email).length}</p>
              <p>Starting status: pending activation — invoice auto-generated</p>
            </Panel>
          </div> : null}
          <div className="actions">
            <button className="secondary" disabled={step === 0} onClick={() => setStep(Math.max(0, step - 1))}>Back</button>
            {step < steps.length - 1 ? <button className="primary" onClick={() => setStep(Math.min(steps.length - 1, step + 1))}>Continue</button> : <button className="primary" disabled={saving || !form.name || !form.pricing_plan_id || !form.primary_admin.email} onClick={createOrganization}>{saving ? "Creating..." : "Create organization"}</button>}
          </div>
          </>}
        </Modal>
      ) : null}
    </section>
  );
}
