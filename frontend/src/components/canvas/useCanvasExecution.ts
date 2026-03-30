"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { Node, Edge } from "@xyflow/react";

import { api } from "@/lib/api";
import { getExecutionWebSocketUrl } from "@/lib/api";
import { parseWsMessage } from "@/lib/ws-types";
import type { AgentNodeData, ExecState } from "./constants";
import type { LogEntry } from "./ExecutionLog";

interface UseCanvasExecutionOptions {
  rootAgentId: string | undefined;
  rootAgentName: string | undefined;
  setNodes: React.Dispatch<React.SetStateAction<Node<AgentNodeData>[]>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
}

export function useCanvasExecution({
  rootAgentId,
  rootAgentName,
  setNodes,
  setEdges,
}: UseCanvasExecutionOptions) {
  /* ---- dialog state ---- */
  const [showRunDialog, setShowRunDialog] = useState(false);
  const [runInput, setRunInput] = useState("Execute your task as instructed in your system prompt.");
  const [runTitle, setRunTitle] = useState("Workflow Run");

  /* ---- execution state ---- */
  const [isExecuting, setIsExecuting] = useState(false);
  const [execLog, setExecLog] = useState<LogEntry[]>([]);
  const [execTaskId, setExecTaskId] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  /* ---- helpers ---- */
  const setNodeExecState = useCallback(
    (agentId: string, state: ExecState, output?: string) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === agentId
            ? {
                ...n,
                data: {
                  ...n.data,
                  execState: state,
                  execOutput: output ?? n.data.execOutput,
                },
              }
            : n
        )
      );
    },
    [setNodes]
  );

  const resetAllExecStates = useCallback(() => {
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        data: { ...n.data, execState: "idle" as ExecState, execOutput: "" },
      }))
    );
    setExecLog([]);
    setExecTaskId(null);
  }, [setNodes]);

  const addLog = useCallback((text: string, type = "info") => {
    setExecLog((prev) => [
      ...prev,
      { time: new Date().toLocaleTimeString(), text, type },
    ]);
  }, []);

  /* ---- run workflow ---- */
  const runWorkflow = useCallback(async () => {
    if (!runTitle.trim() || !runInput.trim()) return;
    if (!rootAgentId) return;

    setShowRunDialog(false);
    setIsExecuting(true);
    resetAllExecStates();
    addLog(`Starting workflow: "${runTitle}"`, "info");
    addLog(`Assigned to: ${rootAgentName ?? rootAgentId}`, "info");

    try {
      const task = await api.tasks.create({
        title: runTitle,
        input: runInput,
        assignedAgentId: rootAgentId,
        createdBy: "canvas",
        allowDelegation: true,
        requiresApproval: false,
      });
      setExecTaskId(task.id);
      addLog(`Task created: ${task.id}`, "info");

      await api.tasks.execute(task.id);
      addLog("Execution started, connecting to live feed...", "info");

      // Get execution to connect WebSocket
      setTimeout(async () => {
        try {
          const execution = await api.executions.getByTask(task.id);
          if (!execution) {
            addLog("Could not find execution", "error");
            return;
          }

          const wsUrl = getExecutionWebSocketUrl(execution.id);
          const ws = new WebSocket(wsUrl);
          wsRef.current = ws;

          ws.onopen = () => addLog("Connected to live feed", "info");

          ws.onmessage = (event) => {
            const msg = parseWsMessage(event);
            if (!msg) return;

            switch (msg.type) {
              case "step":
                setNodeExecState(msg.agentId, "running");
                addLog(
                  `[${msg.agentName}] ${msg.content || "Thinking..."}`,
                  "step"
                );
                break;
              case "delegation":
                setNodeExecState(msg.fromAgentId, "waiting");
                setNodeExecState(msg.toAgentId, "running");
                setEdges((eds) =>
                  eds.map((e) =>
                    e.source === msg.fromAgentId &&
                    e.target === msg.toAgentId
                      ? {
                          ...e,
                          animated: true,
                          style: { stroke: "#7bd0ff", strokeWidth: 3 },
                        }
                      : e
                  )
                );
                addLog(
                  `[${msg.fromAgent}] → Delegated to ${msg.toAgent}: "${msg.subtaskTitle}"`,
                  "delegation"
                );
                break;
              case "execution_completed":
                setNodeExecState(
                  msg.agentId,
                  "done",
                  msg.result.slice(0, 200)
                );
                addLog(`[${msg.agentName}] ✓ Completed`, "done");
                setIsExecuting(false);
                break;
              case "execution_failed":
                addLog(`✗ Execution failed: ${msg.error}`, "error");
                setIsExecuting(false);
                break;
              case "tool_call":
                setNodeExecState(msg.agentId, "running");
                addLog(
                  `[${msg.agentName}] 🔧 ${msg.tool}(${Object.values(msg.args)
                    .map((v: unknown) => String(v).slice(0, 30))
                    .join(", ")})`,
                  "step"
                );
                break;
              case "tool_result":
                addLog(
                  `[${msg.agentName}] ← ${msg.tool}: ${msg.content.slice(0, 100)}`,
                  "done"
                );
                break;
              case "waiting_approval":
                setNodeExecState(msg.agentId, "waiting");
                addLog(
                  `[${msg.agentName}] Waiting for approval`,
                  "waiting"
                );
                break;
            }
          };

          ws.onclose = () => {
            addLog("Live feed disconnected", "info");
            setIsExecuting(false);
          };
          ws.onerror = () => addLog("WebSocket error", "error");
        } catch {
          addLog("Could not connect to execution feed", "error");
        }
      }, 1000);
    } catch (err) {
      addLog(
        err instanceof Error ? err.message : "Failed to start",
        "error"
      );
      setIsExecuting(false);
    }
    setRunTitle(`${rootAgentName ?? "Workflow"} Run`);
    setRunInput("Execute your task as instructed in your system prompt.");
  }, [
    runTitle,
    runInput,
    rootAgentId,
    rootAgentName,
    resetAllExecStates,
    addLog,
    setNodeExecState,
    setEdges,
  ]);

  /* ---- cleanup WS on unmount ---- */
  useEffect(() => () => {
    wsRef.current?.close();
  }, []);

  return {
    // dialog
    showRunDialog,
    setShowRunDialog,
    runInput,
    setRunInput,
    runTitle,
    setRunTitle,
    // execution
    isExecuting,
    setIsExecuting,
    execLog,
    execTaskId,
    wsRef,
    // actions
    runWorkflow,
    resetAllExecStates,
  };
}
