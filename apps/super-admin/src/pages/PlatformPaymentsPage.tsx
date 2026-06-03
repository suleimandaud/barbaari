import { superAdminApi } from "@barbaari/shared";
import { Badge, DataTable, ErrorState, Header, LoadingState } from "../components/Ui";
import { useAsyncData } from "../hooks/useAsyncData";
import { dateShort, money, titleize } from "../utils/format";

export function PlatformPaymentsPage() {
  const { data, loading, error, reload } = useAsyncData(async () => (await superAdminApi.platformPayments()).payments, []);
  async function downloadReceipt(id: string | number) {
    const response = await superAdminApi.downloadPlatformPaymentReceiptPdf(id);
    const url = URL.createObjectURL(response.data);
    const link = document.createElement("a");
    link.href = url;
    link.download = `platform-payment-${id}-receipt.pdf`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return <section className="page">
    <Header eyebrow="Platform Billing" title="Platform payments" />
    {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={reload} /> : <DataTable rows={data ?? []} columns={[
      { header: "Organization", render: (row: any) => row.organization?.name ?? "Organization" },
      { header: "Invoice", render: (row: any) => row.invoice_number ?? row.invoice_id },
      { header: "Amount", render: (row: any) => `${row.currency ?? "USD"} ${money(row.amount)}` },
      { header: "Method", render: (row: any) => <Badge>{titleize(row.method)}</Badge> },
      { header: "Reference", render: (row: any) => row.reference ?? "Manual payment" },
      { header: "Recorded by", render: (row: any) => row.recorded_by_name ?? "System" },
      { header: "Paid", render: (row: any) => dateShort(row.paid_at) },
      { header: "Receipt", render: (row: any) => <button className="secondary" onClick={() => downloadReceipt(row.id)}>Download</button> }
    ]} />}
  </section>;
}
