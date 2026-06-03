import { useState } from "react";
import { useParams } from "react-router-dom";
import { superAdminApi, API_BASE_URL } from "@barbaari/shared";
import { Header, LoadingState, ErrorState, Panel, Badge } from "../components/Ui";
import { useAsyncData } from "../hooks/useAsyncData";

type Role = "daycare_admin" | "manager" | "billing_manager" | "teacher" | "staff";
const ROLES: { value: Role; label: string }[] = [
  { value: "daycare_admin", label: "Daycare Admin" },
  { value: "manager", label: "Manager" },
  { value: "billing_manager", label: "Billing Manager" },
  { value: "teacher", label: "Teacher" },
  { value: "staff", label: "Staff" },
];

function titleize(s?: string | null) {
  return String(s ?? "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function money(v: unknown, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(v ?? 0));
}

function dateShort(v?: string | null) {
  if (!v) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(v));
}

function statusTone(s?: string) {
  if (!s) return "default";
  if (s === "active" || s === "accepted") return "success";
  if (s === "pending" || s === "pending_payment") return "warning";
  if (s === "inactive" || s === "cancelled" || s === "expired") return "danger";
  return "default";
}

export function OrganizationDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [inviteForm, setInviteForm] = useState({ name: "", email: "", role: "daycare_admin" as Role, open: false });
  const [saving, setSaving] = useState(false);
  const [locationForm, setLocationForm] = useState({ lat: "", lng: "", radius: "300", open: false });

  const { data: org, loading: orgLoading, error: orgError } = useAsyncData(
    async () => (await superAdminApi.organizations()).organizations.find((o: any) => String(o.id) === String(id)),
    [id]
  );

  const { data: users, loading: usersLoading, reload: reloadUsers } = useAsyncData(
    async () => id ? (await superAdminApi.organizationUsers(id)).users : [],
    [id]
  );

  const { data: invitations, loading: invLoading, reload: reloadInvitations } = useAsyncData(
    async () => id ? (await superAdminApi.organizationInvitations(id)).invitations : [],
    [id]
  );

  const { data: locationAlerts, loading: alertsLoading, reload: reloadAlerts } = useAsyncData(
    async () => id ? (await superAdminApi.organizationLocationAlerts(id)).location_alerts : [],
    [id]
  );

  const { data: invoices, loading: invoicesLoading, reload: reloadInvoices } = useAsyncData(
    async () => id ? (await superAdminApi.orgBillingInvoices(id)).invoices : [],
    [id]
  );

  const [generatingInvoice, setGeneratingInvoice] = useState(false);

  async function handleGenerateInvoice() {
    if (!id) return;
    clearMessages(); setGeneratingInvoice(true);
    try {
      const res = await superAdminApi.generateOrgInvoice(id);
      setActionMessage(res.message ?? "Invoice generated.");
      reloadInvoices();
    } catch (e: any) { setActionError(e?.response?.data?.message ?? "Failed to generate invoice."); }
    finally { setGeneratingInvoice(false); }
  }

  function clearMessages() { setActionMessage(""); setActionError(""); }

  async function handleDisable(userId: string) {
    if (!id) return;
    clearMessages(); setSaving(true);
    try {
      await superAdminApi.disableOrganizationUser(id, userId);
      setActionMessage("User disabled.");
      reloadUsers();
    } catch (e: any) { setActionError(e?.response?.data?.message ?? "Failed."); } finally { setSaving(false); }
  }

  async function handleEnable(userId: string) {
    if (!id) return;
    clearMessages(); setSaving(true);
    try {
      await superAdminApi.enableOrganizationUser(id, userId);
      setActionMessage("User enabled.");
      reloadUsers();
    } catch (e: any) { setActionError(e?.response?.data?.message ?? "Failed."); } finally { setSaving(false); }
  }

  async function handleResend(invId: string) {
    if (!id) return;
    clearMessages(); setSaving(true);
    try {
      const res = await superAdminApi.resendOrganizationInvitation(id, invId);
      setActionMessage(res.message ?? "Invitation resent.");
      reloadInvitations();
    } catch (e: any) { setActionError(e?.response?.data?.message ?? "Failed."); } finally { setSaving(false); }
  }

  async function handleCancel(invId: string) {
    if (!id) return;
    clearMessages(); setSaving(true);
    try {
      const res = await superAdminApi.cancelOrganizationInvitation(id, invId);
      setActionMessage(res.message ?? "Invitation cancelled.");
      reloadInvitations();
    } catch (e: any) { setActionError(e?.response?.data?.message ?? "Failed."); } finally { setSaving(false); }
  }

  async function handleSaveLocation(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    clearMessages(); setSaving(true);
    try {
      await superAdminApi.updateOrganizationLocation(id, {
        latitude: locationForm.lat ? parseFloat(locationForm.lat) : undefined,
        longitude: locationForm.lng ? parseFloat(locationForm.lng) : undefined,
        checkin_radius_meters: locationForm.radius ? parseInt(locationForm.radius) : undefined,
      });
      setActionMessage("Location settings saved.");
      setLocationForm((f) => ({ ...f, open: false }));
      reloadAlerts();
    } catch (e: any) { setActionError(e?.response?.data?.message ?? "Failed."); } finally { setSaving(false); }
  }

  async function handleCreateInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    clearMessages(); setSaving(true);
    try {
      const res = await superAdminApi.createOrganizationInvite(id, { name: inviteForm.name, email: inviteForm.email, role: inviteForm.role });
      setActionMessage(res.message ?? "Invitation created.");
      setInviteForm({ name: "", email: "", role: "daycare_admin", open: false });
      reloadInvitations();
    } catch (e: any) { setActionError(e?.response?.data?.message ?? "Failed."); } finally { setSaving(false); }
  }

  if (orgLoading) return <section className="page"><LoadingState /></section>;
  if (orgError) return <section className="page"><ErrorState message={orgError} /></section>;

  return (
    <section className="page">
      <Header eyebrow="Organization details" title={org?.name ?? "Organization"} />

      {actionMessage && <div className="alert success">{actionMessage}</div>}
      {actionError && <div className="alert danger">{actionError}</div>}

      {org && (
        <Panel title="Profile" action={<Badge tone={statusTone(org.status)}>{titleize(org.status)}</Badge>}>
          <div className="grid three">
            <article className="ops"><span>City</span><strong>{org.city ?? "—"}</strong></article>
            <article className="ops"><span>Children</span><strong>{org.children ?? 0}</strong></article>
            <article className="ops"><span>MRR</span><strong>${Number(org.mrr ?? 0).toFixed(2)}</strong></article>
            <article className="ops"><span>Plan</span><strong>{org.plan ?? "—"}</strong></article>
            <article className="ops"><span>Email</span><strong>{org.email ?? "—"}</strong></article>
            <article className="ops"><span>Phone</span><strong>{org.phone ?? "—"}</strong></article>
          </div>
        </Panel>
      )}

      <Panel
        title="Billing"
        action={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {org?.subscription_status && (
              <Badge tone={
                org.subscription_status === "active" ? "success"
                : org.subscription_status === "pending_payment" ? "warning"
                : org.subscription_status === "suspended" ? "danger"
                : "default"
              }>
                {titleize(org.subscription_status)}
              </Badge>
            )}
            <button
              className="secondary"
              disabled={generatingInvoice}
              onClick={handleGenerateInvoice}
            >
              {generatingInvoice ? "Generating…" : "Generate Invoice"}
            </button>
          </div>
        }
      >
        <div className="grid three" style={{ marginBottom: 16 }}>
          <article className="ops">
            <span>Plan</span>
            <strong>{org?.current_plan ?? "—"}</strong>
          </article>
          <article className="ops">
            <span>Balance due</span>
            <strong style={{ color: (org?.balance_due ?? 0) > 0 ? "#b45309" : undefined }}>
              {money(org?.balance_due ?? 0)}
            </strong>
          </article>
          <article className="ops">
            <span>Subscription</span>
            <strong>{titleize(org?.subscription_status ?? "none")}</strong>
          </article>
        </div>

        {invoicesLoading ? <LoadingState /> : (
          (invoices ?? []).length === 0 ? (
            <div style={{ padding: "16px 0", color: "#64748b", fontSize: 14 }}>
              No invoice generated yet.{" "}
              <button
                style={{ background: "none", border: "none", color: "#2a7b88", fontWeight: 800, cursor: "pointer", fontSize: 14 }}
                disabled={generatingInvoice}
                onClick={handleGenerateInvoice}
              >
                Generate one now →
              </button>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Invoice #</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Due date</th>
                    <th>Created</th>
                    <th>PDF</th>
                  </tr>
                </thead>
                <tbody>
                  {(invoices ?? []).map((inv: any) => (
                    <tr key={inv.id}>
                      <td><strong>{inv.invoice_number}</strong></td>
                      <td>{money(inv.total_amount, inv.currency)}</td>
                      <td>
                        <Badge tone={
                          inv.status === "paid" ? "success"
                          : inv.status === "overdue" ? "danger"
                          : inv.status === "open" ? "warning"
                          : "default"
                        }>
                          {inv.status === "open" ? "Pending Payment" : titleize(inv.status)}
                        </Badge>
                      </td>
                      <td style={{ color: inv.status === "overdue" ? "#b23a3a" : undefined }}>
                        {dateShort(inv.due_date)}
                      </td>
                      <td>{dateShort(inv.created_at)}</td>
                      <td>
                        <a
                          href={`${API_BASE_URL}/platform/invoices/${inv.id}/pdf`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: "#2a7b88", fontWeight: 800, fontSize: 13 }}
                        >
                          Download
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </Panel>

      <Panel
        title="Users"
        action={
          <button className="secondary" onClick={() => setInviteForm((f) => ({ ...f, open: !f.open }))}>
            {inviteForm.open ? "Cancel" : "+ Invite User"}
          </button>
        }
      >
        {inviteForm.open && (
          <form onSubmit={handleCreateInvite} className="settings-stack" style={{ marginBottom: 16 }}>
            <div className="grid two">
              <input placeholder="Full name" value={inviteForm.name} onChange={(e) => setInviteForm((f) => ({ ...f, name: e.target.value }))} required />
              <input type="email" placeholder="Email" value={inviteForm.email} onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))} required />
            </div>
            <select value={inviteForm.role} onChange={(e) => setInviteForm((f) => ({ ...f, role: e.target.value as Role }))}>
              {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <div className="actions">
              <button className="primary" type="submit" disabled={saving}>{saving ? "Sending..." : "Send Invitation"}</button>
            </div>
          </form>
        )}

        {usersLoading ? <LoadingState /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {(users ?? []).length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign: "center", color: "#64748b" }}>No users yet</td></tr>
                ) : (users ?? []).map((user: any) => (
                  <tr key={user.id}>
                    <td>{user.name}</td>
                    <td>{user.email}</td>
                    <td><Badge>{titleize(user.role)}</Badge></td>
                    <td><Badge tone={statusTone(user.status)}>{titleize(user.status)}</Badge></td>
                    <td>
                      {user.status === "active"
                        ? <button className="secondary" disabled={saving} onClick={() => handleDisable(user.id)}>Disable</button>
                        : <button className="secondary" disabled={saving} onClick={() => handleEnable(user.id)}>Enable</button>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Invitations">
        {invLoading ? <LoadingState /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Invite URL</th><th>Actions</th></tr></thead>
              <tbody>
                {(invitations ?? []).length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign: "center", color: "#64748b" }}>No invitations</td></tr>
                ) : (invitations ?? []).map((inv: any) => (
                  <tr key={inv.id ?? inv.token}>
                    <td>{inv.name}</td>
                    <td>{inv.email}</td>
                    <td><Badge>{titleize(inv.role)}</Badge></td>
                    <td><Badge tone={statusTone(inv.status)}>{titleize(inv.status)}</Badge></td>
                    <td>
                      {inv.invite_url
                        ? <a href={inv.invite_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "#2563eb" }}>Open link</a>
                        : "—"
                      }
                    </td>
                    <td>
                      {inv.status === "pending" && (
                        <div style={{ display: "flex", gap: 8 }}>
                          <button className="secondary" disabled={saving} onClick={() => handleResend(inv.id ?? inv.token)}>Resend</button>
                          <button className="secondary" disabled={saving} onClick={() => handleCancel(inv.id ?? inv.token)}>Cancel</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel
        title="Check-in Location Safety"
        action={
          <button className="secondary" onClick={() => setLocationForm((f) => ({ ...f, open: !f.open, lat: String(org?.latitude ?? ""), lng: String(org?.longitude ?? ""), radius: String(org?.checkin_radius_meters ?? 300) }))}>
            {locationForm.open ? "Cancel" : "Edit location"}
          </button>
        }
      >
        {!locationForm.open ? (
          <div className="grid three">
            <article className="ops"><span>Latitude</span><strong>{org?.latitude ?? "Not set"}</strong></article>
            <article className="ops"><span>Longitude</span><strong>{org?.longitude ?? "Not set"}</strong></article>
            <article className="ops"><span>Check-in radius</span><strong>{org?.checkin_radius_meters ?? 300}m</strong></article>
          </div>
        ) : (
          <form onSubmit={handleSaveLocation} className="settings-stack">
            <p className="muted" style={{ fontSize: 13 }}>Set the daycare GPS coordinates. Staff check-ins outside the radius will be flagged as location alerts.</p>
            <div className="grid two">
              <input type="number" step="0.0000001" placeholder="Latitude (e.g. -1.2921)" value={locationForm.lat} onChange={(e) => setLocationForm((f) => ({ ...f, lat: e.target.value }))} />
              <input type="number" step="0.0000001" placeholder="Longitude (e.g. 36.8219)" value={locationForm.lng} onChange={(e) => setLocationForm((f) => ({ ...f, lng: e.target.value }))} />
            </div>
            <input type="number" min="50" max="10000" placeholder="Radius in meters (default 300)" value={locationForm.radius} onChange={(e) => setLocationForm((f) => ({ ...f, radius: e.target.value }))} />
            <div className="actions">
              <button className="primary" type="submit" disabled={saving}>{saving ? "Saving..." : "Save location settings"}</button>
            </div>
          </form>
        )}
      </Panel>

      <Panel title={`Location Alerts (${(locationAlerts ?? []).length})`}>
        {alertsLoading ? <LoadingState /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Child</th><th>Classroom</th><th>Signed by</th><th>Distance</th><th>Date</th></tr></thead>
              <tbody>
                {(locationAlerts ?? []).length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign: "center", color: "#64748b" }}>No location alerts</td></tr>
                ) : (locationAlerts ?? []).map((alert: any, i: number) => (
                  <tr key={i}>
                    <td>{alert.childName}</td>
                    <td>{alert.classroom}</td>
                    <td>{alert.signedBy}</td>
                    <td><Badge tone="warning">{alert.distanceMeters}m</Badge></td>
                    <td>{alert.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </section>
  );
}
