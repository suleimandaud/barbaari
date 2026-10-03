import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AppLayout } from "./layouts/AppLayout";
import { ProtectedRoute } from "./routes/ProtectedRoute";
import { LoginPage } from "./pages/LoginPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { LoadingState } from "./components/Ui";
import { IconDefaults, ToastProvider } from "@barbaari/shared/web/ui";

// Route-level code splitting: every page loads on first visit (recharts stays in the
// BillingAnalyticsPage chunk as before). AppLayout keeps the shell visible while a chunk loads.
const ForgotPasswordPage = lazy(() => import("./pages/ForgotPasswordPage").then((module) => ({ default: module.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage").then((module) => ({ default: module.ResetPasswordPage })));
const BillingAnalyticsPage = lazy(() => import("./pages/BillingAnalyticsPage").then((module) => ({ default: module.BillingAnalyticsPage })));
const DashboardPage = lazy(() => import("./pages/DashboardPage").then((module) => ({ default: module.DashboardPage })));
const BillingDashboardPage = lazy(() => import("./pages/BillingDashboardPage").then((module) => ({ default: module.BillingDashboardPage })));
const OrganizationsPage = lazy(() => import("./pages/OrganizationsPage").then((module) => ({ default: module.OrganizationsPage })));
const RegistrationApplicationsPage = lazy(() => import("./pages/RegistrationApplicationsPage").then((module) => ({ default: module.RegistrationApplicationsPage })));
const OrganizationDetailsPage = lazy(() => import("./pages/OrganizationDetailsPage").then((module) => ({ default: module.OrganizationDetailsPage })));
const SubscriptionsPage = lazy(() => import("./pages/SubscriptionsPage").then((module) => ({ default: module.SubscriptionsPage })));
const PricingPlansPage = lazy(() => import("./pages/PricingPlansPage").then((module) => ({ default: module.PricingPlansPage })));
const PlatformInvoicesPage = lazy(() => import("./pages/PlatformInvoicesPage").then((module) => ({ default: module.PlatformInvoicesPage })));
const PlatformPaymentsPage = lazy(() => import("./pages/PlatformPaymentsPage").then((module) => ({ default: module.PlatformPaymentsPage })));
const GlobalUsersPage = lazy(() => import("./pages/GlobalUsersPage").then((module) => ({ default: module.GlobalUsersPage })));
const SupportTicketsPage = lazy(() => import("./pages/SupportTicketsPage").then((module) => ({ default: module.SupportTicketsPage })));
const SecurityPage = lazy(() => import("./pages/SecurityPage").then((module) => ({ default: module.SecurityPage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then((module) => ({ default: module.SettingsPage })));
const SystemAlertsPage = lazy(() => import("./pages/SystemAlertsPage").then((module) => ({ default: module.SystemAlertsPage })));
const AnalyticsPage = lazy(() => import("./pages/AnalyticsPage").then((module) => ({ default: module.AnalyticsPage })));
const MonitoringPage = lazy(() => import("./pages/MonitoringPage").then((module) => ({ default: module.MonitoringPage })));

export function App() {
  return <IconDefaults><ToastProvider><BrowserRouter><Suspense fallback={<main className="bb-page"><LoadingState /></main>}><Routes><Route path="/login" element={<LoginPage />} /><Route path="/forgot-password" element={<ForgotPasswordPage />} /><Route path="/reset-password" element={<ResetPasswordPage />} /><Route path="*" element={<NotFoundPage />} /><Route element={<ProtectedRoute />}><Route element={<AppLayout />}><Route path="/" element={<DashboardPage />} /><Route path="/billing" element={<BillingDashboardPage />} /><Route path="/organizations" element={<OrganizationsPage />} /><Route path="/registration-applications" element={<RegistrationApplicationsPage />} /><Route path="/organizations/:id" element={<OrganizationDetailsPage />} /><Route path="/subscriptions" element={<SubscriptionsPage />} /><Route path="/pricing-plans" element={<PricingPlansPage />} /><Route path="/platform-invoices" element={<PlatformInvoicesPage />} /><Route path="/platform-payments" element={<PlatformPaymentsPage />} /><Route path="/users" element={<GlobalUsersPage />} /><Route path="/support" element={<SupportTicketsPage />} /><Route path="/security" element={<SecurityPage />} /><Route path="/settings" element={<SettingsPage />} /><Route path="/alerts" element={<SystemAlertsPage />} /><Route path="/analytics" element={<AnalyticsPage />} /><Route path="/billing-analytics" element={<BillingAnalyticsPage />} /><Route path="/monitoring" element={<MonitoringPage />} /></Route></Route></Routes></Suspense></BrowserRouter></ToastProvider></IconDefaults>;
}
