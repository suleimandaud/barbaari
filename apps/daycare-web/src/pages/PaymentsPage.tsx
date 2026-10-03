import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { billingApi, getApiError } from "@barbaari/shared";
import { Link } from "react-router-dom";
import { Alert, ErrorState, Field, LoadingState, PageHeader, Segmented, StatusBadge, money, shortDate, useToast } from "@barbaari/shared/web/ui";
import { invoiceStatuses } from "@barbaari/shared/web/status";
import { DataTable } from "../components/DataTable";
import { useAsyncData } from "../hooks/useAsyncData";
import { friendlyError } from "../utils/labels";

function invoiceLabel(invoice: any) {
  const child = invoice.childName ?? "General";
  const code = invoice.childCode ? ` · ${invoice.childCode}` : "";
  const due = invoice.dueDate ? ` · due ${invoice.dueDate}` : "";
  return `${invoice.id} · ${child}${code} · ${money(invoice.amount)}${due}`;
}

function paymentChild(row: any) {
  const name = [row.first_name, row.last_name].filter(Boolean).join(" ");
  return name ? `${name}${row.child_code ? ` · ${row.child_code}` : ""}` : "General";
}

const methodLabel = (value?: string | null) => String(value ?? "").replace(/_/g, " ").replace(/^\w/, (letter) => letter.toUpperCase());

export function PaymentsPage() {
  const { data, loading, error, reload } = useAsyncData(async () => {
    const [payments, invoices] = await Promise.all([billingApi.payments(), billingApi.managerInvoices()]);
    return { payments: payments.payments, invoices: invoices.invoices };
  }, []);
  const [invoiceId, setInvoiceId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const [actionError, setActionError] = useState("");

  const payableInvoices = useMemo(() => (data?.invoices ?? []).filter((invoice: any) => invoice.status !== "paid"), [data?.invoices]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setActionError("");
    if (!invoiceId) {
      setActionError("Please choose an invoice from the list.");
      return;
    }
    setSaving(true);
    try {
      await billingApi.recordPayment(invoiceId, { amount: Number(amount), method: method || "cash" });
      toast("Payment recorded.");
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
    <main className="bb-page">
      <PageHeader kicker="Family tuition billing" title="Payments" lede="Record and review family payments." actions={<Link className="bb-btn bb-btn-secondary bb-btn-lg" to="/billing">Invoices</Link>} />
      {actionError ? <Alert tone="danger">{actionError}</Alert> : null}
      <div className="bb-grid-main-side">
        <section>
          {loading && !data ? <LoadingState /> : error ? <ErrorState message={error} onRetry={reload} /> : (
            <DataTable rows={data?.payments ?? []} emptyTitle="No payments yet" emptyDetail="Payments you record appear here." columns={[
              { header: "Payment", render: (row: any) => <span style={{ whiteSpace: "nowrap" }}>Payment {row.id}</span> },
              { header: "Invoice", render: (row: any) => <strong style={{ whiteSpace: "nowrap" }}>{row.invoice_number ?? `Invoice ${row.invoice_id}`}</strong> },
              { header: "Child", render: paymentChild },
              { header: "Amount", align: "right", render: (row: any) => <span className="bb-num">{money(row.amount)}</span> },
              { header: "Method", render: (row: any) => methodLabel(row.method) },
              { header: "Paid", render: (row: any) => <span className="bb-caption" style={{ whiteSpace: "nowrap" }}>{row.paid_at ? shortDate(row.paid_at, { day: "numeric", month: "short", year: "numeric" }) : "—"}</span> },
              { header: "Status", render: (row: any) => <StatusBadge size="sm" map={invoiceStatuses} value={row.status === "paid" ? "paid" : "partial"} label={methodLabel(row.status)} /> }
            ]} />
          )}
        </section>
        <aside className="bb-panel">
          <h3>Record payment</h3>
          <form className="bb-stack" onSubmit={submit}>
            <Field label="Invoice">
              <select className="bb-input white" value={invoiceId} onChange={(event) => setInvoiceId(event.target.value)} required>
                <option value="">Choose invoice</option>
                {payableInvoices.map((invoice: any) => (
                  <option key={invoice.databaseId ?? invoice.id} value={invoice.databaseId ?? ""}>{invoiceLabel(invoice)}</option>
                ))}
              </select>
            </Field>
            <Field label="Amount"><input className="bb-input white" type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" required /></Field>
            <Field label="Method">
              <Segmented label="Payment method" value={method} onChange={setMethod} items={[{ key: "cash", label: "Cash" }, { key: "check", label: "Check" }, { key: "card", label: "Card" }, { key: "bank_transfer", label: "Bank" }]} />
            </Field>
            <button className="bb-btn bb-btn-primary bb-btn-lg bb-btn-block" disabled={saving}>{saving ? "Saving…" : "Record payment"}</button>
          </form>
        </aside>
      </div>
    </main>
  );
}
