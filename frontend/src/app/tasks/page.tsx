"use client";

import { Suspense } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ListTodo,
  Plus,
  Filter,
  ArrowRight,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Task, TaskStatus } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";

const statusFilters: { label: string; value: TaskStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Queued", value: "queued" },
  { label: "Running", value: "running" },
  { label: "Waiting", value: "waiting_approval" },
  { label: "Done", value: "done" },
  { label: "Failed", value: "failed" },
  { label: "Cancelled", value: "cancelled" },
];

function TasksContent() {
  const searchParams = useSearchParams();
  const initialStatus = searchParams.get("status") || "all";
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState(initialStatus);

  useEffect(() => {
    const params: Record<string, string | boolean> = { parent_only: true };
    if (filter !== "all") params.status = filter;

    api.tasks
      .list(params as any)
      .then(setTasks)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filter]);

  return (
    <>
      {/* Status Filters */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        <Filter
          className="w-4 h-4 shrink-0"
          style={{ color: "var(--on-surface-dim)" }}
        />
        {statusFilters.map((sf) => (
          <button
            key={sf.value}
            onClick={() => {
              setFilter(sf.value);
              setLoading(true);
            }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
              filter === sf.value
                ? "text-[#060e20]"
                : "text-on-surface-dim hover:text-foreground"
            }`}
            style={{
              background:
                filter === sf.value
                  ? "linear-gradient(135deg, #7bd0ff, #008abb)"
                  : "var(--surface-high)",
            }}
          >
            {sf.label}
          </button>
        ))}
      </div>

      {/* Tasks Table */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ background: "var(--surface-container)" }}
      >
        {loading ? (
          <div
            className="text-center py-16 text-sm"
            style={{ color: "var(--on-surface-dim)" }}
          >
            Loading tasks...
          </div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-16">
            <ListTodo
              className="w-10 h-10 mx-auto mb-3"
              style={{ color: "var(--on-surface-dim)", opacity: 0.4 }}
            />
            <p className="font-heading font-medium mb-1">No tasks found</p>
            <p
              className="text-sm"
              style={{ color: "var(--on-surface-dim)" }}
            >
              {filter !== "all"
                ? `No ${filter} tasks`
                : "Create your first task to begin"}
            </p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div
              className="grid grid-cols-[1fr_140px_120px_100px_40px] gap-4 px-5 py-3"
              style={{ background: "var(--surface-high)" }}
            >
              <span
                className="text-[11px] font-medium uppercase tracking-[0.05rem]"
                style={{ color: "var(--on-surface-dim)" }}
              >
                Task
              </span>
              <span
                className="text-[11px] font-medium uppercase tracking-[0.05rem]"
                style={{ color: "var(--on-surface-dim)" }}
              >
                Agent
              </span>
              <span
                className="text-[11px] font-medium uppercase tracking-[0.05rem]"
                style={{ color: "var(--on-surface-dim)" }}
              >
                Status
              </span>
              <span
                className="text-[11px] font-medium uppercase tracking-[0.05rem]"
                style={{ color: "var(--on-surface-dim)" }}
              >
                Created
              </span>
              <span />
            </div>

            {/* Rows */}
            <div className="divide-y divide-transparent">
              {tasks.map((task, i) => (
                <Link
                  href={`/tasks/${task.id}`}
                  key={task.id}
                  className="grid grid-cols-[1fr_140px_120px_100px_40px] gap-4 px-5 py-3.5 items-center transition-colors hover:bg-surface-highest animate-slide-in"
                  style={{ animationDelay: `${i * 30}ms` }}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{task.title}</p>
                    <p
                      className="text-[11px] truncate"
                      style={{ color: "var(--on-surface-dim)" }}
                    >
                      {task.input.substring(0, 80)}
                    </p>
                  </div>
                  <span
                    className="text-xs truncate"
                    style={{ color: "var(--on-surface-dim)" }}
                  >
                    {task.assignedAgentId.substring(0, 8)}...
                  </span>
                  <StatusBadge status={task.status} />
                  <span
                    className="text-[11px]"
                    style={{ color: "var(--on-surface-dim)" }}
                  >
                    {new Date(task.createdAt).toLocaleDateString()}
                  </span>
                  <ArrowRight
                    className="w-4 h-4"
                    style={{ color: "var(--on-surface-dim)" }}
                  />
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}

export default function TasksPage() {
  return (
    <>
      <PageHeader
        title="Tasks"
        description="View and manage task orchestrations"
        actions={
          <Link href="/tasks/new">
            <Button className="gradient-primary text-[#060e20] font-medium border-0 hover:opacity-90">
              <Plus className="w-4 h-4 mr-2" />
              New Task
            </Button>
          </Link>
        }
      />
      <Suspense
        fallback={
          <div
            className="text-center py-16 text-sm"
            style={{ color: "var(--on-surface-dim)" }}
          >
            Loading...
          </div>
        }
      >
        <TasksContent />
      </Suspense>
    </>
  );
}
