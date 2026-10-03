import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ChatsCircle, DownloadSimple, FilePdf, FileText, Key, LinkSimple, PencilSimple } from "@phosphor-icons/react";
import { attendanceApi, billingApi, childrenApi, documentsApi, getApiError, guardiansApi } from "@barbaari/shared";
import { Alert, Avatar, Dialog, EmptyState, ErrorState, Field, LoadingState, SectionHead, Status, StatusBadge, money, recordTime, shortDate, useToast } from "@barbaari/shared/web/ui";
import { attendanceStatuses, invoiceStatuses } from "@barbaari/shared/web/status";
import { ChildSelect } from "../components/Selects";
import { PinDialog } from "../components/PinDialog";
import { useAsyncData } from "../hooks/useAsyncData";
import { friendlyError } from "../utils/labels";
import { downloadDocument, fileKind } from "../utils/documents";
import { todayStatusByChild } from "../utils/people";

export function GuardianProfilePage() {
  const { guardianId = "" } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { data, loading, error, reload } = useAsyncData(async () => {
    const [guardians, children, documents] = await Promise.all([guardiansApi.list(), childrenApi.managerList(), documentsApi.list()]);
    const guardian = (guardians.guardians ?? []).find((item: any) => String(item.id) === String(guardianId)) ?? null;
    const childIds = (guardian?.children ?? []).map((child: any) => String(child.id));
    // Attendance for this guardian's children only (usually one or two children).
    const attendance = (await Promise.all(childIds.map((id: string) => attendanceApi.managerList({ child_id: id }).then((result) => result.attendance ?? []).catch(() => [])))).flat();
    const invoices = await billingApi.managerInvoices().then((result) => result.invoices ?? []).catch(() => null);
    return { guardian, children: children.children ?? [], documents: documents.documents ?? [], attendance, invoices };
  }, [guardianId]);
  const [dialog, setDialog] = useState<null | "edit" | "link" | "pin">(null);
  const [form, setForm] = useState({ name: "", phone: "", relationship: "", can_pickup: true, status: "active" });
  const [linkChildId, setLinkChildId] = useState("");
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);

  const guardian = data?.guardian;
  const childIds = useMemo(() => new Set((guardian?.children ?? []).map((child: any) => String(child.id))), [guardian]);
  const linkedChildren = (data?.children ?? []).filter((child: any) => childIds.has(String(child.id)));
  const today = new Date().toISOString().slice(0, 10);
  const statusMap = todayStatusByChild(data?.attendance ?? [], [], today);
  const signedByGuardian = (data?.attendance ?? []).filter((record: any) => String(record.guardianId) === String(guardianId))
    .sort((a: any, b: any) => String(b.date).localeCompare(String(a.date))).slice(0, 8);
  const childDocuments = (data?.documents ?? []).filter((document: any) => childIds.has(String(document.child_id)));
  const childCodes = new Set(linkedChildren.map((child: any) => child.childCode));
  const invoices = data?.invoices ? data.invoices.filter((invoice: any) => childCodes.has(invoice.childCode)) : null;

  async function run(action: () => Promise<void>, message: string) {
    setSaving(true);
    setActionError("");
    try {
      await action();
      toast(message);
      setDialog(null);
      await reload();
    } catch (err) {
      setActionError(friendlyError(getApiError(err).message));
    } finally {
      setSaving(false);
    }
  }

  if (loading && !data) return <main className="bb-page"><LoadingState /></main>;
  if (error || !guardian) return <main className="bb-page"><button className="bb-back" onClick={() => navigate("/guardians")}><ArrowLeft size={16} />Guardians & pickups</button><ErrorState message={error || "This guardian could not be found."} onRetry={reload} /></main>;

  return (
    <main className="bb-page">
      <button type="button" className="bb-back" onClick={() => navigate("/guardians")}><ArrowLeft size={16} />Guardians & pickups</button>
      <header className="bb-record-head">
        <Avatar name={guardian.name} seed={guardian.id} size={104} />
        <div className="bb-record-id">
          <h1>{guardian.name}</h1>
          <p>{[guardian.relationship, guardian.phone, guardian.status === "inactive" ? "inactive" : "active"].filter(Boolean).join(" · ")}</p>
          <div className="bb-row" style={{ gap: 10 }}>
            {guardian.can_pickup ? <span className="bb-tag accent">Can pick up</span> : <span className="bb-tag">No pickup</span>}
            {guardian.pin_configured ? <span className="bb-tag"><Key size={14} style={{ marginRight: 5 }} />Tablet PIN set</span> : <Status spec={{ label: "No tablet PIN yet", tone: "warn", icon: "warning" }} size="sm" />}
          </div>
        </div>
        <div className="bb-actions">
          <button className="bb-btn bb-btn-secondary bb-btn-lg" onClick={() => { setForm({ name: guardian.name ?? "", phone: guardian.phone ?? "", relationship: guardian.relationship ?? "", can_pickup: Boolean(guardian.can_pickup), status: guardian.status ?? "active" }); setActionError(""); setDialog("edit"); }}><PencilSimple />Edit</button>
          <button className="bb-btn bb-btn-secondary bb-btn-lg" onClick={() => setDialog("pin")}>Reset PIN</button>
          <Link className="bb-btn bb-btn-primary bb-btn-lg" to="/messages"><ChatsCircle />Message</Link>
        </div>
      </header>
      {actionError && !dialog ? <Alert tone="danger">{actionError}</Alert> : null}

      <div className="bb-grid-2">
        <div>
          <section className="bb-section">
            <SectionHead title="Children" action={<button className="bb-btn bb-btn-ghost" onClick={() => { setLinkChildId(""); setActionError(""); setDialog("link"); }}><LinkSimple size={18} />Link child</button>} />
            {linkedChildren.length ? (
              <div className="bb-list">
                {linkedChildren.map((child: any) => (
                  <div className="bb-list-row" key={child.id}>
                    <Avatar name={child.name} seed={child.id} size={44} />
                    <div className="grow"><Link to={`/children/${child.id}`} style={{ color: "inherit", textDecoration: "none" }}><strong>{child.name}</strong></Link><span className="sub">{[child.classroom, child.childCode].filter(Boolean).join(" · ")}</span></div>
                    <StatusBadge map={attendanceStatuses} value={statusMap.get(String(child.id))?.key ?? "not_checked_in"} />
                  </div>
                ))}
              </div>
            ) : <EmptyState compact title="No children linked">Link this guardian to a child so they can sign at the tablet.</EmptyState>}
          </section>
          <section className="bb-section">
            <SectionHead title="Recent drop-offs & pickups" />
            {signedByGuardian.length ? (
              <table className="bb-table dense">
                <tbody>
                  {signedByGuardian.flatMap((record: any) => [
                    record.checkOutAt && String(record.guardianId) === String(guardianId) ? { key: `${record.id}-out`, when: `${shortDate(record.date, { weekday: "short", day: "numeric", month: "short" })} ${recordTime(record, "out")}`, what: `Checked out ${record.childName}`, how: record.hasSignature ? "PIN + signature" : String(record.verificationMethod ?? "").replace(/_/g, " ") } : null,
                    { key: `${record.id}-in`, when: `${shortDate(record.date, { weekday: "short", day: "numeric", month: "short" })} ${recordTime(record, "in")}`, what: `Checked in ${record.childName}`, how: record.hasSignature ? "PIN + signature" : String(record.verificationMethod ?? "").replace(/_/g, " ") }
                  ]).filter(Boolean).slice(0, 8).map((row: any) => <tr key={row.key}><td className="bb-num" style={{ whiteSpace: "nowrap" }}>{row.when}</td><td>{row.what}</td><td className="right bb-caption">{row.how}</td></tr>)}
                </tbody>
              </table>
            ) : <p className="bb-muted">No drop-offs or pickups signed by {guardian.name} yet.</p>}
          </section>
        </div>
        <div>
          <section className="bb-section">
            <SectionHead title="Documents" />
            {childDocuments.length ? (
              <div className="bb-list">
                {childDocuments.slice(0, 6).map((document: any) => (
                  <div className="bb-list-row" key={document.id}>
                    {fileKind(document) === "PDF" ? <FilePdf size={24} color="var(--bb-accent)" /> : <FileText size={24} color="var(--bb-accent)" />}
                    <div className="grow"><strong>{document.title}</strong><span className="sub">{document.childName}</span></div>
                    <span className="bb-caption">{shortDate(document.created_at)}</span>
                    <button className="bb-btn bb-btn-ghost bb-btn-icon" aria-label={`Download ${document.title}`} onClick={() => downloadDocument(document).catch((err) => setActionError(friendlyError(getApiError(err).message)))}><DownloadSimple size={20} /></button>
                  </div>
                ))}
              </div>
            ) : <p className="bb-muted">No documents for this family’s children.</p>}
          </section>
          <section className="bb-section">
            <SectionHead title="Family billing" />
            {invoices === null ? <p className="bb-muted">Family billing is only visible to billing roles.</p> : invoices.length ? (
              <div className="bb-list">
                {invoices.map((invoice: any) => (
                  <div className="bb-list-row" key={invoice.databaseId ?? invoice.id}>
                    <div className="grow"><strong>{invoice.id}</strong><span className="sub">{invoice.childName} · due {shortDate(invoice.dueDate)}</span></div>
                    <span className="bb-num">{money(invoice.amount)}</span>
                    <StatusBadge map={invoiceStatuses} value={invoice.status} />
                  </div>
                ))}
              </div>
            ) : <p className="bb-muted">No invoices for this family.</p>}
          </section>
        </div>
      </div>

      {dialog === "edit" ? (
        <Dialog title={`Edit ${guardian.name}`} onClose={() => setDialog(null)} actions={<><button className="bb-btn bb-btn-secondary" onClick={() => setDialog(null)}>Cancel</button><button className="bb-btn bb-btn-primary" disabled={saving || !form.name.trim()} onClick={() => run(() => guardiansApi.update(guardian.id, form).then(() => undefined), "Guardian updated.")}>Save guardian</button></>}>
          {actionError ? <Alert tone="danger">{actionError}</Alert> : null}
          <div className="bb-stack">
            <Field label="Name"><input className="bb-input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
            <div className="bb-form-grid">
              <Field label="Phone"><input className="bb-input" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></Field>
              <Field label="Relationship"><input className="bb-input" value={form.relationship} onChange={(event) => setForm({ ...form, relationship: event.target.value })} /></Field>
            </div>
            <Field label="Status"><select className="bb-input" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="active">Active</option><option value="inactive">Inactive</option></select></Field>
            <label className="bb-check"><input type="checkbox" checked={form.can_pickup} onChange={(event) => setForm({ ...form, can_pickup: event.target.checked })} />Allowed to pick up</label>
          </div>
        </Dialog>
      ) : null}

      {dialog === "link" ? (
        <Dialog title="Link a child" onClose={() => setDialog(null)} actions={<><button className="bb-btn bb-btn-secondary" onClick={() => setDialog(null)}>Cancel</button><button className="bb-btn bb-btn-primary" disabled={saving || !linkChildId} onClick={() => run(() => childrenApi.linkGuardian(linkChildId, { guardian_id: guardian.id, pickup_authorized: true }).then(() => undefined), "Child linked.")}>Link child</button></>}>
          {actionError ? <Alert tone="danger">{actionError}</Alert> : null}
          <ChildSelect children={data?.children ?? []} value={linkChildId} onChange={setLinkChildId} label="Child" placeholder="Choose a child" />
        </Dialog>
      ) : null}

      {dialog === "pin" ? (
        <PinDialog title={`Reset tablet PIN · ${guardian.name}`} description="Used to sign drop-offs and pickups at the tablet." onClose={() => setDialog(null)} onSave={async (next) => {
          try {
            const response = await guardiansApi.resetPin(guardian.id, next);
            toast(response.message);
            setDialog(null);
            await reload();
          } catch (err) {
            throw new Error(friendlyError(getApiError(err).message));
          }
        }} />
      ) : null}
    </main>
  );
}
