import React from "react";

export function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="page-header">
      <div><span>{eyebrow}</span><h1>{title}</h1>{description ? <p>{description}</p> : null}</div>
      {action}
    </div>
  );
}

export function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return <article className="panel"><div className="panel-header"><h2>{title}</h2>{action}</div>{children}</article>;
}
