import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { authApi, getApiError } from "@barbaari/shared";

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") ?? "";
  const email = searchParams.get("email") ?? "";
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setSuccess(""); setLoading(true);
    try {
      const res = await authApi.resetPassword({ token, email, password, password_confirmation: confirmation });
      setSuccess(res.message);
      setTimeout(() => navigate("/login", { replace: true }), 2000);
    } catch (err) {
      setError(getApiError(err).message);
    } finally {
      setLoading(false);
    }
  }

  if (!token || !email) {
    return (
      <main className="auth-shell">
        <div className="auth-card">
          <div className="alert danger">Invalid reset link. Please request a new one.</div>
          <div className="auth-links"><Link to="/forgot-password">Request new link</Link></div>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-shell">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-brand">
          <div className="auth-mark">B</div>
          <div>
            <span>Password recovery</span>
            <h1>Set new password</h1>
            <p>Enter a new password for <strong className="wrap-anywhere">{email}</strong>.</p>
          </div>
        </div>
        <div className="auth-form">
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password (min 8 chars)" required minLength={8} />
          <input type="password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} placeholder="Confirm new password" required />
          <button className="primary" disabled={loading}>{loading ? "Resetting..." : "Reset password"}</button>
        </div>
        {success ? <div className="alert success">{success} Redirecting to login…</div> : null}
        {error ? <div className="alert danger">{error}</div> : null}
        <div className="auth-links"><Link to="/forgot-password">Request a new link</Link><Link to="/login">Back to login</Link></div>
      </form>
    </main>
  );
}
