import React from "react";
import { PageHeader } from "../components/Page";
import { DataTable, Column } from "../components/DataTable";
import { ApiForm, Field } from "../components/Form";
import { Badge, ErrorState, LoadingState } from "../components/Status";
import { useAsyncData } from "../hooks/useAsyncData";

export type ResourcePageProps<T> = {
  eyebrow: string;
  title: string;
  loader: () => Promise<T[]>;
  columns: Column<T>[];
  form?: { fields: Field[]; submitLabel: string; onSubmit: (values: Record<string, any>) => Promise<void> };
  actions?: (reload: () => Promise<void>) => React.ReactNode;
  children?: React.ReactNode;
};

export function ResourcePage<T>({ eyebrow, title, loader, columns, form, actions, children }: ResourcePageProps<T>) {
  const { data, loading, error, reload } = useAsyncData(loader, [loader]);

  return (
    <section className="page">
      <PageHeader eyebrow={eyebrow} title={title} action={actions?.(reload)} />
      {children}
      {form ? <ApiForm fields={form.fields} submitLabel={form.submitLabel} onSubmit={async (values) => { await form.onSubmit(values); await reload(); }} /> : null}
      {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={reload} /> : <DataTable rows={data ?? []} columns={columns} />}
    </section>
  );
}

export function statusBadge(value?: string) {
  const tone = value === "paid" || value === "active" || value === "checked_in" ? "success" : value === "overdue" || value === "suspended" ? "danger" : value === "open" || value === "pending" ? "warning" : "primary";
  return <Badge tone={tone}>{value ?? "unknown"}</Badge>;
}
