import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./layouts/AppLayout";
import { ProtectedRoute } from "./routes/ProtectedRoute";
import { LoginPage } from "./pages/LoginPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { AcceptInvitePage } from "./pages/AcceptInvitePage";
import { SubscriptionPaymentPage } from "./pages/SubscriptionPaymentPage";
import { SubscriptionSuccessPage } from "./pages/SubscriptionSuccessPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ChildrenPage } from "./pages/ChildrenPage";
import { GuardiansPage } from "./pages/GuardiansPage";
import { ClassroomsPage } from "./pages/ClassroomsPage";
import { AttendancePage } from "./pages/AttendancePage";
import { BillingPage } from "./pages/BillingPage";
import { PaymentsPage } from "./pages/PaymentsPage";
import { StaffPage } from "./pages/StaffPage";
import { IncidentsPage } from "./pages/IncidentsPage";
import { DailyNotesPage } from "./pages/DailyNotesPage";
import { MessagesPage } from "./pages/MessagesPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { DocumentsPage } from "./pages/DocumentsPage";
import { DevicesPage } from "./pages/DevicesPage";
import { SubscriptionBillingPage } from "./pages/SubscriptionBillingPage";
import { AuditLogsPage } from "./pages/AuditLogsPage";
import { ReportsPage } from "./pages/ReportsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { NotFoundPage } from "./pages/NotFoundPage";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/invite/:token" element={<AcceptInvitePage />} />
        <Route path="/accept-invite/:token" element={<AcceptInvitePage />} />
        <Route path="*" element={<NotFoundPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/subscription-payment" element={<SubscriptionPaymentPage />} />
          <Route path="/subscription/success" element={<SubscriptionSuccessPage />} />
          <Route element={<AppLayout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/children" element={<ChildrenPage />} />
            <Route path="/guardians" element={<GuardiansPage />} />
            <Route path="/classrooms" element={<ClassroomsPage />} />
            <Route path="/attendance-operations" element={<AttendancePage />} />
            <Route path="/live-check-ins" element={<Navigate to="/attendance-operations?tab=live" replace />} />
            <Route path="/kiosk" element={<Navigate to="/attendance-operations?tab=kiosk" replace />} />
            <Route path="/attendance" element={<Navigate to="/attendance-operations?tab=records" replace />} />
            <Route path="/attendance/absences" element={<Navigate to="/attendance-operations?tab=absences" replace />} />
            <Route path="/attendance/early-checkouts" element={<Navigate to="/attendance-operations?tab=early" replace />} />
            <Route path="/attendance/missing-checkouts" element={<Navigate to="/attendance-operations?tab=missing" replace />} />
            <Route path="/billing" element={<BillingPage />} />
            <Route path="/payments" element={<PaymentsPage />} />
            <Route path="/staff" element={<StaffPage />} />
            <Route path="/incidents" element={<IncidentsPage />} />
            <Route path="/daily-notes" element={<DailyNotesPage />} />
            <Route path="/messages" element={<MessagesPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/documents" element={<DocumentsPage />} />
            <Route path="/devices" element={<DevicesPage />} />
            <Route path="/subscription-billing" element={<SubscriptionBillingPage />} />
            <Route path="/audit-logs" element={<AuditLogsPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
