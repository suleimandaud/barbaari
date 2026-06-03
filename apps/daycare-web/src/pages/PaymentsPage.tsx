import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { billingApi, getApiError } from "@barbaari/shared";
import { ErrorAlert, SuccessAlert } from "../components/Alerts";
import { DataTable } from "../components/DataTable";
import { PageHeader, Panel } from "../components/Page";
import { Badge, ErrorState, LoadingState } from "../components/Status";
import { useAsyncData } from "../hooks/useAsyncData";
import { friendlyError } from "../utils/labels";

function invoiceLabel(invoice: any) {
  const child = invoice.childName ?? "General";
  const code = invoice.childCode ? ` - ${invoice.childCode}` : "";
  const due = invoice.dueDate ? ` - due ${invoice.dueDate}` : "";
  return `${invoice.id} - ${child}${code} - $${Number(invoice.amount).toFixed(2)}${due}`;
}

function paymentChild(row: any) {
  const name = [row.first_name, row.last_name].filter(Boolean).join(" ");
  return name ? `${name}${row.child_code ? ` - ${row.child_code}` : ""}` : "General";
}

export function PaymentsPage() {
  const { data, loading, error, reload } = useAsyncData(async () => {
    const [payments, invoices] = await Promise.all([billingApi.payments(), billingApi.managerInvoices()]);
    return { payments: payments.payments, invoices: invoices.invoices };
  }, []);
  const [invoiceId, setInvoiceId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [actionError, setActionError] = useState("");

  const payableInvoices = useMemo(() => (data?.invoices ?? []).filter((invoice: any) => invoice.status !== "paid"), [data?.invoices]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSuccess("");
    setActionError("");
    if (!invoiceId) {
      setActionError("Please choose an invoice from the list.");
      return;
    }
    setSaving(true);
    try {
      await billingApi.recordPayment(invoiceId, { amount: Number(amount), method: method || "cash" });
      setSuccess("Payment recorded.");
      setInvoiceId("");
      setAmount("");
      setMethod("cash");
      await reload();
    } catch (err) {
      setActionError(friendlyError(getApiError(err).message));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="page">
      <PageHeader eyebrow="Finance" title="Payments" description="Record and review family payments without exposing internal invoice IDs." />
      <SuccessAlert message={success} />
      <ErrorAlert message={actionError} />
      <Panel title="Record payment">
        <form className="form-grid" onSubmit={submit}>
          <label className="field-stack full">
            <span>Invoice</span>
            <select value={invoiceId} onChange={(event) => setInvoiceId(event.target.value)} required>
              <option value="">Choose invoice</option>
              {payableInvoices.map((invoice: any) => (
                <option key={invoice.databaseId ?? invoice.id} value={invoice.databaseId ?? ""}>{invoiceLabel(invoice)}</option>
              ))}
            </select>
          </label>
          <label className="field-stack">
            <span>Amount</span>
            <input type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required />
          </label>
          <label className="field-stack">
            <span>Method</span>
            <select value={method} onChange={(event) => setMethod(event.target.value)}>
              <option value="cash">Cash</option>
              <option value="check">Check</option>
              <option value="card">Card</option>
              <option value="bank_transfer">Bank transfer</option>
            </select>
          </label>
          <button className="primary" disabled={saving}>{saving ? "Saving..." : "Record payment"}</button>
        </form>
      </Panel>
      {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={reload} /> : (
        <DataTable rows={data?.payments ?? []} columns={[
          { header: "Payment", render: (row: any) => `Payment ${row.id}` },
          { header: "Invoice", render: (row: any) => row.invoice_number ?? `Invoice ${row.invoice_id}` },
          { header: "Child", render: paymentChild },
          { header: "Amount", render: (row: any) => `$${Number(row.amount).toFixed(2)}` },
          { header: "Method", render: (row: any) => row.method },
          { header: "Status", render: (row: any) => <Badge tone={row.status === "paid" ? "success" : "warning"}>{row.status}</Badge> }
        ]} />
      )}
    </section>
  );
}
