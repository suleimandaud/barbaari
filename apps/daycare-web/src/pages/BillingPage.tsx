import type { FormEvent } from "react";
import { useState } from "react";
import { billingApi, childrenApi, getApiError } from "@barbaari/shared";
import { Link } from "react-router-dom";
import { Money } from "@phosphor-icons/react";
import { Alert, ErrorState, Field, LoadingState, PageHeader, Stat, StatusBadge, money, shortDate, useToast } from "@barbaari/shared/web/ui";
import { invoiceStatuses } from "@barbaari/shared/web/status";
import { DataTable } from "../components/DataTable";
import { ChildSelect } from "../components/Selects";
import { useAsyncData } from "../hooks/useAsyncData";
import { friendlyError } from "../utils/labels";

export function BillingPage() {
  const { data, loading, error, reload } = useAsyncData(async () => {
    const [invoices, children] = await Promise.all([billingApi.managerInvoices(), childrenApi.managerList()]);
    return { invoices: invoices.invoices, children: children.children };
  }, []);
  const [childId, setChildId] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [description, setDescription] = useState("");
  const toast = useToast();
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setActionError("");
    if (!childId) {
      setActionError("Please select a child from the list.");
      return;
    }
    setSaving(true);
    try {
      await billingApi.createInvoice({ child_id: childId, amount: Number(amount), due_date: dueDate, description });
      toast("Invoice created.");
      setChildId("");
      setAmount("");
      setDueDate("");
      setDescription("");
      await reload();
    } catch (err) {
      setActionError(friendlyError(getApiError(err).message));
    } finally {
      setSaving(false);
    }
  }

  const invoices = (data?.invoices ?? []) as any[];
  const outstanding = invoices.filter((invoice) => !["paid", "void"].includes(String(invoice.status)));
  return (
    <main className="bb-page">
      <PageHeader kicker="Family tuition billing" title="Invoices" actions={<Link className="bb-btn bb-btn-secondary bb-btn-lg" to="/payments"><Money />Record payment</Link>} />
      {actionError ? <Alert tone="danger">{actionError}</Alert> : null}
      <div className="bb-grid-main-side">
        <section>
          {invoices.length ? (
            <div className="bb-stats" style={{ marginBottom: 30 }}>
              <Stat value={invoices.length} label="Invoices" />
              <Stat value={money(outstanding.reduce((sum, invoice) => sum + Number(invoice.amount ?? 0), 0))} label={`Outstanding · ${outstanding.length}`} />
              <Stat value={invoices.filter((invoice) => invoice.status === "overdue").length} label="Overdue" tone={invoices.some((invoice) => invoice.status === "overdue") ? "danger" : undefined} />
            </div>
          ) : null}
          {loading && !data ? <LoadingState /> : error ? <ErrorState message={error} onRetry={reload} /> : (
            <DataTable rows={invoices} emptyTitle="No invoices yet" emptyDetail="Create an invoice for a family with the form." columns={[
              { header: "Invoice", render: (row: any) => <strong style={{ whiteSpace: "nowrap" }}>{row.id}</strong> },
              { header: "Child", render: (row: any) => <div><span>{row.childName}</span><span className="bb-caption" style={{ display: "block" }}>{row.childCode ? `ID ${row.childCode}` : "No child code"}</span></div> },
              { header: "Amount", align: "right", render: (row: any) => <span className="bb-num">{money(row.amount)}</span> },
              { header: "Due", render: (row: any) => <span style={{ whiteSpace: "nowrap" }}>{shortDate(row.dueDate, { day: "numeric", month: "short", year: "numeric" })}</span> },
              { header: "Status", render: (row: any) => <StatusBadge size="sm" map={invoiceStatuses} value={row.status} /> }
            ]} />
          )}
        </section>
        <aside className="bb-panel">
          <h3>Create invoice</h3>
          <form className="bb-stack" onSubmit={submit}>
            <ChildSelect children={data?.children ?? []} value={childId} onChange={setChildId} label="Child" placeholder="Choose a child" />
            <Field label="Amount"><input className="bb-input white" type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" required /></Field>
            <Field label="Due date"><input className="bb-input white" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} required /></Field>
            <Field label="Description"><input className="bb-input white" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="e.g. October tuition" /></Field>
            <button className="bb-btn bb-btn-primary bb-btn-lg bb-btn-block" disabled={saving}>{saving ? "Saving…" : "Create invoice"}</button>
          </form>
        </aside>
      </div>
    </main>
  );
}
