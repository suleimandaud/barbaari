import { useEffect, useRef, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { authApi, getApiError, setBearerToken } from "@barbaari/shared";
import { clearSession, getStoredToken } from "../services/auth";
import { ErrorState, LoadingState } from "../components/Ui";

export function ProtectedRoute() {
  const token = getStoredToken();
  const [status, setStatus] = useState<"checking" | "ready" | "denied" | "connection_error">(token ? "checking" : "denied");
  const [error, setError] = useState("");
  const [retryTick, setRetryTick] = useState(0);
  const [user, setUser] = useState<any | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!token) {
      setStatus("denied");
      return;
    }
    const requestId = ++requestIdRef.current;
    const isStale = () => requestId !== requestIdRef.current;

    setBearerToken(token);
    setStatus((current) => (current === "ready" ? current : "checking"));
    authApi.me()
      .then(({ user }) => {
        if (isStale()) return;
        if (user.role === "super_admin") {
          setUser(user);
          setStatus("ready");
        } else {
          clearSession();
          setStatus("denied");
        }
      })
      .catch((err) => {
        if (isStale()) return;
        const apiError = getApiError(err);
        // Only a genuine auth failure should log the user out — a network blip or
        // server error while checking the session doesn't mean the token is invalid.
        if (apiError.status === 401 || apiError.status === 403) {
          clearSession();
          setStatus("denied");
        } else {
          setError(apiError.message);
          setStatus("connection_error");
        }
      });
  }, [token, retryTick]);

  if (status === "denied") return <Navigate to="/login" replace />;
  if (status === "checking") return <main className="bb-page"><LoadingState /></main>;
  if (status === "connection_error") return <main className="bb-page"><ErrorState message={error || "We couldn't reach the server."} onRetry={() => setRetryTick((tick) => tick + 1)} /></main>;
  // The layout reads the signed-in user from here instead of calling the rate-limited /auth/me again.
  return <Outlet context={{ user }} />;
}
