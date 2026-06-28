import axios, { AxiosError } from "axios";

const env = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};

export const API_BASE_URL = env.EXPO_PUBLIC_API_URL || env.VITE_API_URL || "https://api-barbaari.pioneeriya.com/api";

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { Accept: "application/json", "Content-Type": "application/json" }
});

export type ApiError = { message: string; status?: number; errors?: Record<string, string[]> };
export type LoginResponse = { token: string; user: any };
export type ListResponse<T, K extends string> = Record<K, T[]>;

export function setBearerToken(token?: string | null) {
  if (token) api.defaults.headers.common.Authorization = `Bearer ${token}`;
  else delete api.defaults.headers.common.Authorization;
}

export function getApiError(error: unknown): ApiError {
  if (axios.isAxiosError(error)) {
    const err = error as AxiosError<any>;
    return {
      message: err.response?.data?.message || err.message || "Request failed",
      status: err.response?.status,
      errors: err.response?.data?.errors
    };
  }
  return { message: error instanceof Error ? error.message : "Request failed" };
}

async function data<T>(request: Promise<{ data: T }>): Promise<T> {
  return (await request).data;
}

export const authApi = {
  async login(email: string, password: string) {
    const response = await data<LoginResponse>(api.post("/auth/login", { email, password }));
    setBearerToken(response.token);
    return response;
  },
  register(payload: { name: string; email: string; password: string; role?: string; organization_id?: number }) {
    return data<LoginResponse>(api.post("/auth/register", payload));
  },
  me() {
    return data<{ user: any }>(api.get("/auth/me"));
  },
  forgotPassword(email: string) {
    return data<{ message: string }>(api.post("/auth/forgot-password", { email }));
  },
  resetPassword(payload: { token: string; email: string; password: string; password_confirmation: string }) {
    return data<{ message: string }>(api.post("/auth/reset-password", payload));
  },
  verifyOtp(payload: { email: string; code?: string }) {
    return data<{ message: string }>(api.post("/auth/otp/verify", payload));
  },
  verifyPin(payload: { pin: string; purpose?: string }) {
    return data<{ message: string; pin_verification_id: number; verified_at: string }>(api.post("/auth/verify-pin", payload));
  },
  async pinLogin(payload: { email: string; pin: string; purpose?: string }) {
    const response = await data<LoginResponse & { pin_verification_id: number; verified_at: string }>(api.post("/auth/pin-login", payload));
    setBearerToken(response.token);
    return response;
  },
  async tabletUnlock(payload: { mode?: "guardian" | "staff" | "admin"; email: string; pin?: string; password_or_pin?: string; purpose?: string }) {
    const response = await data<LoginResponse & { role: string; mode: string; organization_id: number; allowed_modes: string[]; visible_classroom_ids: string[]; visible_child_ids: string[]; timezone: string; permissions: Record<string, unknown>; tablet_permissions: Record<string, unknown>; pin_verification_id: number; verified_at: string }>(api.post("/auth/tablet-unlock", payload));
    setBearerToken(response.token);
    return response;
  },
  async logout() {
    try {
      await api.post("/auth/logout");
    } finally {
      setBearerToken(undefined);
    }
  }
};

export const invitationApi = {
  get(token: string) {
    return data<{ invitation: any }>(api.get(`/invitations/${token}`));
  },
  accept(token: string, payload: { password: string; password_confirmation: string }) {
    return data<{ message: string; user: any }>(api.post(`/invitations/${token}/accept`, payload));
  }
};

export const registrationApi = {
  pricingPlans(facility_type?: "family_child_care" | "center_daycare") {
    return data<ListResponse<any, "pricing_plans">>(api.get("/public/pricing-plans", { params: facility_type ? { facility_type } : undefined }));
  },
  validateAddress(payload: Record<string, unknown>) {
    return data<any>(api.post("/public/validate-address", payload));
  },
  createApplication(payload: Record<string, unknown>) {
    return data<{ application: any; message: string }>(api.post("/registration-applications", payload));
  }
};

export const dashboardApi = {
  daycare() {
    return data<any>(api.get("/manager/dashboard"));
  },
  platform() {
    return data<any>(api.get("/platform/dashboard"));
  }
};

