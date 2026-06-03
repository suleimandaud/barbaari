import { superAdminApi } from "@barbaari/shared";
import { Alert, Badge, DataTable, ErrorState, Header, LoadingState, Panel } from "../components/Ui";
import { useAsyncData } from "../hooks/useAsyncData";
import { dateShort, money, titleize } from "../utils/format";

export function BillingDashboardPage() {
  const { data, loading, error, reload } = useAsyncData(async () => await superAdminApi.billingDashboard(), []);

  return <section className="page">
    <Header eyebrow="Platform Billing" title="Billing dashboard" />
    <Alert tone="warning" message="Stripe is test-mode ready only. Manual platform payments are active; Barbaari does not collect or store card numbers." />
    {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={reload} /> : <>
      <div className="metrics">{(data?.metrics ?? []).map((metric: any) => <article className={`metric ${metric.tone}`} key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.detail}</small></article>)}</div>
      <div className="grid two">
        <Panel title="Recent platform payments">
          <DataTable rows={data?.recent_payments ?? []} columns={[
            { header: "Organization", render: (row: any) => row.organization?.name ?? "Organization" },
            { header: "Invoice", render: (row: any) => row.invoice_number ?? row.invoice_id },
            { header: "Amount", render: (row: any) => `${row.currency ?? "USD"} ${money(row.amount)}` },
            { header: "Method", render: (row: any) => <Badge>{titleize(row.method)}</Badge> },
            { header: "Paid", render: (row: any) => dateShort(row.paid_at) }
          ]} />
        </Panel>
        <Panel title="Upcoming renewals">
          <DataTable rows={data?.upcoming_renewals ?? []} columns={[
            { header: "Organization", render: (row: any) => row.organization?.name ?? "Organization" },
            { header: "Plan", render: (row: any) => row.pricing_plan?.name ?? "No plan" },
            { header: "Cycle", render: (row: any) => titleize(row.billing_cycle) },
            { header: "Next invoice", render: (row: any) => dateShort(row.next_invoice_at) },
            { header: "Status", render: (row: any) => <Badge tone={row.status === "active" ? "success" : "warning"}>{titleize(row.status)}</Badge> }
          ]} />
        </Panel>
      </div>
    </>}
  </section>;
}
