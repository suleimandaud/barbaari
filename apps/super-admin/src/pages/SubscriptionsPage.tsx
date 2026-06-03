import { useState } from "react";
import { superAdminApi } from "@barbaari/shared";
import { Alert, Badge, DataTable, ErrorState, Header, LoadingState, Modal, Panel } from "../components/Ui";
import { useAsyncData } from "../hooks/useAsyncData";
import { dateShort, errorMessage, titleize } from "../utils/format";

export function SubscriptionsPage() {
  const { data, loading, error, reload } = useAsyncData(async () => await superAdminApi.subscriptions(), []);
  const [selected, setSelected] = useState<any | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [planId, setPlanId] = useState("");
  const [assignForm, setAssignForm] = useState({ organization_id: "", pricing_plan_id: "", billing_cycle: "monthly" });
  const [success, setSuccess] = useState("");
  const [actionError, setActionError] = useState("");

  async function action(run: () => Promise<unknown>, message: string) {
    setSuccess("");
    setActionError("");
    try {
      await run();
      setSuccess(message);
      setSelected(null);
      await reload();
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  return <section className="page">
    <Header eyebrow="Platform Billing" title="Organization subscriptions" action={<button className="primary" onClick={() => setAssigning(true)}>Assign plan</button>} />
    <Alert tone="warning" message="Manual subscription management is active. Stripe IDs are optional test-mode readiness fields only." />
    <Alert message={success} />
    <Alert message={actionError} tone="danger" />
    <Panel title="Manual controls">
      <p className="muted">Pause, reactivate, cancel, suspend, or change Barbaari platform subscriptions for daycare organizations.</p>
    </Panel>
    {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={reload} /> : <DataTable rows={data?.subscriptions ?? []} columns={[
      { header: "Organization", render: (row: any) => <><strong>{row.organization?.name ?? "Organization"}</strong><br /><small>{row.pricing_plan?.name ?? "No plan"}</small></> },
      { header: "Status", render: (row: any) => <Badge tone={row.status === "active" ? "success" : row.status === "canceled" ? "danger" : "warning"}>{titleize(row.status)}</Badge> },
      { header: "Cycle", render: (row: any) => titleize(row.billing_cycle) },
      { header: "Provider", render: (row: any) => <Badge>{titleize(row.provider ?? "manual")}</Badge> },
      { header: "Stripe", render: (row: any) => row.stripe_subscription_id ?? "Test-mode placeholder" },
      { header: "Trial ends", render: (row: any) => dateShort(row.trial_ends_at) },
      { header: "Period end", render: (row: any) => dateShort(row.current_period_end ?? row.current_period_ends_at) },
      { header: "Next invoice", render: (row: any) => dateShort(row.next_invoice_at) },
      { header: "Actions", render: (row: any) => <div className="row-actions"><button className="secondary" onClick={() => action(() => superAdminApi.pauseSubscription(row.id), "Subscription paused.")}>Pause</button><button className="secondary" onClick={() => action(() => superAdminApi.cancelSubscription(row.id), "Subscription canceled.")}>Cancel</button><button className="secondary" onClick={() => action(() => superAdminApi.resumeSubscription(row.id), "Subscription reactivated.")}>Reactivate</button><button className="secondary" onClick={() => action(() => superAdminApi.suspendSubscription(row.id), "Subscription suspended.")}>Suspend</button><button className="secondary" onClick={() => { setSelected(row); setPlanId(row.pricing_plan_id ?? ""); }}>Change plan</button></div> }
    ]} />}
    {selected ? <Modal title={`Change plan: ${selected.organization?.name}`} onClose={() => setSelected(null)}>
      <div className="form-grid two">
        <select value={planId} onChange={(event) => setPlanId(event.target.value)}>{(data?.plans ?? []).map((plan: any) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select>
        <button className="primary" disabled={!planId} onClick={() => action(() => superAdminApi.changeSubscriptionPlan(selected.id, planId), "Subscription plan changed.")}>Save plan</button>
      </div>
    </Modal> : null}
    {assigning ? <Modal title="Assign organization plan" onClose={() => setAssigning(false)}>
      <div className="form-grid two">
        <select value={assignForm.organization_id} onChange={(event) => setAssignForm({ ...assignForm, organization_id: event.target.value })}>
          <option value="">Choose organization</option>
          {(data?.organizations ?? []).map((organization: any) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
        </select>
        <select value={assignForm.pricing_plan_id} onChange={(event) => setAssignForm({ ...assignForm, pricing_plan_id: event.target.value })}>
          <option value="">Choose plan</option>
          {(data?.plans ?? []).map((plan: any) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
        </select>
        <select value={assignForm.billing_cycle} onChange={(event) => setAssignForm({ ...assignForm, billing_cycle: event.target.value })}><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select>
        <button className="primary" disabled={!assignForm.organization_id || !assignForm.pricing_plan_id} onClick={() => action(() => superAdminApi.createSubscription({ ...assignForm, status: "active", provider: "manual" }), "Subscription assigned.")}>Assign plan</button>
      </div>
    </Modal> : null}
  </section>;
}
