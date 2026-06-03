import { useMemo, useState } from "react";
import { authApi, superAdminApi } from "@barbaari/shared";
import { Alert, Badge, DataTable, ErrorState, Header, LoadingState, Modal } from "../components/Ui";
import { useAsyncData } from "../hooks/useAsyncData";
import { errorMessage, titleize } from "../utils/format";

const roles = ["super_admin", "daycare_admin", "manager", "teacher", "staff", "parent", "billing_manager", "support_staff"];

export function GlobalUsersPage() {
  const [filters, setFilters] = useState({ search: "", role: "", organization_id: "", status: "" });
  const { data, loading, error, reload } = useAsyncData(async () => {
    const [users, organizations, me] = await Promise.all([superAdminApi.filteredUsers(filters), superAdminApi.organizations(), authApi.me()]);
    return { users: users.users, organizations: organizations.organizations, me: me.user };
  }, [filters.search, filters.role, filters.organization_id, filters.status]);
  const [selected, setSelected] = useState<any | null>(null);
  const [roleUser, setRoleUser] = useState<any | null>(null);
  const [nextRole, setNextRole] = useState("");
  const [success, setSuccess] = useState("");
  const [actionError, setActionError] = useState("");

  const orgs = data?.organizations ?? [];
  const rows = useMemo(() => data?.users ?? [], [data]);

  async function action(run: () => Promise<unknown>, message: string) {
    setActionError("");
    setSuccess("");
    try {
      await run();
      setSuccess(message);
      setSelected(null);
      setRoleUser(null);
      await reload();
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  return <section className="page">
    <Header eyebrow="Identity" title="Global users" />
    <Alert message={success} />
    <Alert message={actionError} tone="danger" />
    <div className="panel filters">
      <input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="Search name or email" />
      <select value={filters.role} onChange={(event) => setFilters({ ...filters, role: event.target.value })}><option value="">All roles</option>{roles.map((role) => <option key={role} value={role}>{titleize(role)}</option>)}</select>
      <select value={filters.organization_id} onChange={(event) => setFilters({ ...filters, organization_id: event.target.value })}><option value="">All organizations</option>{orgs.map((org: any) => <option key={org.id} value={org.id}>{org.name}</option>)}</select>
      <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">All statuses</option><option value="active">Active</option><option value="blocked">Blocked</option></select>
    </div>
    {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={reload} /> : <DataTable rows={rows} columns={[
      { header: "User", render: (row: any) => <><strong>{row.name}</strong><br /><small>{row.email}</small></> },
      { header: "Role", render: (row: any) => <Badge>{titleize(row.role)}</Badge> },
      { header: "Organization", render: (row: any) => row.organization?.name ?? "Platform" },
      { header: "Status", render: (row: any) => <Badge tone={row.status === "blocked" ? "danger" : "success"}>{row.status}</Badge> },
      { header: "Actions", render: (row: any) => <div className="row-actions"><button className="secondary" onClick={() => setSelected({ type: "view", user: row })}>View</button>{row.status === "blocked" ? <button className="secondary" onClick={() => action(() => superAdminApi.unblockUser(row.id), "User unblocked.")}>Unblock</button> : <button className="secondary" disabled={row.id === data?.me?.id} onClick={() => setSelected({ type: "block", user: row })}>Block</button>}<button className="secondary" onClick={() => action(() => superAdminApi.resetUser(row.id), "Password reset is a demo placeholder. No SMS or email delivery is connected yet.")}>Reset account (demo)</button><button className="secondary" onClick={() => { setRoleUser(row); setNextRole(row.role); }}>Change role</button></div> }
    ]} />}
    {selected?.type === "view" ? <Modal title={selected.user.name} onClose={() => setSelected(null)}>
      <div className="grid three"><article className="ops"><span>Email</span><strong>{selected.user.email}</strong></article><article className="ops"><span>Role</span><strong>{titleize(selected.user.role)}</strong></article><article className="ops"><span>Status</span><strong>{selected.user.status}</strong></article></div>
    </Modal> : null}
    {selected?.type === "block" ? <Modal title="Confirm block user" onClose={() => setSelected(null)}>
      <p>Block {selected.user.name}? This prevents account access until unblocked.</p>
      <button className="primary" onClick={() => action(() => superAdminApi.blockUser(selected.user.id), "User blocked.")}>Block user</button>
    </Modal> : null}
    {roleUser ? <Modal title={`Change role: ${roleUser.name}`} onClose={() => setRoleUser(null)}>
      <div className="form-grid two"><select value={nextRole} onChange={(event) => setNextRole(event.target.value)}>{roles.map((role) => <option key={role} value={role}>{titleize(role)}</option>)}</select><button className="primary" onClick={() => action(() => superAdminApi.updateUserRole(roleUser.id, nextRole), "Role updated.")}>Save role</button></div>
    </Modal> : null}
  </section>;
}
