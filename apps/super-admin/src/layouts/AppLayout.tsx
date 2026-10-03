import { NavLink, Outlet, useLocation, useNavigate, useOutletContext } from "react-router-dom";
import { Suspense, useEffect, useState } from "react";
import {
  Bell, Buildings, ChartBar, ChartPie, ChartLineUp, CreditCard, FileText, GearSix, Gauge, Lifebuoy, Money,
  Pulse, Receipt, ShieldCheck, Siren, Tag, UsersThree, ArrowsClockwise
} from "@phosphor-icons/react";
import { superAdminApi } from "@barbaari/shared";
import { AppShell, LoadingState, SearchInput, roleLabel, type NavGroup } from "@barbaari/shared/web/ui";
import { clearSession } from "../services/auth";

const PAGE_TITLES: Record<string, string> = {
  "/": "Platform",
  "/billing": "Billing dashboard",
  "/organizations": "Organizations",
  "/registration-applications": "Applications",
  "/subscriptions": "Subscriptions",
  "/pricing-plans": "Pricing plans",
  "/platform-invoices": "Invoices",
  "/platform-payments": "Payments",
  "/analytics": "Analytics",
  "/billing-analytics": "Billing analytics",
  "/users": "Global users",
  "/support": "Support",
  "/security": "Security",
  "/settings": "Settings",
  "/alerts": "System alerts",
  "/monitoring": "Monitoring",
};

function navGroups(counts: { applications: number; alerts: number }): NavGroup[] {
  return [
    { label: "Overview", items: [
      { label: "Platform", to: "/", icon: Gauge, end: true },
      { label: "Analytics", to: "/analytics", icon: ChartBar }
    ] },
    { label: "Customers", items: [
      { label: "Organizations", to: "/organizations", icon: Buildings },
      { label: "Applications", to: "/registration-applications", icon: FileText, count: counts.applications },
      { label: "Global users", to: "/users", icon: UsersThree },
      { label: "Support", to: "/support", icon: Lifebuoy }
    ] },
    { label: "Revenue", items: [
      { label: "Billing dashboard", to: "/billing", icon: ChartLineUp },
      { label: "Subscriptions", to: "/subscriptions", icon: ArrowsClockwise },
      { label: "Pricing plans", to: "/pricing-plans", icon: Tag },
      { label: "Invoices", to: "/platform-invoices", icon: Receipt },
      { label: "Payments", to: "/platform-payments", icon: Money },
      { label: "Billing analytics", to: "/billing-analytics", icon: ChartPie }
    ] },
    { label: "System", items: [
      { label: "System alerts", to: "/alerts", icon: Siren, count: counts.alerts },
      { label: "Monitoring", to: "/monitoring", icon: Pulse },
      { label: "Security", to: "/security", icon: ShieldCheck },
      { label: "Settings", to: "/settings", icon: GearSix }
    ] }
  ];
}

export function AppLayout() {
  const routerLocation = useLocation();
  const navigate = useNavigate();
  const { user } = useOutletContext<{ user: any }>() ?? { user: null };
  const [counts, setCounts] = useState({ applications: 0, alerts: 0 });
  const [search, setSearch] = useState("");

  useEffect(() => {
    const base = PAGE_TITLES[routerLocation.pathname]
      ?? (routerLocation.pathname.startsWith("/organizations/") ? "Organization details" : null)
      ?? "Barbaari Admin";
    document.title = `${base} | Barbaari Admin`;
  }, [routerLocation.pathname]);

  // Sidebar badges: pending applications and unresolved alerts, loaded once per session.
  useEffect(() => {
    let active = true;
    Promise.allSettled([superAdminApi.registrationApplications(), superAdminApi.systemAlerts()]).then(([applications, alerts]) => {
      if (!active) return;
      setCounts({
        applications: applications.status === "fulfilled" ? (applications.value.applications ?? []).filter((item: any) => ["pending", "submitted", "follow_up", "needs_follow_up"].includes(String(item.status))).length : 0,
        alerts: alerts.status === "fulfilled" ? (alerts.value.system_alerts ?? []).filter((alert: any) => !alert.resolved_at && alert.status !== "resolved").length : 0
      });
    });
    return () => { active = false; };
  }, []);

  return (
    <AppShell
      brandSubtitle="Platform admin"
      groups={navGroups(counts)}
      user={{ name: user?.name ?? "", role: roleLabel(user?.role ?? "super_admin") }}
      pathKey={routerLocation.pathname + routerLocation.search}
      renderLink={(item, content, onNavigate) => (
        <NavLink to={item.to} end={item.end} onClick={onNavigate}>{content}</NavLink>
      )}
      topbar={
        <>
          <div className="bb-search-wrap" style={{ flex: "0 1 420px" }}>
            <SearchInput value={search} onChange={setSearch} placeholder="Search organizations" onSubmit={() => navigate(`/organizations${search.trim() ? `?q=${encodeURIComponent(search.trim())}` : ""}`)} />
          </div>
          <span className="bb-topbar-spacer" />
          <NavLink className="bb-bell" to="/alerts" aria-label={counts.alerts ? `${counts.alerts} unresolved system alerts` : "System alerts"}><Bell size={22} />{counts.alerts ? <i /> : null}</NavLink>
          <button className="bb-btn bb-btn-secondary" onClick={() => { clearSession(); location.href = "/login"; }}>Sign out</button>
        </>
      }
    >
      <Suspense fallback={<main className="bb-page"><LoadingState /></main>}>
        <Outlet />
      </Suspense>
    </AppShell>
  );
}
