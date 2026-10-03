import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CaretRight, EnvelopeSimple, IdentificationBadge, UserPlus } from "@phosphor-icons/react";
import { classroomsApi, getApiError, staffApi } from "@barbaari/shared";
import { Alert, Avatar, Drawer, EmptyState, ErrorState, LoadingState, PageHeader, Pagination, SearchInput, Segmented, StatusBadge, usePaged, useToast } from "@barbaari/shared/web/ui";
import { accountStatuses } from "@barbaari/shared/web/status";
import { useAsyncData } from "../hooks/useAsyncData";
import { friendlyError } from "../utils/labels";
import { StaffForm, blankStaff, staffPayload, staffRoleLabel, staffRoles, type StaffFormValues } from "./staffShared";

type Filter = "all" | "active" | "pending_invite" | "inactive" | "blocked";

export function userId(row: any) {
  return row.user?.id ?? row.user_id;
}

export function StaffPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { data, loading, error, reload } = useAsyncData(async () => {
    const [staff, classrooms] = await Promise.all([staffApi.list(), classroomsApi.list()]);
    return { staff: staff.staff, classrooms: classrooms.classrooms };
  }, []);
  const [form, setForm] = useState<StaffFormValues>(blankStaff);
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [role, setRole] = useState("");
  const [query, setQuery] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setActionError("");
    try {
      await staffApi.create(staffPayload(form));
      toast("Staff member created. Invitation email queued so they can set their password.");
      setForm(blankStaff);
      setCreating(false);
      await reload();
    } catch (err) {
      setActionError(friendlyError(getApiError(err).message));
    } finally {
      setSaving(false);
    }
  }

  const staff = (data?.staff ?? []) as any[];
  const statusOf = (row: any) => String(row.user?.status ?? "active");
  const counts = useMemo(() => {
    const result: Record<Filter, number> = { all: staff.length, active: 0, pending_invite: 0, inactive: 0, blocked: 0 };
    for (const row of staff) { const status = statusOf(row) as Filter; if (status in result) result[status] += 1; }
    return result;
  }, [staff]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return staff.filter((row) => (filter === "all" || statusOf(row) === filter) && (!role || row.user?.role === role)
      && (!q || `${row.user?.name ?? ""} ${row.user?.email ?? ""}`.toLowerCase().includes(q)));
  }, [staff, filter, role, query]);
  const paged = usePaged(rows, 12, `${filter}|${role}|${query}`);

  return (
    <main className="bb-page">
      <PageHeader
        kicker="Roles, classrooms and tablet PINs for your team"
        title="Staff access"
        actions={<button className="bb-btn bb-btn-primary bb-btn-lg" onClick={() => { setForm(blankStaff); setActionError(""); setCreating(true); }}><UserPlus />Add staff member</button>}
      />
      {loading && !data ? <LoadingState /> : error ? <ErrorState message={error} onRetry={reload} /> : !staff.length ? (
        <EmptyState icon={IdentificationBadge} title="No staff yet" action={<button className="bb-btn bb-btn-primary" onClick={() => setCreating(true)}><UserPlus />Add staff member</button>}>Add your teachers and staff. Barbaari emails each of them an invitation to set a password.</EmptyState>
      ) : (
        <>
          <div className="bb-toolbar">
            <Segmented label="Status" value={filter} onChange={setFilter} items={[
              { key: "all", label: `All ${counts.all}` },
              { key: "active", label: `Active ${counts.active}` },
              { key: "pending_invite", label: `Invite pending ${counts.pending_invite}` },
              { key: "inactive", label: `Inactive ${counts.inactive}` },
              { key: "blocked", label: `Blocked ${counts.blocked}` }
            ]} />
            <select className="bb-input" aria-label="Role" value={role} onChange={(event) => setRole(event.target.value)}>
              <option value="">All roles</option>
              {staffRoles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <span className="bb-grow" />
            <SearchInput value={query} onChange={setQuery} placeholder="Name or email" />
          </div>
          {rows.length ? (
            <div className="bb-table-wrap">
              <table className="bb-table">
                <thead><tr><th>Name</th><th>Role</th><th>Classroom</th><th>Job title</th><th>Status</th><th aria-label="Actions" /></tr></thead>
                <tbody>
                  {paged.rows.map((row) => (
                    <tr key={row.id} className="clickable" onClick={() => navigate(`/staff/${userId(row)}`)}>
                      <td><div className="bb-person"><Avatar name={row.user?.name} seed={userId(row)} /><div><strong>{row.user?.name}</strong><span>{row.user?.email}</span></div></div></td>
                      <td>{staffRoleLabel(row.user?.role)}</td>
                      <td>{row.classroom?.name ?? <span className="bb-muted">Unassigned</span>}</td>
                      <td>{row.title ?? <span className="bb-muted">—</span>}</td>
                      <td><StatusBadge map={accountStatuses} value={statusOf(row)} /></td>
                      <td className="right"><div className="bb-row" style={{ justifyContent: "flex-end", flexWrap: "nowrap", gap: 5 }}><button className="bb-btn bb-btn-secondary" onClick={(event) => { event.stopPropagation(); navigate(`/staff/${userId(row)}`); }}>Edit</button><CaretRight size={18} color="var(--bb-accent)" weight="fill" /></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyState compact title="No staff match">Try a different filter, role or search.</EmptyState>}
          <Pagination page={paged.page} pageCount={paged.pageCount} total={paged.total} pageSize={paged.pageSize} onChange={paged.setPage} />
          <p className="bb-note"><EnvelopeSimple size={18} color="var(--bb-accent)" />Invitation and password-reset emails are sent by Barbaari. Staff PINs are 4–8 digits and unlock tablet mode.</p>
        </>
      )}

      {creating ? (
        <Drawer title="Add a staff member" onClose={() => setCreating(false)} footer={<><button className="bb-btn bb-btn-secondary bb-btn-lg" onClick={() => setCreating(false)}>Cancel</button><button className="bb-btn bb-btn-primary bb-btn-lg" form="staff-form" disabled={saving}>{saving ? "Saving…" : "Add staff member"}</button></>}>
          {actionError ? <Alert tone="danger">{actionError}</Alert> : null}
          <StaffForm id="staff-form" form={form} setForm={setForm} classrooms={data?.classrooms ?? []} onSubmit={submit} />
          <p className="bb-caption">They’ll get an email invitation to set their password.</p>
        </Drawer>
      ) : null}
    </main>
  );
}