export const organizationApi = {
  get() {
    return data<{ organization: any }>(api.get("/manager/organization"));
  },
  update(payload: Record<string, unknown>) {
    return data<{ organization: any }>(api.put("/manager/organization", payload));
  },
  updateOwnerTabletPin(pin: string) {
    return data<{ message: string; user: any; pin_configured: boolean }>(api.post("/settings/owner-tablet-pin", { pin }));
  },
  validateAttendanceLocation(payload: Record<string, unknown>) {
    return data<any>(api.post("/settings/attendance-location/validate", payload));
  },
  updateAttendanceLocation(payload: Record<string, unknown>) {
    return data<{ organization: any; message: string }>(api.post("/settings/attendance-location", payload));
  }
};

export const childrenApi = {
  list() {
    return data<ListResponse<any, "children">>(api.get("/children"));
  },
  managerList() {
    return data<ListResponse<any, "children">>(api.get("/manager/children"));
  },
  mobileList() {
    return data<ListResponse<any, "children">>(api.get("/mobile/children"));
  },
  get(id: string | number) {
    return data<{ child: any }>(api.get(`/children/${id}`));
  },
  create(payload: Record<string, unknown>) {
    return data<{ child: any }>(api.post("/children", payload));
  },
  update(id: string | number, payload: Record<string, unknown>) {
    return data<{ child: any }>(api.put(`/children/${id}`, payload));
  },
  assignClassroom(id: string | number, classroomId: string | number) {
    return data<{ child: any }>(api.post(`/children/${id}/assign-classroom`, { classroom_id: classroomId }));
  },
  linkGuardian(id: string | number, payload: { guardian_id: string | number; primary_contact?: boolean; pickup_authorized?: boolean }) {
    return data<{ child: any }>(api.post(`/children/${id}/guardians`, payload));
  },
  pickupSigners(id: string | number) {
    return data<ListResponse<any, "signers">>(api.get(`/children/${id}/pickup-signers`));
  }
};

export const guardiansApi = {
  list() {
    return data<ListResponse<any, "guardians">>(api.get("/guardians"));
  },
  create(payload: Record<string, unknown>) {
    return data<{ guardian: any }>(api.post("/guardians", payload));
  },
  update(id: string | number, payload: Record<string, unknown>) {
    return data<{ guardian: any }>(api.put(`/guardians/${id}`, payload));
  },
  sendInvite(id: string | number) {
    return data<{ message: string; invitation?: any }>(api.post(`/guardians/${id}/send-invite`));
  },
  sendPasswordReset(id: string | number) {
    return data<{ message: string }>(api.post(`/guardians/${id}/send-password-reset`));
  },
  resetPin(id: string | number, pin: string) {
    return data<{ message: string }>(api.post(`/guardians/${id}/reset-pin`, { pin }));
  }
};

export const classroomsApi = {
  list() {
    return data<ListResponse<any, "classrooms">>(api.get("/manager/classrooms"));
  },
  tabletList() {
    return data<ListResponse<any, "classrooms">>(api.get("/classrooms"));
  },
  create(payload: { name: string; capacity?: number; lead_staff_id?: number | null }) {
    return data<{ classroom: any }>(api.post("/classrooms", payload));
  }
};

export const attendanceApi = {
  list(params?: Record<string, unknown>) {
    return data<ListResponse<any, "attendance">>(api.get("/attendance", { params }));
  },
  managerList(params?: Record<string, unknown>) {
    return data<ListResponse<any, "attendance">>(api.get("/manager/attendance", { params }));
  },
  mobileList(params?: Record<string, unknown>) {
    return data<ListResponse<any, "attendance">>(api.get("/mobile/attendance", { params }));
  },
  checkIn(childId: string | number, signerType = "staff", verificationMethod = "secure_login", pinVerificationId?: string | number, location?: { latitude?: number; longitude?: number }) {
    return data<{ attendance: any }>(api.post("/attendance/check-in", { child_id: childId, signer_type: signerType, verification_method: verificationMethod, pin_verification_id: pinVerificationId, ...location }));
  },
  checkOut(childId: string | number, signerType = "staff", verificationMethod = "secure_login", pinVerificationId?: string | number, location?: { latitude?: number; longitude?: number }) {
    return data<{ attendance: any }>(api.post("/attendance/check-out", { child_id: childId, signer_type: signerType, verification_method: verificationMethod, pin_verification_id: pinVerificationId, ...location }));
  },
  correct(id: string | number, payload: { reason: string; check_in_time?: string; check_out_time?: string }) {
    return data<{ attendance: any }>(api.post(`/attendance/${id}/correct`, payload));
  },
  guardianCheckIn(payload: Record<string, unknown>) {
    return data<{ attendance: any }>(api.post("/attendance/guardian-check-in", payload));
  },
  guardianCheckOut(payload: Record<string, unknown>) {
    return data<{ attendance: any }>(api.post("/attendance/guardian-check-out", payload));
  },
  auditLogs() {
    return data<ListResponse<any, "audit_logs">>(api.get("/attendance/audit-logs"));
  },
  export() {
    return data<{ message: string }>(api.get("/attendance/export"));
  }
};

