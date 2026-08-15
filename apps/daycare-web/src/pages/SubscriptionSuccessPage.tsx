import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { daycarePlatformBillingApi } from "@barbaari/shared";

const REDIRECT_SECONDS = 5;

type Phase = "confirming" | "success" | "error";

export function SubscriptionSuccessPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const isTest = searchParams.get("test") === "1";

  // A missing session_id is only ever expected for the explicit test-payment path
  // (?test=1). Any other way of landing here without one — a stale bookmark, a broken
  // redirect, a manually-edited URL — must not claim success without ever confirming
  // anything with the backend.
  const initialPhase: Phase = isTest ? "success" : sessionId ? "confirming" : "error";
  const [phase, setPhase] = useState<Phase>(initialPhase);
  const [errorMsg, setErrorMsg] = useState(
    initialPhase === "error" ? "We couldn't find your payment session. If you completed checkout, please check your subscription status or contact support." : ""
  );
  const [subscription, setSubscription] = useState<any>(null);
  const [countdown, setCountdown] = useState(REDIRECT_SECONDS);

  const confirmedRef = useRef(false);

  // Step 1: If we have a real session_id, confirm payment with the backend.
  // This activates the subscription without needing a webhook.
  useEffect(() => {
    if (!sessionId || isTest || confirmedRef.current) return;
    confirmedRef.current = true;

    daycarePlatformBillingApi
      .confirmStripeSession(sessionId)
      .then((res) => {
        setSubscription(res.subscription);
        setPhase("success");
      })
      .catch((err) => {
        const msg: string =
          err?.response?.data?.message ??
          err?.message ??
          "Could not confirm your payment. Please contact support.";
        setErrorMsg(msg);
        setPhase("error");
      });
  }, [sessionId]);

  // Step 2: For test payments or after confirmation, fetch subscription details
  // to display plan info.
  useEffect(() => {
    if (phase !== "success" || subscription) return;
    daycarePlatformBillingApi
      .subscription()
      .then((res) => setSubscription(res.subscription))
      .catch(() => {/* non-critical — we still show success */});
  }, [phase]);

  // Step 3: Start countdown once we are in success phase.
  // Use window.location.assign (hard reload) so ProtectedRoute starts completely
  // fresh — it re-fetches subscription status from the DB and sees the active state.
  useEffect(() => {
    if (phase !== "success") return;
    const interval = setInterval(() => {
      setCountdown((n) => {
        if (n <= 1) {
          clearInterval(interval);
          window.location.assign("/");
          return 0;
        }
        return n - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [phase]);

  const plan = subscription?.pricing_plan;

  if (phase === "confirming") {
    return (
      <main style={page}>
        <div style={card}>
          <div style={spinnerWrap}>
            <div style={spinner} />
          </div>
          <h1 style={title}>Confirming payment…</h1>
          <p style={subtitle}>Activating your subscription, just a moment.</p>
        </div>
      </main>
    );
  }

  if (phase === "error") {
    return (
      <main style={page}>
        <div style={card}>
          <div style={warningCircle}>!</div>
          <h1 style={title}>Payment confirmation failed</h1>
          <p style={{ ...subtitle, color: "#b23a3a" }}>{errorMsg}</p>
          <button style={dashBtn} onClick={() => navigate("/subscription-payment", { replace: true })}>
            Back to payment page
          </button>
          <p style={smallNote}>
            If you were charged, your subscription will activate automatically via webhook. You can also{" "}
            <a href="mailto:support@barbaari.app" style={{ color: "#2a7b88" }}>contact support</a>.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main style={page}>
      <div style={card}>
        <div style={checkCircle}>✓</div>
        <h1 style={title}>You're all set!</h1>
        <p style={subtitle}>Your Barbaari subscription is now active.</p>

        {plan && (
          <div style={planBox}>
            <div style={planLabel}>Active plan</div>
            <div style={planName}>{plan.name}</div>
            {subscription?.current_period_end && (
              <div style={planMeta}>
                Next billing:{" "}
                {new Intl.DateTimeFormat("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                }).format(new Date(subscription.current_period_end))}
              </div>
            )}
          </div>
        )}

        <button style={dashBtn} onClick={() => window.location.assign("/")}>
          Go to Dashboard →
        </button>
        <p style={countdownText}>Redirecting in {countdown}…</p>
      </div>
    </main>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const page: React.CSSProperties = {
  minHeight: "100vh",
  background: "linear-gradient(160deg, #eef8fb 0%, #f8fcfd 60%)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "32px 16px",
  fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
};
const card: React.CSSProperties = {
  width: "100%",
  maxWidth: 460,
  background: "white",
  borderRadius: 28,
  border: "1px solid #c9e2e8",
  boxShadow: "0 24px 60px rgba(42,123,136,.14)",
  padding: "40px 32px",
  textAlign: "center",
};
const spinnerWrap: React.CSSProperties = {
  display: "flex",
  justifyContent: "center",
  marginBottom: 24,
};
const spinner: React.CSSProperties = {
  width: 52,
  height: 52,
  border: "4px solid #c9e2e8",
  borderTopColor: "#2a7b88",
  borderRadius: "50%",
  animation: "spin 0.8s linear infinite",
};
const checkCircle: React.CSSProperties = {
  width: 72,
  height: 72,
  borderRadius: "50%",
  background: "#dcf6eb",
  color: "#1d805a",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 32,
  fontWeight: 900,
  marginBottom: 20,
};
const warningCircle: React.CSSProperties = {
  width: 72,
  height: 72,
  borderRadius: "50%",
  background: "#ffe1e1",
  color: "#b23a3a",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 32,
  fontWeight: 900,
  marginBottom: 20,
  margin: "0 auto 20px",
};
const title: React.CSSProperties = {
  margin: "0 0 8px",
  fontSize: 28,
  fontWeight: 900,
  color: "#20343b",
  fontFamily: "Quicksand, sans-serif",
};
const subtitle: React.CSSProperties = {
  margin: "0 0 24px",
  color: "#647a82",
  fontWeight: 700,
  lineHeight: 1.55,
  fontSize: 15,
};
const planBox: React.CSSProperties = {
  background: "#eef8fb",
  border: "1px solid #c9e2e8",
  borderRadius: 16,
  padding: "14px 18px",
  marginBottom: 24,
  textAlign: "left",
};
const planLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 900,
  color: "#2a7b88",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  marginBottom: 4,
};
const planName: React.CSSProperties = { fontSize: 18, fontWeight: 800, color: "#20343b", marginBottom: 4 };
const planMeta: React.CSSProperties = { fontSize: 13, color: "#647a82", fontWeight: 700 };
const dashBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "100%",
  minHeight: 52,
  padding: "0 24px",
  borderRadius: 999,
  background: "#2a7b88",
  color: "white",
  fontWeight: 900,
  fontSize: 17,
  border: "none",
  cursor: "pointer",
  boxShadow: "0 10px 22px rgba(42,123,136,.26)",
  marginBottom: 14,
};
const countdownText: React.CSSProperties = { margin: 0, fontSize: 13, color: "#94a3b8", fontWeight: 700 };
const smallNote: React.CSSProperties = { margin: "16px 0 0", fontSize: 12, color: "#94a3b8", lineHeight: 1.5 };
