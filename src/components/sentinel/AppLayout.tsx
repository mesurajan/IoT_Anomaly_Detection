import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Activity, AlertTriangle, ScrollText, Cpu, BarChart3,
  Settings, History, ShieldCheck, LogOut, ChevronLeft,
  Database, HeartPulse, Layers, RadioTower, PlaySquare, Bell,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";
import { RoleBadge } from "./Badges";
import { getConfig } from "@/lib/config";
import { sentinel } from "@/lib/sentinel";
import { usePolling } from "@/lib/hooks";

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  roles?: ("admin" | "analyst")[];
}

const NAV_GROUPS = [
  {
    title: "Main Overview",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: <Activity className="h-4 w-4" /> },
    ],
  },
  {
    title: "Monitoring",
    items: [
      { to: "/alerts", label: "Alerts", icon: <AlertTriangle className="h-4 w-4" /> },
      { to: "/logs", label: "Logs", icon: <ScrollText className="h-4 w-4" /> },
      { to: "/detection", label: "Replay Detection", icon: <PlaySquare className="h-4 w-4" />, roles: ["admin"] },
      { to: "/live-capture", label: "Live Capture", icon: <RadioTower className="h-4 w-4" />, roles: ["admin"] },
    ],
  },
  {
    title: "Models",
    items: [
      { to: "/models", label: "Model Management", icon: <Layers className="h-4 w-4" />, roles: ["admin"] },
      { to: "/retraining", label: "Retraining", icon: <Cpu className="h-4 w-4" />, roles: ["admin"] },
    ],
  },
  {
    title: "System",
    items: [
      { to: "/kibana", label: "Kibana", icon: <BarChart3 className="h-4 w-4" /> },
      { to: "/health", label: "System Health", icon: <HeartPulse className="h-4 w-4" />, roles: ["admin"] },
      { to: "/audit", label: "Audit History", icon: <History className="h-4 w-4" />, roles: ["admin"] },
    ],
  },
  {
    title: "Admin",
    items: [
      { to: "/users", label: "Admin Users", icon: <Database className="h-4 w-4" />, roles: ["admin"] },
      { to: "/settings", label: "Settings", icon: <Settings className="h-4 w-4" />, roles: ["admin"] },
    ],
  },
];

export function AppLayout({ children, online }: { children: ReactNode; online: boolean }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const cfg = getConfig();

  const isAdmin = user?.role?.toLowerCase() === "admin";

  const [lastSeenAt, setLastSeenAt] = useState(() => {
    const stored = localStorage.getItem("sentinel.alerts.lastSeenAt");
    return stored ? Number(stored) : 0;
  });

  const alertPoll = usePolling(
    () => isAdmin
      ? sentinel.alerts(Math.max(10, cfg.defaultLimit))
      : Promise.resolve({ data: [], degraded: false }),
    5000,
    [isAdmin, cfg.defaultLimit]
  );

  const markAlertsSeen = () => {
    const ts = Date.now();
    setLastSeenAt(ts);
    localStorage.setItem("sentinel.alerts.lastSeenAt", String(ts));
  };

  useEffect(() => {
    if (location.pathname === "/alerts") markAlertsSeen();
  }, [location.pathname]);

  useEffect(() => {
    if (!isAdmin) return;
    const handler = () => alertPoll.refresh();
    window.addEventListener("sentinel:alerts-changed", handler);
    return () => window.removeEventListener("sentinel:alerts-changed", handler);
  }, [isAdmin, alertPoll.refresh]);

  const unreadAlerts = useMemo(() => {
    if (!online || alertPoll.degraded) return 0;
    return (alertPoll.data ?? []).filter(item => {
      if (item.status !== "open") return false;
      const ts = new Date(item.timestamp).getTime();
      return Number.isFinite(ts) && ts > lastSeenAt;
    }).length;
  }, [alertPoll.data, alertPoll.degraded, lastSeenAt, online]);

  const alertBadge = unreadAlerts > 99 ? "99+" : String(unreadAlerts);

  const visibleNav = NAV_GROUPS;

  return (
    <div className="flex min-h-screen w-full bg-background">

      {/* Sidebar */}
      <aside className={cn(
        "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex",
        collapsed ? "w-16" : "w-64",
        "transition-[width] duration-200"
      )}>
        <div className="flex h-16 items-center gap-2 border-b px-4">
          <ShieldCheck className="h-4 w-4" />
          {!collapsed && <span className="text-sm font-semibold">{cfg.appName}</span>}
        </div>

        <nav className="flex-1 space-y-3 overflow-y-auto p-2">
          {visibleNav.map(group => {
            const items = group.items.filter(n => {
              if (!n.roles) return true;
              if (!user?.role) return false;
              return n.roles.includes(user.role);
            });

            return (
              <div key={group.title}>
                {!collapsed && (
                  <p className="px-3 py-1 text-[10px] uppercase text-muted-foreground">
                    {group.title}
                  </p>
                )}

                {items.map(item => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) => cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm",
                      isActive ? "bg-muted" : "hover:bg-muted/50"
                    )}
                  >
                    {item.icon}
                    {!collapsed && item.label}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>

        <div className="border-t p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={() => setCollapsed(c => !c)}
          >
            <ChevronLeft className={cn(collapsed && "rotate-180")} />
            {!collapsed && <span className="ml-2">Collapse</span>}
          </Button>
        </div>
      </aside>

      {/* MAIN */}
      <div className="flex flex-1 flex-col">

        <header className="flex h-16 items-center justify-between border-b px-4">

          <p className="text-sm font-semibold">{cfg.appName}</p>

          <div className="flex items-center gap-3">

            {/* 🔴 Backend Status */}
            <div
              className={cn(
                "hidden sm:flex items-center gap-2 rounded-md px-2.5 py-1 text-xs border",
                online
                  ? "border-green-500/30 bg-green-500/10 text-green-500"
                  : "border-red-500/30 bg-red-500/10 text-red-500"
              )}
            >
              <span className={cn(
                "h-2 w-2 rounded-full",
                online ? "bg-green-500" : "bg-red-500"
              )} />
              {online ? "Backend Connected" : "Backend Offline"}
            </div>

            {/* 🔔 Bell */}
            {isAdmin && (
              <NavLink
                to="/alerts"
                onClick={markAlertsSeen}
                className="relative grid h-9 w-9 place-items-center rounded-md border"
              >
                <Bell className="h-4 w-4" />
                {unreadAlerts > 0 && (
                  <span className="absolute -right-1 -top-1 bg-red-500 text-white text-[10px] px-1 rounded-full">
                    {alertBadge}
                  </span>
                )}
              </NavLink>
            )}

            {/* 👤 User */}
            {user && (
              <div className="hidden sm:flex items-center gap-2 text-xs border px-2.5 py-1 rounded-md bg-muted/30">
                <Database className="h-3 w-3" />
                {user.displayName}
                <RoleBadge role={user.role} />
              </div>
            )}

            {/* Logout */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => { logout(); navigate("/login"); }}
            >
              <LogOut className="h-4 w-4" />
            </Button>

          </div>
        </header>

        <main className="flex-1 p-6">
          {children}
        </main>

      </div>
    </div>
  );
}