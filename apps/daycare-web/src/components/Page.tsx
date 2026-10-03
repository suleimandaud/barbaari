import React from "react";
import { PageHeader as KitPageHeader, SectionHead } from "@barbaari/shared/web/ui";

export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: React.ReactNode }) {
  return <KitPageHeader kicker={eyebrow} title={title} lede={description} actions={action} />;
}

export function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return <section className="bb-section"><SectionHead title={title} action={action} />{children}</section>;
}
