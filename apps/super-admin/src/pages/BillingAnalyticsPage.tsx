import { superAdminApi } from "@barbaari/shared";
import { Header, LoadingState, ErrorState, Panel, Badge } from "../components/Ui";
import { useAsyncData } from "../hooks/useAsyncData";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

function money(value: number) {
  return `$${Number(value ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function statusTone(s: string) {
  if (s === "active") return "success";
  if (s === "past_due") return "warning";
  if (s === "canceled" || s === "suspended") return "danger";
  return "default";
}

export function BillingAnalyticsPage() {
  const { data: overview, loading: ovLoading, error: ovError } = useAsyncData(() => superAdminApi.billingAnalyticsOverview(), []);
  const { data: monthly, loading: mLoading, error: mError } = useAsyncData(() => superAdminApi.billingAnalyticsRevenueByMonth(), []);
  const { data: topOrgs, loading: tLoading, error: tError } = useAsyncData(() => superAdminApi.billingAnalyticsTopOrganizations(), []);

  const loading = ovLoading || mLoading || tLoading;
  const error = ovError || mError || tError;

  if (loading) return <section className="page"><Header eyebrow="Platform" title="Billing Analytics" /><LoadingState /></section>;
  if (error) return <section className="page"><Header eyebrow="Platform" title="Billing Analytics" /><ErrorState message={error} /></section>;

  const ov = overview!;
  const months = monthly?.revenue_by_month ?? [];
  const chartData = months.map((m) => ({ month: m.month.slice(5), revenue: m.revenue }));

  return (
    <section className="page">
      <Header eyebrow="Platform" title="Billing Analytics" />

      <div className="metrics">
        <article className="metric primary"><span>Total Revenue</span><strong>{money(ov.total_revenue)}</strong><small>All time</small></article>
        <article className="metric secondary"><span>This Month</span><strong>{money(ov.revenue_this_month)}</strong><small>vs {money(ov.revenue_last_month)} last month</small></article>
        <article className="metric tertiary"><span>Active Subscriptions</span><strong>{ov.active_subscriptions}</strong><small>{ov.new_subscriptions_this_month} new this month</small></article>
        <article className="metric danger"><span>Past Due</span><strong>{ov.past_due_subscriptions}</strong><small>{ov.cancelled_subscriptions} cancelled</small></article>
      </div>

      <Panel title="Revenue — last 12 months">
        <div style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94a3b8" }} />
              <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => `$${v}`} />
              <Tooltip formatter={(value: number) => [money(value), "Revenue"]} />
              <Bar dataKey="revenue" fill="#2563eb" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel title="Top organizations by revenue">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Organization</th><th>Total Paid</th><th>Subscription</th><th>Last Payment</th></tr>
            </thead>
            <tbody>
              {(topOrgs?.top_organizations ?? []).map((org: any, i: number) => (
                <tr key={i}>
                  <td><strong>{org.org_name}</strong></td>
                  <td>{money(org.total_paid)}</td>
                  <td><Badge tone={statusTone(org.subscription_status)}>{org.subscription_status}</Badge></td>
                  <td>{org.last_payment_date ? new Date(org.last_payment_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}</td>
                </tr>
              ))}
              {(topOrgs?.top_organizations ?? []).length === 0 && (
                <tr><td colSpan={4} style={{ textAlign: "center", color: "#94a3b8" }}>No payment data yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </section>
  );
}
