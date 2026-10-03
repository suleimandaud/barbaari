import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, FileText, Info, Lifebuoy, Receipt, Warning, WarningCircle } from "@phosphor-icons/react";
import { superAdminApi } from "@barbaari/shared";
import { PageHeader, Stat, StatusBadge, money } from "@barbaari/shared/web/ui";
import { subscriptionStatuses } from "@barbaari/shared/web/status";
import { ErrorState, LoadingState } from "../components/Ui";
import { useAsyncData } from "../hooks/useAsyncData";
import { titleize } from "../utils/format";

const orgStatuses = {
  ...subscriptionStatuses,
  pending: { label: "Pending", tone: "warn" as const, icon: "clock" as const }
};

const compact = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: value >= 10000 ? "compact" : "standard", maximumFractionDigits: value >= 10000 ? 1 : 0 }).format(value).replace("K", "k");

export function DashboardPage() {
  const navigate = useNavigate();
  const { data, loading, error, reload } = useAsyncData(async () => {
    const [dashboard, orgs, subs, users, alerts, applications, tickets, billing] = await Promise.all([
      superAdminApi.dashboard(),
      superAdminApi.organizations(),
      superAdminApi.subscriptions(),
      superAdminApi.users(),
      superAdminApi.systemAlerts(),
      superAdminApi.registrationApplications(),
      superAdminApi.supportTickets(),
      superAdminApi.billingDashboard()
    ]);
    return {
      dashboard, orgs: orgs.organizations ?? [], subs: subs.subscriptions ?? [], users: users.users ?? [], alerts: alerts.system_alerts ?? [],
      applications: applications.applications ?? [], tickets: tickets.support_tickets ?? [], billing
    };
  }, []);
  if (loading && !data) return <main className="bb-page"><LoadingState /></main>;
  if (error || !data) return <main className="bb-page"><ErrorState message={error} onRetry={reload} /></main>;

  const orgs = data.orgs as any[];
  const pendingApplications = (data.applications as any[]).filter((application) => application.status === "pending");
  const openTickets = (data.tickets as any[]).filter((ticket) => !["closed", "resolved"].includes(String(ticket.status)));
  const openAlerts = (data.alerts as any[]).filter((alert) => !alert.resolved_at);
  const overdueOrgs = orgs.filter((org) => org.overdue);
  const outstanding = orgs.reduce((sum, org) => sum + Number(org.balance_due ?? 0), 0);
  const revenueMetric = (data.billing?.metrics ?? []).find((metric: any) => metric.label === "Revenue this month");
  const mrr = (data.dashboard?.metrics ?? []).find((metric: any) => metric.label === "MRR");
  const today = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

  return (
    <main className="bb-page">
      <PageHeader
        kicker={`${today} · all organizations · ${data.users.length} users${mrr ? ` · MRR ${mrr.value}` : ""}`}
        title="Platform"
        actions={<>
          <Link className="bb-btn bb-btn-secondary bb-btn-lg" to="/billing">Billing dashboard</Link>
          <Link className="bb-btn bb-btn-primary bb-btn-lg" to="/registration-applications"><FileText />{pendingApplications.length ? `Review ${pendingApplications.length} application${pendingApplications.length === 1 ? "" : "s"}` : "Applications"}</Link>
        </>}
      />

      <div className="bb-stats" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
        <Stat value={orgs.length} label="Organizations" />
        <Stat value={orgs.filter((org) => org.status === "active").length} label="Active" icon="check" labelTone="ok" />
        <Stat value={orgs.filter((org) => org.status === "suspended").length} label="Suspended" icon="prohibit" labelTone="dangerlabel" />
        <Stat value={data.subs.length} label="Subscriptions" />
        <Stat value={revenueMetric?.value ?? "—"} label="Paid this month" />
        <Stat value={compact(outstanding)} label={`Outstanding${overdueOrgs.length ? ` · ${overdueOrgs.length} overdue` : ""}`} tone={outstanding > 0 ? "danger" : undefined} />
      </div>

      <div className="bb-grid-main-side" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(260px, 340px)" }}>
        <section>
          <div className="bb-section-head"><h2>Organizations</h2><Link className="bb-btn bb-btn-ghost" to="/organizations">All {orgs.length}<ArrowRight size={16} /></Link></div>
          <div className="bb-table-wrap">
            <table className="bb-table">
              <thead><tr><th>Organization</th><th>Owner</th><th>Plan</th><th className="right">Children</th><th className="right">Balance</th><th>Status</th></tr></thead>
              <tbody>
                {orgs.slice(0, 8).map((org) => (
                  <tr key={org.id} className="clickable" onClick={() => navigate(`/organizations/${org.id}`)}>
                    <td><Link to={`/organizations/${org.id}`} className="bb-strong-link">{org.name}</Link><span className="bb-caption" style={{ display: "block" }}>{org.facility_type_label ?? titleize(org.facility_type)}</span></td>
                    <td className="bb-truncate" style={{ maxWidth: 200 }}>{org.primary_admin_email ?? "—"}</td>
                    <td>{org.current_plan ?? org.plan ?? "—"}</td>
                    <td className="right bb-num">{org.children ?? 0}</td>
                    <td className="right bb-num">{money(org.balance_due ?? 0)}</td>
                    <td><StatusBadge size="sm" map={orgStatuses} value={org.subscription_status && org.status === "active" ? org.subscription_status : org.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!orgs.length ? <p className="bb-muted" style={{ marginTop: 15 }}>No organizations yet.</p> : null}
        </section>

        <aside>
          <div className="bb-section-head"><h2>System alerts</h2>{openAlerts.length > 3 ? <Link className="bb-btn bb-btn-ghost" to="/alerts">All</Link> : null}</div>
          {openAlerts.length ? (
            <div className="bb-list" style={{ marginBottom: 40 }}>
              {openAlerts.slice(0, 3).map((alert: any) => {
                const Glyph = alert.severity === "critical" || alert.severity === "high" ? WarningCircle : alert.severity === "warning" || alert.severity === "medium" ? Warning : Info;
                const color = alert.severity === "critical" || alert.severity === "high" ? "var(--bb-error)" : alert.severity === "warning" || alert.severity === "medium" ? "var(--bb-warning)" : "var(--bb-accent)";
                return (
                  <Link className="bb-list-row" key={alert.id} to="/alerts" style={{ alignItems: "flex-start", color: "inherit", textDecoration: "none" }}>
                    <Glyph size={20} color={color} style={{ flex: "none", marginTop: 2 }} />
                    <div className="grow"><strong>{alert.title}</strong><span className="sub">{alert.body}{alert.severity ? ` · ${alert.severity}` : ""}</span></div>
                  </Link>
                );
              })}
            </div>
          ) : <p className="bb-muted" style={{ marginBottom: 40 }}>No open alerts.</p>}

          <div className="bb-section-head"><h2>Needs review</h2></div>
          <div className="bb-list">
            <ReviewRow icon={FileText} text={`${pendingApplications.length} registration application${pendingApplications.length === 1 ? "" : "s"}`} to="/registration-applications" action="Review" />
            <ReviewRow icon={Lifebuoy} text={`${openTickets.length} open support ticket${openTickets.length === 1 ? "" : "s"}`} to="/support" action="Open" />
            <ReviewRow icon={Receipt} text={`${overdueOrgs.length} organization${overdueOrgs.length === 1 ? "" : "s"} with overdue invoices`} to="/platform-invoices" action="View" />
          </div>
        </aside>
      </div>
    </main>
  );
}

function ReviewRow({ icon: Glyph, text, to, action }: { icon: typeof FileText; text: string; to: string; action: string }) {
  return (
    <div className="bb-list-row">
      <Glyph size={20} color="var(--bb-accent)" />
      <span className="grow">{text}</span>
      <Link className="bb-btn bb-btn-ghost" to={to}>{action}</Link>
    </div>
  );
}
