import { useState } from "react";
import { superAdminApi } from "@barbaari/shared";
import { Alert, Badge, ErrorState, Header, LoadingState, Panel } from "../components/Ui";
import { useAsyncData } from "../hooks/useAsyncData";
import { dateShort, errorMessage, titleize } from "../utils/format";

const labels = ["api", "database", "queue", "scheduler", "stripe", "sms", "email"];

export function MonitoringPage() {
  const { data, loading, error, reload } = useAsyncData(async () => await superAdminApi.monitoringHealth(), []);
  const [success, setSuccess] = useState("");
  const [actionError, setActionError] = useState("");

  async function createAlert() {
    setSuccess("");
    setActionError("");
    try {
      await superAdminApi.createSystemAlert({ title: "Monitoring warning", body: "Created from monitoring health screen.", severity: "warning", type: "api_error" });
      setSuccess("System alert created from monitoring.");
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  if (loading) return <section className="page"><LoadingState /></section>;
  if (error || !data) return <section className="page"><ErrorState message={error} onRetry={reload} /></section>;

  return <section className="page">
    <Header eyebrow="Operations" title="Monitoring health" action={<div className="actions"><button className="secondary" onClick={reload}>Refresh health check</button><button className="primary" onClick={createAlert}>Create system alert</button></div>} />
    <Alert tone="warning" message="Demo placeholder: API and database health are checked locally. Queue, scheduler, Stripe, SMS, and email provider checks are not connected to production monitoring yet." />
    <Alert message={success} />
    <Alert message={actionError} tone="danger" />
    <div className="health-grid">
      {labels.map((key) => <article className="health-card" key={key}><span className="muted">{titleize(key)}</span><strong>{titleize(data[key])}</strong><Badge tone={data[key] === "healthy" ? "success" : data[key] === "unhealthy" ? "danger" : "warning"}>{data[key]}</Badge></article>)}
    </div>
    <Panel title="Health summary">
      <div className="grid three">
        <article className="ops"><span>Error count</span><strong>{data.error_count}</strong></article>
        <article className="ops"><span>Last checked</span><strong>{dateShort(data.checked_at)}</strong></article>
        <article className="ops"><span>Database</span><strong>{titleize(data.database)}</strong></article>
      </div>
    </Panel>
  </section>;
}
