import { Suspense, useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Baby, Bell, CalendarCheck, ChartLine, ChatsCircle, ClockCounterClockwise, CreditCard, DeviceMobile, DeviceTablet, Door,
  FirstAidKit, FolderLock, GearSix, IdentificationBadge, NotePencil, SunHorizon, UsersThree
} from "@phosphor-icons/react";
import { authApi, notificationsApi } from "@barbaari/shared";
import { AppShell, LoadingState, SearchInput, roleLabel, type NavGroup } from "@barbaari/shared/web/ui";
import { clearSession } from "../services/auth";
import type { ShellContext } from "../hooks/useShell";

const PAGE_TITLES: Record<string, string> = {
  "/": "Today",
  "/attendance-operations": "Attendance",
  "/children": "Children",
  "/guardians": "Guardians & pickups",
  "/classrooms": "Classrooms",
  "/staff": "Staff access",
  "/audit-logs": "Audit log",
  "/reports": "Reports",
  "/devices": "Devices",
  "/subscription-billing": "Subscription",
  "/settings": "Settings",
  "/billing": "Family billing",
  "/payments": "Payments",
  "/notifications": "Notifications",
  "/messages": "Messages",
  "/documents": "Documents",
  "/incidents": "Incidents",
  "/daily-notes": "Daily notes",
};

function navGroups(familyChildCare: boolean): NavGroup[] {
  // Same routes as before; family child care keeps the smaller set it always had
  // (no classrooms, staff access, audit log or devices).
  const people = [
    { label: "Children", to: "/children", icon: Baby },
    { label: familyChildCare ? "Parents & pickups" : "Guardians & pickups", to: "/guardians", icon: UsersThree },
    ...(familyChildCare ? [] : [
      { label: "Classrooms", to: "/classrooms", icon: Door },
      { label: "Staff access", to: "/staff", icon: IdentificationBadge }
    ])
  ];
  const organization = [
    { label: "Reports", to: "/reports", icon: ChartLine },
    ...(familyChildCare ? [] : [
      { label: "Audit log", to: "/audit-logs", icon: ClockCounterClockwise },
      { label: "Devices", to: "/devices", icon: DeviceMobile }
    ]),
    { label: "Subscription", to: "/subscription-billing", icon: CreditCard },
    { label: "Settings", to: "/settings", icon: GearSix }
  ];
  return [
    { label: "Today", items: [
      { label: "Today", to: "/", icon: SunHorizon, end: true },
      { label: "Attendance", to: "/attendance-operations", icon: CalendarCheck },
      // { label: "Tablet mode", to: "/attendance-operations?tab=kiosk", icon: DeviceTablet }
    ] },
    { label: "People", items: people },
    { label: "Family & records", items: [
      // { label: "Messages", to: "/messages", icon: ChatsCircle },
      { label: "Daily notes", to: "/daily-notes", icon: NotePencil },
      { label: "Documents", to: "/documents", icon: FolderLock },
      // { label: "Incidents", to: "/incidents", icon: FirstAidKit }
    ] },
    { label: "Organization", items: organization }
  ];
}

export function AppLayout() {
  const routerLocation = useLocation();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  const [organizationName, setOrganizationName] = useState("Barbaari");
  const [facilityType, setFacilityType] = useState("center_daycare");
  const [user, setUser] = useState<{ name: string; role: string }>({ name: "", role: "" });
  const [me, setMe] = useState<any | null>(null);
  const [search, setSearch] = useState("");

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
        setUser({ name: response.user?.name ?? "", role: roleLabel(response.user?.role) });
        setMe(response.user ?? null);
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

  function submitSearch() {
    const query = search.trim();
    navigate(query ? `/children?q=${encodeURIComponent(query)}` : "/children");
  }

  const currentPath = `${routerLocation.pathname}${routerLocation.search}`;

  return (
    <AppShell
      brandSubtitle={organizationName}
      groups={navGroups(facilityType === "family_child_care")}
      user={{ name: user.name || organizationName, role: user.role }}
      pathKey={currentPath}
      renderLink={(item, content, onNavigate) => {
        // "Tablet mode" is a tab of the attendance page, so match on the query string too.
        const isKioskLink = item.to.includes("tab=kiosk");
        return (
          <NavLink
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) => {
              const kioskActive = currentPath.includes("tab=kiosk");
              const active = isKioskLink ? kioskActive : isActive && !(item.to === "/attendance-operations" && kioskActive);
              return active ? "active" : "";
            }}
          >
            {content}
          </NavLink>
        );
      }}
      topbar={(
        <>
          <SearchInput value={search} onChange={setSearch} onSubmit={submitSearch} placeholder="Search children by name or code" label="Search children" />
          <span className="bb-topbar-spacer" />
          <NavLink className="bb-bell" to="/notifications" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}>
            <Bell size={22} />
            {unread ? <i aria-hidden /> : null}
          </NavLink>
          <button type="button" className="bb-btn bb-btn-secondary" onClick={() => { clearSession(); location.href = "/login"; }}>Sign out</button>
        </>
      )}
    >
      <Suspense fallback={<main className="bb-page"><LoadingState /></main>}>
        <Outlet context={{ user: me, organization: me?.organization ?? null, familyChildCare: facilityType === "family_child_care" } satisfies ShellContext} />
      </Suspense>
    </AppShell>
  );
}
