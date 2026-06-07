import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AppLayout } from "./layouts/AppLayout";
import { ProtectedRoute } from "./routes/ProtectedRoute";
import { LoginPage } from "./pages/LoginPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { DashboardPage } from "./pages/DashboardPage";
import { BillingDashboardPage } from "./pages/BillingDashboardPage";
import { OrganizationsPage } from "./pages/OrganizationsPage";
import { RegistrationApplicationsPage } from "./pages/RegistrationApplicationsPage";
import { OrganizationDetailsPage } from "./pages/OrganizationDetailsPage";
import { SubscriptionsPage } from "./pages/SubscriptionsPage";
import { PricingPlansPage } from "./pages/PricingPlansPage";
import { PlatformInvoicesPage } from "./pages/PlatformInvoicesPage";
import { PlatformPaymentsPage } from "./pages/PlatformPaymentsPage";
import { GlobalUsersPage } from "./pages/GlobalUsersPage";
import { SupportTicketsPage } from "./pages/SupportTicketsPage";
import { SecurityPage } from "./pages/SecurityPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SystemAlertsPage } from "./pages/SystemAlertsPage";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { BillingAnalyticsPage } from "./pages/BillingAnalyticsPage";
import { MonitoringPage } from "./pages/MonitoringPage";
import { NotFoundPage } from "./pages/NotFoundPage";

export function App() {
  return <BrowserRouter><Routes><Route path="/login" element={<LoginPage />} /><Route path="/forgot-password" element={<ForgotPasswordPage />} /><Route path="/reset-password" element={<ResetPasswordPage />} /><Route path="*" element={<NotFoundPage />} /><Route element={<ProtectedRoute />}><Route element={<AppLayout />}><Route path="/" element={<DashboardPage />} /><Route path="/billing" element={<BillingDashboardPage />} /><Route path="/organizations" element={<OrganizationsPage />} /><Route path="/registration-applications" element={<RegistrationApplicationsPage />} /><Route path="/organizations/:id" element={<OrganizationDetailsPage />} /><Route path="/subscriptions" element={<SubscriptionsPage />} /><Route path="/pricing-plans" element={<PricingPlansPage />} /><Route path="/platform-invoices" element={<PlatformInvoicesPage />} /><Route path="/platform-payments" element={<PlatformPaymentsPage />} /><Route path="/users" element={<GlobalUsersPage />} /><Route path="/support" element={<SupportTicketsPage />} /><Route path="/security" element={<SecurityPage />} /><Route path="/settings" element={<SettingsPage />} /><Route path="/alerts" element={<SystemAlertsPage />} /><Route path="/analytics" element={<AnalyticsPage />} /><Route path="/billing-analytics" element={<BillingAnalyticsPage />} /><Route path="/monitoring" element={<MonitoringPage />} /></Route></Route></Routes></BrowserRouter>;
}
