import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { daycarePlatformBillingApi, getApiError } from "@barbaari/shared";
import { CalendarX, Lock, Prohibit, ShieldCheck, X } from "@phosphor-icons/react";
import { Alert, LoadingState, LogoTile } from "@barbaari/shared/web/ui";
import { useAsyncData } from "../hooks/useAsyncData";
import { clearSession } from "../services/auth";

function fmt(value: unknown, currency = "USD") {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
}

function dateShort(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(new Date(value));
}

function titleize(s?: string | null) {
  return String(s ?? "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function SubscriptionPaymentPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [paying, setPaying] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");
  const [canceledBanner, setCanceledBanner] = useState(searchParams.get("canceled") === "1");

  // Safety net: if a session_id lands here (Stripe returned to payment page
  // instead of success page — e.g. ProtectedRoute dropped it here before this
  // fix), forward it to the success page with the session_id intact.
  useEffect(() => {
    const sid = searchParams.get("session_id");
    if (sid) {
      navigate(`/subscription/success?session_id=${encodeURIComponent(sid)}`, { replace: true });
      return;
    }
    if (searchParams.get("success") === "1") {
      navigate("/subscription/success", { replace: true });
    }
  }, []);

  const { data, loading, reload } = useAsyncData(async () => {
    const sub = await daycarePlatformBillingApi.subscription();
    return sub;
  }, []);

  // Redirect to dashboard if subscription is already active.
  // Skip if session_id or success=1 is present — those cases are handled above.
  useEffect(() => {
    if (searchParams.get("session_id") || searchParams.get("success") === "1") return;
    if (data && !data.requires_payment) {
      navigate("/", { replace: true });
    }
  }, [data]);

  const subscription = data?.subscription;
  const plan = subscription?.pricing_plan;
  const invoice = data?.unpaid_invoice;
  const org = subscription?.organization;
  const status = subscription?.status ?? "pending_payment";
  const isSuspended = status === "suspended";
  const hasInvoice = !!invoice;

  async function payWithStripe() {
    setError("");
    setPaying(true);
    try {
      const response = await daycarePlatformBillingApi.createStripeCheckoutSession({});
      if (response.checkout_url) {
        window.location.assign(response.checkout_url);
        return;
      }
      setError(response.message ?? "Checkout could not be initiated. Please contact support.");
    } catch (err) {
      setError(getApiError(err).message || "Something went wrong. Please try again.");
    } finally {
      setPaying(false);
    }
  }

  async function testPayment() {
    setError("");
    setTesting(true);
    try {
      await daycarePlatformBillingApi.testPaymentSuccess();
      await reload();
      navigate("/subscription/success?test=1", { replace: true });
    } catch (err) {
      const msg = getApiError(err).message;
      setError(msg.includes("No unpaid platform invoice")
        ? "No invoice found to pay. Your account may already be active."
        : (msg || "Test payment failed."));
    } finally {
      setTesting(false);
    }
  }

  const signOut = () => { clearSession(); location.href = "/login"; };
  const shell = (content: React.ReactNode) => (
    <div style={{ minHeight: "100dvh", background: "var(--bb-bg)" }}>
      <header className="bb-gate-top">
        <div className="bb-gate-brand"><LogoTile size={36} /><strong>Barbaari</strong><span>{org?.name ?? ""}</span></div>
        <div className="bb-row">
          <a className="bb-btn bb-btn-ghost" href="mailto:support@barbaari.app">Contact support</a>
          <button className="bb-btn bb-btn-secondary" onClick={signOut}>Sign out</button>
        </div>
      </header>
      {content}
    </div>
  );

  if (loading && !data) return shell(<main className="bb-gate" style={{ display: "block" }}><LoadingState label="Loading your subscription" /></main>);

  if (isSuspended) {
    return shell(
      <main className="bb-gate">
        <div className="bb-stack" style={{ gap: 20 }}>
          <span className="bb-status danger" style={{ alignSelf: "flex-start" }}><Prohibit size={16} />Account suspended</span>
          <h1>Your account is suspended</h1>
          <p>Your organization's access has been suspended. Please contact Barbaari support to resolve this.</p>
          <p className="bb-caption">support@barbaari.app</p>
        </div>
        <aside className="bb-panel bb-stack">
          <a className="bb-btn bb-btn-primary bb-btn-lg bb-btn-block" href="mailto:support@barbaari.app">Contact support</a>
          <button className="bb-btn bb-btn-secondary bb-btn-lg bb-btn-block" onClick={signOut}>Sign out</button>
        </aside>
      </main>
    );
  }

  // Requires payment but no invoice is on record yet — the org's period has lapsed by
  // date (SubscriptionAccessService::requiresPayment()) without ever being re-invoiced.
  // payWithStripe() handles this server-side: createStripeCheckoutSession() generates the
  // renewal invoice itself before proceeding to checkout.
  if (!hasInvoice && data?.requires_payment) {
    const billingCycle = subscription?.billing_cycle === "yearly" ? "yearly" : "monthly";
    const cyclePrice = subscription?.billing_cycle === "yearly" ? plan?.yearly_price : plan?.monthly_price;
    const currency = plan?.currency ?? "USD";
    return shell(
      <main className="bb-gate">
        <div className="bb-stack" style={{ gap: 25 }}>
          <span className="bb-status danger" style={{ alignSelf: "flex-start" }}><CalendarX size={16} />Subscription expired</span>
          <h1>Renew your subscription to keep going</h1>
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <section><h4>What happened</h4><p>Your {plan?.name ?? ""} plan expired{subscription?.current_period_end ? ` on ${dateShort(subscription.current_period_end)}` : ""}.</p></section>
          <section><h4>What’s paused</h4><p>Admins and managers can’t open the dashboard, attendance or tablet mode until payment is complete. Your children, guardians and attendance records are unchanged.</p></section>
          <section><h4>What to do</h4><p>Renew below. Once payment is confirmed you’ll go straight back to your dashboard.</p></section>
        </div>
        <aside className="bb-panel">
          <p className="bb-overline">Amount due</p>
          <div className="bb-amount" style={{ margin: "12px 0 20px" }}>{cyclePrice != null ? fmt(cyclePrice, currency) : "—"}</div>
          <dl className="bb-sumlist" style={{ marginBottom: 20 }}>
            <div><dt>{plan?.name ?? "Plan"} · {billingCycle}</dt><dd>{cyclePrice != null ? fmt(cyclePrice, currency) : "—"}</dd></div>
            {subscription?.current_period_end ? <div><dt>Expired on</dt><dd>{dateShort(subscription.current_period_end)}</dd></div> : null}
          </dl>
          <button className="bb-btn bb-btn-primary bb-btn-lg bb-btn-block" disabled={paying} onClick={payWithStripe}><Lock />{paying ? "Working…" : "Renew subscription"}</button>
          <p className="bb-caption bb-row" style={{ marginTop: 12, flexWrap: "nowrap", alignItems: "flex-start", gap: 8 }}><ShieldCheck size={16} style={{ flex: "none" }} />You’ll pay on Stripe’s secure checkout. Barbaari never sees your card number.</p>
        </aside>
      </main>
    );
  }

  if (!hasInvoice) {
    return shell(
      <main className="bb-gate">
        <div className="bb-stack" style={{ gap: 20 }}>
          <h1>Setting up your account</h1>
          <p>Your subscription is being configured. This usually takes a moment. If this persists, please contact support.</p>
        </div>
        <aside className="bb-panel bb-stack">
          <button className="bb-btn bb-btn-primary bb-btn-lg bb-btn-block" onClick={() => reload()}>Refresh</button>
          <a className="bb-btn bb-btn-secondary bb-btn-lg bb-btn-block" href="mailto:support@barbaari.app">Contact support</a>
        </aside>
      </main>
    );
  }

  const features: string[] = plan?.features ?? [];
  const currency = invoice.currency ?? plan?.currency ?? "USD";
  const overdue = invoice.due_date && new Date(invoice.due_date) < new Date();

  return shell(
    <main className="bb-gate">
      <div className="bb-stack" style={{ gap: 25 }}>
        <span className={`bb-status ${overdue ? "danger" : "warn"}`} style={{ alignSelf: "flex-start" }}><CalendarX size={16} />{overdue ? "Payment overdue" : "Payment required"}</span>
        <h1>{status === "expired" ? "Renew your subscription to keep going" : "Complete payment to start using Barbaari"}</h1>
        {canceledBanner ? (
          <Alert tone="info" action={<button className="bb-btn bb-btn-ghost bb-btn-icon" aria-label="Dismiss" onClick={() => setCanceledBanner(false)}><X size={18} /></button>}>Payment was cancelled. Take your time — your account will be here when you're ready.</Alert>
        ) : null}
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <section><h4>What happened</h4><p>Invoice {invoice.invoice_number} for {fmt(invoice.balance_due, currency)} {overdue ? "was" : "is"} due on {dateShort(invoice.due_date)}{overdue ? " and hasn’t been paid" : ""}.</p></section>
        <section><h4>What’s paused</h4><p>Admins and managers can’t open the dashboard, attendance or tablet mode until payment is complete. Your children, guardians and attendance records are unchanged.</p></section>
        <section><h4>What to do</h4><p>Pay below. Once payment is confirmed you’ll go straight back to your dashboard.</p></section>
        {features.length || plan?.child_limit != null ? (
          <section>
            <h4>Your {plan?.name ?? ""} plan includes</h4>
            <div className="bb-row" style={{ gap: 8 }}>
              {plan?.child_limit != null ? <span className="bb-tag accent">{plan.child_limit} children</span> : null}
              {plan?.staff_limit != null ? <span className="bb-tag accent">{plan.staff_limit} staff</span> : null}
              {plan?.device_limit != null ? <span className="bb-tag accent">{plan.device_limit} tablets</span> : null}
              {features.slice(0, 4).map((feature) => <span key={feature} className="bb-tag">{titleize(feature)}</span>)}
            </div>
          </section>
        ) : null}
      </div>
      <aside className="bb-panel">
        <p className="bb-overline">Amount due</p>
        <div className="bb-amount" style={{ margin: "12px 0 20px" }}>{fmt(invoice.balance_due, currency)}</div>
        <dl className="bb-sumlist" style={{ marginBottom: 20 }}>
          <div><dt>{plan?.name ?? "Subscription"} · {subscription?.billing_cycle === "yearly" ? "yearly" : "monthly"}</dt><dd>{fmt(invoice.balance_due, currency)}</dd></div>
          <div><dt>Invoice</dt><dd>{invoice.invoice_number}</dd></div>
          <div><dt>Due date</dt><dd style={overdue ? { color: "var(--bb-danger-fg)" } : undefined}>{dateShort(invoice.due_date)}</dd></div>
        </dl>
        <button className="bb-btn bb-btn-primary bb-btn-lg bb-btn-block" disabled={paying} onClick={payWithStripe}><Lock />{paying ? "Working…" : status === "expired" ? "Renew subscription" : "Pay with Stripe"}</button>
        <p className="bb-caption bb-row" style={{ marginTop: 12, flexWrap: "nowrap", alignItems: "flex-start", gap: 8 }}><ShieldCheck size={16} style={{ flex: "none" }} />You’ll pay on Stripe’s secure checkout. Barbaari never sees your card number.</p>
        {data?.test_payment_enabled === true ? (
          <button className="bb-btn bb-btn-ghost" style={{ marginTop: 10 }} disabled={testing} onClick={testPayment}>{testing ? "Processing…" : "Local demo only: activate test payment"}</button>
        ) : null}
      </aside>
    </main>
  );
}
