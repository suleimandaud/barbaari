import type { FormEvent } from "react";
import { useState } from "react";
import { childrenApi, dailyNotesApi, getApiError } from "@barbaari/shared";
import { PageHeader, Panel } from "../components/Page";
import { DataTable } from "../components/DataTable";
import { ErrorState, LoadingState } from "../components/Status";
import { ErrorAlert, SuccessAlert } from "../components/Alerts";
import { ChildSelect } from "../components/Selects";
import { useAsyncData } from "../hooks/useAsyncData";
import { childCode, friendlyError } from "../utils/labels";

export function DailyNotesPage() {
  const { data, loading, error, reload } = useAsyncData(async () => {
    const [notes, children] = await Promise.all([dailyNotesApi.list(), childrenApi.managerList()]);
    return { notes: notes.daily_notes, children: children.children };
  }, []);
  const [childId, setChildId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [success, setSuccess] = useState("");
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSuccess("");
    setActionError("");
    if (!childId) {
      setActionError("Please select a child.");
      return;
    }
    setSaving(true);
    try {
      await dailyNotesApi.create({ child_id: childId, date, note });
      setSuccess("Daily note saved.");
      setChildId("");
      setNote("");
      await reload();
    } catch (err) {
      setActionError(friendlyError(getApiError(err).message));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="page">
      <PageHeader eyebrow="Daily care" title="Daily notes" />
      <SuccessAlert message={success} />
      <ErrorAlert message={actionError} />
      <Panel title="Create daily note">
        <form className="form-grid" onSubmit={submit}>
          <div className="full"><ChildSelect children={data?.children ?? []} value={childId} onChange={setChildId} /></div>
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} aria-label="Note date" />
          <textarea className="full" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Daily note" required />
          <button className="primary" disabled={saving}>{saving ? "Saving..." : "Save note"}</button>
        </form>
      </Panel>
      {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={reload} /> : (
        <DataTable rows={data?.notes ?? []} columns={[
          { header: "Child", render: (row: any) => <><strong>{row.childName ?? row.child?.name ?? "Child"}</strong><br /><small>ID: {row.childCode ?? row.child?.child_code ?? childCode(row.child)}</small></> },
          { header: "Date", render: (row: any) => row.date },
          { header: "Note", render: (row: any) => row.note },
          { header: "Staff", render: (row: any) => row.staffName ?? row.staff_name ?? "Staff" }
        ]} />
      )}
    </section>
  );
}
