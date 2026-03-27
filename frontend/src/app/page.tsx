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
} from "lucide-react";
import { api } from "@/lib/api";
import type { DashboardStats, ActivityItem, TopAgent } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { MetricCard } from "@/components/metric-card";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [topAgents, setTopAgents] = useState<TopAgent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [s, a, t] = await Promise.all([
          api.dashboard.stats(),
          api.dashboard.activity(15),
          api.dashboard.topAgents(5),
        ]);
        setStats(s);
        setActivity(a);
        setTopAgents(t);
      } catch {
        // API not available – show empty state
      } finally {
        setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, []);

  const s = stats || {
    totalAgents: 0,
    activeAgents: 0,
    runningTasks: 0,
    queuedTasks: 0,
    failedToday: 0,
    waitingApprovals: 0,
    activeRuns: 0,
    totalTasks: 0,
  };

  return (
    <>
      <PageHeader
        title="Command Center"
        description="Real-time overview of your Multi-Agent System"
        actions={
          <div className="flex gap-2">
            <Link href="/agents/new">
              <Button className="gradient-primary text-[#060e20] font-medium border-0 hover:opacity-90 transition-opacity">
                <Bot className="w-4 h-4 mr-2" />
                New Agent
              </Button>
            </Link>
            <Link href="/tasks/new">
              <Button
                variant="secondary"
                className="bg-surface-high text-foreground border-0 hover:bg-surface-highest"
              >
                <ListTodo className="w-4 h-4 mr-2" />
                New Task
              </Button>
            </Link>
          </div>
        }
      />

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <MetricCard
          title="TOTAL AGENTS"
          value={s.totalAgents}
          icon={<Bot className="w-4 h-4 text-accent-cyan" />}
        />
        <MetricCard
          title="ACTIVE AGENTS"
          value={s.activeAgents}
          icon={<Zap className="w-4 h-4 text-accent-teal" />}
        />
        <MetricCard
          title="RUNNING TASKS"
          value={s.runningTasks}
          icon={<Activity className="w-4 h-4 text-accent-cyan" />}
        />
        <MetricCard
          title="QUEUED TASKS"
          value={s.queuedTasks}
          icon={<Clock className="w-4 h-4" style={{ color: "#8c92a4" }} />}
        />
      </div>

      {/* Second row of metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <MetricCard
          title="FAILED TODAY"
          value={s.failedToday}
          icon={
            <AlertTriangle className="w-4 h-4" style={{ color: "#ffb4ab" }} />
          }
        />
        <MetricCard
          title="AWAITING APPROVAL"
          value={s.waitingApprovals}
          icon={<ShieldCheck className="w-4 h-4" style={{ color: "#f0c674" }} />}
        />
        <MetricCard
          title="ACTIVE RUNS"
          value={s.activeRuns}
          icon={<Activity className="w-4 h-4 text-accent-cyan" />}
        />
        <MetricCard
          title="TOTAL TASKS"
          value={s.totalTasks}
          icon={<ListTodo className="w-4 h-4" style={{ color: "#8c92a4" }} />}
        />
      </div>

      {/* Content Grid: Activity + Top Agents */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_27%] gap-6">
        {/* Activity Feed – "The Pulse" */}
        <div
          className="rounded-xl p-6"
          style={{ background: "var(--surface-container)" }}
        >
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-heading text-lg font-semibold">
              Recent Activity
            </h2>
            <Link
              href="/tasks"
              className="text-xs text-accent-cyan hover:underline flex items-center gap-1"
            >
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {activity.length === 0 && !loading ? (
            <div
              className="text-center py-12 text-sm"
              style={{ color: "var(--on-surface-dim)" }}
            >
              <Activity className="w-8 h-8 mx-auto mb-3 opacity-40" />
              No activity yet. Create a task to get started.
            </div>
          ) : (
            <div className="relative">
              {/* Ghost Line */}
              <div
                className="absolute left-[15px] top-0 bottom-0 w-[1px]"
                style={{ background: "rgba(69, 70, 77, 0.1)" }}
              />
              <div className="space-y-0">
                {activity.map((item, i) => (
                  <Link
                    href={`/tasks/${item.id}`}
                    key={item.id}
                    className="flex items-start gap-4 py-3 px-1 rounded-lg transition-colors hover:bg-surface-high relative animate-slide-in"
                    style={{ animationDelay: `${i * 50}ms` }}
                  >
                    <div
                      className={`status-dot mt-1.5 shrink-0 status-dot-${item.status}`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {item.title}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {item.agentName && (
                          <span
                            className="text-[11px]"
                            style={{ color: "var(--on-surface-dim)" }}
                          >
                            {item.agentName}
                          </span>
                        )}
                        <span
                          className="text-[11px]"
                          style={{ color: "var(--on-surface-dim)" }}
                        >
                          {new Date(item.createdAt).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                    <StatusBadge status={item.status as any} />
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Top Agents */}
        <div
          className="rounded-xl p-6"
          style={{ background: "var(--surface-container)" }}
        >
          <h2 className="font-heading text-lg font-semibold mb-5">
            Top Active Agents
          </h2>
          {topAgents.length === 0 && !loading ? (
            <div
              className="text-center py-12 text-sm"
              style={{ color: "var(--on-surface-dim)" }}
            >
              <Bot className="w-8 h-8 mx-auto mb-3 opacity-40" />
              No agents yet.
            </div>
          ) : (
            <div className="space-y-3">
              {topAgents.map((agent, i) => (
                <Link
                  href={`/agents/${agent.agentId}`}
                  key={agent.agentId}
                  className="flex items-center gap-3 p-3 rounded-lg transition-colors hover:bg-surface-high animate-slide-in"
                  style={{ animationDelay: `${i * 80}ms` }}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-heading font-semibold shrink-0"
                    style={{
                      background:
                        i === 0
                          ? "linear-gradient(135deg, #7bd0ff, #008abb)"
                          : "var(--surface-high)",
                      color: i === 0 ? "#060e20" : "var(--on-surface-dim)",
                    }}
                  >
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {agent.agentName || "Unknown"}
                    </p>
                    <p
                      className="text-[11px] truncate"
                      style={{ color: "var(--on-surface-dim)" }}
                    >
                      {agent.agentRole}
                    </p>
                  </div>
                  <span className="text-sm font-heading font-semibold text-accent-cyan">
                    {agent.taskCount}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Alerts section */}
      {(s.failedToday > 0 || s.waitingApprovals > 0) && (
        <div
          className="mt-6 rounded-xl p-5 glass relative"
          style={{ borderTop: "4px solid #93000a" }}
        >
          <h3 className="font-heading text-sm font-semibold mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" style={{ color: "#ffb4ab" }} />
            Needs Attention
          </h3>
          <div className="flex flex-wrap gap-4">
            {s.failedToday > 0 && (
              <Link
                href="/tasks?status=failed"
                className="text-sm hover:underline"
                style={{ color: "#ffb4ab" }}
              >
                {s.failedToday} task{s.failedToday > 1 ? "s" : ""} failed today
              </Link>
            )}
            {s.waitingApprovals > 0 && (
              <Link
                href="/tasks?status=waiting_approval"
                className="text-sm hover:underline"
                style={{ color: "#f0c674" }}
              >
                {s.waitingApprovals} task{s.waitingApprovals > 1 ? "s" : ""}{" "}
                awaiting approval
              </Link>
            )}
          </div>
        </div>
      )}
    </>
  );
}