export const tabletApi = {
  bootstrap(mode?: string) {
    return data<any>(api.get("/tablet/bootstrap", { params: mode ? { mode } : undefined }));
  },
  pickupSigners(id: string | number) {
    return data<ListResponse<any, "signers">>(api.get(`/tablet/children/${id}/pickup-signers`));
  },
  signers(id: string | number) {
    return data<ListResponse<any, "signers">>(api.get(`/tablet/children/${id}/signers`));
  },
  verifySignerPin(payload: { child_id: string | number; signer_type: string; signer_id: string | number; pin: string }) {
    return data<{ message: string; pin_verification_id: number; verified_at: string; signer: any }>(api.post("/tablet/signers/verify-pin", payload));
  },
  guardianCheckIn(payload: Record<string, unknown>) {
    return data<{ attendance: any }>(api.post("/tablet/attendance/guardian-check-in", payload));
  },
  guardianCheckOut(payload: Record<string, unknown>) {
    return data<{ attendance: any }>(api.post("/tablet/attendance/guardian-check-out", payload));
  },
  markAbsent(payload: { child_id: string | number; absence_date: string; absence_type: string; reason?: string; notes?: string; status?: string; assisting_staff_id?: string | number; signer_type?: string; guardian_id?: string | number; signer_name?: string; verification_method?: string; pin_verification_id?: string | number; signature_name?: string; latitude?: number; longitude?: number }) {
    return data<{ absence_record: any }>(api.post("/tablet/absence-records", payload));
  }
};

export const absenceApi = {
  list(params?: Record<string, unknown>) {
    return data<ListResponse<any, "absence_records">>(api.get("/absence-records", { params }));
  },
  mobileList(params?: Record<string, unknown>) {
    return data<ListResponse<any, "absence_records">>(api.get("/mobile/absence-records", { params }));
  },
  create(payload: { child_id: string | number; absence_date: string; absence_type: string; reason?: string; notes?: string; status?: string }) {
    return data<{ absence_record: any }>(api.post("/absence-records", payload));
  },
  update(id: string | number, payload: Record<string, unknown>) {
    return data<{ absence_record: any }>(api.patch(`/absence-records/${id}`, payload));
  },
  cancel(id: string | number) {
    return data<{ absence_record: any }>(api.delete(`/absence-records/${id}`));
  }
};

export const billingApi = {
  invoices() {
    return data<ListResponse<any, "invoices">>(api.get("/billing/invoices"));
  },
  managerInvoices() {
    return data<ListResponse<any, "invoices">>(api.get("/manager/billing"));
  },
  mobileInvoices() {
    return data<ListResponse<any, "invoices">>(api.get("/mobile/invoices"));
  },
  createInvoice(payload: Record<string, unknown>) {
    return data<{ invoice: any }>(api.post("/billing/invoices", payload));
  },
  recordPayment(invoiceId: string | number, payload: { amount: number; method: string }) {
    return data<{ invoice: any }>(api.post(`/billing/invoices/${invoiceId}/payments`, payload));
  },
  payments() {
    return data<ListResponse<any, "payments">>(api.get("/billing/payments"));
  },
  mobilePayments() {
    return data<ListResponse<any, "payments">>(api.get("/mobile/payments"));
  },
  receiptDownload(id: string | number) {
    return data<{ message: string }>(api.get(`/billing/receipts/${id}/download`));
  },
  stripePlaceholder() {
    return data<{ message: string }>(api.post("/billing/stripe/placeholder"));
  }
};

