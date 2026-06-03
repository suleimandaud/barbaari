import type { FormEvent } from "react";
import { useState } from "react";
import { billingApi, childrenApi, getApiError } from "@barbaari/shared";
import { PageHeader, Panel } from "../components/Page";
import { DataTable } from "../components/DataTable";
import { Badge, ErrorState, LoadingState } from "../components/Status";
import { ErrorAlert, SuccessAlert } from "../components/Alerts";
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
  const [success, setSuccess] = useState("");
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setActionError("");
    setSuccess("");
    if (!childId) {
      setActionError("Please select a child from the list.");
      return;
    }
    setSaving(true);
    try {
      await billingApi.createInvoice({ child_id: childId, amount: Number(amount), due_date: dueDate, description });
      setSuccess("Invoice created.");
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

  return (
    <section className="page">
      <PageHeader eyebrow="Billing" title="Invoices" />
      <SuccessAlert message={success} />
      <ErrorAlert message={actionError} />
      <Panel title="Create invoice">
        <form className="form-grid" onSubmit={submit}>
          <div className="full"><ChildSelect children={data?.children ?? []} value={childId} onChange={setChildId} /></div>
          <input type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Amount" required />
          <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} aria-label="Due date" required />
          <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description / invoice note" />
          <button className="primary" disabled={saving}>{saving ? "Saving..." : "Create invoice"}</button>
        </form>
      </Panel>
      {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={reload} /> : (
        <DataTable rows={data?.invoices ?? []} columns={[
          { header: "Invoice", render: (row: any) => row.id },
          { header: "Child", render: (row: any) => <><strong>{row.childName}</strong><br /><small>{row.childCode ? `ID: ${row.childCode}` : "No child code"}</small></> },
          { header: "Amount", render: (row: any) => `$${Number(row.amount).toFixed(2)}` },
          { header: "Due", render: (row: any) => row.dueDate },
          { header: "Status", render: (row: any) => <Badge tone={row.status === "paid" ? "success" : row.status === "overdue" ? "danger" : "warning"}>{row.status}</Badge> }
        ]} />
      )}
    </section>
  );
}
