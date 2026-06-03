import { classroomsApi } from "@barbaari/shared";
import { ResourcePage } from "./ResourcePage";

export function ClassroomsPage() {
  return (
    <ResourcePage
      eyebrow="Operations"
      title="Classrooms"
      loader={async () => (await classroomsApi.list()).classrooms}
      columns={[
        { header: "Room", render: (row: any) => row.name },
        { header: "Capacity", render: (row: any) => row.capacity },
        { header: "Children", render: (row: any) => row.children_count ?? 0 },
        { header: "Created", render: (row: any) => new Date(row.created_at).toLocaleDateString() }
      ]}
      form={{
        submitLabel: "Create classroom",
        fields: [{ name: "name", label: "Name" }, { name: "capacity", label: "Capacity", type: "number" }],
        onSubmit: (values) => classroomsApi.create({ name: values.name, capacity: Number(values.capacity || 20) }).then(() => undefined)
      }}
    />
  );
}