export const staffApi = {
  list() {
    return data<ListResponse<any, "staff">>(api.get("/manager/staff"));
  },
  create(payload: Record<string, unknown>) {
    return data<{ user: any }>(api.post("/staff", payload));
  },
  update(id: string | number, payload: Record<string, unknown>) {
    return data<{ user: any }>(api.patch(`/staff/${id}`, payload));
  },
  assignClassroom(id: string | number, classroom_id?: string | number | null) {
    return data<{ user: any }>(api.patch(`/staff/${id}/assign-classroom`, { classroom_id: classroom_id || null }));
  },
  activate(id: string | number) {
    return data<{ user: any }>(api.patch(`/staff/${id}/activate`));
  },
  deactivate(id: string | number) {
    return data<{ user: any }>(api.patch(`/staff/${id}/deactivate`));
  },
  resetPin(id: string | number, pin: string) {
    return data<{ message: string }>(api.post(`/staff/${id}/reset-pin`, { pin }));
  },
  sendInvite(id: string | number) {
    return data<{ message: string; invitation?: any }>(api.post(`/staff/${id}/send-invite`));
  },
  sendPasswordReset(id: string | number) {
    return data<{ message: string }>(api.post(`/staff/${id}/send-password-reset`));
  },
  checkIn() {
    return data<{ staff_check_in_id: number }>(api.post("/staff/check-in"));
  },
  checkOut() {
    return data<{ message: string }>(api.post("/staff/check-out"));
  },
  classroomChildren() {
    return data<ListResponse<any, "children">>(api.get("/staff/classroom-children"));
  },
  activity() {
    return data<ListResponse<any, "activities">>(api.get("/staff/activity"));
  }
};

export const incidentApi = {
  list() {
    return data<ListResponse<any, "incidents">>(api.get("/incidents"));
  },
  mobileList() {
    return data<ListResponse<any, "incidents">>(api.get("/mobile/incidents"));
  },
  create(payload: { child_id: string | number; severity: "low" | "medium" | "high"; summary: string; status?: string; occurred_at?: string }) {
    return data<{ incident: any }>(api.post("/incidents", payload));
  },
  notifyParent(id: string | number) {
    return data<{ message: string }>(api.post(`/incidents/${id}/notify-parent`));
  }
};

export const dailyNotesApi = {
  list() {
    return data<ListResponse<any, "daily_notes">>(api.get("/daily-notes"));
  },
  create(payload: { child_id: string | number; date?: string; note: string }) {
    return data<{ daily_note: any }>(api.post("/daily-notes", payload));
  }
};

export const messagesApi = {
  conversations() {
    return data<ListResponse<any, "conversations">>(api.get("/conversations"));
  },
  mobileConversations() {
    return data<ListResponse<any, "conversations">>(api.get("/mobile/messages"));
  },
  send(payload: { conversation_id?: string | number; body: string }) {
    return data<{ message: any }>(api.post("/messages", payload));
  }
};

export const notificationsApi = {
  list(params?: Record<string, unknown>) {
    return data<ListResponse<any, "notifications">>(api.get("/notifications", { params }));
  },
  mobileList(params?: Record<string, unknown>) {
    return data<ListResponse<any, "notifications">>(api.get("/mobile/notifications", { params }));
  },
  unreadCount() {
    return data<{ unread_count: number }>(api.get("/notifications/unread-count"));
  },
  markRead(id: string | number) {
    return data<{ notification: any }>(api.patch(`/notifications/${id}/read`));
  },
  markAllRead() {
    return data<{ message: string; updated: number }>(api.patch("/notifications/read-all"));
  },
  delete(id: string | number) {
    return data<{ message: string }>(api.delete(`/notifications/${id}`));
  },
  test() {
    return data<{ notification: any }>(api.post("/notifications/test"));
  },
  create(payload: { user_id?: number | null; title: string; body?: string; type?: string; priority?: string; delivery_channel?: string }) {
    return data<{ notification: any }>(api.post("/notifications", payload));
  }
};

