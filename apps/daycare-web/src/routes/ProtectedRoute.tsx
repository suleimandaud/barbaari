import { useEffect, useState } from "react";
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
  const [status, setStatus] = useState<"checking" | "ready" | "denied" | "redirecting" | "pending" | "rejected" | "error">("checking");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("denied");
      return;
    }

    setBearerToken(token);
    authApi.me()
      .then(async ({ user }) => {
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
            // Allow the payment page and the post-payment success page through
            // regardless of subscription status. The success page calls
            // confirm-session itself to activate the subscription.
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
        clearSession();
        setError(getApiError(err).message);
        setStatus("error");
      });
  }, [token, location.pathname]);

  if (!token || status === "denied") return <Navigate to="/login" replace />;
  if (status === "checking" || status === "redirecting") return <main className="page"><LoadingState label="Checking session..." /></main>;
  if (status === "pending") return <ApprovalStatusScreen title="Application pending" message="Your application is still pending approval." showLogout />;
  if (status === "rejected") return <ApprovalStatusScreen title="Application not approved" message="Your application was not approved. Please contact support." showLogout />;
  if (status === "error") return <main className="page"><ErrorState message={error || "Session check failed."} onRetry={() => window.location.assign("/login")} /></main>;

  return <Outlet />;
}
