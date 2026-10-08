import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getApiError } from "@barbaari/shared";
import { Alert, AuthFrame, Field, PasswordInput } from "@barbaari/shared/web/ui";
import { getStoredEmail, login } from "../services/auth";

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState(getStoredEmail());
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => { document.title = "Sign in | Barbaari"; }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email.trim(), password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(getApiError(err).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthFrame foot={<><span>New daycare? <Link to="/register">Register your organization</Link></span><Link to="/privacy-policy">Privacy Policy</Link></>}>
      <div>
        <h1>Welcome to Barbaari</h1>
        <p className="bb-lede" style={{ marginTop: 8 }}>Sign in to your daycare.</p>
      </div>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <form className="bb-auth-form" onSubmit={submit}>
        <Field label="Email" htmlFor="login-email"><input id="login-email" className="bb-input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" /></Field>
        <Field label="Password" htmlFor="login-password" labelAction={<Link to="/forgot-password">Forgot password?</Link>}>
          <PasswordInput id="login-password" value={password} onChange={setPassword} autoComplete="current-password" />
        </Field>
        <button className="bb-btn bb-btn-primary bb-btn-lg bb-btn-block" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</button>
      </form>
    </AuthFrame>
  );
}
