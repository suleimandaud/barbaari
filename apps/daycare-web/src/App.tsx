import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { IconDefaults, LoadingState, ToastProvider } from "@barbaari/shared/web/ui";
import { AppLayout } from "./layouts/AppLayout";
import { ProtectedRoute } from "./routes/ProtectedRoute";
import { LoginPage } from "./pages/LoginPage";
import { NotFoundPage } from "./pages/NotFoundPage";

// Route-level code splitting: each page (and the icons it uses) loads on first visit, so the
// sign-in and shell bundle stays small. AppLayout wraps its <Outlet> in Suspense as well,
// which keeps the sidebar on screen while a page chunk loads.
const ForgotPasswordPage = lazy(() => import("./pages/ForgotPasswordPage").then((module) => ({ default: module.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage").then((module) => ({ default: module.ResetPasswordPage })));
const AcceptInvitePage = lazy(() => import("./pages/AcceptInvitePage").then((module) => ({ default: module.AcceptInvitePage })));
const RegisterProviderPage = lazy(() => import("./pages/RegisterProviderPage").then((module) => ({ default: module.RegisterProviderPage })));
const TabletPortalPage = lazy(() => import("./pages/TabletPortalPage").then((module) => ({ default: module.TabletPortalPage })));
const SubscriptionPaymentPage = lazy(() => import("./pages/SubscriptionPaymentPage").then((module) => ({ default: module.SubscriptionPaymentPage })));
const SubscriptionSuccessPage = lazy(() => import("./pages/SubscriptionSuccessPage").then((module) => ({ default: module.SubscriptionSuccessPage })));
const DashboardPage = lazy(() => import("./pages/DashboardPage").then((module) => ({ default: module.DashboardPage })));
const ChildrenPage = lazy(() => import("./pages/ChildrenPage").then((module) => ({ default: module.ChildrenPage })));
const ChildRecordPage = lazy(() => import("./pages/ChildRecordPage").then((module) => ({ default: module.ChildRecordPage })));
const GuardiansPage = lazy(() => import("./pages/GuardiansPage").then((module) => ({ default: module.GuardiansPage })));
const GuardianProfilePage = lazy(() => import("./pages/GuardianProfilePage").then((module) => ({ default: module.GuardianProfilePage })));
const StaffMemberPage = lazy(() => import("./pages/StaffMemberPage").then((module) => ({ default: module.StaffMemberPage })));
const ClassroomsPage = lazy(() => import("./pages/ClassroomsPage").then((module) => ({ default: module.ClassroomsPage })));
const AttendancePage = lazy(() => import("./pages/AttendancePage").then((module) => ({ default: module.AttendancePage })));
const BillingPage = lazy(() => import("./pages/BillingPage").then((module) => ({ default: module.BillingPage })));
const PaymentsPage = lazy(() => import("./pages/PaymentsPage").then((module) => ({ default: module.PaymentsPage })));
const StaffPage = lazy(() => import("./pages/StaffPage").then((module) => ({ default: module.StaffPage })));
const IncidentsPage = lazy(() => import("./pages/IncidentsPage").then((module) => ({ default: module.IncidentsPage })));
const DailyNotesPage = lazy(() => import("./pages/DailyNotesPage").then((module) => ({ default: module.DailyNotesPage })));
const MessagesPage = lazy(() => import("./pages/MessagesPage").then((module) => ({ default: module.MessagesPage })));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage").then((module) => ({ default: module.NotificationsPage })));
const DocumentsPage = lazy(() => import("./pages/DocumentsPage").then((module) => ({ default: module.DocumentsPage })));
const DevicesPage = lazy(() => import("./pages/DevicesPage").then((module) => ({ default: module.DevicesPage })));
const SubscriptionBillingPage = lazy(() => import("./pages/SubscriptionBillingPage").then((module) => ({ default: module.SubscriptionBillingPage })));
const AuditLogsPage = lazy(() => import("./pages/AuditLogsPage").then((module) => ({ default: module.AuditLogsPage })));
const ReportsPage = lazy(() => import("./pages/ReportsPage").then((module) => ({ default: module.ReportsPage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then((module) => ({ default: module.SettingsPage })));

const pageFallback = <main className="bb-page"><LoadingState /></main>;

export function App() {
  const tabletOnlyHost = typeof window !== "undefined" && window.location.hostname.startsWith("tablet-barbaari.");

  if (tabletOnlyHost) {
    return <IconDefaults><BrowserRouter><Suspense fallback={pageFallback}><Routes><Route path="*" element={<TabletPortalPage />} /></Routes></Suspense></BrowserRouter></IconDefaults>;
  }

  return (
    <IconDefaults>
    <ToastProvider>
    <BrowserRouter>
      <Suspense fallback={pageFallback}>
      <Routes>
        <Route path="/tablet" element={<TabletPortalPage />} />
        <Route path="/tablet/*" element={<TabletPortalPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/register" element={<RegisterProviderPage />} />
        <Route path="/apply" element={<RegisterProviderPage />} />
        <Route path="/invite/:token" element={<AcceptInvitePage />} />
        <Route path="/accept-invite/:token" element={<AcceptInvitePage />} />
        <Route path="*" element={<NotFoundPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/subscription-payment" element={<SubscriptionPaymentPage />} />
          <Route path="/subscription/success" element={<SubscriptionSuccessPage />} />
          <Route element={<AppLayout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/children" element={<ChildrenPage />} />
            <Route path="/children/:childId" element={<ChildRecordPage />} />
            <Route path="/guardians" element={<GuardiansPage />} />
            <Route path="/guardians/:guardianId" element={<GuardianProfilePage />} />
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
            <Route path="/staff/:staffUserId" element={<StaffMemberPage />} />
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
      </Suspense>
    </BrowserRouter>
    </ToastProvider>
    </IconDefaults>
  );
}
