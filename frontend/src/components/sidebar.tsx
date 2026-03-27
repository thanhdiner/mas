"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Bot,
  ListTodo,
  Activity,
  ChevronLeft,
  ChevronRight,
  Wrench,
  Clock,
  MessageSquare,
} from "lucide-react";
import { useState, useEffect } from "react";

const navGroups = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { 
    id: "agents",
    label: "Agents", 
    icon: Bot,
    children: [
      { href: "/agents", label: "All Agents" },
      { href: "/agents/canvas", label: "Hierarchy Canvas" },
      { href: "/agents/new", label: "New Agent" },
    ]
  },
  { 
    id: "tasks",
    label: "Tasks", 
    icon: ListTodo,
    children: [
      { href: "/tasks", label: "All Tasks" },
      { href: "/tasks/new", label: "New Task" },
    ]
  },
  {
    href: "/tools",
    label: "Tools Library",
    icon: Wrench,
  },
  {
    href: "/schedules",
    label: "Schedules",
    icon: Clock,
  },
  {
    href: "/playground",
    label: "Playground",
    icon: MessageSquare,
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    agents: true,
    tasks: true,
  });
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from localStorage
  useEffect(() => {
    const storedCollapsed = localStorage.getItem("sidebar_collapsed");
    const storedGroups = localStorage.getItem("sidebar_open_groups");

    if (storedCollapsed !== null) {
      setCollapsed(storedCollapsed === "true");
    }
    if (storedGroups) {
      try {
        setOpenGroups(JSON.parse(storedGroups));
      } catch (e) {
        console.error("Failed to parse sidebar_open_groups", e);
      }
    }
    setIsLoaded(true);
  }, []);

  // Save to localStorage
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem("sidebar_collapsed", String(collapsed));
      localStorage.setItem("sidebar_open_groups", JSON.stringify(openGroups));
    }
  }, [collapsed, openGroups, isLoaded]);

  const toggleGroup = (id: string) => {
    setOpenGroups(prev => ({ ...prev, [id]: !prev[id] }));
  };

  if (!isLoaded) {
    return (
      <aside
        className={`fixed left-0 top-0 h-screen z-50 flex flex-col transition-all duration-300 w-[72px] lg:w-[260px]`}
        style={{ background: "var(--surface-low)" }}
      />
    );
  }

  return (
    <aside
      className={`fixed left-0 top-0 h-screen z-50 flex flex-col transition-all duration-300 ${
        collapsed ? "w-[72px]" : "w-[72px] lg:w-[260px]"
      }`}
      style={{ background: "var(--surface-low)" }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 h-16 shrink-0 border-b border-white/[0.03]">
        <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center shrink-0">
          <Activity className="w-5 h-5 text-[#060e20]" />
        </div>
        {!collapsed && (
          <span className="font-heading font-semibold text-lg tracking-tight text-foreground hidden lg:block">
            MAS
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-2 overflow-y-auto">
        {navGroups.map((group) => {
          if (!group.children) {
            const isActive = pathname === group.href;
            const Icon = group.icon;
            return (
              <Link
                key={group.href}
                href={group.href!}
                className={`group flex items-center gap-3 px-3 py-2.5 rounded-md transition-all duration-200 ${
                  isActive
                    ? "text-accent-cyan bg-surface-high shadow-sm"
                    : "text-on-surface-dim hover:text-foreground hover:bg-surface-container"
                }`}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span className={`text-sm font-medium hidden ${collapsed ? "" : "lg:block"}`}>
                  {group.label}
                </span>
                {isActive && (
                   <div className="absolute left-0 w-[3px] h-6 bg-accent-cyan rounded-r-full" />
                )}
              </Link>
            );
          }

          const id = group.id!;
          const isOpen = openGroups[id];
          const hasActiveChild = group.children.some(c => pathname === c.href || (c.href !== "/" && pathname.startsWith(c.href)));
          const Icon = group.icon;

          return (
            <div key={id} className="space-y-1">
              <button
                onClick={() => !collapsed && toggleGroup(id)}
                className={`w-full group flex items-center gap-3 px-3 py-2.5 rounded-md transition-all duration-200 ${
                  hasActiveChild && !isOpen
                    ? "text-accent-cyan bg-surface-base"
                    : "text-on-surface-dim hover:text-foreground hover:bg-surface-container"
                }`}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span className={`text-sm font-medium flex-1 text-left hidden ${collapsed ? "" : "lg:block"}`}>
                  {group.label}
                </span>
                {!collapsed && (
                  <ChevronRight 
                    className={`w-3.5 h-3.5 transition-transform duration-200 hidden lg:block ${isOpen ? "rotate-90" : ""}`} 
                  />
                )}
              </button>
              
              {!collapsed && isOpen && (
                <div className="hidden lg:block space-y-1 ml-4 pl-4 border-l border-white/[0.05]">
                  {group.children.map((child) => {
                    const isChildActive = pathname === child.href;
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={`block px-3 py-2 rounded-md text-xs font-medium transition-all duration-200 ${
                          isChildActive
                            ? "text-accent-cyan bg-surface-high/50"
                            : "text-on-surface-dim/70 hover:text-foreground hover:bg-surface-container/50"
                        }`}
                      >
                        {child.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* Action Header */}
        {!collapsed && (
          <div className="pt-6 pb-2 px-3 hidden lg:block">
            <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-dim/40">
              Account
            </span>
          </div>
        )}

        {/* Profile Link */}
        <Link
          href="/profile"
          className={`group flex items-center gap-3 px-3 py-2.5 rounded-md transition-all duration-200 ${
            pathname === "/profile"
              ? "text-accent-cyan bg-surface-high shadow-sm"
              : "text-on-surface-dim hover:text-foreground hover:bg-surface-container"
          }`}
        >
          <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <span className={`text-sm font-medium hidden ${collapsed ? "" : "lg:block"}`}>
            Profile
          </span>
          {pathname === "/profile" && (
            <div className="absolute left-0 w-[3px] h-6 bg-accent-cyan rounded-r-full" />
          )}
        </Link>

        {/* Logout Button */}
        <button
          onClick={() => {
            import("@/lib/api").then(({ api }) => api.auth.logout());
          }}
          className="group flex w-full items-center gap-3 px-3 py-2.5 rounded-md transition-all duration-200 text-on-surface-dim hover:text-[#ffb4ab] hover:bg-surface-container"
        >
          <div className="w-5 h-5 shrink-0 flex items-center justify-center">
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </div>
          <span className={`text-sm font-medium hidden ${collapsed ? "" : "lg:block"}`}>
            Logout
          </span>
        </button>
      </nav>

      {/* Collapse toggle (desktop only) */}
      <div className="p-4 border-t border-white/[0.03]">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden lg:flex w-full items-center justify-center h-9 rounded-md transition-colors hover:bg-surface-high"
          style={{ background: "var(--surface-container)" }}
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4 text-on-surface-dim" />
          ) : (
            <ChevronLeft className="w-4 h-4 text-on-surface-dim" />
          )}
        </button>
      </div>
    </aside>
  );
}
