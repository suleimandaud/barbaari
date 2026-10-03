import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Baby, CaretRight, PlusCircle } from "@phosphor-icons/react";
import { absenceApi, childrenApi, classroomsApi, getApiError, mergedAttendance, organizationApi } from "@barbaari/shared";
import { Alert, Avatar, Drawer, EmptyState, ErrorState, Field, LoadingState, PageHeader, Pagination, SearchInput, Segmented, StatusBadge, recordTime, usePaged, useToast } from "@barbaari/shared/web/ui";
import { attendanceStatuses } from "@barbaari/shared/web/status";
import { ClassroomSelect } from "../components/Selects";
import { useAsyncData } from "../hooks/useAsyncData";
import { childCode, childGuardian, friendlyError } from "../utils/labels";
import { ageLabel, todayStatusByChild } from "../utils/people";

type ChildForm = { first_name: string; last_name: string; date_of_birth: string; classroom_id: string };
type Filter = "all" | "present" | "expected" | "out" | "absent";

const emptyForm: ChildForm = { first_name: "", last_name: "", date_of_birth: "", classroom_id: "" };

export function ChildrenPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const today = new Date().toISOString().slice(0, 10);
  const { data, loading, error, reload } = useAsyncData(async () => {
    const [children, classrooms, organization, attendance, absences] = await Promise.all([
      childrenApi.managerList(),
      classroomsApi.list(),
      organizationApi.get(),
      // Today's status only (plus open check-ins), not attendance history.
      mergedAttendance([{ date: today }, { open: 1 }]),
      absenceApi.list({ date: today })
    ]);
    return { children: children.children, classrooms: classrooms.classrooms, organization: organization.organization, attendance, absences: absences.absence_records ?? [] };
  }, [today]);
  const [form, setForm] = useState<ChildForm>(emptyForm);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<any | null>(null);
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [roomId, setRoomId] = useState("");
  const [query, setQuery] = useState(searchParams.get("q") ?? "");

  async function createChild(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setActionError("");
    try {
      const response = await childrenApi.create({
        first_name: form.first_name,
        last_name: form.last_name,
        date_of_birth: form.date_of_birth || null,
        classroom_id: form.classroom_id || null
      });
      setForm(emptyForm);
      setCreating(false);
      setCreated(response.child ?? null);
      toast("Child created with an automatic child code.");
      await reload();
    } catch (err) {
      setActionError(friendlyError(getApiError(err).message));
    } finally {
      setSaving(false);
    }
  }

  const children = (data?.children ?? []) as any[];
  const classrooms = (data?.classrooms ?? []) as any[];
  const isFamilyChildCare = data?.organization?.facility_type === "family_child_care";
  const statusMap = useMemo(() => todayStatusByChild(data?.attendance ?? [], data?.absences ?? [], today), [data?.attendance, data?.absences, today]);
  const statusOf = (child: any) => statusMap.get(String(child.id)) ?? { key: "not_checked_in" };
  const bucket = (key: string): Filter => key === "checked_in" || key === "missing_checkout" ? "present" : key === "checked_out" || key === "checked_out_early" ? "out" : key === "absent" ? "absent" : "expected";
  const counts = useMemo(() => {
    const result = { all: children.length, present: 0, expected: 0, out: 0, absent: 0 };
    for (const child of children) result[bucket(statusOf(child).key)] += 1;
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [children, statusMap]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return children.filter((child) => (filter === "all" || bucket(statusOf(child).key) === filter)
      && (!roomId || String(child.classroomId) === roomId)
      && (!q || `${child.name} ${childCode(child)} ${(child.guardianNames ?? []).join(" ")}`.toLowerCase().includes(q)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [children, filter, roomId, query, statusMap]);
  const paged = usePaged(rows, 10, `${filter}|${roomId}|${query}`);

  function statusLine(child: any) {
    const status = statusOf(child);
    if (status.record && (status.key === "checked_in")) return `In ${recordTime(status.record, "in")}`;
    if (status.record && status.key === "missing_checkout") return `Open since ${recordTime(status.record, "in")}`;
    if (status.record) return `Out ${recordTime(status.record, "out")}`;
    if (status.absence) return status.absence.reason || String(status.absence.absenceType ?? status.absence.absence_type ?? "").replace(/_/g, " ");
    return "";
  }

  return (
    <main className="bb-page">
      <PageHeader
        kicker={data ? `${children.length} enrolled${isFamilyChildCare ? "" : ` across ${classrooms.length} classroom${classrooms.length === 1 ? "" : "s"}`}` : "Enrollment"}
        title="Children"
        actions={<button className="bb-btn bb-btn-primary bb-btn-lg" onClick={() => { setForm(emptyForm); setActionError(""); setCreating(true); }}><PlusCircle />Add child</button>}
      />

      {created ? (
        <Alert tone="ok" title={`${created.name} was added`} action={<button className="bb-btn bb-btn-primary" onClick={() => navigate(`/children/${created.id}`)}>Open record</button>}>
          Child code {created.childCode ?? created.child_code} was created. Link a guardian so they can be checked in on the tablet.
        </Alert>
      ) : null}

      {loading && !data ? <LoadingState /> : error ? <ErrorState message={error} onRetry={reload} /> : !children.length ? (
        <EmptyState icon={Baby} title="No children yet" action={<button className="bb-btn bb-btn-primary" onClick={() => setCreating(true)}><PlusCircle />Add child</button>}>
          No children have been added to your daycare yet. Add a child and Barbaari will create their child code automatically.
        </EmptyState>
      ) : (
        <>
          <div className="bb-toolbar">
            <Segmented label="Today" value={filter} onChange={setFilter} items={[
              { key: "all", label: `All ${counts.all}` },
              { key: "present", label: `Present ${counts.present}` },
              { key: "expected", label: `Expected ${counts.expected}` },
              { key: "out", label: `Checked out ${counts.out}` },
              { key: "absent", label: `Absent ${counts.absent}` }
            ]} />
            {!isFamilyChildCare && classrooms.length ? (
              <select className="bb-input" aria-label="Classroom" value={roomId} onChange={(event) => setRoomId(event.target.value)}>
                <option value="">All classrooms</option>
                {classrooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
              </select>
            ) : null}
            <span className="bb-grow" />
            <SearchInput value={query} onChange={setQuery} placeholder="Name, child code or guardian" />
          </div>

          {rows.length ? (
            <div className="bb-table-wrap">
              <table className="bb-table">
                <thead><tr><th>Child</th><th>Age</th>{!isFamilyChildCare ? <th>Classroom</th> : null}<th>Today</th><th>Primary guardian</th><th aria-label="Open" /></tr></thead>
                <tbody>
                  {paged.rows.map((child) => (
                    <tr key={child.id} className="clickable" onClick={() => navigate(`/children/${child.id}`)}>
                      <td><div className="bb-person"><Avatar name={child.name} seed={child.id} /><div><strong>{child.name}</strong><span>{childCode(child)}</span></div></div></td>
                      <td>{ageLabel(child.dateOfBirth ?? child.date_of_birth, child.age)}</td>
                      {!isFamilyChildCare ? <td>{child.classroom}</td> : null}
                      <td><div className="bb-row" style={{ gap: 10, flexWrap: "nowrap" }}><StatusBadge map={attendanceStatuses} value={statusOf(child).key} /><span className="bb-caption">{statusLine(child)}</span></div></td>
                      <td>{childGuardian(child)}</td>
                      <td className="right"><a href={`/children/${child.id}`} onClick={(event) => { event.preventDefault(); event.stopPropagation(); navigate(`/children/${child.id}`); }} aria-label={`Open ${child.name}`}><CaretRight size={18} color="var(--bb-accent)" weight="fill" /></a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyState compact title="No children match">Try a different filter, classroom or search.</EmptyState>}
          <Pagination page={paged.page} pageCount={paged.pageCount} total={paged.total} pageSize={paged.pageSize} onChange={paged.setPage} />
        </>
      )}

      {creating ? (
        <Drawer title="Add a child" onClose={() => setCreating(false)} footer={<><button className="bb-btn bb-btn-secondary bb-btn-lg" type="button" onClick={() => setCreating(false)}>Cancel</button><button className="bb-btn bb-btn-primary bb-btn-lg" form="create-child" disabled={saving}>{saving ? "Saving…" : "Add child"}</button></>}>
          {actionError ? <Alert tone="danger">{actionError}</Alert> : null}
          <form id="create-child" className="bb-stack" onSubmit={createChild}>
            <div className="bb-form-grid">
              <Field label="First name"><input className="bb-input" value={form.first_name} onChange={(event) => setForm({ ...form, first_name: event.target.value })} required /></Field>
              <Field label="Last name"><input className="bb-input" value={form.last_name} onChange={(event) => setForm({ ...form, last_name: event.target.value })} required /></Field>
            </div>
            <Field label="Date of birth"><input className="bb-input" type="date" value={form.date_of_birth} onChange={(event) => setForm({ ...form, date_of_birth: event.target.value })} /></Field>
            {!isFamilyChildCare ? <ClassroomSelect classrooms={classrooms} value={form.classroom_id} onChange={(id) => setForm({ ...form, classroom_id: id })} label="Classroom" /> : <p className="bb-muted">Family child care children are managed without classrooms.</p>}
            <p className="bb-caption">Barbaari creates the child code automatically.</p>
          </form>
        </Drawer>
      ) : null}
    </main>
  );
}
