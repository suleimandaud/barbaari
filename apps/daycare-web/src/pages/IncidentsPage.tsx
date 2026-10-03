import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle, FirstAidKit, PaperPlaneTilt, PencilSimple, PlusCircle } from "@phosphor-icons/react";
import { childrenApi, getApiError, incidentApi } from "@barbaari/shared";
import { Alert, Avatar, Drawer, EmptyState, ErrorState, Field, LoadingState, PageHeader, Segmented, StatusBadge, clockTime, shortDate, useToast } from "@barbaari/shared/web/ui";
import { incidentSeverities, incidentStatuses } from "@barbaari/shared/web/status";
import { ChildSelect } from "../components/Selects";
import { useAsyncData } from "../hooks/useAsyncData";
import { friendlyError } from "../utils/labels";
import { splitIncidentSummary } from "../utils/documents";

type Filter = "all" | "draft" | "sent" | "high";

function when(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  const isToday = date.toDateString() === new Date().toDateString();
  return `${isToday ? "Today" : shortDate(value, { weekday: "short", day: "numeric", month: "short" })} · ${clockTime(value)}`;
}

export function IncidentsPage() {
  const toast = useToast();
  const { data, loading, error, reload } = useAsyncData(async () => {
    const [incidents, children] = await Promise.all([incidentApi.list(), childrenApi.managerList()]);
    return { incidents: incidents.incidents, children: children.children };
  }, []);
  const [childId, setChildId] = useState("");
  const [severity, setSeverity] = useState<"low" | "medium" | "high">("low");
  const [summary, setSummary] = useState("");
  const [details, setDetails] = useState("");
  const [actionTaken, setActionTaken] = useState("");
  const [notifyParent, setNotifyParent] = useState(true);
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [activeId, setActiveId] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setActionError("");
    if (!childId) {
      setActionError("Please select a child from the list.");
      return;
    }
    setSaving(true);
    try {
      const fullSummary = [summary, details && `Details: ${details}`, actionTaken && `Action taken: ${actionTaken}`].filter(Boolean).join("\n");
      const response = await incidentApi.create({ child_id: childId, severity, summary: fullSummary, status: notifyParent ? "sent" : "draft" });
      if (notifyParent && response.incident?.id) await incidentApi.notifyParent(response.incident.id);
      toast(notifyParent ? "Incident report created and shared with the parent." : "Incident saved as a draft.");
      setChildId("");
      setSummary("");
      setDetails("");
      setActionTaken("");
      setCreating(false);
      if (response.incident?.id) setActiveId(String(response.incident.id));
      await reload();
    } catch (err) {
      setActionError(friendlyError(getApiError(err).message));
    } finally {
      setSaving(false);
    }
  }

  async function run(action: () => Promise<unknown>, message: string) {
    setSaving(true);
    setActionError("");
    try {
      await action();
      toast(message);
      await reload();
    } catch (err) {
      setActionError(friendlyError(getApiError(err).message));
    } finally {
      setSaving(false);
    }
  }

  const incidents = (data?.incidents ?? []) as any[];
  const counts = useMemo(() => ({
    all: incidents.length,
    draft: incidents.filter((incident) => incident.status === "draft").length,
    sent: incidents.filter((incident) => incident.status === "sent").length,
    high: incidents.filter((incident) => incident.severity === "high").length
  }), [incidents]);
  const rows = useMemo(() => incidents.filter((incident) => filter === "all" || (filter === "high" ? incident.severity === "high" : incident.status === filter)), [incidents, filter]);
  useEffect(() => {
    if (rows.length && !rows.some((row) => String(row.id) === activeId)) setActiveId(String(rows[0].id));
  }, [rows, activeId]);
  const active = rows.find((row) => String(row.id) === activeId) ?? null;
  const activeChild = active ? (data?.children ?? []).find((child: any) => child.childCode === active.childCode) : null;
  const parts = splitIncidentSummary(active?.summary);

  return (
    <main className="bb-page">
      <PageHeader kicker="Injuries, illness and anything a parent should know about" title="Incidents" actions={<button className="bb-btn bb-btn-primary bb-btn-lg" onClick={() => { setActionError(""); setCreating(true); }}><PlusCircle />Report incident</button>} />
      {actionError && !creating ? <Alert tone="danger">{actionError}</Alert> : null}
      {loading && !data ? <LoadingState /> : error ? <ErrorState message={error} onRetry={reload} /> : !incidents.length ? (
        <EmptyState icon={FirstAidKit} title="No incidents reported" action={<button className="bb-btn bb-btn-primary" onClick={() => setCreating(true)}><PlusCircle />Report incident</button>}>When a child is hurt or unwell, record it here and share it with their parent.</EmptyState>
      ) : (
        <>
          <div className="bb-toolbar">
            <Segmented label="Filter incidents" value={filter} onChange={setFilter} items={[
              { key: "all", label: `All ${counts.all}` },
              { key: "draft", label: `Drafts ${counts.draft}` },
              { key: "sent", label: `Sent ${counts.sent}` },
              { key: "high", label: `High ${counts.high}` }
            ]} />
          </div>
          <div className="bb-incidents">
            <div className="bb-incident-list">
              {rows.length ? rows.map((incident) => (
                <button key={incident.id} className={`bb-incident-item${String(incident.id) === activeId ? " on" : ""}`} onClick={() => setActiveId(String(incident.id))}>
                  <Avatar name={incident.childName} seed={incident.childCode} size={40} />
                  <div>
                    <div className="bb-row" style={{ justifyContent: "space-between", flexWrap: "nowrap", gap: 10 }}><strong>{incident.childName}</strong><span className="bb-caption" style={{ flex: "none" }}>{when(incident.occurredAt)}</span></div>
                    <span>{splitIncidentSummary(incident.summary).title}</span>
                    <div className="bb-row" style={{ gap: 10, marginTop: 6 }}><StatusBadge size="sm" map={incidentSeverities} value={incident.severity} /><StatusBadge size="sm" plain map={incidentStatuses} value={incident.status} /></div>
                  </div>
                </button>
              )) : <EmptyState compact title="No incidents match">Try another filter.</EmptyState>}
            </div>
            {active ? (
              <article className="bb-incident-detail">
                <div className="bb-row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ flex: "1 1 320px", minWidth: 0 }}>
                    <span className="bb-caption">{[active.childName, active.classroom, active.childCode].filter(Boolean).join(" · ")}</span>
                    <h2 style={{ fontSize: 34, marginTop: 6 }}>{parts.title}</h2>
                  </div>
                  <div className="bb-row">
                    {active.status === "draft" ? <button className="bb-btn bb-btn-primary bb-btn-lg" disabled={saving} onClick={() => run(async () => { await incidentApi.update(active.id, { status: "sent" }); await incidentApi.notifyParent(active.id); }, "Incident shared with the parent.")}><PaperPlaneTilt />Notify parent</button> : null}
                    {active.status === "sent" ? <button className="bb-btn bb-btn-secondary bb-btn-lg" disabled={saving} onClick={() => run(() => incidentApi.update(active.id, { status: "resolved" }), "Incident marked resolved.")}><CheckCircle />Mark resolved</button> : null}
                  </div>
                </div>
                <div className="bb-row" style={{ margin: "12px 0 30px" }}>
                  <StatusBadge map={incidentSeverities} value={active.severity} label={`${incidentSeverities[active.severity]?.label ?? active.severity} severity`} />
                  <span className="bb-inline-status muted">{active.status === "draft" ? <><PencilSimple size={16} />Draft · parent not notified yet</> : active.status === "sent" ? <><PaperPlaneTilt size={16} />Sent to parent</> : <><CheckCircle size={16} />Resolved</>}</span>
                </div>
                <dl className="bb-facts">
                  <div><dt>When</dt><dd>{when(active.occurredAt)}</dd></div>
                  <div><dt>Reported by</dt><dd>{active.staffName}</dd></div>
                  <div><dt>Guardian</dt><dd>{activeChild?.primaryGuardianName ?? "Not linked"}</dd></div>
                </dl>
                {parts.details ? <section style={{ marginTop: 30 }}><h4>Details</h4><p className="bb-prose">{parts.details}</p></section> : null}
                {parts.actionTaken ? <section style={{ marginTop: 24 }}><h4>Action taken</h4><p className="bb-prose">{parts.actionTaken}</p></section> : null}
              </article>
            ) : null}
          </div>
        </>
      )}

      {creating ? (
        <Drawer title="Report an incident" onClose={() => setCreating(false)} footer={<><button className="bb-btn bb-btn-secondary bb-btn-lg" onClick={() => setCreating(false)}>Cancel</button><button className="bb-btn bb-btn-primary bb-btn-lg" form="incident-form" disabled={saving}>{saving ? "Saving…" : "Create incident"}</button></>}>
          {actionError ? <Alert tone="danger">{actionError}</Alert> : null}
          <form id="incident-form" className="bb-stack" onSubmit={submit}>
            <ChildSelect children={data?.children ?? []} value={childId} onChange={setChildId} label="Child" placeholder="Choose a child" />
            <Field label="Severity"><Segmented label="Severity" value={severity} onChange={setSeverity} items={[{ key: "low", label: "Low" }, { key: "medium", label: "Medium" }, { key: "high", label: "High / critical" }]} /></Field>
            <Field label="Summary"><input className="bb-input" value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="e.g. Bumped head on a table corner" required /></Field>
            <Field label="Details"><textarea className="bb-input" value={details} onChange={(event) => setDetails(event.target.value)} placeholder="What happened" /></Field>
            <Field label="Action taken"><textarea className="bb-input" value={actionTaken} onChange={(event) => setActionTaken(event.target.value)} placeholder="How staff responded" /></Field>
            <div>
              <label className="bb-check"><input type="checkbox" checked={notifyParent} onChange={(event) => setNotifyParent(event.target.checked)} />Notify the parent now</label>
              <p className="bb-caption" style={{ margin: "6px 0 0 34px" }}>Untick to save it as a draft and send it later.</p>
            </div>
          </form>
        </Drawer>
      ) : null}
    </main>
  );
}
