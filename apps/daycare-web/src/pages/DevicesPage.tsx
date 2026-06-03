import { devicesApi } from "@barbaari/shared";
import { ResourcePage, statusBadge } from "./ResourcePage";

export function DevicesPage() {
  return <ResourcePage eyebrow="Kiosk/tablet" title="Devices" loader={async () => (await devicesApi.list()).devices} columns={[
    { header: "Name", render: (row: any) => row.name },
    { header: "Type", render: (row: any) => row.type },
    { header: "Identifier", render: (row: any) => row.identifier },
    { header: "Status", render: (row: any) => statusBadge(row.status) }
  ]} />;
}
