import { useState } from "react";
import { superAdminApi } from "@barbaari/shared";
import { Alert, Badge, DataTable, ErrorState, Header, LoadingState, Modal, Panel } from "../components/Ui";
import { useAsyncData } from "../hooks/useAsyncData";
import { errorMessage, money, titleize } from "../utils/format";

function facilityLabel(type?: string) {
  return type === "family_child_care" ? "Family Child Care" : "Center Daycare";
}

function statusTone(status?: string) {
  if (status === "approved") return "success";
  if (status === "rejected") return "danger";
  if (status === "follow_up") return "warning";
  return "warning";
}

export function RegistrationApplicationsPage() {
  const { data, loading, error, reload } = useAsyncData(async () => {
    const [applications, plans] = await Promise.all([superAdminApi.registrationApplications(), superAdminApi.pricingPlans()]);
    return { applications: applications.applications, plans: plans.pricing_plans };
  }, []);
  const [selected, setSelected] = useState<any | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [planId, setPlanId] = useState("");
  const [billingCycle, setBillingCycle] = useState("monthly");
  const [success, setSuccess] = useState("");
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);

  function open(application: any) {
    setSelected(application);
    setPlanId(application.pricing_plan_id ?? data?.plans?.find((plan: any) => plan.available_for_family_child_care || plan.available_for_center_daycare)?.id ?? "");
    setBillingCycle(application.billing_cycle ?? "monthly");
    setReviewNotes(application.review_notes ?? "");
    setSuccess("");
    setActionError("");
  }

  async function action(fn: () => Promise<unknown>, message: string) {
    setSaving(true);
    setActionError("");
    setSuccess("");
    try {
      await fn();
      setSuccess(message);
      setSelected(null);
      await reload();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const rows = data?.applications ?? [];
  const pending = rows.filter((application: any) => application.status === "pending").length;
  const approved = rows.filter((application: any) => application.status === "approved").length;
  const rejected = rows.filter((application: any) => application.status === "rejected").length;

  return (
    <section className="page">
      <Header eyebrow="Provider onboarding" title="Registration Applications" />
      <Alert message={success} />
      <Alert message={actionError} tone="danger" />
      <div className="stat-grid">
        <article className="stat-card"><span>Pending applications</span><strong>{pending}</strong></article>
        <article className="stat-card"><span>Approved</span><strong>{approved}</strong></article>
        <article className="stat-card"><span>Rejected</span><strong>{rejected}</strong></article>
      </div>
      {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={reload} /> : (
        <DataTable rows={rows} columns={[
          { header: "Provider", render: (row: any) => <><strong>{row.business_name}</strong><br /><small>{row.owner_name} - {row.owner_email}</small></> },
          { header: "Facility type", render: (row: any) => <Badge>{facilityLabel(row.facility_type)}</Badge> },
          { header: "Location", render: (row: any) => [row.city, row.state, row.country].filter(Boolean).join(", ") || "Not provided" },
          { header: "Plan", render: (row: any) => <><strong>{row.pricing_plan?.name ?? "Needs plan"}</strong><br /><small>{row.pricing_plan ? money(row.pricing_plan.monthly_price) : "No price"} / {row.billing_cycle}</small></> },
          { header: "Status", render: (row: any) => <Badge tone={statusTone(row.status)}>{titleize(row.status)}</Badge> },
          { header: "Submitted", render: (row: any) => row.created_at ? new Date(row.created_at).toLocaleDateString() : "—" },
          { header: "Actions", render: (row: any) => <button className="secondary" onClick={() => open(row)}>View / Review</button> }
        ]} />
      )}

      {selected ? (
        <Modal title={`Review ${selected.business_name}`} onClose={() => setSelected(null)}>
          <div className="settings-stack">
            <Panel title="Application details">
              <div className="grid three">
                <article className="ops"><span>Facility type</span><strong>{facilityLabel(selected.facility_type)}</strong></article>
                <article className="ops"><span>Owner</span><strong>{selected.owner_name}</strong></article>
                <article className="ops"><span>Email</span><strong>{selected.owner_email}</strong></article>
                <article className="ops"><span>Phone</span><strong>{selected.phone ?? "—"}</strong></article>
                <article className="ops"><span>License</span><strong>{selected.license_number ?? "Not provided"}</strong></article>
                <article className="ops"><span>Status</span><strong>{titleize(selected.status)}</strong></article>
              </div>
              {selected.notes ? <p className="muted">{selected.notes}</p> : null}
            </Panel>
            <Panel title="Approval settings">
              <div className="form-grid two">
                <select value={planId} onChange={(event) => setPlanId(event.target.value)}>
                  {(data?.plans ?? []).filter((plan: any) => selected.facility_type === "family_child_care" ? plan.available_for_family_child_care : plan.available_for_center_daycare).map((plan: any) => <option key={plan.id} value={plan.id}>{plan.name} - {money(plan.monthly_price)}/month</option>)}
                </select>
                <select value={billingCycle} onChange={(event) => setBillingCycle(event.target.value)}><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select>
                <textarea className="full" value={reviewNotes} onChange={(event) => setReviewNotes(event.target.value)} placeholder="Review notes or follow-up request" rows={4} />
              </div>
            </Panel>
            <div className="actions">
              <button className="primary" disabled={saving || !planId || selected.status === "approved"} onClick={() => action(() => superAdminApi.approveRegistrationApplication(selected.id, { pricing_plan_id: planId, billing_cycle: billingCycle, review_notes: reviewNotes || undefined }), "Application approved and organization created.")}>Approve / Convert</button>
              <button className="secondary" disabled={saving} onClick={() => action(() => superAdminApi.requestRegistrationApplicationFollowUp(selected.id, reviewNotes || "Please provide more information."), "Follow-up requested.")}>Request follow-up</button>
              <button className="secondary" disabled={saving} onClick={() => action(() => superAdminApi.rejectRegistrationApplication(selected.id, reviewNotes || "Application rejected."), "Application rejected.")}>Reject</button>
            </div>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}
