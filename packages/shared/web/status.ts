/**
 * Every status in the redesign is shown as an icon plus a word, never colour alone.
 * Tones map to the status palette in design/redesign-2026/tokens.md.
 */
export type StatusTone = "ok" | "muted" | "absent" | "warn" | "danger" | "info";
export type StatusIcon =
  | "check" | "signOut" | "minus" | "clock" | "clockCountdown" | "warning" | "circleDashed" | "circleHalf"
  | "hourglass" | "calendarX" | "prohibit" | "xCircle" | "pause" | "creditCard" | "envelope" | "pencil" | "paperPlane" | "info";

export type StatusSpec = { label: string; tone: StatusTone; icon: StatusIcon };

const titleCase = (value: string) => value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()).replace(/\B\w+/g, (word) => word.toLowerCase());

export const attendanceStatuses: Record<string, StatusSpec> = {
  checked_in: { label: "Present", tone: "ok", icon: "check" },
  present: { label: "Present", tone: "ok", icon: "check" },
  checked_out: { label: "Checked out", tone: "muted", icon: "signOut" },
  checked_out_early: { label: "Early checkout", tone: "warn", icon: "clockCountdown" },
  missing_checkout: { label: "Missing checkout", tone: "danger", icon: "warning" },
  not_checked_in: { label: "Not arrived", tone: "warn", icon: "clock" },
  not_arrived: { label: "Not arrived", tone: "warn", icon: "clock" },
  absent: { label: "Absent", tone: "absent", icon: "minus" }
};

export const invoiceStatuses: Record<string, StatusSpec> = {
  paid: { label: "Paid", tone: "ok", icon: "check" },
  open: { label: "Open", tone: "info", icon: "circleDashed" },
  sent: { label: "Open", tone: "info", icon: "circleDashed" },
  draft: { label: "Draft", tone: "muted", icon: "pencil" },
  overdue: { label: "Overdue", tone: "danger", icon: "warning" },
  partial: { label: "Partial", tone: "warn", icon: "circleHalf" },
  void: { label: "Void", tone: "muted", icon: "xCircle" }
};

export const subscriptionStatuses: Record<string, StatusSpec> = {
  active: { label: "Active", tone: "ok", icon: "check" },
  trial: { label: "Trial", tone: "info", icon: "hourglass" },
  trialing: { label: "Trial", tone: "info", icon: "hourglass" },
  past_due: { label: "Past due", tone: "warn", icon: "clockCountdown" },
  pending_payment: { label: "Payment required", tone: "warn", icon: "creditCard" },
  payment_required: { label: "Payment required", tone: "warn", icon: "creditCard" },
  pending_activation: { label: "Pending activation", tone: "warn", icon: "clock" },
  pending_setup: { label: "Pending setup", tone: "warn", icon: "clock" },
  pending: { label: "Pending", tone: "warn", icon: "clock" },
  expired: { label: "Expired", tone: "danger", icon: "calendarX" },
  suspended: { label: "Suspended", tone: "danger", icon: "prohibit" },
  paused: { label: "Paused", tone: "muted", icon: "pause" },
  canceled: { label: "Canceled", tone: "muted", icon: "xCircle" },
  cancelled: { label: "Canceled", tone: "muted", icon: "xCircle" },
  none: { label: "No subscription", tone: "muted", icon: "xCircle" }
};

export const accountStatuses: Record<string, StatusSpec> = {
  active: { label: "Active", tone: "ok", icon: "check" },
  pending_invite: { label: "Invite pending", tone: "warn", icon: "envelope" },
  pending: { label: "Pending", tone: "warn", icon: "clock" },
  pending_approval: { label: "Pending approval", tone: "warn", icon: "hourglass" },
  inactive: { label: "Inactive", tone: "muted", icon: "pause" },
  blocked: { label: "Blocked", tone: "danger", icon: "prohibit" },
  disabled: { label: "Disabled", tone: "muted", icon: "pause" },
  rejected: { label: "Rejected", tone: "danger", icon: "xCircle" },
  accepted: { label: "Accepted", tone: "ok", icon: "check" },
  expired: { label: "Expired", tone: "danger", icon: "calendarX" },
  cancelled: { label: "Cancelled", tone: "muted", icon: "xCircle" }
};

export const incidentSeverities: Record<string, StatusSpec> = {
  low: { label: "Low", tone: "ok", icon: "circleDashed" },
  medium: { label: "Medium", tone: "warn", icon: "circleHalf" },
  high: { label: "High", tone: "danger", icon: "warning" },
  critical: { label: "Critical", tone: "danger", icon: "warning" }
};

export const incidentStatuses: Record<string, StatusSpec> = {
  draft: { label: "Draft · not sent", tone: "muted", icon: "pencil" },
  sent: { label: "Sent to parent", tone: "info", icon: "paperPlane" },
  resolved: { label: "Resolved", tone: "ok", icon: "check" }
};

export const applicationStatuses: Record<string, StatusSpec> = {
  pending: { label: "In review", tone: "info", icon: "hourglass" },
  follow_up: { label: "Follow-up requested", tone: "warn", icon: "clock" },
  approved: { label: "Approved", tone: "ok", icon: "check" },
  rejected: { label: "Rejected", tone: "danger", icon: "xCircle" }
};

export const alertSeverities: Record<string, StatusSpec> = {
  info: { label: "Info", tone: "info", icon: "info" },
  warning: { label: "Warning", tone: "warn", icon: "warning" },
  critical: { label: "Critical", tone: "danger", icon: "warning" }
};

export function resolveStatus(map: Record<string, StatusSpec>, value?: string | null, fallbackTone: StatusTone = "muted"): StatusSpec {
  const key = String(value ?? "").toLowerCase();
  return map[key] ?? { label: key ? titleCase(key) : "Unknown", tone: fallbackTone, icon: "circleDashed" };
}

/** Attendance status for a record, with an absence taking precedence for that day. */
export function attendanceStatusKey(record?: any): string {
  if (!record) return "not_checked_in";
  return record.status ?? (record.checkOutTime ? "checked_out" : record.checkInTime ? "checked_in" : "not_checked_in");
}
