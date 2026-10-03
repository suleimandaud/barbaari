import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, DownloadSimple, Money, Prohibit, UserPlus } from "@phosphor-icons/react";
import { superAdminApi, getApiError } from "@barbaari/shared";
import { Alert as KitAlert, Dialog, Field, StatusBadge, Tabs, roleLabel } from "@barbaari/shared/web/ui";
import { accountStatuses, invoiceStatuses, subscriptionStatuses } from "@barbaari/shared/web/status";
import { LoadingState, ErrorState, Badge } from "../components/Ui";
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

export function OrganizationDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [inviteForm, setInviteForm] = useState({ name: "", email: "", role: "daycare_admin" as Role, open: false });
  const [saving, setSaving] = useState(false);
  const [locationForm, setLocationForm] = useState({ lat: "", lng: "", radius: "300", open: false });

  const [tab, setTab] = useState<"overview" | "users" | "invoices">("overview");
  const [statusConfirm, setStatusConfirm] = useState<"suspended" | "active" | null>(null);
  const { data: org, loading: orgLoading, error: orgError, reload: reloadOrg } = useAsyncData(
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

  async function handleStatusChange() {
    if (!id || !statusConfirm) return;
    clearMessages(); setSaving(true);
    try {
      await superAdminApi.updateOrganizationStatus(id, statusConfirm);
      setActionMessage(statusConfirm === "suspended" ? "Organization suspended." : "Organization reactivated.");
      setStatusConfirm(null);
      await reloadOrg();
    } catch (e: any) { setActionError(e?.response?.data?.message ?? "Failed."); } finally { setSaving(false); }
  }

  // The PDF endpoint requires the bearer token, so fetch it through the API client.
  async function downloadInvoice(inv: any) {
    clearMessages();
    try {
      const response = await superAdminApi.downloadPlatformInvoicePdf(inv.id);
      const url = URL.createObjectURL(response.data as Blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${inv.invoice_number ?? `invoice-${inv.id}`}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) { setActionError(getApiError(err).message); }
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

  if (orgLoading) return <main className="bb-page"><LoadingState /></main>;
  if (orgError) return <main className="bb-page"><ErrorState message={orgError} /></main>;

  const invoiceRows = (invoices ?? []) as any[];
  const userRows = (users ?? []) as any[];
  const overdueCount = invoiceRows.filter((inv) => inv.status === "overdue").length;
  const partialCount = invoiceRows.filter((inv) => inv.status === "partial").length;
  const owner = userRows.find((user) => user.role === "daycare_admin");
  const subscriptionStatus = org?.subscription_status;

  return (
    <main className="bb-page">
      <Link className="bb-back" to="/organizations"><ArrowLeft size={16} />Organizations</Link>
      <header className="bb-page-header" style={{ marginBottom: 25 }}>
        <div>
          <h1>{org?.name ?? "Organization"}</h1>
          <div className="bb-row" style={{ gap: 12 }}>
            {org ? <StatusBadge size="sm" map={accountStatuses} value={org.status} /> : null}
            <span className="bb-caption" style={{ fontSize: 15 }}>{[org?.facility_type_label ?? titleize(org?.facility_type ?? "center_daycare"), [org?.city, org?.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}</span>
          </div>
        </div>
        {org ? (
          <div className="bb-row">
            {org.status === "suspended"
              ? <button className="bb-btn bb-btn-secondary bb-btn-lg" onClick={() => setStatusConfirm("active")}>Reactivate</button>
              : <button className="bb-btn bb-btn-secondary bb-btn-lg" onClick={() => setStatusConfirm("suspended")}><Prohibit />Suspend</button>}
            <Link className="bb-btn bb-btn-primary bb-btn-lg" to="/platform-invoices"><Money />Record payment</Link>
          </div>
        ) : null}
      </header>

      {actionMessage ? <KitAlert tone="ok">{actionMessage}</KitAlert> : null}
      {actionError ? <KitAlert tone="danger">{actionError}</KitAlert> : null}

      {org ? (
        <dl className="bb-facts" style={{ marginBottom: 30 }}>
          <div><dt>Owner</dt><dd><strong>{owner?.name ?? "—"}</strong><span className="bb-caption" style={{ display: "block" }}>{owner?.email ?? org.primary_admin_email ?? ""}</span></dd></div>
          <div><dt>Subscription</dt><dd><strong>{org.current_plan ?? org.plan ?? "—"}</strong><span className="bb-caption" style={{ display: "block" }}>{subscriptionStatus ? titleize(subscriptionStatus) : "No subscription"}{org.next_invoice_at ? ` · next invoice ${dateShort(org.next_invoice_at)}` : ""}</span></dd></div>
          <div><dt>Balance</dt><dd><strong style={{ color: Number(org.balance_due ?? 0) > 0 ? "var(--bb-danger-fg)" : undefined }}>{money(org.balance_due ?? 0)}</strong><span className="bb-caption" style={{ display: "block" }}>{[overdueCount ? `${overdueCount} overdue` : "", partialCount ? `${partialCount} partial` : ""].filter(Boolean).join(", ") || "Nothing overdue"}</span></dd></div>
          <div><dt>Usage</dt><dd><strong>{org.children ?? 0} children · {org.users_count ?? userRows.length} users</strong><span className="bb-caption" style={{ display: "block" }}>{org.staff ?? 0} staff · MRR {money(org.mrr ?? 0)}</span></dd></div>
        </dl>
      ) : null}

      <Tabs label="Organization" value={tab} onChange={setTab} items={[
        { key: "overview", label: "Overview" },
        { key: "users", label: "Users", count: userRows.length },
        { key: "invoices", label: "Invoices", count: invoiceRows.length }
      ]} />

      {tab === "overview" && org ? (
        <>
          <section className="bb-section bb-admin-section">
            <div className="bb-section-head"><h2>Profile</h2></div>
            <dl className="bb-kv">
              <dt>Facility type</dt><dd>{titleize(org.facility_type ?? "center_daycare")}</dd>
              <dt>City</dt><dd>{org.city ?? "—"}</dd>
              <dt>Plan</dt><dd>{org.plan ?? "—"}</dd>
              <dt>MRR</dt><dd>{money(org.mrr ?? 0)}</dd>
              <dt>Email</dt><dd>{org.email ?? "—"}</dd>
              <dt>Phone</dt><dd>{org.phone ?? "—"}</dd>
              <dt>Children</dt><dd>{org.children ?? 0}</dd>
            </dl>
          </section>

          <section className="bb-section bb-admin-section">
            <div className="bb-section-head">
              <h2>Check-in location safety</h2>
              <button className="bb-btn bb-btn-ghost" onClick={() => setLocationForm((f) => ({ ...f, open: !f.open, lat: String(org?.latitude ?? ""), lng: String(org?.longitude ?? ""), radius: String(org?.checkin_radius_meters ?? 300) }))}>{locationForm.open ? "Cancel" : "Edit location"}</button>
            </div>
            {!locationForm.open ? (
              <dl className="bb-kv">
                <dt>Latitude</dt><dd>{org?.latitude ?? "Not set"}</dd>
                <dt>Longitude</dt><dd>{org?.longitude ?? "Not set"}</dd>
                <dt>Check-in radius</dt><dd>{org?.checkin_radius_meters ?? 300} m</dd>
              </dl>
            ) : (
              <form onSubmit={handleSaveLocation} className="bb-stack" style={{ maxWidth: 640 }}>
                <p className="bb-caption">Set the daycare GPS coordinates. Staff check-ins outside the radius will be flagged as location alerts.</p>
                <div className="bb-form-grid">
                  <Field label="Latitude"><input className="bb-input" type="number" step="0.0000001" placeholder="e.g. -1.2921" value={locationForm.lat} onChange={(e) => setLocationForm((f) => ({ ...f, lat: e.target.value }))} /></Field>
                  <Field label="Longitude"><input className="bb-input" type="number" step="0.0000001" placeholder="e.g. 36.8219" value={locationForm.lng} onChange={(e) => setLocationForm((f) => ({ ...f, lng: e.target.value }))} /></Field>
                  <Field label="Radius (meters)"><input className="bb-input" type="number" min="50" max="10000" placeholder="300" value={locationForm.radius} onChange={(e) => setLocationForm((f) => ({ ...f, radius: e.target.value }))} /></Field>
                </div>
                <div><button className="bb-btn bb-btn-primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save location settings"}</button></div>
              </form>
            )}
          </section>

          <section className="bb-section bb-admin-section">
            <div className="bb-section-head"><h2>Location alerts · {(locationAlerts ?? []).length}</h2></div>
            {alertsLoading ? <LoadingState /> : (locationAlerts ?? []).length === 0 ? <p className="bb-muted">No location alerts.</p> : (
              <div className="bb-table-wrap">
                <table className="bb-table">
                  <thead><tr><th>Child</th><th>Classroom</th><th>Signed by</th><th className="right">Distance</th><th>Date</th></tr></thead>
                  <tbody>
                    {(locationAlerts ?? []).map((alert: any, i: number) => (
                      <tr key={i}><td className="strong">{alert.childName}</td><td>{alert.classroom}</td><td>{alert.signedBy}</td><td className="right"><Badge tone="warning">{`${alert.distanceMeters} m`}</Badge></td><td>{alert.date}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}

      {tab === "users" ? (
        <>
          <section className="bb-section bb-admin-section">
            <div className="bb-section-head">
              <h2>Users</h2>
              <button className="bb-btn bb-btn-secondary" onClick={() => setInviteForm((f) => ({ ...f, open: !f.open }))}>{inviteForm.open ? "Cancel" : <><UserPlus />Invite user</>}</button>
            </div>
            {inviteForm.open ? (
              <form onSubmit={handleCreateInvite} className="bb-panel bb-stack" style={{ marginBottom: 20 }}>
                <div className="bb-form-grid">
                  <Field label="Full name"><input className="bb-input white" value={inviteForm.name} onChange={(e) => setInviteForm((f) => ({ ...f, name: e.target.value }))} required /></Field>
                  <Field label="Email"><input className="bb-input white" type="email" value={inviteForm.email} onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))} required /></Field>
                  <Field label="Role"><select className="bb-input white" value={inviteForm.role} onChange={(e) => setInviteForm((f) => ({ ...f, role: e.target.value as Role }))}>{ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select></Field>
                </div>
                <div><button className="bb-btn bb-btn-primary" type="submit" disabled={saving}>{saving ? "Sending…" : "Send invitation"}</button></div>
              </form>
            ) : null}
            {usersLoading ? <LoadingState /> : userRows.length === 0 ? <p className="bb-muted">No users yet.</p> : (
              <div className="bb-table-wrap">
                <table className="bb-table">
                  <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th className="right">Actions</th></tr></thead>
                  <tbody>
                    {userRows.map((user: any) => (
                      <tr key={user.id}>
                        <td className="strong">{user.name}</td>
                        <td>{user.email}</td>
                        <td>{roleLabel(user.role)}</td>
                        <td><StatusBadge size="sm" map={accountStatuses} value={user.status} /></td>
                        <td className="right">{user.status === "active"
                          ? <button className="bb-btn bb-btn-ghost" disabled={saving} onClick={() => handleDisable(user.id)}>Disable</button>
                          : <button className="bb-btn bb-btn-ghost" disabled={saving} onClick={() => handleEnable(user.id)}>Enable</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="bb-section bb-admin-section">
            <div className="bb-section-head"><h2>Invitations</h2></div>
            {invLoading ? <LoadingState /> : (invitations ?? []).length === 0 ? <p className="bb-muted">No invitations.</p> : (
              <div className="bb-table-wrap">
                <table className="bb-table">
                  <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Invite URL</th><th className="right">Actions</th></tr></thead>
                  <tbody>
                    {(invitations ?? []).map((inv: any) => (
                      <tr key={inv.id ?? inv.token}>
                        <td className="strong">{inv.name}</td>
                        <td>{inv.email}</td>
                        <td>{roleLabel(inv.role)}</td>
                        <td><StatusBadge size="sm" map={accountStatuses} value={inv.status} /></td>
                        <td>{inv.invite_url ? <a href={inv.invite_url} target="_blank" rel="noopener noreferrer">Open link</a> : "—"}</td>
                        <td className="right">{inv.status === "pending" ? (
                          <div className="bb-row" style={{ justifyContent: "flex-end", gap: 6, flexWrap: "nowrap" }}>
                            <button className="bb-btn bb-btn-ghost" disabled={saving} onClick={() => handleResend(inv.id ?? inv.token)}>Resend</button>
                            <button className="bb-btn bb-btn-ghost" disabled={saving} onClick={() => handleCancel(inv.id ?? inv.token)}>Cancel</button>
                          </div>
                        ) : null}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}

      {tab === "invoices" ? (
        <section className="bb-section bb-admin-section">
          <div className="bb-section-head">
            <h2>Invoices</h2>
            <div className="bb-row">
              {subscriptionStatus ? <StatusBadge size="sm" map={subscriptionStatuses} value={subscriptionStatus} /> : null}
              <button className="bb-btn bb-btn-secondary" disabled={generatingInvoice} onClick={handleGenerateInvoice}>{generatingInvoice ? "Generating…" : "Generate invoice"}</button>
            </div>
          </div>
          {invoicesLoading ? <LoadingState /> : invoiceRows.length === 0 ? (
            <p className="bb-muted">No invoice generated yet. <button className="bb-btn bb-btn-ghost" disabled={generatingInvoice} onClick={handleGenerateInvoice}>Generate one now</button></p>
          ) : (
            <div className="bb-table-wrap">
              <table className="bb-table">
                <thead><tr><th>Invoice</th><th className="right">Amount</th><th>Status</th><th>Due</th><th>Created</th><th className="right">PDF</th></tr></thead>
                <tbody>
                  {invoiceRows.map((inv: any) => (
                    <tr key={inv.id}>
                      <td className="strong">{inv.invoice_number}</td>
                      <td className="right bb-num">{money(inv.total_amount, inv.currency)}</td>
                      <td><StatusBadge size="sm" map={invoiceStatuses} value={inv.status} label={inv.status === "open" ? "Pending payment" : undefined} /></td>
                      <td style={{ color: inv.status === "overdue" ? "var(--bb-danger-fg)" : undefined }}>{dateShort(inv.due_date)}</td>
                      <td>{dateShort(inv.created_at)}</td>
                      <td className="right"><button className="bb-btn bb-btn-ghost bb-btn-icon" aria-label={`Download ${inv.invoice_number} PDF`} onClick={() => downloadInvoice(inv)}><DownloadSimple size={20} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {statusConfirm && org ? (
        <Dialog title={statusConfirm === "suspended" ? `Suspend ${org.name}?` : `Reactivate ${org.name}?`} onClose={() => setStatusConfirm(null)} actions={<>
          <button className="bb-btn bb-btn-secondary" onClick={() => setStatusConfirm(null)}>Cancel</button>
          <button className={`bb-btn ${statusConfirm === "suspended" ? "bb-btn-danger" : "bb-btn-primary"}`} disabled={saving} onClick={handleStatusChange}>{saving ? "Saving…" : statusConfirm === "suspended" ? "Suspend organization" : "Reactivate organization"}</button>
        </>}>
          <p>{statusConfirm === "suspended" ? "Staff and families lose access to this organization until it is reactivated. Records are kept." : "Staff and families regain access immediately."}</p>
        </Dialog>
      ) : null}
    </main>
  );
}
