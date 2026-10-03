/**
 * Barbaari web components (redesign 2026). Presentation only: no data fetching and no business
 * logic. Every page keeps its own hooks, API calls and handlers and renders through these.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowClockwise, ArrowLeft, CalendarX, CaretLeft, CaretRight, CheckCircle, CircleDashed, CircleHalf, Clock, ClockCountdown,
  Backspace, CloudSlash, CreditCard, EnvelopeSimple, HourglassMedium, Info, IconContext, MagnifyingGlass, MinusCircle, PaperPlaneTilt,
  PauseCircle, PencilSimple, Prohibit, SignOut, Warning, WarningCircle, WifiSlash, X, XCircle, Eye, EyeSlash, Circle
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { resolveStatus, type StatusIcon, type StatusSpec, type StatusTone } from "./status";
import logoUrl from "./assets/barbaari-logo.jpg";

export { logoUrl };
export type { Icon as IconComponent };

const statusIcons: Record<StatusIcon, Icon> = {
  check: CheckCircle, signOut: SignOut, minus: MinusCircle, clock: Clock, clockCountdown: ClockCountdown, warning: Warning,
  circleDashed: CircleDashed, circleHalf: CircleHalf, hourglass: HourglassMedium, calendarX: CalendarX, prohibit: Prohibit,
  xCircle: XCircle, pause: PauseCircle, creditCard: CreditCard, envelope: EnvelopeSimple, pencil: PencilSimple,
  paperPlane: PaperPlaneTilt, info: Info
};

/** Phosphor duotone at 20px everywhere, per the design. */
export function IconDefaults({ children }: { children: React.ReactNode }) {
  const value = useMemo(() => ({ weight: "duotone" as const, size: 20, mirrored: false, color: "currentColor" }), []);
  return <IconContext.Provider value={value}>{children}</IconContext.Provider>;
}

const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(" ");

/* ---------------------------------------------------------------- status */

export function Status({ spec, size, plain, className }: { spec: StatusSpec; size?: "sm" | "lg"; plain?: boolean; className?: string }) {
  const Glyph = statusIcons[spec.icon] ?? CircleDashed;
  return (
    <span className={cx("bb-status", spec.tone, size, plain && "plain", className)}>
      <Glyph size={size === "lg" ? 18 : 16} aria-hidden />
      {spec.label}
    </span>
  );
}

export function StatusBadge({ map, value, label, size, plain }: { map: Record<string, StatusSpec>; value?: string | null; label?: string; size?: "sm" | "lg"; plain?: boolean }) {
  const spec = resolveStatus(map, value);
  return <Status spec={label ? { ...spec, label } : spec} size={size} plain={plain} />;
}

export function InlineStatus({ tone, icon, children }: { tone: StatusTone; icon: StatusIcon; children: React.ReactNode }) {
  const Glyph = statusIcons[icon] ?? CircleDashed;
  return <span className={cx("bb-inline-status", tone === "ok" ? "ok" : tone === "danger" ? "danger" : tone === "warn" ? "warn" : "muted")}><Glyph size={16} aria-hidden />{children}</span>;
}

/* ---------------------------------------------------------------- people */

