import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { daycarePlatformBillingApi } from "@barbaari/shared";
import { CheckCircle, WarningCircle } from "@phosphor-icons/react";
import { LogoTile } from "@barbaari/shared/web/ui";

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

  const frame = (content: React.ReactNode) => (
    <main className="bb-auth">
      <div className="bb-auth-card">
        <LogoTile size={56} />
        {content}
      </div>
    </main>
  );

  if (phase === "confirming") {
    return frame(
      <>
        <span className="bb-spinner" aria-hidden />
        <h1>Confirming payment…</h1>
        <p className="bb-lede" role="status">Activating your subscription, just a moment.</p>
      </>
    );
  }

  if (phase === "error") {
    return frame(
      <>
        <WarningCircle size={48} color="var(--bb-error)" aria-hidden />
        <h1>Payment confirmation failed</h1>
        <div className="bb-alert danger" role="alert"><div>{errorMsg}</div></div>
        <button className="bb-btn bb-btn-primary bb-btn-lg" onClick={() => navigate("/subscription-payment", { replace: true })}>Back to payment page</button>
        <p className="bb-caption">If you were charged, your subscription will activate automatically via webhook. You can also contact support at support@barbaari.app.</p>
      </>
    );
  }

  return frame(
    <>
      <CheckCircle size={48} color="var(--bb-success)" aria-hidden />
      <h1>You're all set</h1>
      <p className="bb-lede">Your Barbaari subscription is now active.</p>
      {plan ? (
        <div className="bb-alert ok">
          <div>
            <strong>{plan.name} plan is active</strong>
            {subscription?.current_period_end ? <p>Next billing: {new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(new Date(subscription.current_period_end))}</p> : null}
          </div>
        </div>
      ) : null}
      <button className="bb-btn bb-btn-primary bb-btn-lg" onClick={() => window.location.assign("/")}>Go to dashboard</button>
      <p className="bb-caption" role="status">Redirecting in {countdown}…</p>
    </>
  );
}