export const documentsApi = {
  list() {
    return data<ListResponse<any, "documents">>(api.get("/documents"));
  },
  mobileList() {
    return data<ListResponse<any, "documents">>(api.get("/mobile/documents"));
  },
  upload(payload: { title: string; type?: string; child_id?: string | number; file: any }) {
    const formData = new FormData();
    formData.append("title", payload.title);
    if (payload.type) formData.append("type", payload.type);
    if (payload.child_id) formData.append("child_id", String(payload.child_id));
    formData.append("file", payload.file);
    return data<{ document: any }>(api.post("/documents", formData, {
      transformRequest: [(requestData, headers) => {
        if (headers) delete (headers as Record<string, unknown>)["Content-Type"];
        return requestData;
      }]
    }));
  },
  download(id: string | number) {
    return api.get(`/documents/${id}/download`, { responseType: "blob" });
  },
  downloadUrl(id: string | number) {
    return `${API_BASE_URL}/documents/${id}/download`;
  }
};

export const devicesApi = {
  list() {
    return data<ListResponse<any, "devices">>(api.get("/manager/devices"));
  }
};

export const reportsApi = {
  incidents() {
    return incidentApi.list();
  },
  attendanceExport() {
    return attendanceApi.export();
  }
};

export const daycarePlatformBillingApi = {
  subscription() {
    return data<any>(api.get("/daycare/subscription"));
  },
  invoices() {
    return data<ListResponse<any, "invoices">>(api.get("/daycare/billing/invoices"));
  },
  payments() {
    return data<ListResponse<any, "payments">>(api.get("/daycare/billing/payments"));
  },
  requestPlanChange(payload: Record<string, unknown>) {
    return data<{ message: string }>(api.post("/daycare/billing/request-plan-change", payload));
  },
  createStripeCheckoutSession(payload: Record<string, unknown>) {
    return data<{ message?: string; checkout_url?: string; session_id?: string }>(api.post("/daycare/billing/stripe/create-checkout-session", payload));
  },
  cancelStripeSubscription() {
    return data<{ message: string; subscription: any }>(api.post("/daycare/billing/stripe/cancel-subscription"));
  },
  confirmStripeSession(sessionId: string) {
    return data<{ success: boolean; subscription: any; payment_status?: string; message?: string }>(
      api.post("/daycare/billing/stripe/confirm-session", { session_id: sessionId })
    );
  },
  downloadInvoicePdf(invoiceId: string | number) {
    return api.get(`/daycare/billing/invoices/${invoiceId}/pdf`, { responseType: "blob" });
  },
  testPaymentSuccess() {
    return data<{ message: string; invoice: any; subscription: any }>(api.post("/daycare/billing/test-payment-success"));
  }
};

