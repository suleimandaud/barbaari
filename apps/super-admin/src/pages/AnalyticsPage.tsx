import { superAdminApi } from "@barbaari/shared";
import { ResourcePage } from "./ResourcePage";

export function AnalyticsPage() {
  return <ResourcePage eyebrow="Analytics" title="Reports and analytics" loader={async () => (await superAdminApi.organizations()).organizations} columns={[
    { header: "Organization", render: (row: any) => row.name },
    { header: "Status", render: (row: any) => row.status },
    { header: "Children", render: (row: any) => row.children },
    { header: "Staff", render: (row: any) => row.staff },
    { header: "MRR", render: (row: any) => `$${row.mrr}` }
  ]} />;
}
