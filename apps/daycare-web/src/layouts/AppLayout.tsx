import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { Baby, Bell, CalendarCheck, ClipboardList, CreditCard, FileClock, FileText, MonitorSmartphone, Search, Settings, ShieldCheck, Users } from "lucide-react";
import { authApi, notificationsApi } from "@barbaari/shared";
import { clearSession } from "../services/auth";

const centerNavItems: Array<[string, string, LucideIcon]> = [
  ["Attendance Dashboard", "/", CalendarCheck],
  ["Attendance Operations", "/attendance-operations", FileText],
  ["Children", "/children", Baby],
  ["Guardians / Authorized Pickups", "/guardians", Users],
  ["Classrooms", "/classrooms", ClipboardList],
  ["Staff Access", "/staff", ShieldCheck],
  ["Attendance Audit Logs", "/audit-logs", FileClock],
  ["Attendance Reports", "/reports", FileText],
  ["Devices / Tablets", "/devices", MonitorSmartphone],
  ["Subscription / Billing", "/subscription-billing", CreditCard],
  ["Settings", "/settings", Settings]
];

const familyNavItems: Array<[string, string, LucideIcon]> = [
  ["Dashboard", "/", CalendarCheck],
  ["Children", "/children", Baby],
  ["Parents / Guardians", "/guardians", Users],
  ["Attendance", "/attendance-operations", FileText],
  ["Tablet / Kiosk Mode", "/attendance-operations?tab=kiosk", MonitorSmartphone],
  ["Reports / Audit", "/reports", FileClock],
  ["Subscription / Billing", "/subscription-billing", CreditCard],
  ["Settings", "/settings", Settings]
];

const PAGE_TITLES: Record<string, string> = {
  "/": "Attendance Dashboard",
  "/attendance-operations": "Attendance Operations",
  "/children": "Children",
  "/guardians": "Guardians",
  "/classrooms": "Classrooms",
  "/staff": "Staff Access",
  "/audit-logs": "Audit Logs",
  "/reports": "Reports",
  "/devices": "Devices",
  "/subscription-billing": "Subscription & Billing",
  "/settings": "Settings",
  "/billing": "Billing",
  "/payments": "Payments",
  "/notifications": "Notifications",
  "/messages": "Messages",
  "/documents": "Documents",
  "/incidents": "Incidents",
  "/daily-notes": "Daily Notes",
};

export function AppLayout() {
  const routerLocation = useLocation();
  const [unread, setUnread] = useState(0);
  const [organizationName, setOrganizationName] = useState("Barbaari");
  const [facilityType, setFacilityType] = useState("center_daycare");

  useEffect(() => {
    const title = PAGE_TITLES[routerLocation.pathname] ?? "Barbaari";
    document.title = `${title} | Barbaari`;
  }, [routerLocation.pathname]);

  useEffect(() => {
    let mounted = true;
    authApi.me().then((response) => {
      if (mounted) {
        setOrganizationName(response.user?.organization?.name ?? "Barbaari");
        setFacilityType(response.user?.organization?.facility_type ?? "center_daycare");
      }
    }).catch(() => {
      if (mounted) setOrganizationName("Barbaari");
    });
    notificationsApi.unreadCount().then((response) => {
      if (mounted) setUnread(response.unread_count ?? 0);
    }).catch(() => {
      if (mounted) setUnread(0);
    });
    return () => { mounted = false; };
  }, []);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">{organizationName.slice(0, 1).toUpperCase()}</div><div><strong>{organizationName}</strong><span>Attendance Ops</span></div></div>
        <nav>
          {(facilityType === "family_child_care" ? familyNavItems : centerNavItems).map(([label, path, Icon]) => (
            <NavLink key={label} to={path} end={path === "/"}><Icon size={18} /><span>{label}</span></NavLink>
          ))}
        </nav>
      </aside>
      <main>
        <header className="topbar">
          <div className="search"><Search size={18} /><input placeholder="Search live backend records" /></div>
          <NavLink className="icon-button bell-link" to="/notifications" aria-label="Notifications"><Bell size={20} />{unread ? <span className="count-badge">{unread}</span> : null}</NavLink>
          <button className="tenant-switcher" onClick={() => { clearSession(); location.href = "/login"; }}>Logout</button>
        </header>
        <Outlet />
      </main>
    </div>
  );
}
