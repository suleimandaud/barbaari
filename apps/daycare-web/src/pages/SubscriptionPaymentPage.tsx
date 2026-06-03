import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { daycarePlatformBillingApi, getApiError } from "@barbaari/shared";
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

  if (loading) {
    return (
      <main style={styles.page}>
        <div style={styles.loadingWrap}>
          <div style={styles.spinner} />
          <p style={styles.loadingText}>Loading your subscription…</p>
        </div>
      </main>
    );
  }

  if (isSuspended) {
    return (
      <main style={styles.page}>
        <div style={styles.card}>
          <div style={{ textAlign: "center", padding: "8px 0 24px" }}>
            <div style={iconCircle("danger")}>⚠</div>
            <h1 style={styles.cardTitle}>Account suspended</h1>
            <p style={styles.cardSubtitle}>Your organization's access has been suspended. Please contact Barbaari support to resolve this.</p>
          </div>
          <div style={styles.actionsCol}>
            <a href="mailto:support@barbaari.app" style={styles.primaryBtn}>Contact support</a>
            <button style={styles.ghostBtn} onClick={() => { clearSession(); location.href = "/login"; }}>Logout</button>
          </div>
        </div>
      </main>
    );
  }

  if (!hasInvoice) {
    return (
      <main style={styles.page}>
        <div style={styles.card}>
          <div style={{ textAlign: "center", padding: "8px 0 24px" }}>
            <div style={iconCircle("info")}>⏳</div>
            <h1 style={styles.cardTitle}>Setting up your account</h1>
            <p style={styles.cardSubtitle}>
              Your subscription is being configured. This usually takes a moment.
              If this persists, please contact support.
            </p>
          </div>
          <div style={styles.actionsCol}>
            <button style={styles.secondaryBtn} onClick={() => reload()}>Refresh</button>
            <a href="mailto:support@barbaari.app" style={styles.ghostBtn}>Contact support</a>
            <button style={styles.ghostBtn} onClick={() => { clearSession(); location.href = "/login"; }}>Logout</button>
          </div>
        </div>
      </main>
    );
  }

  const features: string[] = plan?.features ?? [];
  const currency = invoice.currency ?? plan?.currency ?? "USD";

  return (
    <main style={styles.page}>
      <div style={styles.header}>
        <div style={styles.brandMark}>B</div>
        <div>
          <div style={styles.headerEyebrow}>Barbaari</div>
          <div style={styles.headerOrg}>{org?.name ?? "Your Organization"}</div>
        </div>
      </div>

      {canceledBanner && (
        <div style={styles.cancelBanner}>
          Payment was cancelled. Take your time — your account will be here when you're ready.
          <button style={styles.bannerClose} onClick={() => setCanceledBanner(false)}>✕</button>
        </div>
      )}

      {error && <div style={styles.errorBanner}>{error}</div>}

      <div style={styles.card}>
        <div style={styles.cardTop}>
          <div>
            <div style={styles.planLabel}>Your plan</div>
            <h1 style={styles.planName}>{plan?.name ?? "Subscription"}</h1>
          </div>
          <div style={styles.priceBadge}>
            <span style={styles.priceAmount}>{fmt(invoice.balance_due, currency)}</span>
            <span style={styles.pricePer}>/month</span>
          </div>
        </div>

        <div style={styles.divider} />

        {/* What's included */}
        <div style={styles.includesGrid}>
          {plan?.child_limit != null && (
            <div style={styles.includeItem}>
              <span style={styles.includeIcon}>👶</span>
              <span><strong>{plan.child_limit}</strong> children</span>
            </div>
          )}
          {plan?.staff_limit != null && (
            <div style={styles.includeItem}>
              <span style={styles.includeIcon}>🧑‍🏫</span>
              <span><strong>{plan.staff_limit}</strong> staff</span>
            </div>
          )}
          {plan?.device_limit != null && (
            <div style={styles.includeItem}>
              <span style={styles.includeIcon}>📱</span>
              <span><strong>{plan.device_limit}</strong> tablets</span>
            </div>
          )}
          {features.slice(0, 4).map((f) => (
            <div key={f} style={styles.includeItem}>
              <span style={styles.includeIcon}>✓</span>
              <span>{titleize(f)}</span>
            </div>
          ))}
        </div>

        <div style={styles.divider} />

        {/* Invoice info */}
        <div style={styles.invoiceRow}>
          <span style={styles.invoiceLabel}>Invoice</span>
          <span style={styles.invoiceValue}>{invoice.invoice_number}</span>
        </div>
        <div style={styles.invoiceRow}>
          <span style={styles.invoiceLabel}>Due date</span>
          <span style={{ ...styles.invoiceValue, color: "#b45309", fontWeight: 700 }}>
            {dateShort(invoice.due_date)}
          </span>
        </div>
        <div style={styles.invoiceRow}>
          <span style={styles.invoiceLabel}>Amount due</span>
          <span style={{ ...styles.invoiceValue, fontSize: 18, fontWeight: 800, color: "#20343b" }}>
            {fmt(invoice.balance_due, currency)}
          </span>
        </div>

        <div style={styles.divider} />

        {/* CTA */}
        <button
          style={{ ...styles.primaryBtn, ...(paying ? styles.btnDisabled : {}) }}
          disabled={paying}
          onClick={payWithStripe}
        >
          {paying ? <><span style={styles.btnSpinner} /> Working…</> : "Pay with Stripe →"}
        </button>
        <p style={styles.stripeNote}>Secure payment via Stripe. Barbaari never stores card details.</p>

        <div style={styles.otherActions}>
          <button style={styles.ghostBtn} onClick={() => { clearSession(); location.href = "/login"; }}>Logout</button>
          <a href="mailto:support@barbaari.app" style={styles.ghostBtn}>Contact support</a>
        </div>

        {data?.test_payment_enabled === true && (
          <div style={styles.testingSection}>
            <button
              style={styles.testingLink}
              disabled={testing}
              onClick={testPayment}
            >
              {testing ? "Processing…" : "Local demo only: activate test payment"}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

// ─── Inline styles (self-contained, no CSS dependency) ────────────────────────

function iconCircle(type: "danger" | "info"): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 64,
    height: 64,
    borderRadius: "50%",
    fontSize: 26,
    marginBottom: 16,
    background: type === "danger" ? "#ffe1e1" : "#e4f4f8",
    color: type === "danger" ? "#b23a3a" : "#2a7b88",
  };
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100dvh",
    background: "linear-gradient(160deg, #eef8fb 0%, #f8fcfd 60%)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "max(24px, env(safe-area-inset-top)) 16px max(40px, env(safe-area-inset-bottom))",
    fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
    overflowX: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 28,
    width: "100%",
    maxWidth: 520,
  },
  brandMark: {
    width: 44,
    height: 44,
    borderRadius: 14,
    background: "#2a7b88",
    color: "white",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 900,
    fontSize: 22,
    flexShrink: 0,
  },
  headerEyebrow: { fontSize: 11, fontWeight: 900, color: "#2a7b88", textTransform: "uppercase", letterSpacing: "0.06em" },
  headerOrg: { fontSize: 16, fontWeight: 800, color: "#20343b" },
  loadingWrap: { display: "flex", flexDirection: "column", alignItems: "center", gap: 16, marginTop: 80 },
  spinner: {
    width: 36,
    height: 36,
    border: "3px solid #c9e2e8",
    borderTopColor: "#2a7b88",
    borderRadius: "50%",
    animation: "spin 0.7s linear infinite",
  },
  loadingText: { color: "#647a82", fontWeight: 700 },
  cancelBanner: {
    width: "100%",
    maxWidth: 520,
    marginBottom: 14,
    padding: "14px 16px",
    background: "#fff4ca",
    border: "1px solid #f4df8b",
    borderRadius: 16,
    color: "#9a6a09",
    fontWeight: 750,
    fontSize: 14,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  bannerClose: { background: "none", border: 0, cursor: "pointer", color: "#9a6a09", fontSize: 16, padding: 0, fontWeight: 900 },
  errorBanner: {
    width: "100%",
    maxWidth: 520,
    marginBottom: 14,
    padding: "14px 16px",
    background: "#ffe1e1",
    border: "1px solid #ffc8c8",
    borderRadius: 16,
    color: "#b23a3a",
    fontWeight: 750,
    fontSize: 14,
  },
  card: {
    width: "100%",
    maxWidth: 520,
    background: "white",
    borderRadius: 28,
    border: "1px solid #c9e2e8",
    boxShadow: "0 24px 60px rgba(42,123,136,.14)",
    padding: "clamp(22px, 5vw, 32px) clamp(18px, 5vw, 28px)",
    overflow: "hidden",
  },
  cardTop: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 20,
    flexWrap: "wrap",
  },
  planLabel: { fontSize: 11, fontWeight: 900, color: "#2a7b88", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 },
  planName: { margin: 0, fontSize: "clamp(22px, 6vw, 26px)", fontWeight: 900, color: "#20343b", fontFamily: "Quicksand, sans-serif", overflowWrap: "anywhere" },
  priceBadge: {
    display: "flex",
    alignItems: "baseline",
    gap: 2,
    background: "#eef8fb",
    border: "1px solid #c9e2e8",
    borderRadius: 16,
    padding: "8px 14px",
    flexShrink: 1,
    minWidth: 0,
  },
  priceAmount: { fontSize: "clamp(22px, 7vw, 28px)", fontWeight: 900, color: "#20343b", fontFamily: "Quicksand, sans-serif", overflowWrap: "anywhere" },
  pricePer: { fontSize: 14, color: "#647a82", fontWeight: 700 },
  divider: { height: 1, background: "#e7f1f4", margin: "20px 0" },
  includesGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px 16px" },
  includeItem: { display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700, color: "#20343b", minWidth: 0 },
  includeIcon: { fontSize: 16, width: 22, textAlign: "center", flexShrink: 0 },
  invoiceRow: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 8, flexWrap: "wrap" },
  invoiceLabel: { fontSize: 13, color: "#647a82", fontWeight: 700 },
  invoiceValue: { fontSize: 14, color: "#20343b", fontWeight: 750, overflowWrap: "anywhere" },
  primaryBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "100%",
    minHeight: 54,
    padding: "0 24px",
    borderRadius: 999,
    background: "#2a7b88",
    color: "white",
    fontWeight: 900,
    fontSize: 17,
    border: "none",
    cursor: "pointer",
    boxShadow: "0 10px 22px rgba(42,123,136,.26)",
    textDecoration: "none",
    marginTop: 4,
  },
  btnDisabled: { opacity: 0.6, cursor: "not-allowed" },
  btnSpinner: {
    width: 18,
    height: 18,
    border: "2px solid rgba(255,255,255,.4)",
    borderTopColor: "white",
    borderRadius: "50%",
    display: "inline-block",
    animation: "spin 0.7s linear infinite",
  },
  stripeNote: { textAlign: "center", fontSize: 12, color: "#94a3b8", marginTop: 10, marginBottom: 0 },
  otherActions: { display: "flex", justifyContent: "center", gap: 16, marginTop: 18, flexWrap: "wrap" },
  secondaryBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    minHeight: 48,
    padding: "0 20px",
    borderRadius: 999,
    background: "white",
    color: "#455a64",
    fontWeight: 800,
    fontSize: 15,
    border: "1px solid #c9e2e8",
    cursor: "pointer",
  },
  ghostBtn: {
    background: "none",
    border: "none",
    color: "#647a82",
    fontWeight: 750,
    fontSize: 14,
    cursor: "pointer",
    textDecoration: "underline",
    padding: "4px 0",
  },
  testingSection: { textAlign: "center", marginTop: 28, paddingTop: 20, borderTop: "1px dashed #e7f1f4" },
  testingLink: {
    background: "none",
    border: "none",
    color: "#94a3b8",
    fontSize: 12,
    cursor: "pointer",
    textDecoration: "underline",
    padding: 0,
  },
  actionsCol: { display: "flex", flexDirection: "column", gap: 12, alignItems: "stretch" },
  cardTitle: { margin: "0 0 8px", fontSize: 24, fontWeight: 900, color: "#20343b", fontFamily: "Quicksand, sans-serif" },
  cardSubtitle: { margin: 0, color: "#647a82", fontWeight: 700, lineHeight: 1.55 },
};
