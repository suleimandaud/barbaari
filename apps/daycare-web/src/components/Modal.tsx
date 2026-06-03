import React from "react";

export function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="modal-panel" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
        <div className="panel-header"><h2>{title}</h2><button className="secondary" onClick={onClose}>Close</button></div>
        {children}
      </section>
    </div>
  );
}
