"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Bot,
  Clock,
  Eye,
  AlertTriangle,
} from "lucide-react";
import { api, Task, TaskDetail } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function ApprovalsPage() {
  const [pending, setPending] = useState<Task[]>([]);
  const [history, setHistory] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<TaskDetail | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);
  const [tab, setTab] = useState<"pending" | "history">("pending");

  const fetchData = useCallback(async () => {
    try {
      const [pendingTasks, allTasks] = await Promise.all([
        api.tasks.list({ status: "waiting_approval" }),
        api.tasks.list({}),
      ]);
      setPending(pendingTasks);
      // History = recently completed/failed tasks that had requiresApproval
      setHistory(
        allTasks
          .filter(
            (t) =>
              t.requiresApproval &&
              (t.status === "done" || t.status === "failed") 
          )
          .slice(0, 20)
      );
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleApprove = async (taskId: string) => {
    setProcessing(taskId);
    try {
      await api.tasks.approve(taskId);
      fetchData();
    } catch (err) {
      console.error(err);
    }
    setProcessing(null);
  };

  const handleReject = async (taskId: string) => {
    setProcessing(taskId);
    try {
      await api.tasks.reject(taskId);
      fetchData();
    } catch (err) {
      console.error(err);
    }
    setProcessing(null);
  };

  const openPreview = async (taskId: string) => {
    try {
      const detail = await api.tasks.get(taskId);
      setSelectedTask(detail);
    } catch {}
  };

  return (
    <>
      <PageHeader
        title="Approvals"
        description="Review and approve agent outputs before they are finalized"
      />

      {/* Tab selector */}
      <div className="flex gap-1 mb-6 p-1 rounded-lg w-fit" style={{ background: "var(--surface-container)" }}>
        <button
          onClick={() => setTab("pending")}
          className="px-4 py-2 rounded-md text-sm font-medium transition-all"
          style={{
            background: tab === "pending" ? "rgba(123,208,255,0.12)" : "transparent",
            color: tab === "pending" ? "#7bd0ff" : "var(--on-surface-dim)",
          }}
        >
          <ShieldCheck className="w-4 h-4 inline mr-1.5 -mt-0.5" />
          Pending ({pending.length})
        </button>
        <button
          onClick={() => setTab("history")}
          className="px-4 py-2 rounded-md text-sm font-medium transition-all"
          style={{
            background: tab === "history" ? "rgba(123,208,255,0.12)" : "transparent",
            color: tab === "history" ? "#7bd0ff" : "var(--on-surface-dim)",
          }}
        >
          <Clock className="w-4 h-4 inline mr-1.5 -mt-0.5" />
          History ({history.length})
        </button>
      </div>

      {/* Pending approvals */}
      {tab === "pending" && (
        <>
          {loading ? (
            <div className="text-center py-20 text-sm" style={{ color: "var(--on-surface-dim)" }}>Loading...</div>
          ) : pending.length === 0 ? (
            <div className="text-center py-20 rounded-xl" style={{ background: "var(--surface-container)" }}>
              <CheckCircle2 className="w-12 h-12 mx-auto mb-4 text-accent-teal" style={{ opacity: 0.4 }} />
              <p className="text-lg font-heading font-medium mb-2">All clear!</p>
              <p className="text-sm" style={{ color: "var(--on-surface-dim)" }}>
                No tasks are waiting for your approval
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {pending.map((task, i) => (
                <div
                  key={task.id}
                  className="rounded-xl p-5 transition-all duration-200 animate-slide-in relative overflow-hidden group"
                  style={{
                    background: "var(--surface-base)",
                    border: "1px solid rgba(240, 198, 116, 0.15)",
                    animationDelay: `${i * 50}ms`,
                  }}
                >
                  {/* Warning accent */}
                  <div
                    className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl"
                    style={{ background: "linear-gradient(180deg, #f0c674, #e6a817)" }}
                  />

                  <div className="flex items-start gap-4">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                      style={{
                        background: "rgba(240, 198, 116, 0.1)",
                        border: "1px solid rgba(240, 198, 116, 0.2)",
                      }}
                    >
                      <AlertTriangle className="w-5 h-5" style={{ color: "#f0c674" }} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <h3 className="font-heading text-sm font-semibold text-foreground truncate">
                        {task.title}
                      </h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Bot className="w-3 h-3" style={{ color: "var(--on-surface-dim)" }} />
                        <span className="text-xs" style={{ color: "var(--on-surface-dim)" }}>
                          {task.agentName || "Agent"}
                        </span>
                        <span className="text-[10px]" style={{ color: "var(--on-surface-dim)" }}>
                          {new Date(task.createdAt).toLocaleString()}
                        </span>
                      </div>

                      {/* Result preview */}
                      {task.result && (
                        <div
                          className="mt-3 p-3 rounded-lg text-xs leading-relaxed line-clamp-3"
                          style={{
                            background: "var(--surface-container)",
                            color: "var(--on-surface-dim)",
                          }}
                        >
                          {task.result}
                        </div>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openPreview(task.id)}
                        className="text-on-surface-dim hover:text-foreground"
                      >
                        <Eye className="w-4 h-4 mr-1" /> View
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleReject(task.id)}
                        disabled={processing === task.id}
                        className="bg-[#93000a]/20 text-[#ffb4ab] hover:bg-[#93000a]/30 border-0"
                      >
                        <XCircle className="w-4 h-4 mr-1" /> Reject
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleApprove(task.id)}
                        disabled={processing === task.id}
                        className="gradient-primary text-[#060e20] font-semibold border-0"
                      >
                        <CheckCircle2 className="w-4 h-4 mr-1" /> Approve
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* History tab */}
      {tab === "history" && (
        <>
          {history.length === 0 ? (
            <div className="text-center py-20 rounded-xl" style={{ background: "var(--surface-container)" }}>
              <Clock className="w-12 h-12 mx-auto mb-4" style={{ color: "var(--on-surface-dim)", opacity: 0.4 }} />
              <p className="text-lg font-heading font-medium mb-2">No review history</p>
              <p className="text-sm" style={{ color: "var(--on-surface-dim)" }}>
                Tasks requiring approval will appear here after review
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {history.map((task, i) => (
                <div
                  key={task.id}
                  className="rounded-lg p-4 flex items-center gap-4 animate-slide-in"
                  style={{
                    background: "var(--surface-base)",
                    border: "1px solid rgba(255,255,255,0.05)",
                    animationDelay: `${i * 30}ms`,
                  }}
                >
                  {task.status === "done" ? (
                    <CheckCircle2 className="w-5 h-5 text-accent-teal shrink-0" />
                  ) : (
                    <XCircle className="w-5 h-5 shrink-0" style={{ color: "#ffb4ab" }} />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{task.title}</p>
                    <p className="text-[11px]" style={{ color: "var(--on-surface-dim)" }}>
                      {new Date(task.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <span
                    className="text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider"
                    style={{
                      background: task.status === "done" ? "rgba(0,200,150,0.1)" : "rgba(255,180,171,0.1)",
                      color: task.status === "done" ? "#00c896" : "#ffb4ab",
                    }}
                  >
                    {task.status === "done" ? "Approved" : "Rejected"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Detail Preview Dialog */}
      <Dialog open={!!selectedTask} onOpenChange={(open) => { if (!open) setSelectedTask(null); }}>
        <DialogContent className="sm:max-w-2xl" style={{ background: "var(--surface-high)", borderColor: "rgba(255,255,255,0.1)" }}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-heading">
              <ShieldCheck className="w-5 h-5" style={{ color: "#f0c674" }} />
              Review Task Output
            </DialogTitle>
          </DialogHeader>
          {selectedTask && (
            <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
              <div>
                <h4 className="text-xs text-on-surface-dim uppercase tracking-wider font-bold mb-1">Task</h4>
                <p className="text-sm font-semibold">{selectedTask.title}</p>
              </div>
              <div>
                <h4 className="text-xs text-on-surface-dim uppercase tracking-wider font-bold mb-1">Input</h4>
                <div className="text-sm p-3 rounded-lg" style={{ background: "var(--surface-container)" }}>
                  {selectedTask.input}
                </div>
              </div>
              <div>
                <h4 className="text-xs text-on-surface-dim uppercase tracking-wider font-bold mb-1">Agent Output</h4>
                <div className="text-sm p-3 rounded-lg whitespace-pre-wrap leading-relaxed" style={{ background: "var(--surface-container)" }}>
                  {selectedTask.result || "No output yet."}
                </div>
              </div>

              {selectedTask.status === "waiting_approval" && (
                <div className="flex gap-2 pt-4 border-t border-white/[0.05]">
                  <Button
                    onClick={() => { handleReject(selectedTask.id); setSelectedTask(null); }}
                    className="bg-[#93000a]/20 text-[#ffb4ab] hover:bg-[#93000a]/30 border-0 flex-1"
                  >
                    <XCircle className="w-4 h-4 mr-1.5" /> Reject
                  </Button>
                  <Button
                    onClick={() => { handleApprove(selectedTask.id); setSelectedTask(null); }}
                    className="gradient-primary text-[#060e20] font-semibold border-0 flex-1"
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1.5" /> Approve
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
