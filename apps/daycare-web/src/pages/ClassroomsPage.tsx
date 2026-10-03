import { classroomsApi } from "@barbaari/shared";
import { Meter, shortDate } from "@barbaari/shared/web/ui";
import { ResourcePage } from "./ResourcePage";

export function ClassroomsPage() {
  return (
    <ResourcePage
      eyebrow="Operations"
      title="Classrooms"
      emptyTitle="No classrooms yet"
      emptyDetail="Create your first classroom above, then assign children to it."
      loader={async () => (await classroomsApi.list()).classrooms}
      columns={[
        { header: "Room", render: (row: any) => <strong>{row.name}</strong> },
        { header: "Children", render: (row: any) => <div className="bb-row" style={{ flexWrap: "nowrap", gap: 10 }}><div style={{ flex: "0 1 140px" }}><Meter value={row.children_count ?? 0} max={row.capacity || 1} label={`${row.children_count ?? 0} of ${row.capacity}`} /></div><span className="bb-num">{row.children_count ?? 0} of {row.capacity}</span></div> },
        { header: "Capacity", align: "right", render: (row: any) => <span className="bb-num">{row.capacity}</span> },
        { header: "Created", render: (row: any) => shortDate(row.created_at, { day: "numeric", month: "short", year: "numeric" }) }
      ]}
      form={{
        title: "Add a classroom",
        submitLabel: "Create classroom",
        fields: [{ name: "name", label: "Name", placeholder: "e.g. Sunflower Room" }, { name: "capacity", label: "Capacity", type: "number", placeholder: "20" }],
        onSubmit: (values) => classroomsApi.create({ name: values.name, capacity: Number(values.capacity || 20) }).then(() => undefined)
      }}
    />
  );
}
