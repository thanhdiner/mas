"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import {
  ListTodo,
  Plus,
  Filter,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Archive,
} from "lucide-react";
import type { TaskStatus } from "@/lib/api";
import { api } from "@/lib/api";
import { useTasks } from "@/lib/hooks/use-tasks";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const PAGE_SIZE = 15;

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
  const router = useRouter();
  const pathname = usePathname();

  const filter = searchParams.get("status") || "all";
  const page = parseInt(searchParams.get("page") || "1", 10);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { tasks, total, isLoading: loading, mutate } = useTasks(
    filter !== "all"
      ? { parent_only: true, status: filter as TaskStatus, page, pageSize: PAGE_SIZE }
      : { parent_only: true, page, pageSize: PAGE_SIZE }
  );

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleFilterChange = (value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value === "all") {
      params.delete("status");
    } else {
      params.set("status", value);
    }
    params.set("page", "1");
    router.push(`${pathname}?${params.toString()}`);
  };

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams);
    if (newPage > 1) {
      params.set("page", newPage.toString());
    } else {
      params.delete("page");
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  const handleArchive = async (e: React.MouseEvent, taskId: string) => {
    e.stopPropagation();

    // Optimistically update
    mutate(
      (currentData: any) => {
        if (!currentData?.items) return currentData;
        return {
          ...currentData,
          items: currentData.items.filter((t: any) => t.id !== taskId),
          total: Math.max(0, currentData.total - 1),
        };
      },
      false // false = don't revalidate immediately, just set cache
    );

    try {
      await api.tasks.delete(taskId);
      toast.success("Task moved to trash");
      mutate();
    } catch (err) {
      toast.error("Failed to archive task");
      console.error(err);
      mutate(); // rollback by re-fetching
    }
  };

  const toggleSelect = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleAll = () => {
    if (selectedIds.size === tasks.length && tasks.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(tasks.map(t => t.id)));
    }
  };

  const handleBulkArchive = async () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);

    // Optimistically update
    mutate(
      (currentData: any) => {
        if (!currentData?.items) return currentData;
        return {
          ...currentData,
          items: currentData.items.filter((t: any) => !ids.includes(t.id)),
          total: Math.max(0, currentData.total - ids.length),
        };
      },
      false
    );

    try {
      await Promise.all(ids.map(id => api.tasks.delete(id)));
      toast.success(`${ids.length} tasks moved to trash`);
      setSelectedIds(new Set());
      mutate();
    } catch (err) {
      toast.error("Failed to archive some tasks");
      console.error(err);
      mutate();
    }
  };

  return (
    <>
      {/* Status Filters + Count */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Filter
            className="w-4 h-4 shrink-0"
            style={{ color: "var(--on-surface-dim)" }}
          />
          {statusFilters.map((sf) => (
            <button
              key={sf.value}
              onClick={() => handleFilterChange(sf.value)}
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
        {!loading && (
          <span
            className="text-xs tabular-nums"
            style={{ color: "var(--on-surface-dim)" }}
          >
            {total} task{total !== 1 ? "s" : ""}
          </span>
        )}
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
              className="grid grid-cols-[40px_1fr_140px_120px_100px_40px_40px] gap-4 px-5 py-3"
              style={{ background: "var(--surface-high)" }}
            >
              <div className="flex items-center justify-center">
                <input
                  type="checkbox"
                  checked={tasks.length > 0 && selectedIds.size === tasks.length}
                  onChange={toggleAll}
                  className="w-4 h-4 rounded border-white/20 bg-surface-lowest accent-accent-cyan cursor-pointer"
                />
              </div>
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
              <span />
            </div>

            {/* Rows */}
            <div className="divide-y divide-transparent">
              {tasks.map((task, i) => (
                <div
                  key={task.id}
                  onClick={() => router.push(`/tasks/${task.id}`)}
                  className="cursor-pointer group grid grid-cols-[40px_1fr_140px_120px_100px_40px_40px] gap-4 px-5 py-3.5 items-center transition-colors hover:bg-surface-highest animate-slide-in"
                  style={{ animationDelay: `${i * 30}ms` }}
                >
                  <div className="flex items-center justify-center" onClick={(e) => toggleSelect(e, task.id)}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(task.id)}
                      readOnly
                      className="w-4 h-4 rounded border-white/20 bg-surface-lowest accent-accent-cyan cursor-pointer"
                    />
                  </div>
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
                  <button
                    onClick={(e) => handleArchive(e, task.id)}
                    className="p-1.5 opacity-0 group-hover:opacity-100 hover:opacity-100! hover:bg-surface-high rounded-md transition-all flex justify-center text-on-surface-dim hover:text-red-400"
                    title="Archive Task"
                  >
                    <Archive className="w-4 h-4" />
                  </button>
                  <ArrowRight
                    className="w-4 h-4"
                    style={{ color: "var(--on-surface-dim)" }}
                  />
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div
                className="flex items-center justify-between px-5 py-3"
                style={{
                  background: "var(--surface-high)",
                  borderTop: "1px solid rgba(255,255,255,0.04)",
                }}
              >
                <span
                  className="text-xs tabular-nums"
                  style={{ color: "var(--on-surface-dim)" }}
                >
                  Page {page} of {totalPages}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handlePageChange(Math.max(1, page - 1))}
                    disabled={page === 1}
                    className="p-1.5 rounded-md transition-colors hover:bg-surface-highest disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  {/* Page number buttons */}
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum: number;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (page <= 3) {
                      pageNum = i + 1;
                    } else if (page >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = page - 2 + i;
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => handlePageChange(pageNum)}
                        className={`w-8 h-8 rounded-md text-xs font-medium transition-all ${
                          page === pageNum
                            ? "text-[#060e20]"
                            : "text-on-surface-dim hover:text-foreground hover:bg-surface-highest"
                        }`}
                        style={{
                          background:
                            page === pageNum
                              ? "linear-gradient(135deg, #7bd0ff, #008abb)"
                              : "transparent",
                        }}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => handlePageChange(Math.min(totalPages, page + 1))}
                    disabled={page === totalPages}
                    className="p-1.5 rounded-md transition-colors hover:bg-surface-highest disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Floating Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#060e20] border border-white/10 rounded-full px-6 py-3 flex items-center gap-4 shadow-2xl animate-in slide-in-from-bottom-5">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <div className="w-px h-4 bg-white/10" />
          <button
            onClick={handleBulkArchive}
            className="flex items-center gap-2 text-sm text-red-400 hover:text-red-300 transition-colors"
          >
            <Archive className="w-4 h-4" />
            Archive
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="flex items-center gap-2 text-sm text-on-surface-dim hover:text-white transition-colors ml-2"
          >
            Cancel
          </button>
        </div>
      )}
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
          <div className="flex gap-2 items-center">
            <Link href="/trash">
              <Button variant="outline" className="text-on-surface-dim border-white/10 hover:bg-white/5 hover:text-white">
                <Trash2 className="w-4 h-4 mr-2" />
                Trash
              </Button>
            </Link>
            <Link href="/tasks/new">
              <Button className="gradient-primary text-[#060e20] font-medium border-0 hover:opacity-90">
                <Plus className="w-4 h-4 mr-2" />
                New Task
              </Button>
            </Link>
          </div>
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
