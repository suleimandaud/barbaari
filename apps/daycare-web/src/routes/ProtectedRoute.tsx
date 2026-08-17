import { useEffect, useRef, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { authApi, daycarePlatformBillingApi, getApiError, setBearerToken } from "@barbaari/shared";
import { clearSession, getStoredToken } from "../services/auth";
import { ErrorState, LoadingState } from "../components/Status";

function ApprovalStatusScreen({ title, message, showLogout = false }: { title: string; message: string; showLogout?: boolean }) {
  return (
    <main className="page">
      <section className="panel">
        <div className="panel-header">
          <h2>{title}</h2>
          {showLogout ? <button className="secondary" onClick={() => { clearSession(); window.location.assign("/login"); }}>Logout</button> : null}
        </div>
        <p>{message}</p>
      </section>
    </main>
  );
}

export function ProtectedRoute() {
  const token = getStoredToken();
  const location = useLocation();
  const [status, setStatus] = useState<"checking" | "ready" | "denied" | "redirecting" | "pending" | "rejected" | "error" | "connection_error">("checking");
  const [error, setError] = useState("");
  const [retryTick, setRetryTick] = useState(0);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!token) {
      setStatus("denied");
      return;
    }

    const requestId = ++requestIdRef.current;
    // This intentionally depends only on [token, retryTick] — NOT location.pathname.
    // /auth/me sits behind the `auth` rate limiter (10/min per IP, sized for
    // login-attempt abuse, not a per-navigation session check); this effect used to
    // depend on the pathname too "so the payment-gate redirect stays accurate as the
    // user moves around", which meant clicking through a handful of pages in one
    // session could trip that limiter. Every route into this component is already a
    // fresh mount (login navigates here for the first time; logout and the
    // post-payment success page both hard-reload via window.location, not a
    // client-side nav) or an explicit retry, so establishing the session once here is
    // enough — see the effect below for how the subscription/payment gate still stays
    // accurate without re-calling /auth/me.
    const isStale = () => requestId !== requestIdRef.current;

    setBearerToken(token);
    setStatus((current) => (current === "ready" ? current : "checking"));
    authApi.me()
      .then(async ({ user }) => {
        if (isStale()) return;
        if (["daycare_admin", "manager", "billing_manager"].includes(user.role)) {
          if (user.application_status === "pending" || user.status === "pending_approval") {
            setStatus("pending");
            return;
          }
          if (user.application_status === "rejected" || user.status === "rejected") {
            setStatus("rejected");
            return;
          }
          if (["daycare_admin", "manager"].includes(user.role)) {
            const billing = await daycarePlatformBillingApi.subscription();
            if (isStale()) return;
            // Allow the payment page and the post-payment success page through
            // regardless of subscription status. The success page calls
            // confirm-session itself to activate the subscription, then does a hard
            // reload back to "/" once it has — which re-mounts this component and
            // re-runs this exact check against the now-active subscription, so a
            // renewal correctly lands the user back on a working dashboard without
            // needing a second effect keyed on navigation.
            const paymentExempt = location.pathname === "/subscription-payment"
              || location.pathname.startsWith("/subscription/success");
            if (billing.requires_payment && !paymentExempt) {
              setStatus("redirecting");
              window.location.assign("/subscription-payment");
              return;
            }
          }
          setStatus("ready");
        } else {
          clearSession();
          setError("This account does not have access to the daycare web app.");
          setStatus("error");
        }
      })
      .catch((err) => {
        if (isStale()) return;
        const apiError = getApiError(err);
        // Only a genuine auth failure (expired/invalid token, forbidden) should log the
        // user out. A network blip, timeout, or server error while merely *checking* the
        // session must not — the token may still be perfectly valid; force-logging-out
        // on every transient failure would boot users off a flaky connection repeatedly.
        if (apiError.status === 401 || apiError.status === 403) {
          clearSession();
          setError(apiError.message);
          setStatus("error");
        } else {
          setError(apiError.message);
          setStatus("connection_error");
        }
      });
  }, [token, retryTick]);

  if (!token || status === "denied") return <Navigate to="/login" replace />;
  if (status === "checking" || status === "redirecting") return <main className="page"><LoadingState label="Checking session..." /></main>;
  if (status === "pending") return <ApprovalStatusScreen title="Application pending" message="Your application is still pending approval." showLogout />;
  if (status === "rejected") return <ApprovalStatusScreen title="Application not approved" message="Your application was not approved. Please contact support." showLogout />;
  if (status === "error") return <main className="page"><ErrorState message={error || "Session check failed."} onRetry={() => window.location.assign("/login")} /></main>;
  if (status === "connection_error") return <main className="page"><ErrorState message={error || "We couldn't reach the server."} onRetry={() => setRetryTick((tick) => tick + 1)} /></main>;

  return <Outlet />;
}
