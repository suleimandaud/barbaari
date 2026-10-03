import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CaretRight, DeviceTablet, Key, LinkSimple, UserPlus, UsersThree } from "@phosphor-icons/react";
import { childrenApi, getApiError, guardiansApi } from "@barbaari/shared";
import { Alert, Avatar, Dialog, Drawer, EmptyState, ErrorState, Field, LoadingState, PageHeader, Pagination, SearchInput, Segmented, Status, usePaged, useToast } from "@barbaari/shared/web/ui";
import { ChildSelect, GuardianSelect } from "../components/Selects";
import { PinDialog } from "../components/PinDialog";
import { useAsyncData } from "../hooks/useAsyncData";
import { useShell } from "../hooks/useShell";
import { friendlyError } from "../utils/labels";

type Filter = "all" | "pin" | "nopickup" | "inactive";

export function GuardiansPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { familyChildCare } = useShell();
  const { data, loading, error, reload } = useAsyncData(async () => {
    const [guardians, children] = await Promise.all([guardiansApi.list(), childrenApi.managerList()]);
    return { guardians: guardians.guardians, children: children.children };
  }, []);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [relationship, setRelationship] = useState("");
  const [createChildId, setCreateChildId] = useState("");
  const [pin, setPin] = useState("");
  const [linkChildId, setLinkChildId] = useState("");
  const [linkGuardianId, setLinkGuardianId] = useState("");
  const [panel, setPanel] = useState<null | "create" | "link">(null);
  const [pinFor, setPinFor] = useState<any | null>(null);
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  async function runAction(action: () => Promise<void>, message: string) {
    setSaving(true);
    setActionError("");
    try {
      await action();
      toast(message);
      setPanel(null);
      await reload();
    } catch (err) {
      setActionError(friendlyError(getApiError(err).message));
    } finally {
      setSaving(false);
    }
  }

  async function createGuardian(event: FormEvent) {
    event.preventDefault();
    await runAction(async () => {
      await guardiansApi.create({ name, phone, relationship, can_pickup: true, child_id: createChildId || undefined, pin: pin || undefined });
      setName("");
      setPhone("");
      setRelationship("");
      setCreateChildId("");
      setPin("");
    }, "Guardian created.");
  }

  async function linkGuardian(event: FormEvent) {
    event.preventDefault();
    if (!linkChildId) {
      setActionError("Please select a child from the list.");
      return;
    }
    if (!linkGuardianId) {
      setActionError("Please select a guardian from the list.");
      return;
    }
    await runAction(async () => {
      await childrenApi.linkGuardian(linkChildId, { guardian_id: linkGuardianId, pickup_authorized: true });
      setLinkChildId("");
      setLinkGuardianId("");
    }, "Guardian linked to child.");
  }

  const guardians = (data?.guardians ?? []) as any[];
  const counts = useMemo(() => ({
    all: guardians.length,
    pin: guardians.filter((guardian) => !guardian.pin_configured).length,
    nopickup: guardians.filter((guardian) => !guardian.can_pickup).length,
    inactive: guardians.filter((guardian) => guardian.status === "inactive").length
  }), [guardians]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return guardians.filter((guardian) => (filter === "all" || (filter === "pin" && !guardian.pin_configured) || (filter === "nopickup" && !guardian.can_pickup) || (filter === "inactive" && guardian.status === "inactive"))
      && (!q || `${guardian.name} ${guardian.phone ?? ""} ${(guardian.children ?? []).map((child: any) => child.name).join(" ")}`.toLowerCase().includes(q)));
  }, [guardians, filter, query]);
  const paged = usePaged(rows, 12, `${filter}|${query}`);

  return (
    <main className="bb-page">
      <PageHeader
        kicker="Parents, guardians and anyone allowed to pick up"
        title={familyChildCare ? "Parents & pickups" : "Guardians & pickups"}
        actions={<>
          <button className="bb-btn bb-btn-secondary bb-btn-lg" onClick={() => { setActionError(""); setPanel("link"); }}><LinkSimple />Link to child</button>
          <button className="bb-btn bb-btn-primary bb-btn-lg" onClick={() => { setActionError(""); setPanel("create"); }}><UserPlus />Add guardian</button>
        </>}
      />
      {actionError && !panel ? <Alert tone="danger">{actionError}</Alert> : null}

      {loading && !data ? <LoadingState /> : error ? <ErrorState message={error} onRetry={reload} /> : !guardians.length ? (
        <EmptyState icon={UsersThree} title="No guardians yet" action={<button className="bb-btn bb-btn-primary" onClick={() => setPanel("create")}><UserPlus />Add guardian</button>}>Add the parents and authorized pickups for each child. They sign at the tablet with their own PIN.</EmptyState>
      ) : (
        <>
          <div className="bb-toolbar">
            <Segmented label="Filter guardians" value={filter} onChange={setFilter} items={[
              { key: "all", label: `All ${counts.all}` },
              { key: "pin", label: `PIN missing ${counts.pin}` },
              { key: "nopickup", label: `No pickup ${counts.nopickup}` },
              { key: "inactive", label: `Inactive ${counts.inactive}` }
            ]} />
            <span className="bb-grow" />
            <SearchInput value={query} onChange={setQuery} placeholder="Name, phone or child" />
          </div>
          {rows.length ? (
            <div className="bb-table-wrap">
              <table className="bb-table">
                <thead><tr><th>Guardian</th><th>Phone</th><th>Children</th><th>Pickup</th><th>Tablet PIN</th><th>Status</th><th aria-label="Actions" /></tr></thead>
                <tbody>
                  {paged.rows.map((guardian) => (
                    <tr key={guardian.id} className="clickable" onClick={() => navigate(`/guardians/${guardian.id}`)}>
                      <td><div className="bb-person"><Avatar name={guardian.name} seed={guardian.id} /><div><strong>{guardian.name}</strong><span>{guardian.relationship ?? "Guardian"}</span></div></div></td>
                      <td className="bb-num">{guardian.phone ?? "—"}</td>
                      <td>{(guardian.children ?? []).map((child: any) => child.name).join(", ") || <span className="bb-muted">Not linked</span>}</td>
                      <td>{guardian.can_pickup ? <span className="bb-tag accent">Can pick up</span> : <span className="bb-tag">No pickup</span>}</td>
                      <td>{guardian.pin_configured ? <span className="bb-inline-status muted"><Key size={16} />PIN set</span> : <Status plain spec={{ label: "PIN missing", tone: "warn", icon: "warning" }} />}</td>
                      <td>{guardian.status === "inactive" ? "Inactive" : guardian.status === "pending_invite" ? "Invite pending" : "Active"}</td>
                      <td className="right"><div className="bb-row" style={{ justifyContent: "flex-end", flexWrap: "nowrap", gap: 5 }}><button className="bb-btn bb-btn-secondary" onClick={(event) => { event.stopPropagation(); setPinFor(guardian); }}>Reset PIN</button><CaretRight size={18} color="var(--bb-accent)" weight="fill" /></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyState compact title="No guardians match">Try a different filter or search.</EmptyState>}
          <Pagination page={paged.page} pageCount={paged.pageCount} total={paged.total} pageSize={paged.pageSize} onChange={paged.setPage} />
          <p className="bb-note"><DeviceTablet size={18} color="var(--bb-accent)" />Guardians don’t need an email address or an account. They sign at the tablet with their own PIN.</p>
        </>
      )}

      {panel === "create" ? (
        <Drawer title="Add a guardian" onClose={() => setPanel(null)} footer={<><button className="bb-btn bb-btn-secondary bb-btn-lg" onClick={() => setPanel(null)}>Cancel</button><button className="bb-btn bb-btn-primary bb-btn-lg" form="create-guardian" disabled={saving}>{saving ? "Saving…" : "Add guardian"}</button></>}>
          {actionError ? <Alert tone="danger">{actionError}</Alert> : null}
          <form id="create-guardian" className="bb-stack" onSubmit={createGuardian}>
            <Field label="Name"><input className="bb-input" value={name} onChange={(event) => setName(event.target.value)} required /></Field>
            <div className="bb-form-grid">
              <Field label="Phone"><input className="bb-input" value={phone} onChange={(event) => setPhone(event.target.value)} /></Field>
              <Field label="Relationship"><input className="bb-input" value={relationship} onChange={(event) => setRelationship(event.target.value)} placeholder="Mother, aunt, family friend…" /></Field>
            </div>
            <Field label="Tablet PIN (optional)" hint="4–8 digits. Used to verify drop-offs and pickups at the tablet."><input className="bb-input" type="password" inputMode="numeric" value={pin} onChange={(event) => setPin(event.target.value)} /></Field>
            <ChildSelect children={data?.children ?? []} value={createChildId} onChange={setCreateChildId} label="Link a child now (optional)" placeholder="No child selected" />
          </form>
        </Drawer>
      ) : null}

      {panel === "link" ? (
        <Dialog title="Link a guardian to a child" onClose={() => setPanel(null)} actions={<><button className="bb-btn bb-btn-secondary" onClick={() => setPanel(null)}>Cancel</button><button className="bb-btn bb-btn-primary" form="link-guardian" disabled={saving}>{saving ? "Saving…" : "Link guardian"}</button></>}>
          {actionError ? <Alert tone="danger">{actionError}</Alert> : null}
          <form id="link-guardian" className="bb-stack" onSubmit={linkGuardian}>
            <ChildSelect children={data?.children ?? []} value={linkChildId} onChange={setLinkChildId} label="Child" placeholder="Choose a child" />
            <GuardianSelect guardians={guardians} value={linkGuardianId} onChange={setLinkGuardianId} label="Guardian" />
          </form>
        </Dialog>
      ) : null}

      {pinFor ? (
        <PinDialog title={`Reset tablet PIN · ${pinFor.name}`} description="The guardian uses this PIN to sign drop-offs and pickups at the tablet." onClose={() => setPinFor(null)} onSave={async (next) => {
          try {
            const response = await guardiansApi.resetPin(pinFor.id, next);
            toast(response.message);
            setPinFor(null);
            await reload();
          } catch (err) {
            throw new Error(friendlyError(getApiError(err).message));
          }
        }} />
      ) : null}
    </main>
  );
}