export function initials(name?: string | null) {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "·";
  return ((parts[0][0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : parts[0][1] ?? "")).toUpperCase();
}

/** Stable avatar tint from the design's five-colour palette. */
export function avatarVariant(seed?: string | number | null) {
  const text = String(seed ?? "");
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  return `v${(hash % 5) + 1}`;
}

export function Avatar({ name, seed, size = 36, label }: { name?: string | null; seed?: string | number | null; size?: 36 | 40 | 44 | 56 | 104 | 112; label?: string }) {
  return <span className={cx("bb-avatar", size !== 36 && `s${size}`, avatarVariant(seed ?? name))} aria-hidden={label ? undefined : true} aria-label={label}>{initials(name)}</span>;
}

export function Person({ name, detail, seed, size = 36, onClick, href }: { name: string; detail?: React.ReactNode; seed?: string | number; size?: 36 | 40 | 44 | 56; onClick?: () => void; href?: string }) {
  const body = <><Avatar name={name} seed={seed ?? name} size={size} /><div><strong className="bb-truncate">{name}</strong>{detail ? <span className="bb-truncate">{detail}</span> : null}</div></>;
  if (href) return <a className="bb-person link" href={href}>{body}</a>;
  if (onClick) return <button type="button" className="bb-person link" style={{ background: "none", border: 0, padding: 0, textAlign: "left" }} onClick={onClick}>{body}</button>;
  return <div className="bb-person">{body}</div>;
}

/* ---------------------------------------------------------------- page chrome */

export function PageHeader({ kicker, title, lede, actions, back }: { kicker?: React.ReactNode; title: React.ReactNode; lede?: React.ReactNode; actions?: React.ReactNode; back?: { label: string; onClick?: () => void; href?: string } }) {
  return (
    <>
      {back ? (back.href ? <a className="bb-back" href={back.href}><ArrowLeft size={16} />{back.label}</a> : <button type="button" className="bb-back" onClick={back.onClick}><ArrowLeft size={16} />{back.label}</button>) : null}
      <header className="bb-page-header">
        <div>
          {kicker ? <span className="bb-kicker">{kicker}</span> : null}
          <h1>{title}</h1>
          {lede ? <p className="bb-lede">{lede}</p> : null}
        </div>
        {actions ? <div className="bb-actions">{actions}</div> : null}
      </header>
    </>
  );
}

export function SectionHead({ title, action, as = "h2" }: { title: React.ReactNode; action?: React.ReactNode; as?: "h2" | "h3" }) {
  const Heading = as;
  return <div className="bb-section-head"><Heading>{title}</Heading>{action}</div>;
}

export type TabItem<K extends string> = { key: K; label: React.ReactNode; count?: number; alert?: boolean };

export function Tabs<K extends string>({ items, value, onChange, label = "Sections" }: { items: TabItem<K>[]; value: K; onChange: (key: K) => void; label?: string }) {
  return (
    <div className="bb-tabs" role="tablist" aria-label={label}>
      {items.map((item) => (
        <button key={item.key} type="button" role="tab" aria-selected={item.key === value} className={item.key === value ? "on" : undefined} onClick={() => onChange(item.key)}>
          {item.label}
          {item.count !== undefined ? (item.alert ? <span className="bb-tab-count">{item.count}</span> : <span className="bb-num"> · {item.count}</span>) : null}
        </button>
      ))}
    </div>
  );
}

export type SegItem<K extends string> = { key: K; label: React.ReactNode; count?: number };

export function Segmented<K extends string>({ items, value, onChange, label, touch }: { items: SegItem<K>[]; value: K; onChange: (key: K) => void; label: string; touch?: boolean }) {
  return (
    <div className={cx("bb-seg", touch && "touch")} role="group" aria-label={label}>
      {items.map((item) => (
        <button key={item.key} type="button" aria-pressed={item.key === value} className={item.key === value ? "on" : undefined} onClick={() => onChange(item.key)}>
          {item.label}{item.count !== undefined ? <span className="bb-num">{item.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder, label, white, autoFocus, onSubmit }: { value: string; onChange: (value: string) => void; placeholder: string; label?: string; white?: boolean; autoFocus?: boolean; onSubmit?: () => void }) {
  return (
    <div className="bb-search">
      <MagnifyingGlass size={18} aria-hidden />
      <input
        className={cx("bb-input", white && "white")}
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={label ?? placeholder}
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter" && onSubmit) onSubmit(); }}
      />
    </div>
  );
}

export function Field({ label, hint, error, children, className, htmlFor, labelAction }: { label: React.ReactNode; hint?: React.ReactNode; error?: React.ReactNode; children: React.ReactNode; className?: string; htmlFor?: string; labelAction?: React.ReactNode }) {
  return (
    <div className={cx("bb-field", className)}>
      {labelAction ? <div className="bb-label-row"><label htmlFor={htmlFor} className="bb-label">{label}</label>{labelAction}</div> : <label htmlFor={htmlFor}>{label}</label>}
      {children}
      {error ? <span className="bb-field-error"><WarningCircle size={15} aria-hidden />{error}</span> : hint ? <span className="bb-field-hint">{hint}</span> : null}
    </div>
  );
}

export function Meter({ value, max, label, tone }: { value: number; max: number; label?: string; tone?: "muted" }) {
  const percent = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return <div className="bb-meter" role="img" aria-label={label ?? `${value} of ${max}`}><i style={{ width: `${percent}%`, background: tone === "muted" ? "var(--bb-neutral-400)" : undefined }} /></div>;
}

export function Stat({ value, label, tone, icon, labelTone }: { value: React.ReactNode; label: React.ReactNode; tone?: "accent" | "danger" | "good"; icon?: StatusIcon; labelTone?: "ok" | "warn" | "dangerlabel" }) {
  const Glyph = icon ? statusIcons[icon] : null;
  return (
    <div className={cx("bb-stat", tone, labelTone)}>
      <strong>{value}</strong>
      <span>{Glyph ? <Glyph size={16} aria-hidden /> : null}{label}</span>
    </div>
  );
}

/** Simple labelled bar chart (the design uses plain bars with the value on top). */
export function BarChart({ data, format = (value: number) => String(value), label }: { data: Array<{ label: string; value: number }>; format?: (value: number) => string; label: string }) {
  const max = Math.max(1, ...data.map((item) => item.value));
  return (
    <figure role="img" aria-label={label} style={{ margin: 0 }}>
      <div className="bb-bars">
        {data.map((item) => (
          <div className="bb-bar" key={item.label}>
            <b>{format(item.value)}</b>
            <i style={{ height: `${Math.max(1, (item.value / max) * 82)}%` }} />
          </div>
        ))}
      </div>
      <div className="bb-bar-labels">{data.map((item) => <span key={item.label}>{item.label}</span>)}</div>
    </figure>
  );
}

export function Pagination({ page, pageCount, total, pageSize, onChange }: { page: number; pageCount: number; total: number; pageSize: number; onChange: (page: number) => void }) {
  if (total <= pageSize) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const pages = Array.from({ length: pageCount }, (_, index) => index + 1).filter((number) => pageCount <= 7 || Math.abs(number - page) <= 2 || number === 1 || number === pageCount);
  return (
    <nav className="bb-pagination" aria-label="Pagination">
      <span>Showing {from}–{to} of {total}</span>
      <div className="pages">
        <button type="button" className="bb-btn bb-btn-ghost bb-btn-icon" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Previous page"><CaretLeft size={18} /></button>
        {pages.map((number, index) => (
          <React.Fragment key={number}>
            {index > 0 && number - pages[index - 1] > 1 ? <span aria-hidden>…</span> : null}
            <button type="button" className={number === page ? "on" : undefined} aria-current={number === page ? "page" : undefined} onClick={() => onChange(number)}>{number}</button>
          </React.Fragment>
        ))}
        <button type="button" className="bb-btn bb-btn-ghost bb-btn-icon" disabled={page >= pageCount} onClick={() => onChange(page + 1)} aria-label="Next page"><CaretRight size={18} /></button>
      </div>
    </nav>
  );
}

/** Client-side pagination over an already-fetched list. */
export function usePaged<T>(rows: T[], pageSize = 10, resetKey?: unknown) {
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [resetKey]);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pageCount);
  return { page: current, pageCount, setPage, pageSize, total: rows.length, rows: rows.slice((current - 1) * pageSize, current * pageSize) };
}

/* ---------------------------------------------------------------- feedback */

const alertIcons = { ok: CheckCircle, warn: Clock, danger: WarningCircle, info: Info } as const;

export function Alert({ tone = "info", title, children, action, icon }: { tone?: "ok" | "warn" | "danger" | "info"; title?: React.ReactNode; children?: React.ReactNode; action?: React.ReactNode; icon?: Icon }) {
  const Glyph = icon ?? alertIcons[tone];
  return (
    <div className={cx("bb-alert", tone)} role={tone === "danger" ? "alert" : "status"}>
      <Glyph size={22} aria-hidden />
      <div>{title ? <strong>{title}</strong> : null}{children ? <span>{children}</span> : null}</div>
      {action}
    </div>
  );
}

export function OfflineBanner({ online }: { online: boolean }) {
  if (online) return null;
  return <Alert tone="info" icon={WifiSlash}>You’re offline. We’ll reconnect automatically.</Alert>;
}

export function LoadingState({ rows = 5, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div className="bb-skeleton" role="status" aria-live="polite" aria-label={label}>
      {Array.from({ length: rows }, (_, index) => (
        <div className="bb-skeleton-row" key={index}>
          <span className="dot" />
          <div className="lines"><span className="line" style={{ width: `${[48, 38, 55, 44, 50][index % 5]}%` }} /><span className="line" style={{ width: `${[28, 22, 32, 25, 20][index % 5]}%` }} /></div>
          <span className="end" />
        </div>
      ))}
      <span className="bb-sr-only">{label}…</span>
    </div>
  );
}

export function EmptyState({ icon: Glyph = CircleDashed, title, children, action, compact }: { icon?: Icon; title: React.ReactNode; children?: React.ReactNode; action?: React.ReactNode; compact?: boolean }) {
  return (
    <div className={cx("bb-state", compact && "compact")}>
      <Glyph size={48} color="var(--bb-accent)" aria-hidden />
      <h3>{title}</h3>
      {children ? <p>{children}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry, title = "Something went wrong" }: { message?: string; onRetry?: () => void; title?: string }) {
  return (
    <div className="bb-state" role="alert">
      <CloudSlash size={48} color="var(--bb-error)" aria-hidden />
      <h3>{title}</h3>
      <p>{message || "Please check your connection and try again. Nothing you entered was lost."}</p>
      {onRetry ? <button type="button" className="bb-btn bb-btn-secondary" onClick={onRetry}><ArrowClockwise size={18} />Try again</button> : null}
    </div>
  );
}

type Toast = { id: number; message: string; tone: "ok" | "danger" };
const ToastContext = createContext<(message: string, tone?: "ok" | "danger") => void>(() => undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);
  const push = useCallback((message: string, tone: "ok" | "danger" = "ok") => {
    const id = ++counter.current;
    setToasts((current) => [...current, { id, message, tone }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 4200);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="bb-toast-wrap" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={cx("bb-toast", toast.tone === "danger" && "danger")}>
            {toast.tone === "danger" ? <WarningCircle size={22} aria-hidden /> : <CheckCircle size={22} aria-hidden />}
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() { return useContext(ToastContext); }

/* ---------------------------------------------------------------- overlays */

function useEscape(onClose: () => void) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);
}

export function Dialog({ title, children, onClose, actions, wide }: { title: React.ReactNode; children: React.ReactNode; onClose: () => void; actions?: React.ReactNode; wide?: boolean }) {
  useEscape(onClose);
  return (
    <div className="bb-backdrop" role="presentation" onMouseDown={onClose}>
      <section className={cx("bb-dialog", wide && "wide")} role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined} onMouseDown={(event) => event.stopPropagation()}>
        <div className="bb-dialog-head"><h2>{title}</h2><button type="button" className="bb-btn bb-btn-ghost bb-btn-icon" onClick={onClose} aria-label="Close"><X size={20} /></button></div>
        <div className="bb-dialog-body">{children}</div>
        {actions ? <div className="bb-dialog-actions">{actions}</div> : null}
      </section>
    </div>
  );
}

export function Drawer({ title, children, onClose, footer }: { title: React.ReactNode; children: React.ReactNode; onClose: () => void; footer?: React.ReactNode }) {
  useEscape(onClose);
  return (
    <>
      <div className="bb-drawer-backdrop" onMouseDown={onClose} />
      <aside className="bb-drawer" role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined}>
        <div className="bb-drawer-head"><h2>{title}</h2><button type="button" className="bb-btn bb-btn-ghost bb-btn-icon" onClick={onClose} aria-label="Close"><X size={22} /></button></div>
        {children}
        {footer ? <div className="bb-drawer-foot">{footer}</div> : null}
      </aside>
    </>
  );
}

/* ---------------------------------------------------------------- shell */

export type NavItem = { label: string; to: string; icon: Icon; count?: number; end?: boolean };
export type NavGroup = { label: string; items: NavItem[] };

export function LogoTile({ size = 40 }: { size?: number }) {
  return <span className="bb-logo-tile" style={{ width: size, height: size, backgroundImage: `url(${logoUrl})` }} aria-hidden />;
}

export function PasswordChecklist({ password, confirmation }: { password: string; confirmation: string }) {
  const rules = [
    { ok: password.length >= 8, label: "At least 8 characters" },
    { ok: !!password && password === confirmation, label: "Passwords match" }
  ];
  return (
    <div className="bb-checklist" aria-live="polite">
      {rules.map((rule) => <span key={rule.label} className={rule.ok ? "ok" : "pending"}>{rule.ok ? <CheckCircle size={18} /> : <Circle size={18} />}{rule.label}</span>)}
    </div>
  );
}

/** Centered sign-in style card (5a–5f): logo, content, and an optional footer pinned low. */
export function AuthFrame({ children, foot, wide }: { children: React.ReactNode; foot?: React.ReactNode; wide?: boolean }) {
  return (
    <main className="bb-auth">
      <div className={cx("bb-auth-card", wide && "wide")}>
        <img className="bb-auth-logo" src={logoUrl} alt="Barbaari" width={64} height={64} />
        {children}
        {foot ? <div className="bb-auth-foot">{foot}</div> : null}
      </div>
    </main>
  );
}

export function PasswordInput({ value, onChange, id, autoComplete, placeholder, required = true, minLength }: { value: string; onChange: (value: string) => void; id?: string; autoComplete?: string; placeholder?: string; required?: boolean; minLength?: number }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="bb-password">
      <input id={id} className="bb-input" type={shown ? "text" : "password"} value={value} onChange={(event) => onChange(event.target.value)} autoComplete={autoComplete} placeholder={placeholder} required={required} minLength={minLength} />
      <button type="button" aria-label={shown ? "Hide password" : "Show password"} aria-pressed={shown} onClick={() => setShown((current) => !current)}>{shown ? <EyeSlash size={20} /> : <Eye size={20} />}</button>
    </div>
  );
}

/**
 * The grouped sidebar + topbar frame. `renderLink` lets each app use its own router NavLink so
 * active-state and client navigation stay exactly as before.
 */
export function AppShell({ brandSubtitle, groups, user, topbar, children, renderLink, pathKey }: {
  brandSubtitle: string;
  groups: NavGroup[];
  user: { name: string; role: string };
  topbar: React.ReactNode;
  children: React.ReactNode;
  renderLink: (item: NavItem, content: React.ReactNode, onNavigate: () => void) => React.ReactNode;
  pathKey?: string;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(false); }, [pathKey]);
  const close = () => setOpen(false);
  return (
    <div className={cx("bb-shell", open && "nav-open")}>
      <aside className="bb-sidebar" aria-label="Main navigation">
        <div className="bb-sidebar-brand"><LogoTile /><div><strong>Barbaari</strong><span>{brandSubtitle}</span></div></div>
        <nav className="bb-nav">
          {groups.map((group) => (
            <div className="bb-nav-group" key={group.label}>
              <div className="bb-nav-group-label">{group.label}</div>
              {group.items.map((item) => {
                const Glyph = item.icon;
                return <React.Fragment key={item.to + item.label}>{renderLink(item, <><Glyph size={20} aria-hidden /><span className="label">{item.label}</span>{item.count ? <span className="bb-nav-count">{item.count}</span> : null}</>, close)}</React.Fragment>;
              })}
            </div>
          ))}
        </nav>
        <div className="bb-sidebar-user"><Avatar name={user.name} seed="user" /><div><strong>{user.name}</strong><span>{user.role}</span></div></div>
      </aside>
      {open ? <div className="bb-nav-scrim" onMouseDown={close} /> : null}
      <div className="bb-main">
        <header className="bb-topbar">
          <button type="button" className="bb-btn bb-btn-secondary bb-btn-icon bb-menu-toggle" aria-label="Open navigation" aria-expanded={open} onClick={() => setOpen(true)}>
            <svg width="20" height="20" viewBox="0 0 256 256" aria-hidden><path fill="currentColor" d="M224 128a8 8 0 0 1-8 8H40a8 8 0 0 1 0-16h176a8 8 0 0 1 8 8ZM40 72h176a8 8 0 0 0 0-16H40a8 8 0 0 0 0 16Zm176 112H40a8 8 0 0 0 0 16h176a8 8 0 0 0 0-16Z" /></svg>
          </button>
          {topbar}
        </header>
        {children}
      </div>
    </div>
  );
}

export const roleLabels: Record<string, string> = {
  super_admin: "Super admin", support_staff: "Support staff", daycare_admin: "Daycare admin", manager: "Manager",
  billing_manager: "Billing manager", teacher: "Teacher", staff: "Staff", parent: "Parent"
};
export const roleLabel = (role?: string | null) => roleLabels[String(role ?? "")] ?? String(role ?? "").replace(/_/g, " ");

/* ---------------------------------------------------------------- formatting */

export function money(value: unknown, currency = "USD") {
  const number = Number(value ?? 0);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD", minimumFractionDigits: 2 }).format(Number.isFinite(number) ? number : 0);
}

export function shortDate(value?: string | null, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, options);
}

export function shortTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** 12-hour clock time ("1:40 PM") in the organization's attendance timezone. */
export function clockTime(value?: string | null, timeZone?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  try {
    return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: timeZone || undefined }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(date);
  }
}

