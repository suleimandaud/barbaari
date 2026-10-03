import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getApiError, invitationApi } from "@barbaari/shared";
import { Alert, AuthFrame, Field, LoadingState, PasswordChecklist, PasswordInput, StatusBadge, roleLabel } from "@barbaari/shared/web/ui";
import { accountStatuses } from "@barbaari/shared/web/status";

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

  if (loading) return <AuthFrame><LoadingState rows={3} label="Loading invitation" /></AuthFrame>;
  if (error && !invitation) {
    return (
      <AuthFrame foot={<Link to="/login">Back to sign in</Link>}>
        <div>
          <h1>Invitation unavailable</h1>
          <p className="bb-lede" style={{ marginTop: 8 }}>This invite may be invalid, expired, canceled, or already accepted.</p>
        </div>
        <Alert tone="danger">{error}</Alert>
      </AuthFrame>
    );
  }

  const pending = invitation?.status === "pending";
  return (
    <AuthFrame foot={<span className="bb-caption">This invitation is for {invitation?.email}{invitation?.expires_at ? ` and expires on ${new Date(invitation.expires_at).toLocaleDateString(undefined, { day: "numeric", month: "long" })}` : ""}.</span>}>
      <div>
        <h1>You’re invited to {invitation?.organization_name ?? "your daycare"}</h1>
        <p className="bb-lede" style={{ marginTop: 8 }}>You’ve been added as a <strong>{roleLabel(invitation?.role)}</strong>. Create a password to join.</p>
      </div>
      {!pending ? <StatusBadge map={accountStatuses} value={invitation?.status} label={String(invitation?.status ?? "").replace(/_/g, " ").replace(/^\w/, (letter) => letter.toUpperCase())} /> : null}
      {success ? <Alert tone="ok">{success} <Link to="/login">Go to sign in</Link></Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <form className="bb-auth-form" onSubmit={submit}>
        <Field label="Create a password" htmlFor="invite-password"><PasswordInput id="invite-password" value={password} onChange={setPassword} autoComplete="new-password" placeholder="At least 8 characters" /></Field>
        <Field label="Confirm password" htmlFor="invite-confirm"><PasswordInput id="invite-confirm" value={confirmation} onChange={setConfirmation} autoComplete="new-password" /></Field>
        <PasswordChecklist password={password} confirmation={confirmation} />
        <button className="bb-btn bb-btn-primary bb-btn-lg bb-btn-block" disabled={saving || !pending}>{saving ? "Saving…" : "Accept and continue"}</button>
      </form>
    </AuthFrame>
  );
}
