import { Activity, BadgeDollarSign, Building, ShieldAlert } from "lucide-react";
import { superAdminApi } from "@barbaari/shared";
import { Header, LoadingState, ErrorState, Panel } from "../components/Ui";
import { useAsyncData } from "../hooks/useAsyncData";

export function DashboardPage() {
  const { data, loading, error, reload } = useAsyncData(async () => {
    const [dashboard, orgs, subs, users, alerts] = await Promise.all([superAdminApi.dashboard(), superAdminApi.organizations(), superAdminApi.subscriptions(), superAdminApi.users(), superAdminApi.systemAlerts()]);
    return { dashboard, orgs: orgs.organizations, subs: subs.subscriptions, users: users.users, alerts: alerts.system_alerts };
  }, []);
  if (loading) return <section className="page"><LoadingState /></section>;
  if (error || !data) return <section className="page"><ErrorState message={error} onRetry={reload} /></section>;
  return <section className="page"><Header eyebrow="Company workspace" title="SaaS platform command center" /><div className="metrics">{data.dashboard.metrics.map((m: any) => <article className={`metric ${m.tone}`} key={m.label}><span>{m.label}</span><strong>{m.value}</strong><small>{m.detail}</small></article>)}</div><div className="grid three"><Ops icon={Building} title="Active orgs" value={String(data.orgs.filter((o: any) => o.status === "active").length)} /><Ops icon={ShieldAlert} title="Suspended" value={String(data.orgs.filter((o: any) => o.status === "suspended").length)} /><Ops icon={BadgeDollarSign} title="Subscriptions" value={String(data.subs.length)} /><Ops icon={Activity} title="Users" value={String(data.users.length)} /></div><Panel title="System alerts"><div className="log-list">{data.alerts.map((alert: any) => <div className={`log ${alert.severity}`} key={alert.id}><strong>{alert.title}</strong><span>{alert.body}</span></div>)}</div></Panel></section>;
}

function Ops({ icon: Icon, title, value }: { icon: React.ElementType; title: string; value: string }) {
  return <article className="ops"><Icon size={22} /><span>{title}</span><strong>{value}</strong></article>;
}
