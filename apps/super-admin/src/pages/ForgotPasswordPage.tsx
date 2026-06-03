import { useState } from "react";
import { Link } from "react-router-dom";
import { authApi, getApiError } from "@barbaari/shared";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setSuccess(""); setLoading(true);
    try {
      const res = await authApi.forgotPassword(email);
      setSuccess(res.message);
    } catch (err) {
      setError(getApiError(err).message);
    } finally { setLoading(false); }
  }

  return (
    <main className="auth-shell">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-brand">
          <div className="auth-mark">B</div>
          <div>
            <span>Password recovery</span>
            <h1>Forgot password</h1>
            <p>Enter your platform admin email to receive a reset link.</p>
          </div>
        </div>
        <div className="auth-form">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" required />
          <button className="primary" disabled={loading}>{loading ? "Sending..." : "Send reset link"}</button>
          <div className="auth-links"><Link to="/login">Back to login</Link></div>
        </div>
        {success ? <div className="alert success">{success}</div> : null}
        {error ? <div className="alert danger">{error}</div> : null}
      </form>
    </main>
  );
}
