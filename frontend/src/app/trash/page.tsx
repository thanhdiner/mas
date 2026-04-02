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
  Check,
} from "lucide-react";
import type { TaskStatus } from "@/lib/api";
import { api } from "@/lib/api";
import { useTasks } from "@/lib/hooks/use-tasks";
import { useAgents } from "@/lib/hooks/use-agents";
import { useWebhooks } from "@/lib/hooks/use-webhooks";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

const PAGE_SIZE = 15;

function TaskTrashContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const page = parseInt(searchParams.get("page") || "1", 10);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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

  const handleBulkRestore = async () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);

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
      await Promise.all(ids.map(id => api.tasks.restore(id)));
      toast.success(`${ids.length} tasks restored`);
      setSelectedIds(new Set());
      mutate();
    } catch (err) {
      toast.error("Failed to restore some tasks");
      console.error(err);
      mutate();
    }
  };

  const handleBulkHardDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Are you sure you want to permanently delete ${selectedIds.size} tasks? This action cannot be undone.`)) return;
    const ids = Array.from(selectedIds);

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
      await Promise.all(ids.map(id => api.tasks.hardDelete(id)));
      toast.success(`${ids.length} tasks permanently deleted`);
      setSelectedIds(new Set());
      mutate();
    } catch (err) {
      toast.error("Failed to permanently delete some tasks");
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
              className="grid grid-cols-[40px_1fr_140px_120px_100px_40px_40px] gap-4 px-5 py-3"
              style={{ background: "var(--surface-high)" }}
            >
              <div className="flex items-center justify-center">
                <div 
                  className="flex items-center justify-center cursor-pointer w-4 h-4 rounded border transition-colors shrink-0"
                  style={{
                    borderColor: tasks.length > 0 && selectedIds.size === tasks.length ? "var(--accent-cyan)" : "rgba(255,255,255,0.2)",
                    background: tasks.length > 0 && selectedIds.size === tasks.length ? "var(--accent-cyan)" : "var(--surface-lowest)"
                  }}
                  onClick={() => toggleAll()}
                >
                  {tasks.length > 0 && selectedIds.size === tasks.length && <Check className="w-3 h-3 text-[#060e20]" strokeWidth={3} />}
                </div>
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
                  className="cursor-pointer group grid grid-cols-[40px_1fr_140px_120px_100px_40px_40px] gap-4 px-5 py-3.5 items-center hover:bg-surface-high transition-colors"
                >
                  <div className="flex items-center justify-center" onClick={(e) => toggleSelect(e, task.id)}>
                    <div 
                      className="flex items-center justify-center cursor-pointer w-4 h-4 rounded border transition-colors shrink-0"
                      style={{
                        borderColor: selectedIds.has(task.id) ? "var(--accent-cyan)" : "rgba(255,255,255,0.2)",
                        background: selectedIds.has(task.id) ? "var(--accent-cyan)" : "var(--surface-lowest)"
                      }}
                    >
                      {selectedIds.has(task.id) && <Check className="w-3 h-3 text-[#060e20]" strokeWidth={3} />}
                    </div>
                  </div>
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

      {/* Floating Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#060e20] border border-white/10 rounded-full px-6 py-3 flex items-center gap-4 shadow-2xl animate-in slide-in-from-bottom-5">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <div className="w-px h-4 bg-white/10" />
          <button
            onClick={handleBulkRestore}
            className="flex items-center gap-2 text-sm text-green-400 hover:text-green-300 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Restore
          </button>
          <button
            onClick={handleBulkHardDelete}
            className="flex items-center gap-2 text-sm text-red-400 hover:text-red-300 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Delete Permanently
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

function AgentTrashContent() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  // NOTE: useAgents does not natively support pagination yet unlike tasks. 
  // It returns the full list. We will handle pagination on client if needed OR just show all.
  // Signature: useAgents(activeOnly, isArchived)
  const { agents, isLoading: loading, mutate } = useAgents(false, true);

  const handleRestore = async (e: React.MouseEvent, agentId: string) => {
    e.stopPropagation();

    mutate(
      (currentAgents: any) => {
        if (!currentAgents) return currentAgents;
        return currentAgents.filter((a: any) => a.id !== agentId);
      },
      false
    );

    try {
      await api.agents.restore(agentId);
      toast.success("Agent restored successfully");
      mutate();
    } catch (err) {
      toast.error("Failed to restore agent");
      console.error(err);
      mutate();
    }
  };

  const handleHardDelete = async (e: React.MouseEvent, agentId: string) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to permanently delete this agent? This action cannot be undone.")) return;

    mutate(
      (currentAgents: any) => {
        if (!currentAgents) return currentAgents;
        return currentAgents.filter((a: any) => a.id !== agentId);
      },
      false
    );

    try {
      await api.agents.delete(agentId, true);
      toast.success("Agent deleted permanently");
      mutate();
    } catch (err) {
      toast.error("Failed to permanently delete agent");
      console.error(err);
      mutate();
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
    if (selectedIds.size === agents.length && agents.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(agents.map(a => a.id)));
    }
  };

  const handleBulkRestore = async () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);

    mutate(
      (currentAgents: any) => {
        if (!currentAgents) return currentAgents;
        return currentAgents.filter((a: any) => !ids.includes(a.id));
      },
      false
    );

    try {
      await Promise.all(ids.map(id => api.agents.restore(id)));
      toast.success(`${ids.length} agents restored`);
      setSelectedIds(new Set());
      mutate();
    } catch (err) {
      toast.error("Failed to restore some agents");
      console.error(err);
      mutate();
    }
  };

  const handleBulkHardDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Are you sure you want to permanently delete ${selectedIds.size} agents? This action cannot be undone.`)) return;
    const ids = Array.from(selectedIds);

    mutate(
      (currentAgents: any) => {
        if (!currentAgents) return currentAgents;
        return currentAgents.filter((a: any) => !ids.includes(a.id));
      },
      false
    );

    try {
      await Promise.all(ids.map(id => api.agents.delete(id, true)));
      toast.success(`${ids.length} agents permanently deleted`);
      setSelectedIds(new Set());
      mutate();
    } catch (err) {
      toast.error("Failed to permanently delete some agents");
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
            {agents.length} agent{agents.length !== 1 ? "s" : ""} in trash
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
        ) : agents.length === 0 ? (
          <div className="text-center py-16">
            <Trash2
              className="w-10 h-10 mx-auto mb-3 text-on-surface-dim opacity-30"
            />
            <p className="font-heading font-medium mb-1">Trash is empty</p>
            <p
              className="text-sm"
              style={{ color: "var(--on-surface-dim)" }}
            >
              No deleted agents found
            </p>
          </div>
        ) : (
          <>
            <div
              className="grid grid-cols-[40px_1fr_140px_120px_100px_40px_40px] gap-4 px-5 py-3"
              style={{ background: "var(--surface-high)" }}
            >
              <div className="flex items-center justify-center">
                <div 
                  className="flex items-center justify-center cursor-pointer w-4 h-4 rounded border transition-colors shrink-0"
                  style={{
                    borderColor: agents.length > 0 && selectedIds.size === agents.length ? "var(--accent-cyan)" : "rgba(255,255,255,0.2)",
                    background: agents.length > 0 && selectedIds.size === agents.length ? "var(--accent-cyan)" : "var(--surface-lowest)"
                  }}
                  onClick={() => toggleAll()}
                >
                  {agents.length > 0 && selectedIds.size === agents.length && <Check className="w-3 h-3 text-[#060e20]" strokeWidth={3} />}
                </div>
              </div>
              <span
                className="text-[11px] font-medium uppercase tracking-[0.05rem]"
                style={{ color: "var(--on-surface-dim)" }}
              >
                Agent Name
              </span>
              <span
                className="text-[11px] font-medium uppercase tracking-[0.05rem]"
                style={{ color: "var(--on-surface-dim)" }}
              >
                Role
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
                Deleted On
              </span>
              <span></span>
              <span></span>
            </div>

            <div className="divide-y divide-white/5">
              {agents.map((agent: any) => (
                <div
                  key={agent.id}
                  className="group grid grid-cols-[40px_1fr_140px_120px_100px_40px_40px] gap-4 px-5 py-3.5 items-center hover:bg-surface-high transition-colors"
                >
                  <div className="flex items-center justify-center" onClick={(e) => toggleSelect(e, agent.id)}>
                    <div 
                      className="flex items-center justify-center cursor-pointer w-4 h-4 rounded border transition-colors shrink-0"
                      style={{
                        borderColor: selectedIds.has(agent.id) ? "var(--accent-cyan)" : "rgba(255,255,255,0.2)",
                        background: selectedIds.has(agent.id) ? "var(--accent-cyan)" : "var(--surface-lowest)"
                      }}
                    >
                      {selectedIds.has(agent.id) && <Check className="w-3 h-3 text-[#060e20]" strokeWidth={3} />}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate opacity-60 line-through">{agent.name}</p>
                    <p
                      className="text-[11px] truncate mt-0.5 opacity-40 uppercase tracking-widest"
                      style={{ color: "var(--on-surface-dim)" }}
                    >
                      ID: {agent.id.substring(0, 8)}
                    </p>
                  </div>
                  <span
                    className="text-xs truncate opacity-60"
                    style={{ color: "var(--on-surface-dim)" }}
                  >
                    {agent.role}
                  </span>
                  <div className="opacity-60 grayscale">
                    <span
                      className="text-[11px]"
                      style={{
                        color: agent.active
                          ? "var(--accent-teal)"
                          : "var(--on-surface-dim)",
                      }}
                    >
                      {agent.active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <span
                    className="text-[11px] opacity-60"
                    style={{ color: "var(--on-surface-dim)" }}
                  >
                    {agent.archivedAt ? new Date(agent.archivedAt).toLocaleDateString() : new Date(agent.createdAt).toLocaleDateString()}
                  </span>
                  <button
                    onClick={(e) => handleRestore(e, agent.id)}
                    className="p-1.5 opacity-0 group-hover:opacity-100 hover:opacity-100! hover:bg-surface-highest rounded-md transition-all flex justify-center text-on-surface-dim hover:text-green-400"
                    title="Restore Agent"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => handleHardDelete(e, agent.id)}
                    className="p-1.5 opacity-0 group-hover:opacity-100 hover:opacity-100! hover:bg-surface-highest rounded-md transition-all flex justify-center text-on-surface-dim hover:text-red-500"
                    title="Delete Permanently"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Floating Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#060e20] border border-white/10 rounded-full px-6 py-3 flex items-center gap-4 shadow-2xl animate-in slide-in-from-bottom-5">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <div className="w-px h-4 bg-white/10" />
          <button
            onClick={handleBulkRestore}
            className="flex items-center gap-2 text-sm text-green-400 hover:text-green-300 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Restore
          </button>
          <button
            onClick={handleBulkHardDelete}
            className="flex items-center gap-2 text-sm text-red-400 hover:text-red-300 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Delete Permanently
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

function WebhookTrashContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const page = parseInt(searchParams.get("page") || "1", 10);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showHardDeleteConfirm, setShowHardDeleteConfirm] = useState(false);

  const { webhooks, total, isLoading: loading, mutate } = useWebhooks({
    is_archived: true,
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

  const toggleAll = () => {
    if (selectedIds.size === webhooks.length && webhooks.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(webhooks.map((w) => w.id)));
    }
  };

  const toggleWebhook = (id: string, event?: React.MouseEvent) => {
    event?.stopPropagation();
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleBulkRestore = async () => {
    if (selectedIds.size === 0) return;
    try {
      const promises = Array.from(selectedIds).map((id) => api.webhooks.restore(id));
      await Promise.all(promises);
      toast.success(`Restored ${selectedIds.size} webhooks.`);
      setSelectedIds(new Set());
      mutate();
    } catch (err: unknown) {
      const m = err instanceof Error ? err.message : "Failed to restore webhooks";
      toast.error(m);
    }
  };

  const initiateBulkHardDelete = () => {
    if (selectedIds.size === 0) return;
    setShowHardDeleteConfirm(true);
  };

  const confirmBulkHardDelete = async () => {
    setShowHardDeleteConfirm(false);
    try {
      const promises = Array.from(selectedIds).map((id) => api.webhooks.hardDelete(id));
      await Promise.all(promises);
      toast.success(`Permanently deleted ${selectedIds.size} webhooks.`);
      setSelectedIds(new Set());
      mutate();
    } catch (err: unknown) {
      const m = err instanceof Error ? err.message : "Failed to permanently delete webhooks";
      toast.error(m);
    }
  };

  if (loading) {
    return (
      <div className="py-20 text-center text-sm text-on-surface-dim">
        Loading webhooks...
      </div>
    );
  }

  return (
    <>
      <div className="rounded-xl border border-white/5 overflow-hidden bg-surface-base relative pb-16">
        {webhooks.length === 0 ? (
          <div className="text-center py-16">
            <WebhookIcon
              className="w-10 h-10 mx-auto mb-3"
              style={{ color: "var(--on-surface-dim)", opacity: 0.4 }}
            />
            <p className="font-heading font-medium mb-1">No webhooks in trash</p>
            <p
              className="text-sm"
              style={{ color: "var(--on-surface-dim)" }}
            >
              Archived webhooks will appear here
            </p>
          </div>
        ) : (
          <>
            <div
              className="grid grid-cols-[40px_1fr_140px_160px] gap-4 px-5 py-3"
              style={{ background: "var(--surface-high)" }}
            >
              <div className="flex items-center justify-center">
                <div 
                  className="flex items-center justify-center cursor-pointer w-4 h-4 rounded border transition-colors shrink-0"
                  style={{
                    borderColor: webhooks.length > 0 && selectedIds.size === webhooks.length ? "var(--accent-cyan)" : "rgba(255,255,255,0.2)",
                    background: webhooks.length > 0 && selectedIds.size === webhooks.length ? "var(--accent-cyan)" : "var(--surface-lowest)"
                  }}
                  onClick={() => toggleAll()}
                >
                  {webhooks.length > 0 && selectedIds.size === webhooks.length && <Check className="w-3 h-3 text-[#060e20]" strokeWidth={3} />}
                </div>
              </div>
              <span className="text-[11px] font-medium uppercase tracking-[0.05rem] text-on-surface-dim">Webhook</span>
              <span className="text-[11px] font-medium uppercase tracking-[0.05rem] text-on-surface-dim">Agent Name</span>
              <span className="text-[11px] font-medium uppercase tracking-[0.05rem] text-on-surface-dim">Archived</span>
            </div>

            <div className="divide-y divide-white/5">
              {webhooks.map((webhook) => (
                <div
                  key={webhook.id}
                  className="grid grid-cols-[40px_1fr_140px_160px] gap-4 px-5 py-4 items-center hover:bg-white/5 transition-colors cursor-pointer group"
                  onClick={() => toggleWebhook(webhook.id)}
                >
                  <div className="flex items-center justify-center">
                    <div 
                      className="flex items-center justify-center cursor-pointer w-4 h-4 rounded border transition-colors shrink-0"
                      style={{
                        borderColor: selectedIds.has(webhook.id) ? "var(--accent-cyan)" : "rgba(255,255,255,0.2)",
                        background: selectedIds.has(webhook.id) ? "var(--accent-cyan)" : "var(--surface-lowest)"
                      }}
                    >
                      {selectedIds.has(webhook.id) && <Check className="w-3 h-3 text-[#060e20]" strokeWidth={3} />}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{webhook.name}</p>
                    <p className="text-xs text-on-surface-dim truncate mt-0.5">{webhook.description || "No description"}</p>
                  </div>
                  <div className="flex items-center gap-2 min-w-0 text-sm text-foreground">
                    <Bot className="w-3.5 h-3.5 text-accent-cyan shrink-0" />
                    <span className="truncate">{webhook.agentName || "Unknown"}</span>
                  </div>
                  <div className="text-sm text-on-surface-dim">
                    {webhook.archivedAt ? new Date(webhook.archivedAt).toLocaleDateString() : "-"}
                  </div>
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <div
                className="flex items-center justify-between px-5 py-3 border-t border-white/5"
                style={{ background: "var(--surface-high)" }}
              >
                <div className="text-xs text-on-surface-dim">
                  Page {page} of {totalPages}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePageChange(page - 1);
                    }}
                    disabled={page === 1}
                    className="h-8 w-8 rounded-lg bg-surface-container hover:bg-surface-lowest text-foreground disabled:opacity-50 border-0"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePageChange(page + 1);
                    }}
                    disabled={page === totalPages}
                    className="h-8 w-8 rounded-lg bg-surface-container hover:bg-surface-lowest text-foreground disabled:opacity-50 border-0"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {selectedIds.size > 0 && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 px-6 py-3 rounded-full shadow-lg transition-all duration-300 z-50 animate-slide-up"
          style={{
            background: "var(--surface-high)",
            border: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <div className="w-px h-4 bg-white/10" />
          <button
            onClick={handleBulkRestore}
            className="flex items-center gap-2 text-sm text-green-400 hover:text-green-300 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Restore
          </button>
          <button
            onClick={initiateBulkHardDelete}
            className="flex items-center gap-2 text-sm text-red-400 hover:text-red-300 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Delete Permanently
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="flex items-center gap-2 text-sm text-on-surface-dim hover:text-white transition-colors ml-2"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Hard Delete Confirmation Dialog */}
      <Dialog open={showHardDeleteConfirm} onOpenChange={setShowHardDeleteConfirm}>
        <DialogContent
          className="sm:max-w-md"
          style={{
            background: "var(--surface-high)",
            borderColor: "rgba(255,255,255,0.1)",
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-heading text-[#ffb4ab]">
              <Trash2 className="h-5 w-5" />
              Permanently Delete
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 text-sm text-foreground">
            <p>
              Are you sure you want to permanently delete <strong>{selectedIds.size}</strong> webhooks?
            </p>
            <p className="mt-2 text-on-surface-dim">
              This action cannot be undone.
            </p>
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <Button
              variant="secondary"
              onClick={() => setShowHardDeleteConfirm(false)}
              className="border-0 bg-surface-container text-foreground hover:bg-surface-lowest"
            >
              Cancel
            </Button>
            <Button
              onClick={confirmBulkHardDelete}
              className="border-0 bg-[rgba(255,180,171,0.12)] text-[#ffb4ab] hover:bg-[rgba(255,180,171,0.2)]"
            >
              Yes, Delete Permanently
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function GlobalTrashContainer() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") || "tasks";

  const handleTabChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", value);
    params.delete("page");
    router.push(`?${params.toString()}`);
  };

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

      <Tabs defaultValue="tasks" value={activeTab} onValueChange={handleTabChange} className="w-full">
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
            className="flex items-center gap-2 data-[state=active]:bg-surface-high data-[state=active]:text-foreground rounded-md px-4 py-2 font-medium transition-all"
          >
            <Bot className="w-4 h-4" />
            Agents
          </TabsTrigger>
          <TabsTrigger 
            value="webhooks" 
            className="flex items-center gap-2 data-[state=active]:bg-surface-high data-[state=active]:text-foreground rounded-md px-4 py-2 font-medium transition-all"
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
        <TabsContent value="agents" className="mt-0 outline-none">
          <Suspense
            fallback={
              <div className="text-center py-16 text-sm text-on-surface-dim">
                Loading agents...
              </div>
            }
          >
            <AgentTrashContent />
          </Suspense>
        </TabsContent>
        <TabsContent value="webhooks" className="mt-0 outline-none">
          <Suspense
            fallback={
              <div className="text-center py-16 text-sm text-on-surface-dim">
                Loading webhooks...
              </div>
            }
          >
            <WebhookTrashContent />
          </Suspense>
        </TabsContent>
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
      <Suspense fallback={<div className="py-20 text-center text-sm opacity-50">Loading interface...</div>}>
        <GlobalTrashContainer />
      </Suspense>
    </>
  );
}
