import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { authApi, getApiError } from "@barbaari/shared";
import { Alert, AuthFrame, Field, PasswordChecklist, PasswordInput } from "@barbaari/shared/web/ui";

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
      <AuthFrame foot={<Link to="/login">Back to sign in</Link>}>
        <h1>This link doesn’t work</h1>
        <Alert tone="danger">Invalid reset link. Please request a new one.</Alert>
        <Link className="bb-btn bb-btn-primary bb-btn-lg bb-btn-block" to="/forgot-password">Request a new link</Link>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame foot={<><Link to="/login">Back to sign in</Link><Link to="/forgot-password">Request a new link</Link></>}>
      <div>
        <h1>Choose a new password</h1>
        <p className="bb-lede" style={{ marginTop: 8, overflowWrap: "anywhere" }}>For {email}</p>
      </div>
      {success ? <Alert tone="ok">{success} Redirecting to sign in…</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <form className="bb-auth-form" onSubmit={submit}>
        <Field label="New password" htmlFor="reset-password"><PasswordInput id="reset-password" value={password} onChange={setPassword} autoComplete="new-password" minLength={8} /></Field>
        <Field label="Confirm password" htmlFor="reset-confirm"><PasswordInput id="reset-confirm" value={confirmation} onChange={setConfirmation} autoComplete="new-password" /></Field>
        <PasswordChecklist password={password} confirmation={confirmation} />
        <button className="bb-btn bb-btn-primary bb-btn-lg bb-btn-block" disabled={loading}>{loading ? "Saving…" : "Save password"}</button>
      </form>
    </AuthFrame>
  );
}
