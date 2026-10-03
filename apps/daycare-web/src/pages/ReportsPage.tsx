import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowsClockwise, CalendarX, ClipboardText, DeviceTablet, Export, Money, PencilSimple, SignIn, SignOut, UserMinus } from "@phosphor-icons/react";
import { absenceApi, attendanceApi, billingApi, childrenApi, reportsApi } from "@barbaari/shared";
import { Alert, BarChart, EmptyState, ErrorState, LoadingState, Meter, PageHeader, SearchInput, Segmented, Stat, StatusBadge, Tabs, clockTime, money, shortDate } from "@barbaari/shared/web/ui";
import { invoiceStatuses } from "@barbaari/shared/web/status";
import { useAsyncData } from "../hooks/useAsyncData";
import { useShell } from "../hooks/useShell";

type Tab = "attendance" | "children" | "activity" | "billing";
type Preset = "today" | "week" | "month" | "custom";

const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

function presetRange(preset: Preset): { from: string; to: string } {
  const now = new Date();
  const today = iso(now);
  if (preset === "week") {
    const start = new Date(now);
    start.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    return { from: iso(start), to: today };
  }
  if (preset === "month") return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
  return { from: today, to: today };
}

function statusOf(record: any) {
  return record.status ?? (record.checkOutTime ? "checked_out" : "checked_in");
}

const words = (value?: string | null) => String(value ?? "").replace(/_/g, " ").replace(/^\w/, (letter) => letter.toUpperCase());
const inRange = (date: string | undefined | null, from: string, to: string) => !!date && (!from || date >= from) && (!to || date <= to);

const actionLabels: Record<string, string> = {
  check_in: "Check-ins",
  guardian_check_in: "Check-ins",
  check_out: "Checkouts",
  guardian_check_out: "Checkouts",
  correction: "Corrections",
  corrected: "Corrections",
  absence_recorded: "Absences recorded",
  absence_updated: "Absence updates",
  absence_cancelled: "Absences cancelled"
};
const actionIcons: Record<string, typeof SignIn> = { Checkins: SignIn, Checkouts: SignOut, Corrections: PencilSimple };
const verb = (action?: string) => {
  const value = String(action ?? "");
  if (value.includes("check_in")) return "checked in";
  if (value.includes("check_out")) return "checked out";
  if (value.includes("correct")) return "corrected the record of";
  if (value.includes("absence")) return `${words(value.replace("absence_", "")).toLowerCase()} an absence for`;
  return words(value).toLowerCase();
};
const actionGroup = (action?: string) => actionLabels[String(action)] ?? words(action);

function rangeLabel(from: string, to: string) {
  if (!from && !to) return "on record";
  if (from === to) return `on ${shortDate(from, { day: "numeric", month: "long" })}`;
  return `between ${from ? shortDate(from, { day: "numeric", month: "long" }) : "the start"} and ${to ? shortDate(to, { day: "numeric", month: "long" }) : "today"}`;
}

/** Arrival time in minutes after midnight, from the record's local check-in time. */
function arrivalMinutes(record: any) {
  const [hours, minutes] = String(record.checkInTime ?? "").split(":").map(Number);
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : null;
}
function minutesLabel(value: number | null) {
  if (value === null) return "—";
  const hours = Math.floor(value / 60);
  const minutes = String(Math.round(value % 60)).padStart(2, "0");
  return `${hours % 12 || 12}:${minutes} ${hours < 12 ? "AM" : "PM"}`;
}

