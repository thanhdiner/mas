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
  ShieldCheck,
  BookOpen,
  Webhook as WebhookIcon,
  Settings,
  Trash2,
  Share2,
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
    id: "social",
    label: "Social Media",
    icon: Share2,
    children: [
      { href: "/social/facebook", label: "FB Dashboard" },
      { href: "/social/facebook/pages", label: "All Fanpages" },
      { href: "/social/zalo", label: "Zalo Integrations" }
    ]
  },
  {
    href: "/tools",
    label: "Tools Library",
    icon: Wrench,
  },
  {
    href: "/webhooks",
    label: "Webhooks",
    icon: WebhookIcon,
  },
  {
    href: "/schedules",
    label: "Schedules",
    icon: Clock,
  },
  {
    href: "/approvals",
    label: "Approvals",
    icon: ShieldCheck,
  },
  {
    href: "/playground",
    label: "Playground",
    icon: MessageSquare,
  },
  {
    href: "/knowledge",
    label: "Knowledge Base",
    icon: BookOpen,
  },
  {
    href: "/trash",
    label: "Trash",
    icon: Trash2,
  },
];

export function Sidebar({ 
  collapsed, 
  setCollapsed, 
}: { 
  collapsed: boolean; 
  setCollapsed: (v: boolean) => void; 
}) {
  const pathname = usePathname();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    agents: true,
    tasks: true,
    social: true,
  });

  // Load from localStorage
  useEffect(() => {
    const storedGroups = localStorage.getItem("sidebar_open_groups");
    if (storedGroups) {
      try {
        setOpenGroups(JSON.parse(storedGroups));
      } catch (e) {
        console.error("Failed to parse sidebar_open_groups", e);
      }
    }
  }, []);

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem("sidebar_open_groups", JSON.stringify(openGroups));
  }, [openGroups]);

  const toggleGroup = (id: string) => {
    setOpenGroups(prev => ({ ...prev, [id]: !prev[id] }));
  };

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

      {/* Navigation — scrollable area */}
      <nav className="flex-1 min-h-0 px-3 py-4 space-y-2 overflow-y-auto scrollbar-thin">
        {navGroups.map((group) => {
          if (!group.children) {
            const isActive = pathname === group.href;
            const Icon = group.icon;
            return (
              <Link
                key={group.href}
                href={group.href!}
                className={`relative group flex items-center gap-3 px-3 py-2.5 rounded-md transition-all duration-200 ${
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
            <div key={id} className="space-y-1 relative group/nav">
              <button
                onClick={() => !collapsed && toggleGroup(id)}
                className={`w-full group flex items-center gap-3 px-3 py-2.5 rounded-md transition-all duration-200 ${
                  hasActiveChild && (!isOpen || collapsed)
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
              
              {/* Flyout menu for collapsed state */}
              {collapsed && (
                <div className="absolute left-full top-0 pl-2 hidden w-52 group-hover/nav:block z-50">
                  <div className="rounded-md border border-white/5 bg-surface-high p-2 shadow-2xl">
                    <div className="mb-2 px-3 pt-1 text-[10px] font-bold uppercase tracking-widest text-on-surface-dim/50">
                      {group.label}
                    </div>
                    <div className="space-y-1">
                      {group.children.map((child) => {
                        const isChildActive = pathname === child.href;
                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            className={`block rounded-md px-3 py-2 text-xs font-medium transition-all duration-200 ${
                              isChildActive
                                ? "text-accent-cyan bg-surface-base"
                                : "text-on-surface-dim hover:text-foreground hover:bg-surface-container"
                            }`}
                          >
                            {child.label}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
              
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
      </nav>

      {/* Bottom pinned section — always visible */}
      <div className="shrink-0 border-t border-white/[0.03] px-3 py-3 space-y-1">
        {/* System header */}
        {!collapsed && (
          <div className="pb-2 px-3 hidden lg:block">
            <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-dim/40">
              System
            </span>
          </div>
        )}

        {/* Settings Link */}
        <Link
          href="/settings"
          className={`relative group flex items-center gap-3 px-3 py-2.5 rounded-md transition-all duration-200 ${
            pathname === "/settings"
              ? "text-accent-cyan bg-surface-high shadow-sm"
              : "text-on-surface-dim hover:text-foreground hover:bg-surface-container"
          }`}
        >
          <Settings className="w-5 h-5 shrink-0" />
          <span className={`text-sm font-medium hidden ${collapsed ? "" : "lg:block"}`}>
            Settings
          </span>
          {pathname === "/settings" && (
            <div className="absolute left-0 w-[3px] h-6 bg-accent-cyan rounded-r-full" />
          )}
        </Link>

        {/* Profile Link */}
        <Link
          href="/profile"
          className={`relative group flex items-center gap-3 px-3 py-2.5 rounded-md transition-all duration-200 ${
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

        {/* Collapse toggle (desktop only) */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden lg:flex w-full items-center justify-center h-9 mt-2 rounded-md transition-colors hover:bg-surface-high"
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
