import React from "react";
import { Header, DataTable, Column, ApiForm, ErrorState, LoadingState } from "../components/Ui";
import { useAsyncData } from "../hooks/useAsyncData";

export function ResourcePage<T>({ eyebrow, title, loader, columns, form, actions }: { eyebrow: string; title: string; loader: () => Promise<T[]>; columns: Column<T>[]; form?: { fields: Array<{ name: string; label: string; type?: string }>; submitLabel: string; onSubmit: (values: Record<string, any>) => Promise<void> }; actions?: (reload: () => Promise<void>) => React.ReactNode }) {
  const { data, loading, error, reload } = useAsyncData(loader, [loader]);
  return <section className="page"><Header eyebrow={eyebrow} title={title} action={actions?.(reload)} />{form ? <ApiForm fields={form.fields} submitLabel={form.submitLabel} onSubmit={async (values) => { await form.onSubmit(values); await reload(); }} /> : null}{loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={reload} /> : <DataTable rows={data ?? []} columns={columns} />}</section>;
}
