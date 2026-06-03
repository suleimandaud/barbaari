import type { FormEvent } from "react";
import { useState } from "react";
import { classroomsApi, getApiError, staffApi } from "@barbaari/shared";
import { ErrorAlert, SuccessAlert } from "../components/Alerts";
import { DataTable } from "../components/DataTable";
import { PageHeader, Panel } from "../components/Page";
import { Badge, ErrorState, LoadingState } from "../components/Status";
import { useAsyncData } from "../hooks/useAsyncData";
import { friendlyError } from "../utils/labels";

const blank = { name: "", email: "", phone: "", role: "teacher", classroom_id: "", title: "", status: "active", pin: "" };
const roles = [
  ["teacher", "Teacher"],
  ["staff", "Staff"],
  ["manager", "Manager"],
  ["billing_manager", "Billing manager"],
];

function userId(row: any) {
  return row.user?.id ?? row.user_id;
}

function roleLabel(role?: string) {
  return roles.find(([value]) => value === role)?.[1] ?? String(role ?? "Staff").replace(/_/g, " ");
}

export function StaffPage() {
  const { data, loading, error, reload } = useAsyncData(async () => {
    const [staff, classrooms] = await Promise.all([staffApi.list(), classroomsApi.list()]);
    return { staff: staff.staff, classrooms: classrooms.classrooms };
  }, []);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState<any | null>(null);
  const [success, setSuccess] = useState("");
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);

  function startEdit(row: any) {
    setEditing(row);
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
  }

  function resetForm() {
    setEditing(null);
    setForm(blank);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setSuccess("");
    setActionError("");
    try {
      const payload = {
        name: form.name,
        email: form.email,
        phone: form.phone || undefined,
        role: form.role,
        classroom_id: form.classroom_id || null,
        title: form.title || undefined,
        status: form.status,
        pin: form.pin || undefined,
      };
      if (editing) {
        await staffApi.update(userId(editing), payload);
        setSuccess("Staff member updated.");
      } else {
        await staffApi.create(payload);
        setSuccess("Staff member created. Invitation email queued so they can set their password.");
      }
      resetForm();
      await reload();
    } catch (err) {
      setActionError(friendlyError(getApiError(err).message));
    } finally {
      setSaving(false);
    }
  }

  async function action(message: string, run: () => Promise<unknown>) {
    setSuccess("");
    setActionError("");
    try {
      await run();
      setSuccess(message);
      await reload();
    } catch (err) {
      setActionError(friendlyError(getApiError(err).message));
    }
  }

  function resetPin(row: any) {
    const pin = window.prompt("Enter a new 4-8 digit staff PIN for tablet mode.");
    if (!pin) return;
    if (!/^\d{4,8}$/.test(pin)) {
      setActionError("PIN must be 4-8 digits.");
      return;
    }
    action("Staff PIN reset.", () => staffApi.resetPin(userId(row), pin));
  }

  return (
    <section className="page">
      <PageHeader eyebrow="Team" title="Users & Staff" description="Create staff, assign classrooms, update roles, and manage staff PINs for the daycare." />
      <SuccessAlert message={success} />
      <ErrorAlert message={actionError} />
      <Panel title={editing ? "Edit staff member" : "Add staff member"}>
        <form className="form-grid" onSubmit={submit}>
          <label className="field-stack"><span>Name</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
          <label className="field-stack"><span>Email</span><input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></label>
          <label className="field-stack"><span>Phone</span><input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
          <label className="field-stack"><span>Role</span><select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>{roles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="field-stack"><span>Classroom</span><select value={form.classroom_id} onChange={(event) => setForm({ ...form, classroom_id: event.target.value })}><option value="">Unassigned</option>{(data?.classrooms ?? []).map((room: any) => <option key={room.id} value={room.id}>{room.name} - capacity {room.capacity ?? "n/a"}</option>)}</select></label>
          <label className="field-stack"><span>Job title</span><input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Lead teacher, assistant, manager..." /></label>
          <label className="field-stack"><span>Status</span><select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="active">Active</option><option value="inactive">Inactive</option><option value="blocked">Blocked</option></select></label>
          <label className="field-stack"><span>{editing ? "New PIN (optional)" : "Staff PIN (optional)"}</span><input type="password" inputMode="numeric" value={form.pin} onChange={(event) => setForm({ ...form, pin: event.target.value })} placeholder="4-8 digits" /></label>
          <div className="actions full"><button className="primary" disabled={saving}>{saving ? "Saving..." : editing ? "Update staff" : "Add staff"}</button>{editing ? <button type="button" className="secondary" onClick={resetForm}>Cancel</button> : null}<Badge tone="success">Invitation and reset emails are queued through Barbaari email</Badge></div>
        </form>
      </Panel>
      {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={reload} /> : (
        <DataTable rows={data?.staff ?? []} columns={[
          { header: "Name", render: (row: any) => <><strong>{row.user?.name}</strong><br /><small>{row.user?.email}</small></> },
          { header: "Role", render: (row: any) => roleLabel(row.user?.role) },
          { header: "Classroom", render: (row: any) => row.classroom?.name ?? "Unassigned" },
          { header: "Title", render: (row: any) => row.title ?? "Not set" },
          { header: "Status", render: (row: any) => <Badge tone={row.user?.status === "active" ? "success" : row.user?.status === "pending_invite" ? "warning" : "danger"}>{String(row.user?.status ?? "active").replace(/_/g, " ")}</Badge> },
          { header: "Actions", render: (row: any) => <div className="row-actions"><button className="secondary" onClick={() => startEdit(row)}>Edit</button>{row.user?.status === "active" ? <button className="secondary" onClick={() => action("Staff deactivated.", () => staffApi.deactivate(userId(row)))}>Deactivate</button> : <button className="secondary" onClick={() => action("Staff activated.", () => staffApi.activate(userId(row)))}>Activate</button>}<button className="secondary" onClick={() => resetPin(row)}>Reset PIN</button><button className="secondary" onClick={() => action("Staff invitation email queued.", () => staffApi.sendInvite(userId(row)))}>Send invite</button><button className="secondary" disabled={row.user?.status !== "active"} onClick={() => action("Staff reset email queued.", () => staffApi.sendPasswordReset(userId(row)))}>Send reset email</button></div> }
        ]} />
      )}
    </section>
  );
}
