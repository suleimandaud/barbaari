import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { superAdminApi } from "@barbaari/shared";
import { Alert, ErrorState, Header, LoadingState, Panel } from "../components/Ui";
import { useAsyncData } from "../hooks/useAsyncData";
import { errorMessage } from "../utils/format";

const defaults = {
  general: { platform_name: "Barbaari", support_email: "support@barbaari.test", default_timezone: "America/Chicago" },
  sms: { provider: "Twilio", sender_id: "Barbaari", test_mode: true, api_key_placeholder: "" },
  email: { provider: "SendGrid", from_email: "noreply@barbaari.test", from_name: "Barbaari", test_mode: true },
  stripe: { public_key_placeholder: "", secret_key_placeholder: "", webhook_secret_placeholder: "", test_mode: true, enable_payments: false },
  features: { qr_kiosk_attendance: true, stripe_payments: false, parent_messaging: true, incident_notifications: true, dcyf_export: false, document_downloads: false },
  control: { maintenance_mode: false, api_rate_limit: 120, max_upload_size: 25, session_timeout: 120 },
};

export function SettingsPage() {
  const { data, loading, error, reload } = useAsyncData(async () => await superAdminApi.settings(), []);
  const [settings, setSettings] = useState<any>(defaults);
  const [success, setSuccess] = useState("");
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    if (data?.settings_map) setSettings({ ...defaults, ...data.settings_map });
  }, [data]);

  function setSection(section: string, key: string, value: any) {
    setSettings((current: any) => ({ ...current, [section]: { ...current[section], [key]: value } }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSuccess("");
    setActionError("");
    try {
      await superAdminApi.updateSettingsBulk(settings);
      setSuccess("Platform settings saved.");
      await reload();
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  if (loading) return <section className="page"><LoadingState /></section>;
  if (error) return <section className="page"><ErrorState message={error} onRetry={reload} /></section>;

  return <section className="page">
    <Header eyebrow="Platform" title="Platform settings" />
    <Alert tone="warning" message="Demo placeholder: SMS delivery, email delivery, and Stripe payment processing are not connected yet. These controls store demo configuration only." />
    <Alert message={success} />
    <Alert message={actionError} tone="danger" />
    <form onSubmit={submit}>
      <Panel title="General Settings"><div className="form-grid three"><Field label="Platform name" value={settings.general.platform_name} onChange={(v) => setSection("general", "platform_name", v)} /><Field label="Support email" value={settings.general.support_email} onChange={(v) => setSection("general", "support_email", v)} /><Field label="Default timezone" value={settings.general.default_timezone} onChange={(v) => setSection("general", "default_timezone", v)} /></div></Panel>
      <Panel title="SMS Provider"><div className="form-grid three"><Select label="Provider" value={settings.sms.provider} options={["Twilio", "Other"]} onChange={(v) => setSection("sms", "provider", v)} /><Field label="Sender ID" value={settings.sms.sender_id} onChange={(v) => setSection("sms", "sender_id", v)} /><Field label="Placeholder API key" value={settings.sms.api_key_placeholder} onChange={(v) => setSection("sms", "api_key_placeholder", v)} /><Toggle label="Test mode" checked={settings.sms.test_mode} onChange={(v) => setSection("sms", "test_mode", v)} /></div></Panel>
      <Panel title="Email Provider"><div className="form-grid three"><Select label="Provider" value={settings.email.provider} options={["SendGrid", "Mailgun", "SMTP"]} onChange={(v) => setSection("email", "provider", v)} /><Field label="From email" value={settings.email.from_email} onChange={(v) => setSection("email", "from_email", v)} /><Field label="From name" value={settings.email.from_name} onChange={(v) => setSection("email", "from_name", v)} /><Toggle label="Test mode" checked={settings.email.test_mode} onChange={(v) => setSection("email", "test_mode", v)} /></div></Panel>
      <Panel title="Stripe Settings"><div className="form-grid three"><Field label="Public key placeholder" value={settings.stripe.public_key_placeholder} onChange={(v) => setSection("stripe", "public_key_placeholder", v)} /><Field label="Secret key placeholder" value={settings.stripe.secret_key_placeholder} onChange={(v) => setSection("stripe", "secret_key_placeholder", v)} /><Field label="Webhook secret placeholder" value={settings.stripe.webhook_secret_placeholder} onChange={(v) => setSection("stripe", "webhook_secret_placeholder", v)} /><Toggle label="Test mode" checked={settings.stripe.test_mode} onChange={(v) => setSection("stripe", "test_mode", v)} /><Toggle label="Enable payments" checked={settings.stripe.enable_payments} onChange={(v) => setSection("stripe", "enable_payments", v)} /></div></Panel>
      <Panel title="Feature Toggles"><div className="form-grid three">{Object.keys(settings.features).map((key) => <Toggle key={key} label={key.replace(/_/g, " ")} checked={settings.features[key]} onChange={(v) => setSection("features", key, v)} />)}</div></Panel>
      <Panel title="Platform Control"><div className="form-grid three"><Toggle label="Maintenance mode" checked={settings.control.maintenance_mode} onChange={(v) => setSection("control", "maintenance_mode", v)} /><NumberField label="API rate limit" value={settings.control.api_rate_limit} onChange={(v) => setSection("control", "api_rate_limit", v)} /><NumberField label="Max upload size MB" value={settings.control.max_upload_size} onChange={(v) => setSection("control", "max_upload_size", v)} /><NumberField label="Session timeout minutes" value={settings.control.session_timeout} onChange={(v) => setSection("control", "session_timeout", v)} /></div></Panel>
      <button className="primary">Save settings</button>
    </form>
  </section>;
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="stack"><span>{label}</span><input value={value ?? ""} onChange={(event) => onChange(event.target.value)} /></label>;
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="stack"><span>{label}</span><input type="number" value={value ?? 0} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <label className="stack"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="stack"><span>{label}</span><select value={checked ? "yes" : "no"} onChange={(event) => onChange(event.target.value === "yes")}><option value="yes">Enabled</option><option value="no">Disabled</option></select></label>;
}
