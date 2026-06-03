import { Navigate, Outlet } from "react-router-dom";
import { setBearerToken } from "@barbaari/shared";
import { getStoredToken } from "../services/auth";

export function ProtectedRoute() {
  const token = getStoredToken();
  if (!token) return <Navigate to="/login" replace />;
  setBearerToken(token);
  return <Outlet />;
}
