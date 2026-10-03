import { useState } from "react";
import { Link } from "react-router-dom";
import { authApi, getApiError } from "@barbaari/shared";
import { Alert, AuthFrame, Field } from "@barbaari/shared/web/ui";

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
    <AuthFrame foot={<Link to="/login">Back to sign in</Link>}>
      <div>
        <h1>Reset your password</h1>
        <p className="bb-lede" style={{ marginTop: 8 }}>Enter your email and we’ll send you a reset link.</p>
      </div>
      {success ? <Alert tone="ok">{success}</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <form className="bb-auth-form" onSubmit={submit}>
        <Field label="Email" htmlFor="forgot-email"><input id="forgot-email" className="bb-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></Field>
        <button className="bb-btn bb-btn-primary bb-btn-lg bb-btn-block" disabled={loading}>{loading ? "Sending…" : "Send reset link"}</button>
      </form>
    </AuthFrame>
  );
}