export const superAdminApi = {
  dashboard() {
    return dashboardApi.platform();
  },
  billingDashboard() {
    return data<any>(api.get("/platform/billing/dashboard"));
  },
  organizations() {
    return data<ListResponse<any, "organizations">>(api.get("/platform/organizations"));
  },
  registrationApplications(params?: Record<string, unknown>) {
    return data<ListResponse<any, "applications">>(api.get("/platform/registration-applications", { params }));
  },
  approveRegistrationApplication(id: string | number, payload?: Record<string, unknown>) {
    return data<{ application: any; organization: any; subscription?: any; invitations?: any[]; invoice?: any }>(api.post(`/platform/registration-applications/${id}/approve`, payload ?? {}));
  },
  rejectRegistrationApplication(id: string | number, review_notes?: string) {
    return data<{ application: any }>(api.post(`/platform/registration-applications/${id}/reject`, { review_notes }));
  },
  requestRegistrationApplicationFollowUp(id: string | number, review_notes: string) {
    return data<{ application: any }>(api.post(`/platform/registration-applications/${id}/follow-up`, { review_notes }));
  },
  createOrganization(payload: Record<string, unknown>) {
    return data<{ organization: any; subscription?: any; invitations?: any[]; invoice?: any; demo_invite_note?: string }>(api.post("/platform/organizations", payload));
  },
  updateOrganizationStatus(id: string | number, status: "active" | "pending" | "suspended" | "trial") {
    return data<{ organization: any }>(api.post(`/platform/organizations/${id}/status`, { status }));
  },
  organizationUsers(id: string | number) {
    return data<{ users: any[] }>(api.get(`/platform/organizations/${id}/users`));
  },
  createOrganizationUser(id: string | number, payload: { name: string; email: string; role: string; send_invite?: boolean }) {
    return data<{ user?: any; invitation?: any; message?: string }>(api.post(`/platform/organizations/${id}/users`, payload));
  },
  disableOrganizationUser(orgId: string | number, userId: string | number) {
    return data<{ user: any }>(api.patch(`/platform/organizations/${orgId}/users/${userId}/disable`));
  },
  enableOrganizationUser(orgId: string | number, userId: string | number) {
    return data<{ user: any }>(api.patch(`/platform/organizations/${orgId}/users/${userId}/enable`));
  },
  organizationInvitations(id: string | number) {
    return data<{ invitations: any[] }>(api.get(`/platform/organizations/${id}/invitations`));
  },
  createOrganizationInvite(id: string | number, payload: { name: string; email: string; role: string }) {
    return data<{ invitation: any; message?: string }>(api.post(`/platform/organizations/${id}/invitations`, payload));
  },
  resendOrganizationInvitation(orgId: string | number, invId: string | number) {
    return data<{ invitation: any; message: string }>(api.post(`/platform/organizations/${orgId}/invitations/${invId}/resend`));
  },
  cancelOrganizationInvitation(orgId: string | number, invId: string | number) {
    return data<{ message: string }>(api.delete(`/platform/organizations/${orgId}/invitations/${invId}`));
  },
  generateOrgInvoice(orgId: string | number) {
    return data<{ invoice: any; message: string }>(api.post(`/platform/organizations/${orgId}/generate-invoice`));
  },
  orgBillingInvoices(orgId: string | number) {
    return data<{ invoices: any[] }>(api.get(`/platform/invoices`, { params: { organization_id: orgId } }));
  },
  subscriptions() {
    return data<any>(api.get("/platform/subscriptions"));
  },
  createSubscription(payload: Record<string, unknown>) {
    return data<{ subscription: any }>(api.post("/platform/subscriptions", payload));
  },
  updateSubscription(id: string | number, payload: Record<string, unknown>) {
    return data<{ subscription: any }>(api.put(`/platform/subscriptions/${id}`, payload));
  },
  updateSubscriptionStatus(id: string | number, status: string) {
    return data<{ subscription: any }>(api.patch(`/platform/subscriptions/${id}/status`, { status }));
  },
  changeSubscriptionPlan(id: string | number, pricing_plan_id: string | number) {
    return data<{ subscription: any }>(api.patch(`/platform/subscriptions/${id}/plan`, { pricing_plan_id }));
  },
  pauseSubscription(id: string | number) {
    return data<{ subscription: any }>(api.patch(`/platform/subscriptions/${id}/pause`));
  },
  resumeSubscription(id: string | number) {
    return data<{ subscription: any }>(api.patch(`/platform/subscriptions/${id}/resume`));
  },
  cancelSubscription(id: string | number) {
    return data<{ subscription: any }>(api.patch(`/platform/subscriptions/${id}/cancel`));
  },
  suspendSubscription(id: string | number) {
    return data<{ subscription: any }>(api.patch(`/platform/subscriptions/${id}/suspend`));
  },
  platformInvoices(params?: Record<string, unknown>) {
    return data<ListResponse<any, "invoices">>(api.get("/platform/invoices", { params }));
  },
  createPlatformInvoice(payload: Record<string, unknown>) {
    return data<{ invoice: any }>(api.post("/platform/invoices", payload));
  },
  markPlatformInvoicePaid(id: string | number, payload?: Record<string, unknown>) {
    return data<{ invoice: any }>(api.patch(`/platform/invoices/${id}/mark-paid`, payload ?? {}));
  },
  recordPlatformPayment(id: string | number, payload: Record<string, unknown>) {
    return data<{ invoice: any; payment: any }>(api.post(`/platform/invoices/${id}/payments`, payload));
  },
  voidPlatformInvoice(id: string | number) {
    return data<{ invoice: any }>(api.patch(`/platform/invoices/${id}/void`));
  },
  platformPayments(params?: Record<string, unknown>) {
    return data<ListResponse<any, "payments">>(api.get("/platform/payments", { params }));
  },
  downloadPlatformPaymentReceiptPdf(id: string | number) {
    return api.get(`/platform/payments/${id}/receipt`, { responseType: "blob" });
  },
  syncStripePlan(payload?: Record<string, unknown>) {
    return data<{ message: string }>(api.post("/platform/billing/stripe/sync-plan", payload ?? {}));
  },
  pricingPlans() {
    return data<ListResponse<any, "pricing_plans">>(api.get("/platform/pricing-plans"));
  },
  createPricingPlan(payload: Record<string, unknown>) {
    return data<{ pricing_plan: any }>(api.post("/platform/pricing-plans", payload));
  },
  updatePricingPlan(id: string | number, payload: Record<string, unknown>) {
    return data<{ pricing_plan: any }>(api.patch(`/platform/pricing-plans/${id}`, payload));
  },
  activatePricingPlan(id: string | number) {
    return data<{ pricing_plan: any }>(api.patch(`/platform/pricing-plans/${id}/activate`));
  },
  deactivatePricingPlan(id: string | number) {
    return data<{ pricing_plan: any }>(api.patch(`/platform/pricing-plans/${id}/deactivate`));
  },
  users() {
    return data<ListResponse<any, "users">>(api.get("/platform/users"));
  },
  filteredUsers(params?: Record<string, unknown>) {
    return data<ListResponse<any, "users">>(api.get("/platform/users", { params }));
  },
  blockUser(id: string | number) {
    return data<{ user: any }>(api.patch(`/platform/users/${id}/block`));
  },
  unblockUser(id: string | number) {
    return data<{ user: any }>(api.patch(`/platform/users/${id}/unblock`));
  },
  resetUser(id: string | number) {
    return data<{ message: string }>(api.post(`/platform/users/${id}/reset-account`));
  },
  updateUserRole(id: string | number, role: string) {
    return data<{ user: any }>(api.patch(`/platform/users/${id}/role`, { role }));
  },
  supportTickets() {
    return data<ListResponse<any, "support_tickets">>(api.get("/platform/support-tickets"));
  },
  createSupportTicket(payload: Record<string, unknown>) {
    return data<{ support_ticket: any }>(api.post("/platform/support-tickets", payload));
  },
  updateSupportTicket(id: string | number, payload: Record<string, unknown>) {
    return data<{ support_ticket: any }>(api.patch(`/platform/support-tickets/${id}`, payload));
  },
  updateSupportTicketStatus(id: string | number, status: string) {
    return data<{ support_ticket: any }>(api.patch(`/platform/support-tickets/${id}/status`, { status }));
  },
  commentSupportTicket(id: string | number, body: string) {
    return data<{ comment: any }>(api.post(`/platform/support-tickets/${id}/comments`, { body }));
  },
  closeSupportTicket(id: string | number) {
    return data<{ support_ticket: any }>(api.patch(`/platform/support-tickets/${id}/close`));
  },
  auditLogs() {
    return data<ListResponse<any, "audit_logs">>(api.get("/platform/audit-logs"));
  },
  settings() {
    return data<{ settings: any[]; settings_map?: Record<string, any> }>(api.get("/platform/settings"));
  },
  updateSettings(payload: { key: string; value: unknown }) {
    return data<{ setting: any }>(api.patch("/platform/settings", payload));
  },
  updateSettingsBulk(settings: Record<string, unknown>) {
    return data<{ settings: any[] }>(api.patch("/platform/settings/bulk", { settings }));
  },
  systemAlerts() {
    return data<ListResponse<any, "system_alerts">>(api.get("/platform/system-alerts"));
  },
  filteredSystemAlerts(params?: Record<string, unknown>) {
    return data<ListResponse<any, "system_alerts">>(api.get("/platform/system-alerts", { params }));
  },
  createSystemAlert(payload: Record<string, unknown>) {
    return data<{ system_alert: any }>(api.post("/platform/system-alerts", payload));
  },
  resolveSystemAlert(id: string | number) {
    return data<{ system_alert: any }>(api.patch(`/platform/system-alerts/${id}/resolve`));
  },
  reopenSystemAlert(id: string | number) {
    return data<{ system_alert: any }>(api.patch(`/platform/system-alerts/${id}/reopen`));
  },
  monitoringHealth() {
    return data<any>(api.get("/platform/monitoring/health"));
  },
  billingAnalyticsOverview() {
    return data<{ total_revenue: number; revenue_this_month: number; revenue_last_month: number; active_subscriptions: number; past_due_subscriptions: number; cancelled_subscriptions: number; new_subscriptions_this_month: number }>(api.get("/platform/analytics/billing/overview"));
  },
  billingAnalyticsRevenueByMonth() {
    return data<{ revenue_by_month: Array<{ month: string; revenue: number }> }>(api.get("/platform/analytics/billing/revenue-by-month"));
  },
  billingAnalyticsTopOrganizations() {
    return data<{ top_organizations: Array<{ org_name: string; total_paid: number; subscription_status: string; last_payment_date: string | null }> }>(api.get("/platform/analytics/billing/top-organizations"));
  },
  downloadPlatformInvoicePdf(invoiceId: string | number) {
    return api.get(`/platform/invoices/${invoiceId}/pdf`, { responseType: "blob" });
  },
  updateOrganizationLocation(orgId: string | number, payload: { latitude?: number; longitude?: number; checkin_radius_meters?: number }) {
    return data<{ organization: any }>(api.patch(`/platform/organizations/${orgId}/location`, payload));
  },
  organizationLocationAlerts(orgId: string | number) {
    return data<{ location_alerts: any[] }>(api.get(`/platform/organizations/${orgId}/location-alerts`));
  }
};

