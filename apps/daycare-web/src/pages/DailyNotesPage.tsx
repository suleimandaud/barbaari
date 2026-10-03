import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { CheckSquare, NotePencil } from "@phosphor-icons/react";
import { childrenApi, dailyNotesApi, getApiError } from "@barbaari/shared";
import { Alert, Avatar, EmptyState, ErrorState, Field, LoadingState, PageHeader, SearchInput, shortDate, useToast } from "@barbaari/shared/web/ui";
import { ChildSelect } from "../components/Selects";
import { useAsyncData } from "../hooks/useAsyncData";
import { friendlyError } from "../utils/labels";

export function DailyNotesPage() {
  const toast = useToast();
  const { data, loading, error, reload } = useAsyncData(async () => {
    const [notes, children] = await Promise.all([dailyNotesApi.list(), childrenApi.managerList()]);
    return { notes: notes.daily_notes, children: children.children };
  }, []);
  const [childId, setChildId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [filter, setFilter] = useState("");
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setActionError("");
    if (!childId) {
      setActionError("Please select a child.");
      return;
    }
    setSaving(true);
    try {
      await dailyNotesApi.create({ child_id: childId, date, note });
      toast("Daily note saved.");
      setChildId("");
      setNote("");
      await reload();
    } catch (err) {
      setActionError(friendlyError(getApiError(err).message));
    } finally {
      setSaving(false);
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const groups = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const notes = ((data?.notes ?? []) as any[]).filter((item) => !q || `${item.childName ?? ""} ${item.childCode ?? ""}`.toLowerCase().includes(q));
    const byDate = new Map<string, any[]>();
    for (const item of notes) byDate.set(item.date, [...(byDate.get(item.date) ?? []), item]);
    return [...byDate.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [data?.notes, filter]);

  return (
    <main className="bb-page">
      <div className="bb-grid-main-side" style={{ gridTemplateColumns: "minmax(320px, 420px) minmax(0, 1fr)", gap: 70 }}>
        <div>
          <PageHeader kicker="A quick record of each child’s day" title="Daily notes" />
          <form className="bb-panel bb-stack" onSubmit={submit}>
            {actionError ? <Alert tone="danger">{actionError}</Alert> : null}
            <ChildSelect children={data?.children ?? []} value={childId} onChange={setChildId} label="Child" placeholder="Choose a child" />
            <Field label="Date"><input className="bb-input white" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></Field>
            <Field label="Note"><textarea className="bb-input white" style={{ minHeight: 150 }} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Meals, naps, activities…" required /></Field>
            <button className="bb-btn bb-btn-primary bb-btn-lg bb-btn-block" disabled={saving}><CheckSquare />{saving ? "Saving…" : "Save note"}</button>
          </form>
        </div>
        <section>
          <div className="bb-row" style={{ justifyContent: "space-between", marginBottom: 20, marginTop: 20 }}>
            <h2 style={{ fontSize: 28 }}>Recent notes</h2>
            <div style={{ width: "min(260px, 100%)" }}><SearchInput value={filter} onChange={setFilter} placeholder="Filter by child" /></div>
          </div>
          {loading && !data ? <LoadingState /> : error ? <ErrorState message={error} onRetry={reload} /> : groups.length ? groups.map(([day, notes]) => (
            <div key={day} className="bb-section" style={{ marginBottom: 30 }}>
              <p className="bb-overline accent" style={{ marginBottom: 6 }}>{day === today ? "Today · " : ""}{shortDate(day, { weekday: "long", day: "numeric", month: "long" })}</p>
              <div className="bb-list">
                {notes.map((item: any) => (
                  <div className="bb-list-row" key={item.id} style={{ alignItems: "flex-start" }}>
                    <Avatar name={item.childName} seed={item.child_id} size={40} />
                    <div className="grow"><strong>{item.childName ?? "Child"}</strong><span className="bb-caption"> · {item.childCode}{item.classroom && item.classroom !== "Unassigned" ? ` · ${item.classroom}` : ""}</span><p style={{ fontSize: 16.5, marginTop: 4 }}>{item.note}</p></div>
                  </div>
                ))}
              </div>
            </div>
          )) : <EmptyState compact icon={NotePencil} title={filter ? "No notes for that child" : "No notes yet"}>{filter ? "Try another name." : "Notes you save appear here, newest first."}</EmptyState>}
        </section>
      </div>
    </main>
  );
}
