import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Activity, BadgeDollarSign, BarChart3, Bell, Building, CircleGauge, CreditCard, DatabaseZap, FileText, LifeBuoy, Lock, Receipt, Search, Settings, UsersRound } from "lucide-react";
import { clearSession } from "../services/auth";

const nav = [
  ["Platform", "/", CircleGauge],
  ["Billing Dashboard", "/billing", BadgeDollarSign],
  ["Organizations", "/organizations", Building],
  ["Applications", "/registration-applications", FileText],
  ["Subscriptions", "/subscriptions", CreditCard],
  ["Pricing Plans", "/pricing-plans", BadgeDollarSign],
  ["Platform Invoices", "/platform-invoices", FileText],
  ["Platform Payments", "/platform-payments", Receipt],
  ["Analytics", "/analytics", BarChart3],
  ["Billing Analytics", "/billing-analytics", BarChart3],
  ["Global Users", "/users", UsersRound],
  ["Support", "/support", LifeBuoy],
  ["Security", "/security", Lock],
  ["Settings", "/settings", Settings],
  ["System Alerts", "/alerts", Activity],
  ["Monitoring", "/monitoring", DatabaseZap]
] as const;

const PAGE_TITLES: Record<string, string> = {
  "/": "Platform Dashboard",
  "/billing": "Billing Dashboard",
  "/organizations": "Organizations",
  "/registration-applications": "Registration Applications",
  "/subscriptions": "Subscriptions",
  "/pricing-plans": "Pricing Plans",
  "/platform-invoices": "Platform Invoices",
  "/platform-payments": "Platform Payments",
  "/analytics": "Analytics",
  "/billing-analytics": "Billing Analytics",
  "/users": "Global Users",
  "/support": "Support Tickets",
  "/security": "Security",
  "/settings": "Settings",
  "/alerts": "System Alerts",
  "/monitoring": "Monitoring",
};

export function AppLayout() {
  const routerLocation = useLocation();

  useEffect(() => {
    const base = PAGE_TITLES[routerLocation.pathname]
      ?? (routerLocation.pathname.startsWith("/organizations/") ? "Organization Details" : null)
      ?? "Barbaari Admin";
    document.title = `${base} | Barbaari Admin`;
  }, [routerLocation.pathname]);

  return (
    <div className="suite">
      <aside className="rail">
        <div className="brand"><div>B</div><section><strong>Barbaari</strong><span>Platform Admin</span></section></div>
        <nav>{nav.map(([label, path, Icon]) => <NavLink key={label} to={path}><Icon size={18} /><span>{label}</span></NavLink>)}</nav>
      </aside>
      <main>
        <header className="topbar">
          <div className="search"><Search size={18} /><input disabled placeholder="Global search is not implemented yet. Use page filters." /></div>
          <button className="icon-button"><Bell size={19} /></button>
          <button className="primary" onClick={() => { clearSession(); location.href = "/login"; }}>Logout</button>
        </header>
        <Outlet />
      </main>
    </div>
  );
}
