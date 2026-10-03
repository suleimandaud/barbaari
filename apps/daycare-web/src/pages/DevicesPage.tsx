import { DeviceTablet } from "@phosphor-icons/react";
import { devicesApi } from "@barbaari/shared";
import { ResourcePage, statusBadge } from "./ResourcePage";

const words = (value?: string | null) => String(value ?? "").replace(/_/g, " ").replace(/^\w/, (letter) => letter.toUpperCase());

export function DevicesPage() {
  return <ResourcePage eyebrow="Kiosk / tablet" title="Devices" emptyTitle="No devices registered" emptyDetail="Tablets appear here once they are set up for tablet mode." loader={async () => (await devicesApi.list()).devices} columns={[
    { header: "Name", render: (row: any) => <span className="bb-row" style={{ gap: 10, flexWrap: "nowrap" }}><DeviceTablet size={22} color="var(--bb-accent)" aria-hidden /><strong>{row.name}</strong></span> },
    { header: "Type", render: (row: any) => words(row.type) },
    { header: "Identifier", render: (row: any) => <span className="bb-num bb-caption">{row.identifier}</span> },
    { header: "Status", render: (row: any) => statusBadge(row.status) }
  ]} />;
}