/** Record check-in / check-out time as "7:52 AM", falling back to the server's "H:i" string. */
export function recordTime(record: any, which: "in" | "out") {
  const iso = which === "in" ? record?.checkInLocal ?? record?.checkInAt : record?.checkOutLocal ?? record?.checkOutAt;
  return iso ? clockTime(iso, record?.timezone) : (which === "in" ? record?.checkInTime : record?.checkOutTime) ?? "";
}

/** On-screen PIN keypad (design 3a/3d). Keeps the value as a plain digit string. */
export function PinPad({ value, onChange, label, length = 4 }: { value: string; onChange: (value: string) => void; label: string; length?: number }) {
  const dots = Math.max(length, value.length);
  return (
    <div className="bb-pinpad">
      <h3>{label}</h3>
      <div className="bb-pin-dots" aria-label={`${value.length} digits entered`}>{Array.from({ length: dots }, (_, index) => <i key={index} className={index < value.length ? "on" : undefined} />)}</div>
      <div className="bb-pin-keys">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"].map((key) => key === "" ? <span key="blank" /> : key === "del"
          ? <button key={key} type="button" aria-label="Delete digit" onClick={() => onChange(value.slice(0, -1))}><Backspace size={30} /></button>
          : <button key={key} type="button" onClick={() => value.length < 8 && onChange(value + key)}>{key}</button>)}
      </div>
    </div>
  );
}
