import type { FormEvent } from "react";
import { Field } from "@barbaari/shared/web/ui";

export const staffRoles = [
  ["teacher", "Teacher"],
  ["staff", "Staff"],
  ["manager", "Manager"],
  ["billing_manager", "Billing manager"],
] as const;

export const blankStaff = { name: "", email: "", phone: "", role: "teacher", classroom_id: "", title: "", status: "active", pin: "" };
export type StaffFormValues = typeof blankStaff;

export function staffRoleLabel(role?: string) {
  if (role === "daycare_admin") return "Daycare admin";
  return staffRoles.find(([value]) => value === role)?.[1] ?? String(role ?? "Staff").replace(/_/g, " ");
}

/** Same payload the staff page always sent to staffApi.create/update. */
export function staffPayload(form: StaffFormValues) {
  return {
    name: form.name,
    email: form.email,
    phone: form.phone || undefined,
    role: form.role,
    classroom_id: form.classroom_id || null,
    title: form.title || undefined,
    status: form.status,
    pin: form.pin || undefined,
  };
}

export function StaffForm({ id, form, setForm, classrooms, onSubmit, editing }: { id: string; form: StaffFormValues; setForm: (form: StaffFormValues) => void; classrooms: any[]; onSubmit: (event: FormEvent) => void; editing?: boolean }) {
  return (
    <form id={id} className="bb-stack" onSubmit={onSubmit}>
      <Field label="Name"><input className="bb-input white" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></Field>
      <div className="bb-form-grid">
        <Field label="Email"><input className="bb-input white" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></Field>
        <Field label="Phone"><input className="bb-input white" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></Field>
        <Field label="Role"><select className="bb-input white" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>{form.role === "daycare_admin" ? <option value="daycare_admin">Daycare admin</option> : null}{staffRoles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
        <Field label="Classroom"><select className="bb-input white" value={form.classroom_id} onChange={(event) => setForm({ ...form, classroom_id: event.target.value })}><option value="">Unassigned</option>{classrooms.map((room: any) => <option key={room.id} value={room.id}>{room.name}</option>)}</select></Field>
        <Field label="Job title"><input className="bb-input white" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Lead teacher, assistant…" /></Field>
        <Field label="Status"><select className="bb-input white" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="active">Active</option><option value="inactive">Inactive</option><option value="blocked">Blocked</option>{form.status === "pending_invite" ? <option value="pending_invite">Invite pending</option> : null}</select></Field>
      </div>
      <Field label={editing ? "New PIN (optional)" : "Staff PIN (optional)"}><input className="bb-input white" type="password" inputMode="numeric" value={form.pin} onChange={(event) => setForm({ ...form, pin: event.target.value })} placeholder="4–8 digits" /></Field>
    </form>
  );
}