export async function login(email: string, password: string) {
  return authApi.login(email, password);
}

export async function logout() {
  return authApi.logout();
}

export async function me() {
  const response = await authApi.me();
  return response.user;
}

export async function getDaycareData() {
  const [dashboard, children, attendance, absences, invoices, payments, incidents, classrooms, guardians, staff, documents, devices, auditLogs, notes, notifications, conversations, organization] = await Promise.all([
    dashboardApi.daycare(),
    childrenApi.managerList(),
    attendanceApi.managerList(),
    absenceApi.list(),
    billingApi.managerInvoices(),
    billingApi.payments(),
    incidentApi.list(),
    classroomsApi.list(),
    guardiansApi.list(),
    staffApi.list(),
    documentsApi.list(),
    devicesApi.list(),
    attendanceApi.auditLogs(),
    dailyNotesApi.list(),
    notificationsApi.list(),
    messagesApi.conversations(),
    organizationApi.get()
  ]);

  return {
    dashboard,
    children: children.children,
    attendance: attendance.attendance,
    absences: absences.absence_records,
    invoices: invoices.invoices,
    payments: payments.payments,
    incidents: incidents.incidents,
    classrooms: classrooms.classrooms,
    guardians: guardians.guardians,
    staff: staff.staff,
    documents: documents.documents,
    devices: devices.devices,
    auditLogs: auditLogs.audit_logs,
    dailyNotes: notes.daily_notes,
    notifications: notifications.notifications,
    conversations: conversations.conversations,
    organization: organization.organization
  };
}

