import React from "react";
import { EmptyState } from "./Status";

export type Column<T> = {
  header: string;
  render: (row: T) => React.ReactNode;
  align?: "right";
};

export function DataTable<T>({ rows, columns, emptyTitle, emptyDetail, onRowClick }: { rows: T[]; columns: Column<T>[]; emptyTitle?: string; emptyDetail?: string; onRowClick?: (row: T) => void }) {
  if (!rows.length) return <EmptyState title={emptyTitle} detail={emptyDetail} />;

  return (
    <div className="bb-table-wrap">
      <table className="bb-table">
        <thead>
          <tr>{columns.map((column) => <th key={column.header} className={column.align === "right" ? "right" : undefined}>{column.header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={String((row as any).id ?? index)} className={onRowClick ? "clickable" : undefined} onClick={onRowClick ? () => onRowClick(row) : undefined}>
              {columns.map((column) => <td key={column.header} className={column.align === "right" ? "right" : undefined}>{column.render(row)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
