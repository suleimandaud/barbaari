import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getApiError, invitationApi } from "@barbaari/shared";
import { Badge, ErrorState, LoadingState } from "../components/Status";

function titleize(value?: string | null) {
  return String(value ?? "").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function AcceptInvitePage() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const [invitation, setInvitation] = useState<any | null>(null);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    invitationApi.get(token).then((response) => setInvitation(response.invitation)).catch((err) => setError(getApiError(err).message)).finally(() => setLoading(false));
  }, [token]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setSaving(true);
    try {
      const response = await invitationApi.accept(token, { password, password_confirmation: confirmation });
      setSuccess(response.message);
      window.setTimeout(() => navigate("/login"), 1200);
    } catch (err) {
      setError(getApiError(err).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <main className="auth-shell"><div className="auth-card"><LoadingState label="Loading invitation..." /></div></main>;
  if (error && !invitation) return <main className="auth-shell"><div className="auth-card"><div className="auth-brand"><div className="auth-mark">B</div><div><span>Barbaari invitation</span><h1>Invitation unavailable</h1><p>This invite may be invalid, expired, canceled, or already accepted.</p></div></div><ErrorState message={error} /><div className="auth-links"><Link to="/login">Back to login</Link></div></div></main>;

  return <main className="auth-shell">
    <form className="auth-card" onSubmit={submit}>
      <div className="auth-brand">
        <div className="auth-mark">B</div>
        <div>
          <span>Barbaari invitation</span>
          <h1>Set up your account</h1>
          <p>Create your password to join <strong>{invitation?.organization_name ?? "your daycare organization"}</strong>.</p>
        </div>
      </div>
      <div className="auth-meta-grid">
        <div className="readonly-field"><span>Email</span><strong>{invitation?.email}</strong></div>
        <div className="readonly-field"><span>Role</span><strong>{titleize(invitation?.role)}</strong></div>
      </div>
      <div className="auth-form">
        <Badge tone={invitation?.status === "pending" ? "warning" : "success"}>{titleize(invitation?.status)}</Badge>
        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="New password" required />
        <input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="Confirm password" required />
        <button className="primary" disabled={saving || invitation?.status !== "pending"}>{saving ? "Saving..." : "Accept invitation"}</button>
        {success ? <div className="alert success">{success} <Link to="/login">Go to login</Link></div> : null}
        {error ? <div className="alert danger">{error}</div> : null}
      </div>
    </form>
  </main>;
}
