import { useState } from "react";
import { daycarePlatformBillingApi, getApiError } from "@barbaari/shared";
import { DownloadSimple, WarningCircle } from "@phosphor-icons/react";
import { Alert, ErrorState, LoadingState, PageHeader, StatusBadge, money, shortDate } from "@barbaari/shared/web/ui";
import { invoiceStatuses, subscriptionStatuses } from "@barbaari/shared/web/status";
import { useAsyncData } from "../hooks/useAsyncData";

function dateShort(value?: string | null, withYear = false) {
  if (!value) return "—";
  return shortDate(value, withYear ? { day: "numeric", month: "short", year: "numeric" } : { day: "numeric", month: "short" });
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

  // The PDF endpoint needs the bearer token, so fetch it through the API client and save the blob.
  async function downloadPdf(invoice: any) {
    setActionError("");
    try {
      const response = await daycarePlatformBillingApi.downloadInvoicePdf(invoice.id);
      const url = URL.createObjectURL(response.data as Blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${invoice.invoice_number ?? `invoice-${invoice.id}`}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setActionError(getApiError(err).message);
    }
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

  if (loading && !data) return <main className="bb-page"><LoadingState label="Loading subscription billing" /></main>;
  if (error) return <main className="bb-page"><ErrorState message={error} onRetry={reload} /></main>;

  const subscription = data?.subscription.subscription;
  const plan = subscription?.pricing_plan;
  const currency = plan?.currency ?? "USD";
  const openBalance = Number(data?.subscription.open_balance ?? 0);
  const status = subscription?.status ?? "not configured";
  const invoices = (data?.invoices ?? []) as any[];
  const openInvoices = invoices.filter((invoice) => Number(invoice.balance_due ?? 0) > 0);
  const oldestOpen = [...openInvoices].sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))[0];
  const warning = status === "suspended"
    ? "Your organization subscription is suspended. Contact platform admin."
    : openBalance > 0 || ["past_due", "suspended"].includes(status)
      ? `You have an unpaid balance of ${money(openBalance, currency)}`
      : "";
  const limit = (value: unknown, noun: string) => value ? `Up to ${value} ${noun}` : `Unlimited ${noun}`;

  return (
    <main className="bb-page">
      <PageHeader kicker="Your Barbaari plan, invoices and payments" title="Subscription" />
      {warning ? (
        <Alert tone="danger" icon={WarningCircle} title={warning} action={status !== "suspended" ? <button className="bb-btn bb-btn-primary" onClick={payInvoicePlaceholder}>Pay now</button> : undefined}>
          {status === "suspended" ? null : oldestOpen ? `Pay invoice ${oldestOpen.invoice_number} to keep tablet mode and attendance running without interruption.` : "Your Barbaari subscription has an unpaid or overdue balance."}
        </Alert>
      ) : null}
      {message ? <Alert tone="ok">{message}</Alert> : null}
      {actionError ? <Alert tone="danger">{actionError}</Alert> : null}

      <div className="bb-sub-summary">
        <div>
          <p className="bb-overline">Current plan</p>
          <strong className="bb-sub-plan">{plan?.name ?? "No plan"}{subscription?.billing_cycle ? ` · ${titleize(subscription.billing_cycle).toLowerCase()}` : ""}</strong>
          <div className="bb-row" style={{ gap: 10 }}><StatusBadge size="sm" map={subscriptionStatuses} value={status} /><span className="bb-caption">{subscription?.provider === "stripe" ? "Paid by card through Stripe" : `Provider: ${titleize(subscription?.provider ?? "manual")}`}</span></div>
        </div>
        <div>
          <p className="bb-overline">Open balance</p>
          <strong className={`bb-sub-figure${openBalance > 0 ? " danger" : ""}`}>{money(openBalance, currency)}</strong>
          <span className="bb-caption">{openInvoices.length ? `Across ${openInvoices.length} invoice${openInvoices.length === 1 ? "" : "s"}` : "Platform invoices only"}</span>
        </div>
        <div>
          <p className="bb-overline">Next invoice</p>
          <strong className="bb-sub-figure">{dateShort(subscription?.next_invoice_at ?? subscription?.current_period_end)}</strong>
          <span className="bb-caption">{plan ? money(subscription?.billing_cycle === "yearly" ? plan.yearly_price : plan.monthly_price, currency) : ""}{data?.subscription.stripe_mode ? ` · Stripe ${data.subscription.stripe_mode} mode` : ""}</span>
        </div>
        <div>
          <p className="bb-overline">Plan limits</p>
          <ul className="bb-sub-limits">
            <li>{limit(plan?.child_limit, "children")}</li>
            <li>{limit(plan?.staff_limit, "staff")}</li>
            <li>{limit(plan?.device_limit, "tablets")}</li>
          </ul>
        </div>
      </div>
      {(plan?.features ?? []).length ? <div className="bb-row" style={{ gap: 8, marginBottom: 40 }}>{(plan?.features ?? []).map((feature: string) => <span key={feature} className="bb-tag accent">{titleize(feature)}</span>)}</div> : null}

      <section className="bb-section" style={{ marginBottom: 40 }}>
        <div className="bb-row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
          <h2 style={{ fontSize: 26 }}>Invoices</h2>
          <button className="bb-btn bb-btn-ghost" onClick={requestPlanChange}>Request plan change</button>
        </div>
        {invoices.length ? (
          <div className="bb-table-wrap">
            <table className="bb-table">
              <thead><tr><th>Invoice</th><th>Period</th><th>Due</th><th className="right">Total</th><th className="right">Paid</th><th className="right">Balance</th><th>Status</th><th className="right">PDF</th></tr></thead>
              <tbody>
                {invoices.map((row) => (
                  <tr key={row.id}>
                    <td className="strong" style={{ whiteSpace: "nowrap" }}>{row.invoice_number}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{dateShort(row.billing_period_start)} – {dateShort(row.billing_period_end, true)}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{dateShort(row.due_date)}</td>
                    <td className="right bb-num">{money(row.total_amount, row.currency)}</td>
                    <td className="right bb-num">{money(row.amount_paid, row.currency)}</td>
                    <td className="right bb-num strong">{money(row.balance_due, row.currency)}</td>
                    <td><StatusBadge size="sm" map={invoiceStatuses} value={row.status} /></td>
                    <td className="right"><button className="bb-btn bb-btn-ghost bb-btn-icon" aria-label={`Download ${row.invoice_number} PDF`} onClick={() => downloadPdf(row)}><DownloadSimple size={20} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="bb-muted">No platform invoices yet.</p>}
        {openBalance > 0 && status !== "suspended" ? <div style={{ marginTop: 15 }}><button className="bb-btn bb-btn-primary" onClick={payInvoicePlaceholder}>Pay invoice</button></div> : null}
      </section>

      <div className="bb-grid-main-side" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(260px, 340px)" }}>
        <section>
          <h2 style={{ fontSize: 26, marginBottom: 10 }}>Payment history</h2>
          {(data?.payments ?? []).length ? (
            <div className="bb-list">
              {(data?.payments ?? []).map((row: any) => (
                <div className="bb-list-row" key={row.id}>
                  <span className="bb-caption" style={{ width: 70, flex: "none" }}>{dateShort(row.paid_at)}</span>
                  <span className="grow">{[row.invoice_number ?? row.invoice_id, titleize(row.method), row.reference ?? "Manual"].filter(Boolean).join(" · ")}</span>
                  <strong className="bb-num">{money(row.amount, row.currency)}</strong>
                </div>
              ))}
            </div>
          ) : <p className="bb-muted">No payments yet.</p>}
        </section>
        <section>
          <h2 style={{ fontSize: 26, marginBottom: 10 }}>Manage</h2>
          {subscription?.cancel_at_period_end ? (
            <Alert tone="warn">Subscription cancellation scheduled. Access ends on {dateShort(subscription?.current_period_end, true)}.</Alert>
          ) : status === "active" ? (
            !cancelConfirm ? (
              <>
                <p style={{ marginBottom: 12 }}>If you cancel, access continues until the end of the current billing period.</p>
                <button className="bb-btn bb-btn-secondary" onClick={() => setCancelConfirm(true)}>Cancel subscription</button>
              </>
            ) : (
              <>
                <p style={{ marginBottom: 12 }}>Are you sure? Your access will continue until the end of the current billing period.</p>
                <div className="bb-row">
                  <button className="bb-btn bb-btn-danger" disabled={cancelling} onClick={cancelSubscription}>{cancelling ? "Cancelling…" : "Yes, cancel at period end"}</button>
                  <button className="bb-btn bb-btn-secondary" disabled={cancelling} onClick={() => setCancelConfirm(false)}>Keep subscription</button>
                </div>
              </>
            )
          ) : <p className="bb-muted">Subscription changes are available while the plan is active.</p>}
        </section>
      </div>
    </main>
  );
}
