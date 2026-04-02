"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import {
  ListTodo,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Trash2,
  RefreshCw,
  AlertTriangle,
  ArrowLeft,
  Bot,
  Webhook as WebhookIcon,
} from "lucide-react";
import type { TaskStatus } from "@/lib/api";
import { api } from "@/lib/api";
import { useTasks } from "@/lib/hooks/use-tasks";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

const PAGE_SIZE = 15;

function TaskTrashContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const page = parseInt(searchParams.get("page") || "1", 10);

  const { tasks, total, isLoading: loading, mutate } = useTasks({
    parent_only: true, // We still group by parent
    is_archived: true, // Fetch only from trash
    page,
    pageSize: PAGE_SIZE,
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams);
    if (newPage > 1) {
      params.set("page", newPage.toString());
    } else {
      params.delete("page");
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  const handleRestore = async (e: React.MouseEvent, taskId: string) => {
    e.stopPropagation();

    mutate(
      (currentData: any) => {
        if (!currentData?.items) return currentData;
        return {
          ...currentData,
          items: currentData.items.filter((t: any) => t.id !== taskId),
          total: Math.max(0, currentData.total - 1),
        };
      },
      false
    );

    try {
      await api.tasks.restore(taskId);
      toast.success("Task restored successfully");
      mutate();
    } catch (err) {
      toast.error("Failed to restore task");
      console.error(err);
      mutate();
    }
  };

  const handleHardDelete = async (e: React.MouseEvent, taskId: string) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to permanently delete this task? This action cannot be undone.")) return;

    mutate(
      (currentData: any) => {
        if (!currentData?.items) return currentData;
        return {
          ...currentData,
          items: currentData.items.filter((t: any) => t.id !== taskId),
          total: Math.max(0, currentData.total - 1),
        };
      },
      false
    );

    try {
      await api.tasks.hardDelete(taskId);
      toast.success("Task deleted permanently");
      mutate();
    } catch (err) {
      toast.error("Failed to permanently delete task");
      console.error(err);
      mutate();
    }
  };

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div></div>
        {!loading && (
          <span
            className="text-xs tabular-nums"
            style={{ color: "var(--on-surface-dim)" }}
          >
            {total} task{total !== 1 ? "s" : ""} in trash
          </span>
        )}
      </div>

      <div
        className="rounded-xl overflow-hidden shadow-sm border border-white/5"
        style={{ background: "var(--surface-container)" }}
      >
        {loading ? (
          <div
            className="text-center py-16 text-sm"
            style={{ color: "var(--on-surface-dim)" }}
          >
            Loading trash...
          </div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-16">
            <Trash2
              className="w-10 h-10 mx-auto mb-3 text-on-surface-dim opacity-30"
            />
            <p className="font-heading font-medium mb-1">Trash is empty</p>
            <p
              className="text-sm"
              style={{ color: "var(--on-surface-dim)" }}
            >
              No deleted tasks found
            </p>
          </div>
        ) : (
          <>
            <div
              className="grid grid-cols-[1fr_140px_120px_100px_40px_40px] gap-4 px-5 py-3"
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
                Archived
              </span>
              <span />
              <span />
            </div>

            <div className="divide-y divide-white/5">
              {tasks.map((task, i) => (
                <div
                  key={task.id}
                  onClick={() => router.push(`/tasks/${task.id}`)}
                  className="cursor-pointer group grid grid-cols-[1fr_140px_120px_100px_40px_40px] gap-4 px-5 py-3.5 items-center hover:bg-surface-high transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate opacity-60 line-through">{task.title}</p>
                    <p
                      className="text-[11px] truncate opacity-50"
                      style={{ color: "var(--on-surface-dim)" }}
                    >
                      {task.input.substring(0, 80)}
                    </p>
                  </div>
                  <span
                    className="text-xs truncate opacity-60"
                    style={{ color: "var(--on-surface-dim)" }}
                  >
                    {task.assignedAgentId.substring(0, 8)}...
                  </span>
                  <div className="opacity-60 grayscale"><StatusBadge status={task.status} /></div>
                  <span
                    className="text-[11px] opacity-60"
                    style={{ color: "var(--on-surface-dim)" }}
                  >
                    {task.archivedAt ? new Date(task.archivedAt).toLocaleDateString() : new Date(task.createdAt).toLocaleDateString()}
                  </span>
                  <button
                    onClick={(e) => handleRestore(e, task.id)}
                    className="p-1.5 opacity-0 group-hover:opacity-100 hover:opacity-100! hover:bg-surface-highest rounded-md transition-all flex justify-center text-on-surface-dim hover:text-green-400"
                    title="Restore Task"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => handleHardDelete(e, task.id)}
                    className="p-1.5 opacity-0 group-hover:opacity-100 hover:opacity-100! hover:bg-surface-highest rounded-md transition-all flex justify-center text-on-surface-dim hover:text-red-500"
                    title="Delete Permanently"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

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
    </>
  );
}

function GlobalTrashContainer() {
  const [activeTab, setActiveTab] = useState("tasks");

  return (
    <>
      <div className="mb-6 flex p-4 gap-3 rounded-lg border border-[#f4c871]/20 bg-[#f4c871]/5">
        <AlertTriangle className="w-5 h-5 text-[#f4c871] shrink-0 mt-0.5" />
        <div>
          <h4 className="text-sm font-semibold text-[#f4c871] mb-1">Auto-Purge System Active</h4>
          <p className="text-sm text-on-surface-dim">
            Items in the trash will be permanently deleted automatically <b>30 days</b> after they are archived. You can also delete them manually at any time.
          </p>
        </div>
      </div>

      <Tabs defaultValue="tasks" value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-6 bg-surface-lowest border border-white/5 inline-flex w-full justify-start rounded-lg p-1 h-auto">
          <TabsTrigger 
            value="tasks" 
            className="flex items-center gap-2 data-[state=active]:bg-surface-high data-[state=active]:text-foreground rounded-md px-4 py-2 font-medium transition-all"
          >
            <ListTodo className="w-4 h-4" />
            Tasks
          </TabsTrigger>
          <TabsTrigger 
            value="agents" 
            disabled
            className="flex items-center gap-2 data-[state=active]:bg-surface-high data-[state=active]:text-foreground rounded-md px-4 py-2 font-medium transition-all opacity-50"
            title="Coming soon"
          >
            <Bot className="w-4 h-4" />
            Agents
          </TabsTrigger>
          <TabsTrigger 
            value="webhooks" 
            disabled
            className="flex items-center gap-2 data-[state=active]:bg-surface-high data-[state=active]:text-foreground rounded-md px-4 py-2 font-medium transition-all opacity-50"
            title="Coming soon"
          >
            <WebhookIcon className="w-4 h-4" />
            Webhooks
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tasks" className="mt-0 outline-none">
          <Suspense
            fallback={
              <div className="text-center py-16 text-sm text-on-surface-dim">
                Loading tasks...
              </div>
            }
          >
            <TaskTrashContent />
          </Suspense>
        </TabsContent>
        {/* Placeholder for future tabs */}
        <TabsContent value="agents" className="mt-0 outline-none" />
        <TabsContent value="webhooks" className="mt-0 outline-none" />
      </Tabs>
    </>
  );
}

export default function GlobalTrashPage() {
  return (
    <>
      <PageHeader
        title="Global Trash"
        description="Manage removed resources across your system"
      />
      <GlobalTrashContainer />
    </>
  );
}
