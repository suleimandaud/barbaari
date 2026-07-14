import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { authApi, setBearerToken } from "@barbaari/shared";
import { clearSession, getStoredToken } from "../services/auth";

export function ProtectedRoute() {
  const token = getStoredToken();
  const [status, setStatus] = useState<"checking" | "ready" | "denied">(token ? "checking" : "denied");

  useEffect(() => {
    if (!token) {
      setStatus("denied");
      return;
    }
    setBearerToken(token);
    authApi.me()
      .then(({ user }) => {
        if (user.role === "super_admin") setStatus("ready");
        else {
          clearSession();
          setStatus("denied");
        }
      })
      .catch(() => {
        clearSession();
        setStatus("denied");
      });
  }, [token]);

  if (status === "denied") return <Navigate to="/login" replace />;
  if (status === "checking") return <main className="page"><p>Checking session…</p></main>;
  return <Outlet />;
}
