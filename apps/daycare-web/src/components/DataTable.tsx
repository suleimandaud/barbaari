import React from "react";
import { EmptyState } from "./Status";

export type Column<T> = {
  header: string;
  render: (row: T) => React.ReactNode;
};

export function DataTable<T>({ rows, columns, emptyTitle, emptyDetail }: { rows: T[]; columns: Column<T>[]; emptyTitle?: string; emptyDetail?: string }) {
  if (!rows.length) return <EmptyState title={emptyTitle} detail={emptyDetail} />;

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{columns.map((column) => <th key={column.header}>{column.header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={String((row as any).id ?? index)}>{columns.map((column) => <td key={column.header}>{column.render(row)}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
