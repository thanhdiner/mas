"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Bot,
  Play,
  XCircle,
  RefreshCw,
  Loader2,
  GitBranch,
  Brain,
  Zap,
  AlertTriangle,
  CheckCircle,
  Clock,
  ArrowRight,
  RotateCcw,
} from "lucide-react";
import { api, getExecutionWebSocketUrl } from "@/lib/api";
import type { TaskDetail, ExecutionStep, Execution } from "@/lib/api";
import { parseWsMessage } from "@/lib/ws-types";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import ExecutionTimeline from "@/components/execution-timeline";

const stepIcons: Record<string, typeof Brain> = {
  thinking: Brain,
  action: Zap,
  delegation: GitBranch,
  result: CheckCircle,
  error: AlertTriangle,
  waiting: Clock,
};

const stepColors: Record<string, string> = {
  thinking: "#7bd0ff",
  action: "#008abb",
  delegation: "#4edea3",
  result: "#4edea3",
  error: "#ffb4ab",
  waiting: "#f0c674",
};

export default function TaskDetailPage() {
  const params = useParams();
  const router = useRouter();
  const taskId = params.id as string;
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [steps, setSteps] = useState<ExecutionStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [execHistory, setExecHistory] = useState<Execution[]>([]);
  const [activeExecId, setActiveExecId] = useState<string | null>(null);
  const stepsEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const loadData = async () => {
    try {
      const t = await api.tasks.get(taskId);
      setTask(t);

      // Load execution history
      try {
        const history = await api.executions.listByTask(taskId);
        setExecHistory(history);
      } catch { /* no history */ }

      if (t.execution) {
        // If no active exec selected or it matches the latest, show latest
        if (!activeExecId || activeExecId === t.execution.id) {
          setActiveExecId(t.execution.id);
          const s = await api.executions.getSteps(t.execution.id);
          setSteps(s);
        }
      }
    } catch {
      // Ignore errors
    } finally {
      setLoading(false);
    }
  };

  const loadExecution = async (execId: string) => {
    setActiveExecId(execId);
    try {
      const s = await api.executions.getSteps(execId);
      setSteps(s);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    loadData();
    // Poll while running
    const interval = setInterval(() => {
      loadData();
    }, 3000);
    return () => clearInterval(interval);
  }, [taskId]);

  // WebSocket for realtime updates
  useEffect(() => {
    if (!task?.execution?.id) return;

    const wsUrl = getExecutionWebSocketUrl(task.execution.id);
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        const msg = parseWsMessage(event);
        if (!msg) return;

        if (msg.type === "step") {
          setSteps((prev) => [
            ...prev,
            {
              id: Date.now().toString(),
              executionId: task.execution!.id,
              taskId: taskId,
              agentId: msg.agentId,
              stepType: msg.stepType,
              content: msg.content,
              meta: {},
              createdAt: new Date().toISOString(),
            },
          ]);
        }
        if (
          msg.type === "execution_completed" ||
          msg.type === "execution_failed"
        ) {
          loadData();
        }
      };

      return () => {
        ws.close();
      };
    } catch {
      // WS not available
    }
  }, [task?.execution?.id]);

  useEffect(() => {
    stepsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [steps]);

  const handleExecute = async (smartRetry = false) => {
    setExecuting(true);
    try {
      await api.tasks.execute(taskId, smartRetry);
      await loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setExecuting(false);
    }
  };

  const handleCancel = async () => {
    try {
      await api.tasks.cancel(taskId);
      await loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  const handleApprove = async () => {
    try {
      await api.tasks.approve(taskId);
      await loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  const handleReject = async () => {
    try {
      await api.tasks.reject(taskId);
      await loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  if (loading) {
    return (
      <div
        className="flex items-center justify-center py-20 text-sm"
        style={{ color: "var(--on-surface-dim)" }}
      >
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading task...
      </div>
    );
  }

  if (!task) {
    return (
      <div className="text-center py-20">
        <p className="text-lg font-heading font-medium mb-4">Task not found</p>
        <Link href="/tasks">
          <Button
            variant="secondary"
            className="bg-surface-high text-foreground border-0"
          >
            Back to Tasks
          </Button>
        </Link>
      </div>
    );
  }

  const isRunning = task.status === "running";
  const canExecute =
    task.status === "queued" || task.status === "failed";
  const canCancel =
    task.status === "running" ||
    task.status === "queued" ||
    task.status === "waiting_approval";

  return (
    <>
      {/* Back button */}
      <button
        onClick={() => router.push("/tasks")}
        className="flex items-center gap-2 text-sm mb-6 transition-colors hover:text-accent-cyan"
        style={{ color: "var(--on-surface-dim)" }}
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Tasks
      </button>

      <PageHeader
        title={task.title}
        description={`Assigned to ${task.agentName || task.assignedAgentId}`}
        actions={
          <div className="flex items-center gap-3">
            <StatusBadge status={task.status} />
            {task.status === "waiting_approval" && (
              <>
                <Button
                  onClick={handleApprove}
                  className="bg-accent-teal text-[#060e20] font-medium border-0 hover:opacity-90"
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Approve
                </Button>
                <Button
                  onClick={handleReject}
                  variant="secondary"
                  className="bg-[#ffb4ab] text-[#93000a] font-medium border-0 hover:opacity-90"
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  Reject
                </Button>
              </>
            )}
            {canExecute && task.status === "failed" && task.subtasks && task.subtasks.length > 0 ? (
              /* Failed task with subtasks → show both Retry and Smart Retry */
              <>
                <Button
                  onClick={() => handleExecute(false)}
                  disabled={executing}
                  variant="secondary"
                  className="bg-surface-high text-foreground border-0 hover:bg-surface-highest"
                >
                  {executing ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <RotateCcw className="w-4 h-4 mr-2" />
                  )}
                  Retry
                </Button>
                <Button
                  onClick={() => handleExecute(true)}
                  disabled={executing}
                  className="gradient-primary text-[#060e20] font-medium border-0 hover:opacity-90"
                >
                  {executing ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Zap className="w-4 h-4 mr-2" />
                  )}
                  Smart Retry
                </Button>
              </>
            ) : canExecute ? (
              /* Queued or failed without subtasks → single Execute/Retry button */
              <Button
                onClick={() => handleExecute(false)}
                disabled={executing}
                className="gradient-primary text-[#060e20] font-medium border-0 hover:opacity-90"
              >
                {executing ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 mr-2" />
                )}
                {task.status === "failed" ? "Retry" : "Execute"}
              </Button>
            ) : null}
            {canCancel && (
              <Button
                onClick={handleCancel}
                variant="secondary"
                className="bg-surface-high text-foreground border-0 hover:bg-surface-highest"
              >
                <XCircle className="w-4 h-4 mr-2" />
                Cancel
              </Button>
            )}
            <Button
              onClick={loadData}
              variant="secondary"
              className="bg-surface-high text-foreground border-0 hover:bg-surface-highest"
              size="icon"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
        {/* Main: Execution Timeline */}
        <div className="min-w-0">
          {/* Task Input */}
          <div
            className="rounded-xl p-5 mb-6"
            style={{ background: "var(--surface-container)" }}
          >
            <h3
              className="text-[11px] font-medium uppercase tracking-[0.05rem] mb-3"
              style={{ color: "var(--on-surface-dim)" }}
            >
              Task Input
            </h3>
            <div
              className="rounded-lg p-4 text-sm whitespace-pre-wrap break-words leading-relaxed"
              style={{ background: "var(--surface-lowest)" }}
            >
              {task.input}
            </div>
          </div>

          {/* Execution Steps */}
          <div
            className="rounded-xl p-5"
            style={{ background: "var(--surface-container)" }}
          >
            <div className="flex items-center justify-between mb-5">
              <h3
                className="text-[11px] font-medium uppercase tracking-[0.05rem]"
                style={{ color: "var(--on-surface-dim)" }}
              >
                Execution Timeline
              </h3>
              {execHistory.length > 1 && (
                <select
                  value={activeExecId || ""}
                  onChange={(e) => loadExecution(e.target.value)}
                  className="text-xs rounded-md px-2 py-1 outline-none border cursor-pointer"
                  style={{
                    background: "var(--surface-lowest)",
                    color: "var(--on-surface)",
                    borderColor: "rgba(255,255,255,0.1)",
                  }}
                >
                  {execHistory.map((exec, i) => (
                    <option key={exec.id} value={exec.id}>
                      Run #{execHistory.length - i}{" "}
                      {exec.status === "completed" ? "✅" : exec.status === "failed" ? "❌" : "🔄"}{" "}
                      {new Date(exec.startedAt).toLocaleString()}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <ExecutionTimeline steps={steps} isRunning={isRunning} />
          </div>

          {/* Result */}
          {task.result && (
            <div
              className="rounded-xl p-5 mt-6"
              style={{ background: "var(--surface-container)" }}
            >
              <h3
                className="text-[11px] font-medium uppercase tracking-[0.05rem] mb-3"
                style={{ color: "var(--accent-teal)" }}
              >
                Final Result
              </h3>
              <div
                className="rounded-lg p-4 text-sm whitespace-pre-wrap break-words leading-relaxed"
                style={{ background: "var(--surface-lowest)" }}
              >
                {task.result}
              </div>
            </div>
          )}

          {/* Error */}
          {task.error && (
            <div
              className="rounded-xl p-5 mt-6 relative"
              style={{
                background: "var(--surface-container)",
                borderTop: "4px solid #93000a",
              }}
            >
              <h3
                className="text-[11px] font-medium uppercase tracking-[0.05rem] mb-3 flex items-center gap-2"
                style={{ color: "#ffb4ab" }}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                Error
              </h3>
              <div
                className="rounded-lg p-4 text-sm whitespace-pre-wrap break-words leading-relaxed font-mono"
                style={{ background: "var(--surface-lowest)" }}
              >
                {task.error}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar: Task Info + Delegation Chain */}
        <div className="space-y-6">
          {/* Task Info */}
          <div
            className="rounded-xl p-5"
            style={{ background: "var(--surface-container)" }}
          >
            <h3
              className="text-[11px] font-medium uppercase tracking-[0.05rem] mb-4"
              style={{ color: "var(--on-surface-dim)" }}
            >
              Task Info
            </h3>
            <div className="space-y-3">
              <InfoRow
                label="Status"
                value={<StatusBadge status={task.status} />}
              />
              <InfoRow
                label="Agent"
                value={
                  <span className="text-sm">
                    {task.agentName || task.assignedAgentId}
                  </span>
                }
              />
              <InfoRow
                label="Created"
                value={
                  <span className="text-sm">
                    {new Date(task.createdAt).toLocaleString()}
                  </span>
                }
              />
              <InfoRow
                label="Created By"
                value={<span className="text-sm">{task.createdBy}</span>}
              />
              <InfoRow
                label="Delegation"
                value={
                  <span className="text-sm">
                    {task.allowDelegation ? "Allowed" : "Disabled"}
                  </span>
                }
              />
              <InfoRow
                label="Approval"
                value={
                  <span className="text-sm">
                    {task.requiresApproval ? "Required" : "Not required"}
                  </span>
                }
              />
            </div>
          </div>

          {/* Execution Info */}
          {task.execution && (
            <div
              className="rounded-xl p-5"
              style={{ background: "var(--surface-container)" }}
            >
              <h3
                className="text-[11px] font-medium uppercase tracking-[0.05rem] mb-4"
                style={{ color: "var(--on-surface-dim)" }}
              >
                Execution
              </h3>
              <div className="space-y-3">
                <InfoRow
                  label="Status"
                  value={
                    <span className="text-sm">{task.execution.status}</span>
                  }
                />
                <InfoRow
                  label="Started"
                  value={
                    <span className="text-sm">
                      {new Date(task.execution.startedAt).toLocaleTimeString()}
                    </span>
                  }
                />
                {task.execution.endedAt && (
                  <InfoRow
                    label="Ended"
                    value={
                      <span className="text-sm">
                        {new Date(
                          task.execution.endedAt
                        ).toLocaleTimeString()}
                      </span>
                    }
                  />
                )}
                <InfoRow
                  label="Steps"
                  value={
                    <span className="text-sm font-heading font-semibold text-accent-cyan">
                      {steps.length}
                    </span>
                  }
                />
              </div>
            </div>
          )}

          {/* Delegation Chain (Subtasks) */}
          {task.subtasks.length > 0 && (
            <div
              className="rounded-xl p-5"
              style={{ background: "var(--surface-container)" }}
            >
              <h3
                className="text-[11px] font-medium uppercase tracking-[0.05rem] mb-4 flex items-center gap-2"
                style={{ color: "var(--on-surface-dim)" }}
              >
                <GitBranch className="w-3.5 h-3.5" />
                Delegation Chain
              </h3>
              <div className="space-y-2">
                {task.subtasks.map((sub) => (
                  <Link
                    href={`/tasks/${sub.id}`}
                    key={sub.id}
                    className="flex items-center gap-3 p-3 rounded-lg transition-colors hover:bg-surface-high"
                  >
                    <Bot
                      className="w-4 h-4 shrink-0"
                      style={{ color: "var(--accent-teal)" }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {sub.title}
                      </p>
                      <p
                        className="text-[11px]"
                        style={{ color: "var(--on-surface-dim)" }}
                      >
                        {sub.agentName || sub.assignedAgentId}
                      </p>
                    </div>
                    <StatusBadge status={sub.status} />
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Parent Task Link */}
          {task.parentTaskId && (
            <Link
              href={`/tasks/${task.parentTaskId}`}
              className="flex items-center gap-3 p-4 rounded-xl transition-colors hover:bg-surface-high"
              style={{ background: "var(--surface-container)" }}
            >
              <ArrowLeft
                className="w-4 h-4"
                style={{ color: "var(--on-surface-dim)" }}
              />
              <span className="text-sm">View Parent Task</span>
            </Link>
          )}
        </div>
      </div>
    </>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <span
        className="text-[11px] uppercase tracking-[0.05rem]"
        style={{ color: "var(--on-surface-dim)" }}
      >
        {label}
      </span>
      {value}
    </div>
  );
}
