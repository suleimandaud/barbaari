import React from "react";
import { EmptyState as KitEmpty, ErrorState as KitError, LoadingState as KitLoading } from "@barbaari/shared/web/ui";

export function LoadingState({ label = "Loading" }: { label?: string; rows?: number }) {
  return <KitLoading label={label} />;
}

export function ErrorState({ message, onRetry, title }: { message: string; onRetry?: () => void; title?: string }) {
  return <KitError message={message} onRetry={onRetry} title={title} />;
}

export function EmptyState({ title = "Nothing here yet", detail = "Records will appear here once they are added.", action, icon }: { title?: string; detail?: string; action?: React.ReactNode; icon?: React.ComponentProps<typeof KitEmpty>["icon"] }) {
  return <KitEmpty title={title} icon={icon} action={action} compact>{detail}</KitEmpty>;
}

const toneClass: Record<string, string> = { success: "ok", warning: "warn", tertiary: "warn", danger: "danger", neutral: "muted", primary: "info", secondary: "info", info: "info" };

/** Word-only tag. Status values should use StatusBadge (icon + word) from the design system. */
export function Badge({ children, tone = "primary" }: { children: React.ReactNode; tone?: string }) {
  return <span className={`bb-status ${toneClass[tone] ?? "info"}`}>{children}</span>;
}