export function ReportsPage() {
  const navigate = useNavigate();
  const { user, organization, familyChildCare } = useShell();
  const [params, setParams] = useSearchParams();
  const tab = (["attendance", "children", "activity", "billing"].includes(params.get("tab") ?? "") ? params.get("tab") : "attendance") as Tab;
  const setTab = (next: Tab) => setParams((current) => { const copy = new URLSearchParams(current); copy.set("tab", next); return copy; }, { replace: true });
  const [preset, setPreset] = useState<Preset>("week");
  const [{ from: fromDate, to: toDate }, setRange] = useState(() => presetRange("week"));
  const [classroom, setClassroom] = useState("");
  const [childQuery, setChildQuery] = useState("");
  const [exportMessage, setExportMessage] = useState("");
  const [exportError, setExportError] = useState(false);
  const canBill = ["daycare_admin", "manager", "billing_manager"].includes(String(user?.role ?? ""));

  const choosePreset = (next: Preset) => {
    setPreset(next);
    if (next !== "custom") setRange(presetRange(next));
  };
  const setDate = (key: "from" | "to", value: string) => {
    setPreset("custom");
    setRange((current) => ({ ...current, [key]: value }));
  };
  const clearRange = () => {
    setPreset("custom");
    setRange({ from: "", to: "" });
  };

  // Attendance and absences follow the report's date range server-side; an empty bound means "unbounded".
  const attendance = useAsyncData(async () => {
    if (tab !== "attendance" && tab !== "children") return null;
    const range = { from: fromDate || undefined, to: toDate || undefined };
    const [records, absences, children] = await Promise.all([
      attendanceApi.managerList(range),
      absenceApi.list(range),
      tab === "children" ? childrenApi.managerList() : Promise.resolve({ children: [] as any[] })
    ]);
    return { attendance: records.attendance ?? [], absences: absences.absence_records ?? [], children: children.children ?? [] };
  }, [tab, fromDate, toDate]);

  const activity = useAsyncData(async () => {
    if (tab !== "activity") return null;
    return (await attendanceApi.auditLogs({ limit: 2000 })).audit_logs ?? [];
  }, [tab]);

  const billing = useAsyncData(async () => {
    if (tab !== "billing" || !canBill) return null;
    const [invoices, payments] = await Promise.all([billingApi.managerInvoices(), billingApi.payments()]);
    return { invoices: invoices.invoices ?? [], payments: payments.payments ?? [] };
  }, [tab, canBill]);

  const matchesRoom = (record: any) => !classroom || record.classroom === classroom;
  const records = useMemo(() => ((attendance.data?.attendance ?? []) as any[]).filter((record) => inRange(record.date, fromDate, toDate) && matchesRoom(record)), [attendance.data, fromDate, toDate, classroom]);
  const absences = useMemo(() => ((attendance.data?.absences ?? []) as any[]).filter((record) => inRange(record.absenceDate ?? record.absence_date, fromDate, toDate) && matchesRoom(record)), [attendance.data, fromDate, toDate, classroom]);
  const classrooms = useMemo(() => [...new Set([...(attendance.data?.attendance ?? []), ...(attendance.data?.absences ?? [])].map((record: any) => record.classroom).filter((name: string) => name && name !== "Unassigned"))].sort() as string[], [attendance.data]);

  async function exportAttendance() {
    setExportMessage("");
    setExportError(false);
    try {
      await reportsApi.attendanceExport();
      setExportMessage("Attendance export requested. The backend will return the available attendance export.");
    } catch {
      setExportError(true);
    }
  }

  const rangeControls = (options: { classroom?: boolean; search?: boolean; billing?: boolean } = {}) => (
    <div className="bb-toolbar bb-report-range">
      <Segmented label="Date range" value={preset} onChange={choosePreset} items={[
        { key: "today", label: "Today" },
        { key: "week", label: "This week" },
        { key: "month", label: "This month" },
        { key: "custom", label: "Custom" }
      ]} />
      <label className="bb-field"><span className="bb-label">From</span><input className="bb-input" type="date" value={fromDate} max={toDate || undefined} onChange={(event) => setDate("from", event.target.value)} /></label>
      <label className="bb-field"><span className="bb-label">To</span><input className="bb-input" type="date" value={toDate} min={fromDate || undefined} onChange={(event) => setDate("to", event.target.value)} /></label>
      {options.classroom && !familyChildCare ? (
        <label className="bb-field"><span className="bb-label">Classroom</span>
          <select className="bb-input" value={classroom} onChange={(event) => setClassroom(event.target.value)}>
            <option value="">All classrooms</option>
            {classrooms.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
      ) : null}
      {options.search ? <div style={{ flex: "1 1 220px", maxWidth: 320, marginLeft: "auto" }}><SearchInput value={childQuery} onChange={setChildQuery} placeholder="Find a child" /></div> : <button type="button" className="bb-btn bb-btn-ghost" onClick={clearRange}>Clear range</button>}
    </div>
  );

  const emptyRange = (
    <EmptyState icon={CalendarX} title={`No attendance records ${rangeLabel(fromDate, toDate)}`} action={<><button className="bb-btn bb-btn-primary" onClick={() => choosePreset("month")}>This month</button><button className="bb-btn bb-btn-secondary" onClick={clearRange}>Clear range</button></>}>
      Try a wider date range, or clear the range to see all records.
    </EmptyState>
  );
  const loadError = (retry: () => void, message?: string) => <ErrorState title="We couldn’t load this report" message={message || "Please check your connection and try again."} onRetry={retry} />;

  return (
    <main className="bb-page">
      <PageHeader kicker={organization?.name ?? "Reports"} title="Reports" actions={
        tab === "billing"
          ? <button className="bb-btn bb-btn-secondary bb-btn-lg" onClick={() => navigate("/payments")}><Money />Record payment</button>
          : <button className="bb-btn bb-btn-primary bb-btn-lg" onClick={exportAttendance}><Export />Export attendance</button>
      } />
      <Tabs label="Report" value={tab} onChange={setTab} items={[
        { key: "attendance", label: "Attendance" },
        { key: "children", label: "Children" },
        { key: "activity", label: "Activity" },
        ...(canBill ? [{ key: "billing" as const, label: "Billing" }] : [])
      ]} />
      {exportMessage ? <Alert tone="ok">{exportMessage}</Alert> : null}
      {exportError ? <Alert tone="danger" title="Attendance export is not available right now">Your report is still on screen. Try the export again in a few minutes.</Alert> : null}

      {tab === "attendance" ? (
        <>
          {rangeControls({ classroom: true })}
          {attendance.loading && !attendance.data ? <LoadingState label="Loading report" /> : attendance.error ? loadError(attendance.reload, attendance.error) : !records.length && !absences.length ? emptyRange : (
            <AttendanceReport records={records} absences={absences} familyChildCare={familyChildCare} />
          )}
        </>
      ) : null}

      {tab === "children" ? (
        <>
          {rangeControls({ classroom: true, search: true })}
          {attendance.loading && !attendance.data?.children?.length ? <LoadingState label="Loading report" /> : attendance.error ? loadError(attendance.reload, attendance.error) : (
            <ChildrenReport children={attendance.data?.children ?? []} records={records} absences={absences} classroom={classroom} query={childQuery} familyChildCare={familyChildCare} onOpen={(id) => navigate(`/children/${id}`)} emptyRange={emptyRange} />
          )}
        </>
      ) : null}

      {tab === "activity" ? (
        <>
          {rangeControls()}
          {activity.loading && !activity.data ? <LoadingState label="Loading report" /> : activity.error ? loadError(activity.reload, activity.error) : (
            <ActivityReport logs={((activity.data ?? []) as any[]).filter((log) => inRange(String(log.editedAtLocal ?? log.edited_at ?? log.date ?? "").slice(0, 10), fromDate, toDate))} rangeText={rangeLabel(fromDate, toDate)} onClear={clearRange} />
          )}
        </>
      ) : null}

      {tab === "billing" && canBill ? (
        <>
          {rangeControls({ billing: true })}
          {billing.loading && !billing.data ? <LoadingState label="Loading report" /> : billing.error ? loadError(billing.reload, billing.error) : (
            <BillingReport invoices={billing.data?.invoices ?? []} payments={billing.data?.payments ?? []} from={fromDate} to={toDate} currency={organization?.currency} onOpen={() => navigate("/billing")} />
          )}
        </>
      ) : null}
    </main>
  );
}

function AttendanceReport({ records, absences, familyChildCare }: { records: any[]; absences: any[]; familyChildCare: boolean }) {
  const count = (predicate: (record: any) => boolean) => records.filter(predicate).length;
  const perDay = useMemo(() => {
    const days = new Map<string, Set<string>>();
    for (const record of records) days.set(record.date, (days.get(record.date) ?? new Set()).add(String(record.childId)));
    return [...days.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-10).map(([day, children]) => ({ label: `${shortDate(day, { weekday: "short" })} ${shortDate(day, { day: "numeric" })}`, value: children.size }));
  }, [records]);
  const byRoom = useMemo(() => {
    const rooms = new Map<string, { records: number; absences: number }>();
    for (const record of records) { const room = record.classroom || "Unassigned"; rooms.set(room, { ...(rooms.get(room) ?? { records: 0, absences: 0 }), records: (rooms.get(room)?.records ?? 0) + 1 }); }
    for (const absence of absences) { const room = absence.classroom || "Unassigned"; const current = rooms.get(room) ?? { records: 0, absences: 0 }; rooms.set(room, { ...current, absences: current.absences + 1 }); }
    return [...rooms.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [records, absences]);
  const byType = useMemo(() => {
    const types = new Map<string, number>();
    for (const absence of absences) { const type = words(absence.absenceType ?? absence.absence_type); types.set(type, (types.get(type) ?? 0) + 1); }
    return [...types.entries()].sort((a, b) => b[1] - a[1]);
  }, [absences]);
  const missing = count((record) => statusOf(record) === "missing_checkout");

  return (
    <>
      <div className="bb-stats bb-stats-8">
        <Stat value={records.length} label="Attendance records" />
        <Stat value={count((record) => statusOf(record) === "checked_in" && !record.checkOutTime)} label="Present now" />
        <Stat value={count((record) => !!record.checkOutTime || statusOf(record) === "checked_out")} label="Checked out" />
        <Stat value={count((record) => statusOf(record) === "checked_out_early")} label="Early checkouts" />
        <Stat value={absences.length} label="Absences" />
        <Stat value={missing} label="Missing checkouts" tone={missing ? "danger" : undefined} />
        <Stat value={count((record) => record.corrected)} label="Corrections" />
        <Stat value={count((record) => record.hasSignature || record.signatureName || record.signature_name)} label="Signed records" />
      </div>
      <div className="bb-grid-2">
        <section>
          <h2 className="bb-report-h">Children attended per day</h2>
          {perDay.length ? <BarChart label="Children attended per day" data={perDay} /> : <p className="bb-muted">No check-ins in this range.</p>}
          {!familyChildCare && byRoom.length ? (
            <>
              <h3 className="bb-report-sub">By classroom</h3>
              <dl className="bb-sumlist">
                {byRoom.map(([room, totals]) => <div key={room}><dt>{room}</dt><dd>{totals.records} record{totals.records === 1 ? "" : "s"} · {totals.absences} absence{totals.absences === 1 ? "" : "s"}</dd></div>)}
              </dl>
            </>
          ) : null}
        </section>
        <section>
          <div className="bb-row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
            <h2 className="bb-report-h">Absences by type</h2>
            <span className="bb-caption">{byType.map(([type, total]) => `${type} ${total}`).join(" · ")}</span>
          </div>
          {absences.length ? (
            <div className="bb-table-wrap">
              <table className="bb-table">
                <thead><tr><th>Child</th><th>Date</th><th>Type</th><th>Reason</th><th>Status</th></tr></thead>
                <tbody>
                  {absences.map((absence) => {
                    const type = absence.absenceType ?? absence.absence_type;
                    return (
                      <tr key={absence.id}>
                        <td className="strong">{absence.childName}</td>
                        <td style={{ whiteSpace: "nowrap" }}>{shortDate(absence.absenceDate ?? absence.absence_date)}</td>
                        <td><span className={`bb-tag${type === "no_show" ? " warn" : ""}`}>{words(type)}</span></td>
                        <td>{absence.reason ?? "No reason entered"}</td>
                        <td>{words(absence.status)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <p className="bb-muted">No absences in this range.</p>}
        </section>
      </div>
    </>
  );
}

function ChildrenReport({ children, records, absences, classroom, query, familyChildCare, onOpen, emptyRange }: { children: any[]; records: any[]; absences: any[]; classroom: string; query: string; familyChildCare: boolean; onOpen: (id: string) => void; emptyRange: React.ReactNode }) {
  const openDays = useMemo(() => new Set(records.map((record) => record.date)).size, [records]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return children
      .filter((child) => (!classroom || child.classroom === classroom) && (!q || `${child.name} ${child.childCode ?? ""}`.toLowerCase().includes(q)))
      .map((child) => {
        const mine = records.filter((record) => String(record.childId) === String(child.id));
        const arrivals = mine.map(arrivalMinutes).filter((value): value is number => value !== null).sort((a, b) => a - b);
        return {
          child,
          days: new Set(mine.map((record) => record.date)).size,
          absences: absences.filter((absence) => String(absence.childId) === String(child.id)).length,
          early: mine.filter((record) => statusOf(record) === "checked_out_early").length,
          missing: mine.filter((record) => statusOf(record) === "missing_checkout").length,
          arrival: arrivals.length ? arrivals[Math.floor(arrivals.length / 2)] : null
        };
      });
  }, [children, records, absences, classroom, query]);

  if (!records.length && !absences.length) return <>{emptyRange}</>;
  if (!rows.length) return <EmptyState compact title="No children match">Try another name or classroom.</EmptyState>;
  return (
    <>
      <div className="bb-table-wrap">
        <table className="bb-table">
          <thead><tr><th>Child</th>{familyChildCare ? null : <th>Classroom</th>}<th>Days attended (of {openDays})</th><th className="right">Absences</th><th className="right">Early checkouts</th><th className="right">Missing checkouts</th><th className="right">Typical arrival</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.child.id} className="clickable" onClick={() => onOpen(String(row.child.id))}>
                <td className="strong"><a href={`/children/${row.child.id}`} onClick={(event) => { event.preventDefault(); onOpen(String(row.child.id)); }} style={{ color: "inherit", textDecoration: "none" }}>{row.child.name}</a></td>
                {familyChildCare ? null : <td>{row.child.classroom ?? "Unassigned"}</td>}
                <td><div className="bb-row" style={{ flexWrap: "nowrap", gap: 10 }}><div style={{ flex: "0 1 140px" }}><Meter value={row.days} max={openDays} label={`${row.days} of ${openDays} days`} /></div><span className="bb-num">{row.days}</span></div></td>
                <td className="right bb-num">{row.absences}</td>
                <td className="right bb-num">{row.early}</td>
                <td className="right bb-num" style={row.missing ? { color: "var(--bb-danger-fg)" } : undefined}>{row.missing}</td>
                <td className="right bb-num">{minutesLabel(row.arrival)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="bb-caption" style={{ marginTop: 20 }}>Worked out from attendance and absence records in the selected range. Select a child to open their record.</p>
    </>
  );
}

function ActivityReport({ logs, rangeText, onClear }: { logs: any[]; rangeText: string; onClear: () => void }) {
  const byPerson = useMemo(() => {
    const people = new Map<string, number>();
    for (const log of logs) { const name = log.editedBy || "System"; people.set(name, (people.get(name) ?? 0) + 1); }
    return [...people.entries()].sort((a, b) => b[1] - a[1]);
  }, [logs]);
  const byAction = useMemo(() => {
    const actions = new Map<string, number>();
    for (const log of logs) { const group = actionGroup(log.action); actions.set(group, (actions.get(group) ?? 0) + 1); }
    return [...actions.entries()].sort((a, b) => b[1] - a[1]);
  }, [logs]);
  if (!logs.length) return <EmptyState icon={ClipboardText} title={`No attendance activity ${rangeText}`} action={<button className="bb-btn bb-btn-secondary" onClick={onClear}>Clear range</button>}>Check-ins, checkouts, corrections and absences are logged here as they happen.</EmptyState>;
  const top = byPerson[0]?.[1] ?? 1;

  return (
    <div className="bb-grid-2" style={{ gridTemplateColumns: "minmax(0, 5fr) minmax(0, 7fr)" }}>
      <section>
        <h2 className="bb-report-h">Who recorded attendance</h2>
        <div className="bb-stack" style={{ gap: 14 }}>
          {byPerson.map(([name, total]) => (
            <div key={name}>
              <div className="bb-row" style={{ justifyContent: "space-between" }}><span>{name}</span><span className="bb-num">{total}</span></div>
              <Meter value={total} max={top} label={`${name}: ${total}`} />
            </div>
          ))}
        </div>
        <h2 className="bb-report-h" style={{ marginTop: 30 }}>By kind of action</h2>
        <dl className="bb-sumlist">{byAction.map(([label, total]) => <div key={label}><dt>{label}</dt><dd>{total}</dd></div>)}</dl>
      </section>
      <section>
        <h2 className="bb-report-h">Audit log</h2>
        <ol className="bb-feed">
          {logs.slice(0, 15).map((log) => {
            const group = actionGroup(log.action);
            const Glyph = actionIcons[group.replace(/[^A-Za-z]/g, "")] ?? (String(log.action).includes("absence") ? UserMinus : String(log.action).includes("tablet") ? DeviceTablet : ArrowsClockwise);
            const when = String(log.editedAtLocal ?? log.edited_at ?? "");
            const today = when.slice(0, 10) === iso(new Date());
            return (
              <li key={log.id}>
                <span className="bb-caption">{today ? "Today" : shortDate(when, { weekday: "short", day: "numeric", month: "short" })} · {clockTime(when)}</span>
                <Glyph size={18} color="var(--bb-accent)" aria-hidden />
                <div><strong>{log.editedBy || "System"}</strong> {verb(log.action)} · {log.childName}<span className="sub">{log.reason}{log.classroom && log.classroom !== "Unassigned" ? ` · ${log.classroom}` : ""}</span></div>
              </li>
            );
          })}
        </ol>
        {logs.length > 15 ? <p className="bb-caption" style={{ marginTop: 10 }}>Showing the latest 15 of {logs.length} entries. The full history is on the Audit log page.</p> : null}
      </section>
    </div>
  );
}

function BillingReport({ invoices, payments, from, to, currency, onOpen }: { invoices: any[]; payments: any[]; from: string; to: string; currency?: string; onOpen: () => void }) {
  const cash = (value: number) => money(value, currency).replace(/\.00$/, "");
  const dueInRange = invoices.filter((invoice) => inRange(invoice.dueDate, from, to));
  const paidInRange = payments.filter((payment) => inRange(String(payment.paid_at ?? payment.created_at ?? "").slice(0, 10), from, to));
  const open = invoices.filter((invoice) => !["paid", "void"].includes(String(invoice.status)));
  const overdue = invoices.filter((invoice) => invoice.status === "overdue");
  const perMonth = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 5 }, (_, index) => {
      const month = new Date(now.getFullYear(), now.getMonth() - 4 + index, 1);
      const key = iso(month).slice(0, 7);
      const total = payments.filter((payment) => String(payment.paid_at ?? payment.created_at ?? "").slice(0, 7) === key).reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0);
      return { label: month.toLocaleDateString(undefined, { month: "short" }), value: total };
    });
  }, [payments]);
  const byMethod = useMemo(() => {
    const methods = new Map<string, number>();
    for (const payment of paidInRange) methods.set(words(payment.method ?? "other"), (methods.get(words(payment.method ?? "other")) ?? 0) + Number(payment.amount ?? 0));
    return [...methods.entries()].sort((a, b) => b[1] - a[1]);
  }, [paidInRange]);
  const sum = (rows: any[]) => rows.reduce((total, row) => total + Number(row.amount ?? 0), 0);

  if (!invoices.length && !payments.length) return <EmptyState icon={Money} title="No family invoices yet" action={<button className="bb-btn bb-btn-primary" onClick={onOpen}>Open billing</button>}>Invoices and payments for families appear here once you create them.</EmptyState>;
  return (
    <>
      <div className="bb-stats">
        <Stat value={cash(sum(dueInRange))} label="Invoiced · due in range" />
        <Stat value={cash(sum(paidInRange))} label="Collected in range" tone="good" />
        <Stat value={cash(sum(open))} label={`Outstanding · ${open.length} invoice${open.length === 1 ? "" : "s"}`} />
        <Stat value={overdue.length} label={`Overdue invoice${overdue.length === 1 ? "" : "s"}`} tone={overdue.length ? "danger" : undefined} />
      </div>
      <div className="bb-grid-2">
        <section>
          <h2 className="bb-report-h">Collected per month</h2>
          <BarChart label="Collected per month" data={perMonth} format={(value) => value >= 1000 ? new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD", notation: "compact", maximumFractionDigits: 1 }).format(value).replace("K", "k") : cash(value)} />
          <h3 className="bb-report-sub">By payment method</h3>
          {byMethod.length ? <dl className="bb-sumlist">{byMethod.map(([method, total]) => <div key={method}><dt>{method}</dt><dd>{cash(total)}</dd></div>)}</dl> : <p className="bb-muted">No payments in this range.</p>}
        </section>
        <section>
          <h2 className="bb-report-h">Open and overdue invoices</h2>
          {open.length ? (
            <div className="bb-table-wrap">
              <table className="bb-table">
                <thead><tr><th>Invoice</th><th>For</th><th>Due</th><th className="right">Amount</th><th>Status</th></tr></thead>
                <tbody>
                  {open.map((invoice) => (
                    <tr key={invoice.databaseId ?? invoice.id} className="clickable" onClick={onOpen}>
                      <td className="strong" style={{ whiteSpace: "nowrap" }}>{invoice.id}</td>
                      <td>{invoice.childName}{invoice.childCode ? <span className="bb-caption"> · {invoice.childCode}</span> : null}</td>
                      <td style={{ whiteSpace: "nowrap" }}>{shortDate(invoice.dueDate)}</td>
                      <td className="right bb-num">{money(invoice.amount, currency)}</td>
                      <td><StatusBadge size="sm" map={invoiceStatuses} value={invoice.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="bb-muted">Every invoice is paid.</p>}
          <p className="bb-caption" style={{ marginTop: 15 }}>Family tuition billing only. Your Barbaari subscription is on the Subscription page.</p>
        </section>
      </div>
    </>
  );
}
