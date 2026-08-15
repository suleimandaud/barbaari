import { useState } from "react";
import { daycarePlatformBillingApi, getApiError } from "@barbaari/shared";
import { API_BASE_URL } from "@barbaari/shared";
import { DataTable } from "../components/DataTable";
import { PageHeader, Panel } from "../components/Page";
import { Badge, ErrorState, LoadingState } from "../components/Status";
import { useAsyncData } from "../hooks/useAsyncData";

function money(value: unknown, currency = "USD") {
  return `${currency} $${Number(value ?? 0).toFixed(2)}`;
}

function dateShort(value?: string | null) {
  if (!value) return "n/a";
  return new Intl.DateTimeFormat("en", { month: "short", day: "2-digit", year: "numeric" }).format(new Date(value));
}

function titleize(value?: string | null) {
  return String(value ?? "").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function SubscriptionBillingPage() {
  const { data, loading, error, reload } = useAsyncData(async () => {
    const [subscription, invoices, payments] = await Promise.all([
      daycarePlatformBillingApi.subscription(),
      daycarePlatformBillingApi.invoices(),
      daycarePlatformBillingApi.payments(),
    ]);
    return { subscription, invoices: invoices.invoices, payments: payments.payments };
  }, []);
  const [message, setMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  async function cancelSubscription() {
    if (cancelling) return;
    setMessage(""); setActionError(""); setCancelling(true);
    try {
      const res = await daycarePlatformBillingApi.cancelStripeSubscription();
      setMessage(res.message);
      reload();
    } catch (err) { setActionError(getApiError(err).message); }
    finally { setCancelling(false); setCancelConfirm(false); }
  }

  function downloadPdf(invoiceId: string) {
    window.open(`${API_BASE_URL}/daycare/billing/invoices/${invoiceId}/pdf`, "_blank");
  }

  async function requestPlanChange() {
    setMessage("");
    setActionError("");
    try {
      const response = await daycarePlatformBillingApi.requestPlanChange({ message: "Daycare admin requested a platform plan change from the billing page." });
      setMessage(response.message);
    } catch (err) {
      setActionError(getApiError(err).message);
    }
  }

  async function payInvoicePlaceholder() {
    setMessage("");
    setActionError("");
    try {
      const response = await daycarePlatformBillingApi.createStripeCheckoutSession({
        success_url: `${location.origin}/subscription-payment?success=1`,
        cancel_url: `${location.origin}/subscription-billing?canceled=1`,
      });
      if (response.checkout_url) {
        window.location.assign(response.checkout_url);
        return;
      }
      setMessage(response.message ?? "");
    } catch (err) {
      setActionError(getApiError(err).message);
    }
  }

  if (loading) return <LoadingState label="Loading subscription billing..." />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const subscription = data?.subscription.subscription;
  const plan = subscription?.pricing_plan;
  const openBalance = Number(data?.subscription.open_balance ?? 0);
  const status = subscription?.status ?? "not configured";
  const warning = status === "suspended"
    ? "Your organization subscription is suspended. Contact platform admin."
    : openBalance > 0 || ["past_due", "suspended"].includes(status)
      ? "Your Barbaari subscription has an unpaid or overdue balance."
      : "";

  return <section className="page">
    <PageHeader eyebrow="Platform Subscription" title="Subscription / Billing" description="View your daycare organization’s Barbaari platform subscription, invoices, and payment history." />
    {warning ? <div className={`alert ${status === "suspended" ? "danger" : "warning"}`}>{warning}</div> : null}
    {message ? <div className="alert success">{message}</div> : null}
    {actionError ? <div className="alert danger">{actionError}</div> : null}

    <div className="metrics">
      <article className="metric primary"><span>Current plan</span><strong>{plan?.name ?? "No plan"}</strong><small>{titleize(subscription?.billing_cycle)} billing</small></article>
      <article className={`metric ${status === "active" ? "secondary" : "danger"}`}><span>Status</span><strong>{titleize(status)}</strong><small>Provider: {titleize(subscription?.provider ?? "manual")}</small></article>
      <article className="metric tertiary"><span>Open balance</span><strong>{money(openBalance, plan?.currency ?? "USD")}</strong><small>Platform invoices only</small></article>
      <article className="metric primary"><span>Next invoice</span><strong>{dateShort(subscription?.next_invoice_at)}</strong><small>Stripe mode: {data?.subscription.stripe_mode ?? "test"}</small></article>
    </div>

    <Panel title="Plan limits and features" action={<button className="secondary" onClick={requestPlanChange}>Request plan change</button>}>
      <div className="grid three">
        <div><strong>{plan?.child_limit ?? "Unlimited"}</strong><br /><small>Children</small></div>
        <div><strong>{plan?.staff_limit ?? "Unlimited"}</strong><br /><small>Staff</small></div>
        <div><strong>{plan?.device_limit ?? "Unlimited"}</strong><br /><small>Tablet devices</small></div>
      </div>
      <div className="feature-list">{(plan?.features ?? []).map((feature: string) => <Badge key={feature}>{titleize(feature)}</Badge>)}</div>
    </Panel>

    {subscription?.cancel_at_period_end ? (
      <div className="alert warning">Subscription cancellation scheduled. Access ends on {dateShort(subscription?.current_period_end)}.</div>
    ) : status === "active" && (
      <Panel title="Manage subscription">
        {!cancelConfirm ? (
          <button className="secondary" onClick={() => setCancelConfirm(true)}>Cancel subscription</button>
        ) : (
          <div className="settings-stack">
            <p className="muted">Are you sure? Your access will continue until the end of the current billing period.</p>
            <div className="actions">
              <button className="secondary" disabled={cancelling} onClick={cancelSubscription}>{cancelling ? "Cancelling..." : "Yes, cancel at period end"}</button>
              <button className="secondary" disabled={cancelling} onClick={() => setCancelConfirm(false)}>Keep subscription</button>
            </div>
          </div>
        )}
      </Panel>
    )}
    <Panel title="Platform invoices" action={<button className="primary" onClick={payInvoicePlaceholder}>Pay Invoice</button>}>
      <DataTable rows={data?.invoices ?? []} columns={[
        { header: "Invoice", render: (row: any) => row.invoice_number },
        { header: "Period", render: (row: any) => `${dateShort(row.billing_period_start)} - ${dateShort(row.billing_period_end)}` },
        { header: "Due", render: (row: any) => dateShort(row.due_date) },
        { header: "Total", render: (row: any) => money(row.total_amount, row.currency) },
        { header: "Paid", render: (row: any) => money(row.amount_paid, row.currency) },
        { header: "Balance", render: (row: any) => money(row.balance_due, row.currency) },
        { header: "Status", render: (row: any) => <Badge tone={row.status === "paid" ? "success" : row.status === "overdue" ? "danger" : "warning"}>{titleize(row.status)}</Badge> },
        { header: "PDF", render: (row: any) => <button className="action-link" onClick={() => downloadPdf(row.id)}>Download</button> }
      ]} />
    </Panel>

    <Panel title="Payment history">
      <DataTable rows={data?.payments ?? []} columns={[
        { header: "Invoice", render: (row: any) => row.invoice_number ?? row.invoice_id },
        { header: "Amount", render: (row: any) => money(row.amount, row.currency) },
        { header: "Method", render: (row: any) => <Badge>{titleize(row.method)}</Badge> },
        { header: "Reference", render: (row: any) => row.reference ?? "Manual" },
        { header: "Paid", render: (row: any) => dateShort(row.paid_at) }
      ]} />
    </Panel>
  </section>;
}
