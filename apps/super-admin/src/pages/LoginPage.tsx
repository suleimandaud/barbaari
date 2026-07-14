import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getApiError } from "@barbaari/shared";
import { Badge } from "../components/Ui";
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
    <main className="auth-shell">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-brand">
          <div className="auth-mark">B</div>
          <div>
            <span>Barbaari</span>
            <h1>Platform admin sign in</h1>
            <p>Manage organizations, platform billing, users, and operational oversight.</p>
          </div>
        </div>
        <div className="auth-form">
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email address" required autoComplete="email" />
          <input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" type="password" required autoComplete="current-password" />
          <button className="primary" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</button>
          <div className="auth-links"><Link to="/forgot-password">Forgot password?</Link></div>
        </div>
        {error ? <Badge tone="danger">{error}</Badge> : null}
      </form>
    </main>
  );
}
