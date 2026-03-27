"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Bot,
  Zap,
  ListTodo,
  Clock,
  AlertTriangle,
  ShieldCheck,
  Activity,
  ArrowRight,
  BarChart3,
  TrendingUp,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { api } from "@/lib/api";
import type { DashboardStats, ActivityItem, TopAgent, AnalyticsData } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { MetricCard } from "@/components/metric-card";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [topAgents, setTopAgents] = useState<TopAgent[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [s, a, t, an] = await Promise.all([
          api.dashboard.stats(),
          api.dashboard.activity(15),
          api.dashboard.topAgents(5),
          api.dashboard.analytics().catch(() => null),
        ]);
        setStats(s);
        setActivity(a);
        setTopAgents(t);
        setAnalytics(an);
      } catch {
        // API not available
      } finally {
        setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, []);

  const s = stats || {
    totalAgents: 0, activeAgents: 0, runningTasks: 0, queuedTasks: 0,
    failedToday: 0, waitingApprovals: 0, activeRuns: 0, totalTasks: 0,
  };

  const maxDaily = analytics ? Math.max(...analytics.dailyTasks.map((d) => d.count), 1) : 1;

  return (
    <>
      <PageHeader
        title="Command Center"
        description="Real-time overview of your Multi-Agent System"
        actions={
          <div className="flex gap-2">
            <Link href="/agents/new">
              <Button className="gradient-primary text-[#060e20] font-medium border-0 hover:opacity-90 transition-opacity">
                <Bot className="w-4 h-4 mr-2" /> New Agent
              </Button>
            </Link>
            <Link href="/tasks/new">
              <Button variant="secondary" className="bg-surface-high text-foreground border-0 hover:bg-surface-highest">
                <ListTodo className="w-4 h-4 mr-2" /> New Task
              </Button>
            </Link>
          </div>
        }
      />

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <MetricCard title="TOTAL AGENTS" value={s.totalAgents} icon={<Bot className="w-4 h-4 text-accent-cyan" />} />
        <MetricCard title="ACTIVE AGENTS" value={s.activeAgents} icon={<Zap className="w-4 h-4 text-accent-teal" />} />
        <MetricCard title="RUNNING TASKS" value={s.runningTasks} icon={<Activity className="w-4 h-4 text-accent-cyan" />} />
        <MetricCard title="QUEUED TASKS" value={s.queuedTasks} icon={<Clock className="w-4 h-4" style={{ color: "#8c92a4" }} />} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <MetricCard title="FAILED TODAY" value={s.failedToday} icon={<AlertTriangle className="w-4 h-4" style={{ color: "#ffb4ab" }} />} />
        <MetricCard title="AWAITING APPROVAL" value={s.waitingApprovals} icon={<ShieldCheck className="w-4 h-4" style={{ color: "#f0c674" }} />} />
        <MetricCard title="ACTIVE RUNS" value={s.activeRuns} icon={<Activity className="w-4 h-4 text-accent-cyan" />} />
        <MetricCard title="TOTAL TASKS" value={s.totalTasks} icon={<ListTodo className="w-4 h-4" style={{ color: "#8c92a4" }} />} />
      </div>

      {/* Analytics Charts */}
      {analytics && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Daily Tasks Bar Chart */}
          <div className="rounded-xl p-6" style={{ background: "var(--surface-container)" }}>
            <div className="flex items-center gap-2 mb-5">
              <BarChart3 className="w-5 h-5 text-accent-cyan" />
              <h2 className="font-heading text-lg font-semibold">Task Volume (7 days)</h2>
            </div>
            <div className="flex items-end gap-2 h-36">
              {analytics.dailyTasks.map((d, i) => (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[10px] font-medium" style={{ color: "var(--on-surface-dim)" }}>{d.count}</span>
                  <div
                    className="w-full rounded-t-md transition-all duration-500"
                    style={{
                      height: `${Math.max((d.count / maxDaily) * 100, 4)}%`,
                      background: i === analytics.dailyTasks.length - 1 ? "linear-gradient(180deg, #7bd0ff, #008abb)" : "rgba(123, 208, 255, 0.2)",
                    }}
                  />
                  <span className="text-[9px] font-medium" style={{ color: "var(--on-surface-dim)" }}>
                    {new Date(d.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short" })}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Agent Performance */}
          <div className="rounded-xl p-6" style={{ background: "var(--surface-container)" }}>
            <div className="flex items-center gap-2 mb-5">
              <TrendingUp className="w-5 h-5 text-accent-teal" />
              <h2 className="font-heading text-lg font-semibold">Agent Performance</h2>
            </div>
            {analytics.agentPerformance.length === 0 ? (
              <div className="text-center py-8 text-sm" style={{ color: "var(--on-surface-dim)" }}>No performance data yet.</div>
            ) : (
              <div className="space-y-3">
                {analytics.agentPerformance.map((ap) => (
                  <div key={ap.agentId} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium truncate pr-2">{ap.agentName}</span>
                        <span className="text-xs font-heading text-accent-cyan shrink-0">{ap.successRate}%</span>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                        <div className="h-full flex">
                          <div className="h-full rounded-l-full" style={{ width: `${(ap.completed / Math.max(ap.total, 1)) * 100}%`, background: "linear-gradient(90deg, #7bd0ff, #008abb)" }} />
                          <div className="h-full" style={{ width: `${(ap.failed / Math.max(ap.total, 1)) * 100}%`, background: "#ffb4ab" }} />
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] shrink-0">
                      <span className="flex items-center gap-0.5 text-accent-teal"><CheckCircle2 className="w-3 h-3" /> {ap.completed}</span>
                      <span className="flex items-center gap-0.5" style={{ color: "#ffb4ab" }}><XCircle className="w-3 h-3" /> {ap.failed}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Content Grid: Activity + Top Agents */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_27%] gap-6">
        <div className="rounded-xl p-6" style={{ background: "var(--surface-container)" }}>
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-heading text-lg font-semibold">Recent Activity</h2>
            <Link href="/tasks" className="text-xs text-accent-cyan hover:underline flex items-center gap-1">View all <ArrowRight className="w-3 h-3" /></Link>
          </div>
          {activity.length === 0 && !loading ? (
            <div className="text-center py-12 text-sm" style={{ color: "var(--on-surface-dim)" }}>
              <Activity className="w-8 h-8 mx-auto mb-3 opacity-40" /> No activity yet. Create a task to get started.
            </div>
          ) : (
            <div className="relative">
              <div className="absolute left-[15px] top-0 bottom-0 w-[1px]" style={{ background: "rgba(69, 70, 77, 0.1)" }} />
              <div className="space-y-0">
                {activity.map((item, i) => (
                  <Link href={`/tasks/${item.id}`} key={item.id} className="flex items-start gap-4 py-3 px-1 rounded-lg transition-colors hover:bg-surface-high relative animate-slide-in" style={{ animationDelay: `${i * 50}ms` }}>
                    <div className={`status-dot mt-1.5 shrink-0 status-dot-${item.status}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {item.agentName && <span className="text-[11px]" style={{ color: "var(--on-surface-dim)" }}>{item.agentName}</span>}
                        <span className="text-[11px]" style={{ color: "var(--on-surface-dim)" }}>{new Date(item.createdAt).toLocaleTimeString()}</span>
                      </div>
                    </div>
                    <StatusBadge status={item.status as any} />
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="rounded-xl p-6" style={{ background: "var(--surface-container)" }}>
          <h2 className="font-heading text-lg font-semibold mb-5">Top Active Agents</h2>
          {topAgents.length === 0 && !loading ? (
            <div className="text-center py-12 text-sm" style={{ color: "var(--on-surface-dim)" }}>
              <Bot className="w-8 h-8 mx-auto mb-3 opacity-40" /> No agents yet.
            </div>
          ) : (
            <div className="space-y-3">
              {topAgents.map((agent, i) => (
                <Link href={`/agents/${agent.agentId}`} key={agent.agentId} className="flex items-center gap-3 p-3 rounded-lg transition-colors hover:bg-surface-high animate-slide-in" style={{ animationDelay: `${i * 80}ms` }}>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-heading font-semibold shrink-0" style={{ background: i === 0 ? "linear-gradient(135deg, #7bd0ff, #008abb)" : "var(--surface-high)", color: i === 0 ? "#060e20" : "var(--on-surface-dim)" }}>{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{agent.agentName || "Unknown"}</p>
                    <p className="text-[11px] truncate" style={{ color: "var(--on-surface-dim)" }}>{agent.agentRole}</p>
                  </div>
                  <span className="text-sm font-heading font-semibold text-accent-cyan">{agent.taskCount}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Alerts */}
      {(s.failedToday > 0 || s.waitingApprovals > 0) && (
        <div className="mt-6 rounded-xl p-5 glass relative" style={{ borderTop: "4px solid #93000a" }}>
          <h3 className="font-heading text-sm font-semibold mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" style={{ color: "#ffb4ab" }} /> Needs Attention
          </h3>
          <div className="flex flex-wrap gap-4">
            {s.failedToday > 0 && <Link href="/tasks?status=failed" className="text-sm hover:underline" style={{ color: "#ffb4ab" }}>{s.failedToday} task{s.failedToday > 1 ? "s" : ""} failed today</Link>}
            {s.waitingApprovals > 0 && <Link href="/tasks?status=waiting_approval" className="text-sm hover:underline" style={{ color: "#f0c674" }}>{s.waitingApprovals} task{s.waitingApprovals > 1 ? "s" : ""} awaiting approval</Link>}
          </div>
        </div>
      )}
    </>
  );
}
