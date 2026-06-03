import { superAdminApi } from "@barbaari/shared";
import { Badge } from "../components/Ui";
import { dateShort } from "../utils/format";
import { ResourcePage } from "./ResourcePage";

export function SecurityPage() {
  return <ResourcePage eyebrow="Security" title="Audit logs" loader={async () => (await superAdminApi.auditLogs()).audit_logs} columns={[
    { header: "Action", render: (row: any) => <Badge>{row.action}</Badge> },
    { header: "Actor", render: (row: any) => <><strong>{row.actorName ?? "System"}</strong><br /><small>{row.actorEmail ?? "Automated"}</small></> },
    { header: "Target", render: (row: any) => <><strong>{row.targetName ?? "n/a"}</strong><br /><small>{row.targetType ?? "n/a"}</small></> },
    { header: "Organization", render: (row: any) => row.organization ?? "Platform" },
    { header: "IP", render: (row: any) => row.ip_address ?? "n/a" },
    { header: "Created", render: (row: any) => dateShort(row.created_at) }
  ]} />;
}
