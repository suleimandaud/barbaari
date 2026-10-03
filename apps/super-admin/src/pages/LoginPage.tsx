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
  useEffect(() => { document.title = "Sign in | Barbaari Admin"; }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email.trim(), password);
      navigate("/");
    } catch (err) {
      setError(getApiError(err).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthFrame>
      <div>
        <h1>Barbaari platform admin</h1>
        <p className="bb-lede" style={{ marginTop: 8 }}>Manage organizations, platform billing, users and operational oversight.</p>
      </div>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <form className="bb-auth-form" onSubmit={submit}>
        <Field label="Email" htmlFor="admin-email"><input id="admin-email" className="bb-input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" /></Field>
        <Field label="Password" htmlFor="admin-password" labelAction={<Link to="/forgot-password">Forgot password?</Link>}>
          <PasswordInput id="admin-password" value={password} onChange={setPassword} autoComplete="current-password" />
        </Field>
        <button className="bb-btn bb-btn-primary bb-btn-lg bb-btn-block" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</button>
      </form>
    </AuthFrame>
  );
}
