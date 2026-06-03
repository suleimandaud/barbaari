import React from "react";

export function LoadingState({ label = "Loading data..." }: { label?: string }) {
  return <section className="panel"><strong>{label}</strong></section>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <section className="panel">
      <div className="panel-header"><h2>Something went wrong</h2>{onRetry ? <button className="secondary" onClick={onRetry}>Retry</button> : null}</div>
      <span>{message}</span>
    </section>
  );
}

export function EmptyState({ title = "No records yet", detail = "Create a record or adjust filters to see results." }: { title?: string; detail?: string }) {
  return <section className="panel"><h2>{title}</h2><p>{detail}</p></section>;
}

export function Badge({ children, tone = "primary" }: { children: React.ReactNode; tone?: string }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
