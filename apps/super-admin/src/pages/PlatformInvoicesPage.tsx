import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { superAdminApi } from "@barbaari/shared";
import { Alert, Badge, DataTable, ErrorState, Header, LoadingState, Modal, Panel } from "../components/Ui";
import { useAsyncData } from "../hooks/useAsyncData";
import { dateShort, errorMessage, money, titleize } from "../utils/format";

const invoiceForm = { subscription_id: "", organization_id: "", due_date: "", subtotal: "", notes: "" };
const paymentForm = { amount: "", method: "manual", reference: "", notes: "" };

export function PlatformInvoicesPage() {
  const { data, loading, error, reload } = useAsyncData(async () => {
    const [invoices, subscriptions] = await Promise.all([superAdminApi.platformInvoices(), superAdminApi.subscriptions()]);
    return { invoices: invoices.invoices, subscriptions: subscriptions.subscriptions, organizations: subscriptions.organizations };
  }, []);
  const [creating, setCreating] = useState(false);
  const [paying, setPaying] = useState<any | null>(null);
  const [form, setForm] = useState<any>(invoiceForm);
  const [payment, setPayment] = useState<any>(paymentForm);
  const [success, setSuccess] = useState("");
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);

  const payable = useMemo(() => (data?.invoices ?? []).filter((invoice: any) => !["paid", "void", "canceled"].includes(invoice.status)), [data?.invoices]);

  async function run(action: () => Promise<unknown>, message: string) {
    setSuccess("");
    setActionError("");
    setSaving(true);
    try {
      await action();
      setSuccess(message);
      setCreating(false);
      setPaying(null);
      setForm(invoiceForm);
      setPayment(paymentForm);
      await reload();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function submitInvoice(event: FormEvent) {
    event.preventDefault();
    void run(() => superAdminApi.createPlatformInvoice({
      subscription_id: form.subscription_id || undefined,
      organization_id: form.organization_id || undefined,
      due_date: form.due_date || undefined,
      subtotal: form.subtotal === "" ? undefined : Number(form.subtotal),
      notes: form.notes || undefined,
    }), "Platform invoice created.");
  }

  function submitPayment(event: FormEvent) {
    event.preventDefault();
    if (!paying) return;
    void run(() => superAdminApi.recordPlatformPayment(paying.id, { ...payment, amount: Number(payment.amount) }), "Platform payment recorded.");
  }

  return <section className="page">
    <Header eyebrow="Platform Billing" title="Platform invoices" action={<button className="primary" onClick={() => setCreating(true)}>Create invoice</button>} />
    <Alert message={success} />
    <Alert message={actionError} tone="danger" />
    <Panel title="Manual payment workflow">
      <p className="muted">Use these invoices for Barbaari platform charges to daycare organizations. Parent tuition billing remains separate.</p>
    </Panel>
    {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={reload} /> : <DataTable rows={data?.invoices ?? []} columns={[
      { header: "Invoice", render: (row: any) => <><strong>{row.invoice_number}</strong><br /><small>{row.organization?.name}</small></> },
      { header: "Period", render: (row: any) => `${dateShort(row.billing_period_start)} - ${dateShort(row.billing_period_end)}` },
      { header: "Due", render: (row: any) => dateShort(row.due_date) },
      { header: "Total", render: (row: any) => `${row.currency} ${money(row.total_amount)}` },
      { header: "Paid", render: (row: any) => money(row.amount_paid) },
      { header: "Balance", render: (row: any) => money(row.balance_due) },
      { header: "Status", render: (row: any) => <Badge tone={row.status === "paid" ? "success" : row.status === "overdue" ? "danger" : "warning"}>{titleize(row.status)}</Badge> },
      { header: "Actions", render: (row: any) => <div className="row-actions"><button className="secondary" disabled={!payable.some((invoice: any) => invoice.id === row.id)} onClick={() => { setPaying(row); setPayment({ ...paymentForm, amount: String(row.balance_due ?? "") }); }}>Record payment</button><button className="secondary" onClick={() => run(() => superAdminApi.markPlatformInvoicePaid(row.id, { method: "manual", reference: "Marked paid" }), "Invoice marked paid.")}>Mark paid</button><button className="secondary" disabled={row.status === "void"} onClick={() => run(() => superAdminApi.voidPlatformInvoice(row.id), "Invoice voided.")}>Void</button><Badge>Receipt placeholder</Badge></div> }
    ]} />}

    {creating ? <Modal title="Create platform invoice" onClose={() => setCreating(false)}>
      <form className="form-grid two" onSubmit={submitInvoice}>
        <select value={form.subscription_id} onChange={(event) => setForm({ ...form, subscription_id: event.target.value })}>
          <option value="">Choose subscription</option>
          {(data?.subscriptions ?? []).map((subscription: any) => <option key={subscription.id} value={subscription.id}>{subscription.organization?.name} - {subscription.pricing_plan?.name}</option>)}
        </select>
        <input type="date" value={form.due_date} onChange={(event) => setForm({ ...form, due_date: event.target.value })} />
        <input type="number" step="0.01" value={form.subtotal} onChange={(event) => setForm({ ...form, subtotal: event.target.value })} placeholder="Override subtotal optional" />
        <input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Notes" />
        <button className="primary" disabled={saving}>{saving ? "Saving..." : "Create invoice"}</button>
      </form>
    </Modal> : null}

    {paying ? <Modal title={`Record payment for ${paying.invoice_number}`} onClose={() => setPaying(null)}>
      <form className="form-grid two" onSubmit={submitPayment}>
        <input type="number" step="0.01" value={payment.amount} onChange={(event) => setPayment({ ...payment, amount: event.target.value })} placeholder="Amount" required />
        <select value={payment.method} onChange={(event) => setPayment({ ...payment, method: event.target.value })}><option value="manual">Manual</option><option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option><option value="stripe_test">Stripe test</option></select>
        <input value={payment.reference} onChange={(event) => setPayment({ ...payment, reference: event.target.value })} placeholder="Reference" />
        <input value={payment.notes} onChange={(event) => setPayment({ ...payment, notes: event.target.value })} placeholder="Notes" />
        <button className="primary" disabled={saving}>{saving ? "Saving..." : "Record payment"}</button>
      </form>
    </Modal> : null}
  </section>;
}