export async function getMobileData() {
  const [children, attendance, absences, invoices, payments, incidents, notifications, messages, documents, notes] = await Promise.all([
    childrenApi.mobileList(),
    attendanceApi.mobileList(),
    absenceApi.mobileList(),
    billingApi.mobileInvoices(),
    billingApi.mobilePayments(),
    incidentApi.mobileList(),
    notificationsApi.mobileList(),
    messagesApi.mobileConversations(),
    documentsApi.mobileList(),
    dailyNotesApi.list()
  ]);

  return {
    children: children.children,
    attendance: attendance.attendance,
    absences: absences.absence_records,
    invoices: invoices.invoices,
    payments: payments.payments,
    incidents: incidents.incidents,
    notifications: notifications.notifications,
    messages: messages.conversations,
    documents: documents.documents,
    dailyNotes: notes.daily_notes
  };
}

export async function getStaffChildren() {
  return (await staffApi.classroomChildren()).children;
}

export async function checkChildIn(childId: string | number) {
  return (await attendanceApi.checkIn(childId)).attendance;
}

export async function checkChildOut(childId: string | number) {
  return (await attendanceApi.checkOut(childId)).attendance;
}

export async function getSuperAdminData() {
  const [dashboard, organizations, subscriptions, users, support, security, settings, alerts] = await Promise.all([
    superAdminApi.dashboard(),
    superAdminApi.organizations(),
    superAdminApi.subscriptions(),
    superAdminApi.users(),
    superAdminApi.supportTickets(),
    superAdminApi.auditLogs(),
    superAdminApi.settings(),
    superAdminApi.systemAlerts()
  ]);

  return {
    dashboard,
    organizations: organizations.organizations,
    subscriptions: subscriptions.subscriptions,
    plans: subscriptions.plans,
    users: users.users,
    support: support.support_tickets,
    security: security.audit_logs,
    settings: settings.settings,
    alerts: alerts.system_alerts
  };
}
