import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Key, PaperPlaneTilt, Warning } from "@phosphor-icons/react";
import { classroomsApi, getApiError, staffApi } from "@barbaari/shared";
import { Alert, Avatar, ErrorState, LoadingState, SectionHead, StatusBadge, shortDate, useToast } from "@barbaari/shared/web/ui";
import { accountStatuses } from "@barbaari/shared/web/status";
import { PinDialog } from "../components/PinDialog";
import { useAsyncData } from "../hooks/useAsyncData";
import { friendlyError } from "../utils/labels";
import { userId } from "./StaffPage";
import { StaffForm, blankStaff, staffPayload, staffRoleLabel, type StaffFormValues } from "./staffShared";

export function StaffMemberPage() {
  const { staffUserId = "" } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { data, loading, error, reload } = useAsyncData(async () => {
    const [staff, classrooms] = await Promise.all([staffApi.list(), classroomsApi.list()]);
    return { row: (staff.staff ?? []).find((item: any) => String(userId(item)) === String(staffUserId)) ?? null, classrooms: classrooms.classrooms ?? [] };
  }, [staffUserId]);
  const [form, setForm] = useState<StaffFormValues>(blankStaff);
  const [pinOpen, setPinOpen] = useState(false);
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);
  const row = data?.row;

  useEffect(() => {
    if (!row) return;
    setForm({
      name: row.user?.name ?? "",
      email: row.user?.email ?? "",
      phone: row.user?.phone ?? "",
      role: row.user?.role ?? "teacher",
      classroom_id: row.classroom?.id ? String(row.classroom.id) : "",
      title: row.title ?? "",
      status: row.user?.status ?? "active",
      pin: "",
    });
  }, [row]);

  async function action(message: string, run: () => Promise<unknown>) {
    setActionError("");
    setSaving(true);
    try {
      await run();
      toast(message);
      await reload();
    } catch (err) {
      setActionError(friendlyError(getApiError(err).message));
    } finally {
      setSaving(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    await action("Staff member updated.", () => staffApi.update(userId(row), staffPayload(form)));
  }

  if (loading && !data) return <main className="bb-page"><LoadingState /></main>;
  if (error || !row) return <main className="bb-page"><button className="bb-back" onClick={() => navigate("/staff")}><ArrowLeft size={16} />Staff access</button><ErrorState message={error || "This staff member could not be found."} onRetry={reload} /></main>;

  const status = String(row.user?.status ?? "active");
  const id = userId(row);

  return (
    <main className="bb-page">
      <button type="button" className="bb-back" onClick={() => navigate("/staff")}><ArrowLeft size={16} />Staff access</button>
      <header className="bb-record-head">
        <Avatar name={row.user?.name} seed={id} size={104} />
        <div className="bb-record-id">
          <h1>{row.user?.name}</h1>
          <p>{[staffRoleLabel(row.user?.role), row.title, row.classroom?.name].filter(Boolean).join(" · ")}</p>
          <div className="bb-row"><StatusBadge map={accountStatuses} value={status} label={status === "pending_invite" && row.user?.updated_at ? `Invite pending · updated ${shortDate(row.user.updated_at, { weekday: "short", day: "numeric", month: "short" })}` : undefined} /></div>
        </div>
        <div className="bb-actions">
          {status === "active"
            ? <button className="bb-btn bb-btn-secondary bb-btn-lg" disabled={saving} onClick={() => action("Staff deactivated.", () => staffApi.deactivate(id))}>Deactivate</button>
            : <button className="bb-btn bb-btn-secondary bb-btn-lg" disabled={saving} onClick={() => action("Staff activated.", () => staffApi.activate(id))}>Activate</button>}
          <button className="bb-btn bb-btn-primary bb-btn-lg" disabled={saving} onClick={() => action("Staff invitation email queued.", () => staffApi.sendInvite(id))}><PaperPlaneTilt />{status === "pending_invite" ? "Resend invite" : "Send invite"}</button>
        </div>
      </header>
      {actionError ? <Alert tone="danger">{actionError}</Alert> : null}

      <div className="bb-grid-main-side" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(320px, 520px)" }}>
        <div>
          <section className="bb-section" style={{ marginBottom: 40 }}>
            <SectionHead title="Contact" />
            <dl className="bb-kv"><dt>Email</dt><dd>{row.user?.email}</dd><dt>Phone</dt><dd>{row.user?.phone ?? "—"}</dd></dl>
          </section>
          <section className="bb-section" style={{ marginBottom: 40 }}>
            <SectionHead title="Role & access" />
            <dl className="bb-kv">
              <dt>Role</dt><dd>{staffRoleLabel(row.user?.role)}</dd>
              <dt>Classroom</dt><dd>{row.classroom ? `${row.classroom.name}${row.classroom.capacity ? ` · capacity ${row.classroom.capacity}` : ""}` : "Unassigned"}</dd>
              <dt>Job title</dt><dd>{row.title ?? "—"}</dd>
              <dt>Account</dt><dd>{status === "pending_invite" ? `Waiting for ${String(row.user?.name ?? "").split(" ")[0]} to set a password` : status === "active" ? "Active · can sign in" : "Can’t sign in"}</dd>
            </dl>
          </section>
          <section className="bb-section" style={{ marginBottom: 40 }}>
            <SectionHead title="Tablet PIN" />
            <div className="bb-list-row" style={{ borderBottom: 0 }}>
              <Key size={22} color="var(--bb-accent)" />
              <p className="grow">Set or replace the 4–8 digit PIN this person uses to unlock tablet mode.</p>
              <button className="bb-btn bb-btn-secondary" onClick={() => setPinOpen(true)}>Set PIN</button>
            </div>
          </section>
          <section className="bb-section">
            <SectionHead title="Password" />
            <div className="bb-list-row" style={{ borderBottom: 0 }}>
              {status !== "active" ? <Warning size={22} color="var(--bb-warning)" /> : null}
              <p className="grow">{status === "active" ? "Email a secure link so they can choose a new password." : "A reset email can be sent once the account is active."}</p>
              <button className="bb-btn bb-btn-secondary" disabled={status !== "active" || saving} onClick={() => action("Staff reset email queued.", () => staffApi.sendPasswordReset(id))}>Send reset email</button>
            </div>
          </section>
        </div>
        <aside className="bb-panel">
          <h3>Edit details</h3>
          <StaffForm id="edit-staff" editing form={form} setForm={setForm} classrooms={data?.classrooms ?? []} onSubmit={submit} />
          <div className="bb-row" style={{ justifyContent: "flex-end", marginTop: 25 }}>
            <button className="bb-btn bb-btn-ghost" type="button" onClick={() => navigate("/staff")}>Cancel</button>
            <button className="bb-btn bb-btn-primary bb-btn-lg" form="edit-staff" disabled={saving}>{saving ? "Saving…" : "Update staff"}</button>
          </div>
        </aside>
      </div>

      {pinOpen ? (
        <PinDialog title={`Set tablet PIN · ${row.user?.name}`} description="Used to unlock tablet mode. It replaces any existing PIN." onClose={() => setPinOpen(false)} onSave={async (next) => {
          try {
            await staffApi.resetPin(id, next);
            toast("Staff PIN reset.");
            setPinOpen(false);
            await reload();
          } catch (err) {
            throw new Error(friendlyError(getApiError(err).message));
          }
        }} />
      ) : null}
    </main>
  );
}
