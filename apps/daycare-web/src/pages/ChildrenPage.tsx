import type { FormEvent } from "react";
import { useState } from "react";
import { childrenApi, classroomsApi, guardiansApi, getApiError, organizationApi } from "@barbaari/shared";
import { PageHeader, Panel } from "../components/Page";
import { DataTable } from "../components/DataTable";
import { Badge, ErrorState, LoadingState } from "../components/Status";
import { ErrorAlert, SuccessAlert } from "../components/Alerts";
import { ChildSelect, ClassroomSelect, GuardianSelect } from "../components/Selects";
import { Modal } from "../components/Modal";
import { useAsyncData } from "../hooks/useAsyncData";
import { childCode, childDob, childLabel, friendlyError } from "../utils/labels";

type ChildForm = { first_name: string; last_name: string; date_of_birth: string; classroom_id: string };

const emptyForm: ChildForm = { first_name: "", last_name: "", date_of_birth: "", classroom_id: "" };

export function ChildrenPage() {
  const { data, loading, error, reload } = useAsyncData(async () => {
    const [children, classrooms, guardians, organization] = await Promise.all([childrenApi.managerList(), classroomsApi.list(), guardiansApi.list(), organizationApi.get()]);
    return { children: children.children, classrooms: classrooms.classrooms, guardians: guardians.guardians, organization: organization.organization };
  }, []);
  const [form, setForm] = useState<ChildForm>(emptyForm);
  const [selectedChild, setSelectedChild] = useState<any | null>(null);
  const [mode, setMode] = useState<"view" | "edit" | "assign" | "guardian" | null>(null);
  const [classroomId, setClassroomId] = useState("");
  const [guardianId, setGuardianId] = useState("");
  const [success, setSuccess] = useState("");
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);

  async function runAction(action: () => Promise<void>, message: string) {
    setSaving(true);
    setActionError("");
    setSuccess("");
    try {
      await action();
      setSuccess(message);
      setMode(null);
      setSelectedChild(null);
      await reload();
    } catch (err) {
      setActionError(friendlyError(getApiError(err).message));
    } finally {
      setSaving(false);
    }
  }

  async function createChild(event: FormEvent) {
    event.preventDefault();
    await runAction(async () => {
      await childrenApi.create({
        first_name: form.first_name,
        last_name: form.last_name,
        date_of_birth: form.date_of_birth || null,
        classroom_id: form.classroom_id || null
      });
      setForm(emptyForm);
    }, "Child created with an automatic child code.");
  }

  function openModal(nextMode: typeof mode, child: any) {
    setSelectedChild(child);
    setMode(nextMode);
    setClassroomId(child.classroomId ? String(child.classroomId) : "");
    setGuardianId("");
    setActionError("");
    if (nextMode === "edit") {
      const [firstName, ...rest] = child.name.split(" ");
      setForm({
        first_name: child.firstName ?? firstName ?? "",
        last_name: child.lastName ?? rest.join(" "),
        date_of_birth: childDob(child) === "DOB not recorded" ? "" : childDob(child),
        classroom_id: child.classroomId ? String(child.classroomId) : ""
      });
    }
  }

  const rows = data?.children ?? [];
  const classrooms = data?.classrooms ?? [];
  const guardians = data?.guardians ?? [];
  const isFamilyChildCare = data?.organization?.facility_type === "family_child_care";

  return (
    <section className="page">
      <PageHeader eyebrow="Enrollment" title="Children" />
      <SuccessAlert message={success} />
      <ErrorAlert message={actionError} />

      <Panel title="Create child">
        <form className="form-grid" onSubmit={createChild}>
          <input value={form.first_name} onChange={(event) => setForm({ ...form, first_name: event.target.value })} placeholder="First name" required />
          <input value={form.last_name} onChange={(event) => setForm({ ...form, last_name: event.target.value })} placeholder="Last name" required />
          <input type="date" value={form.date_of_birth} onChange={(event) => setForm({ ...form, date_of_birth: event.target.value })} aria-label="Date of birth" />
          {!isFamilyChildCare ? <ClassroomSelect classrooms={classrooms} value={form.classroom_id} onChange={(id) => setForm({ ...form, classroom_id: id })} /> : <p className="muted">Family child care children are managed without classrooms.</p>}
          <button className="primary" disabled={saving}>{saving ? "Saving..." : "Create child"}</button>
        </form>
      </Panel>

      {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={reload} /> : (
        <DataTable rows={rows} columns={[
          { header: "Child", render: (row: any) => <><strong>{row.name}</strong><br /><small>{childLabel(row)}</small></> },
          { header: "Child code", render: (row: any) => <Badge>{childCode(row)}</Badge> },
          { header: "DOB / age", render: (row: any) => <>{childDob(row)}<br /><small>{row.age}</small></> },
          ...(!isFamilyChildCare ? [{ header: "Classroom", render: (row: any) => row.classroom }] : []),
          { header: "Guardians", render: (row: any) => row.guardianNames?.join(", ") || "Not linked" },
          { header: "Actions", render: (row: any) => <div className="row-actions"><button className="action-link" onClick={() => openModal("view", row)}>View</button><button className="action-link" onClick={() => openModal("edit", row)}>Edit</button>{!isFamilyChildCare ? <button className="action-link" onClick={() => openModal("assign", row)}>Assign classroom</button> : null}<button className="action-link" onClick={() => openModal("guardian", row)}>Link guardian</button><button className="action-link" onClick={() => runAction(() => childrenApi.update(row.id, { status: "archived" }).then(() => undefined), `${row.name} archived.`)}>Archive</button></div> }
        ]} />
      )}

      {selectedChild && mode ? (
        <Modal title={`${mode === "view" ? "View" : mode === "edit" ? "Edit" : mode === "assign" ? "Assign classroom" : "Link guardian"}: ${selectedChild.name}`} onClose={() => setMode(null)}>
          <div className="record-summary">
            <strong>{selectedChild.name} - {childCode(selectedChild)}</strong>
            <span>{childLabel(selectedChild)}</span>
          </div>
          {mode === "view" ? null : mode === "edit" ? (
            <form className="form-grid" onSubmit={(event) => {
              event.preventDefault();
              void runAction(() => childrenApi.update(selectedChild.id, { ...form, classroom_id: form.classroom_id || null }).then(() => undefined), "Child updated.");
            }}>
              <input value={form.first_name} onChange={(event) => setForm({ ...form, first_name: event.target.value })} placeholder="First name" required />
              <input value={form.last_name} onChange={(event) => setForm({ ...form, last_name: event.target.value })} placeholder="Last name" required />
              <input type="date" value={form.date_of_birth} onChange={(event) => setForm({ ...form, date_of_birth: event.target.value })} />
              {!isFamilyChildCare ? <ClassroomSelect classrooms={classrooms} value={form.classroom_id} onChange={(id) => setForm({ ...form, classroom_id: id })} /> : null}
              <button className="primary" disabled={saving}>{saving ? "Saving..." : "Save child"}</button>
            </form>
          ) : mode === "assign" ? (
            <div className="form-grid">
              <ClassroomSelect classrooms={classrooms} value={classroomId} onChange={setClassroomId} />
              <button className="primary" disabled={saving || !classroomId} onClick={() => runAction(() => childrenApi.assignClassroom(selectedChild.id, classroomId).then(() => undefined), "Classroom assigned.")}>Assign classroom</button>
            </div>
          ) : (
            <div className="form-grid">
              <GuardianSelect guardians={guardians} value={guardianId} onChange={setGuardianId} />
              <button className="primary" disabled={saving || !guardianId} onClick={() => runAction(() => childrenApi.linkGuardian(selectedChild.id, { guardian_id: guardianId, pickup_authorized: true }).then(() => undefined), "Guardian linked to child.")}>Link guardian</button>
            </div>
          )}
        </Modal>
      ) : null}
    </section>
  );
}
