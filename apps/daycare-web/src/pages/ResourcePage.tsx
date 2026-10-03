import React from "react";
import { PageHeader, StatusBadge } from "@barbaari/shared/web/ui";
import { accountStatuses, invoiceStatuses } from "@barbaari/shared/web/status";
import { DataTable, Column } from "../components/DataTable";
import { ApiForm, Field } from "../components/Form";
import { ErrorState, LoadingState } from "../components/Status";
import { useAsyncData } from "../hooks/useAsyncData";

export type ResourcePageProps<T> = {
  eyebrow: string;
  title: string;
  loader: () => Promise<T[]>;
  columns: Column<T>[];
  form?: { fields: Field[]; submitLabel: string; onSubmit: (values: Record<string, any>) => Promise<void>; title?: string };
  actions?: (reload: () => Promise<void>) => React.ReactNode;
  children?: React.ReactNode;
  emptyTitle?: string;
  emptyDetail?: string;
};

export function ResourcePage<T>({ eyebrow, title, loader, columns, form, actions, children, emptyTitle, emptyDetail }: ResourcePageProps<T>) {
  const { data, loading, error, reload } = useAsyncData(loader, [loader]);

  return (
    <main className="bb-page">
      <PageHeader kicker={eyebrow} title={title} actions={actions?.(reload)} />
      {children}
      {form ? <ApiForm title={form.title} fields={form.fields} submitLabel={form.submitLabel} onSubmit={async (values) => { await form.onSubmit(values); await reload(); }} /> : null}
      {loading && !data ? <LoadingState /> : error ? <ErrorState message={error} onRetry={reload} /> : <DataTable rows={data ?? []} columns={columns} emptyTitle={emptyTitle} emptyDetail={emptyDetail} />}
    </main>
  );
}

export function statusBadge(value?: string) {
  const key = String(value ?? "");
  const map = key in invoiceStatuses ? invoiceStatuses : accountStatuses;
  return <StatusBadge size="sm" map={map} value={key || "unknown"} />;
}
