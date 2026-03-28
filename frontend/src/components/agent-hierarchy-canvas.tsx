"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { ReactFlow, Background, BackgroundVariant, Controls, MiniMap, Panel, useNodesState, useEdgesState, addEdge, ConnectionMode } from "@xyflow/react";
import type { Node, Edge, Connection, OnConnect, NodeTypes, EdgeTypes } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import Link from "next/link";
import { Play, Square, Loader2, Save, Undo2, LayoutGrid, AlertTriangle, Plus, GitBranch, X, Bot, Info, Unlink } from "lucide-react";

import { api, type Agent } from "@/lib/api";
import { hasHierarchyCycle, sanitizeAllowedSubAgents } from "@/lib/agent-hierarchy";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";

import { NODE_COLORS, type AgentNodeData, type ExecState } from "./canvas/constants";
import { loadPositions, savePositions, buildNodesAndEdges } from "./canvas/utils";
import { getExecutionWebSocketUrl } from "@/lib/api";
import { AgentNode } from "./canvas/AgentNode";
import { DeletableEdge } from "./canvas/DeletableEdge";
import { SidebarInspector } from "./canvas/SidebarInspector";
import { RunWorkflowDialog } from "./canvas/RunWorkflowDialog";
import { ExecutionLog, type LogEntry } from "./canvas/ExecutionLog";

const nodeTypes: NodeTypes = { n8nNode: AgentNode };
const edgeTypes: EdgeTypes = { deletableEdge: DeletableEdge };

export function AgentHierarchyCanvas() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const savedPositionsRef = useRef<Record<string, { x: number; y: number }>>({});

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<AgentNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  /* ---- execution state ---- */
  const [showRunDialog, setShowRunDialog] = useState(false);
  const [runInput, setRunInput] = useState("");
  const [runTitle, setRunTitle] = useState("");
  const [isExecuting, setIsExecuting] = useState(false);
  const [execLog, setExecLog] = useState<LogEntry[]>([]);
  const [execTaskId, setExecTaskId] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const selectedAgent = useMemo(
    () => agents.find((a) => a.id === selectedNodeId) ?? null,
    [agents, selectedNodeId]
  );

  /* ---- helper: update single node exec state ---- */
  const setNodeExecState = useCallback((agentId: string, state: ExecState, output?: string) => {
    setNodes((nds) => nds.map((n) => 
      n.id === agentId 
        ? { ...n, data: { ...n.data, execState: state, execOutput: output ?? n.data.execOutput } }
        : n
    ));
  }, [setNodes]);

  const resetAllExecStates = useCallback(() => {
    setNodes((nds) => nds.map((n) => ({
      ...n,
      data: { ...n.data, execState: "idle" as ExecState, execOutput: "" },
    })));
    setExecLog([]);
    setExecTaskId(null);
  }, [setNodes]);

  const addLog = useCallback((text: string, type = "info") => {
    setExecLog((prev) => [...prev, { time: new Date().toLocaleTimeString(), text, type }]);
  }, []);

  /* ---- find root agents (no parent in current edges) ---- */
  const rootAgents = useMemo(() => {
    const targets = new Set(edges.map((e) => e.target));
    return agents.filter((a) => !targets.has(a.id));
  }, [agents, edges]);

  /* ---- run workflow ---- */
  const runWorkflow = useCallback(async () => {
    if (!runTitle.trim() || !runInput.trim()) return;
    const rootAgent = rootAgents[0];
    if (!rootAgent) { setLoadError("No root agent found."); return; }

    setShowRunDialog(false);
    setIsExecuting(true);
    resetAllExecStates();
    addLog(`Starting workflow: "${runTitle}"`, "info");
    addLog(`Assigned to: ${rootAgent.name}`, "info");

    try {
      const task = await api.tasks.create({
        title: runTitle,
        input: runInput,
        assignedAgentId: rootAgent.id,
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
          if (!execution) { addLog("Could not find execution", "error"); return; }

          const wsUrl = getExecutionWebSocketUrl(execution.id);
          const ws = new WebSocket(wsUrl);
          wsRef.current = ws;

          ws.onopen = () => addLog("Connected to live feed", "info");

          ws.onmessage = (event) => {
            try {
              const msg = JSON.parse(event.data);
              switch (msg.type) {
                case "step":
                  if (msg.agentId) setNodeExecState(msg.agentId, "running");
                  addLog(`[${msg.agentName || "Agent"}] ${msg.content || "Thinking..."}`, "step");
                  break;
                case "delegation":
                  if (msg.fromAgentId) setNodeExecState(msg.fromAgentId, "waiting");
                  if (msg.toAgentId) setNodeExecState(msg.toAgentId, "running");
                  // Animate edge between from → to
                  setEdges((eds) => eds.map((e) =>
                    e.source === msg.fromAgentId && e.target === msg.toAgentId
                      ? { ...e, animated: true, style: { stroke: "#7bd0ff", strokeWidth: 3 } }
                      : e
                  ));
                  addLog(`[${msg.fromAgent}] → Delegated to ${msg.toAgent}: "${msg.subtaskTitle}"`, "delegation");
                  break;
                case "execution_completed":
                  if (msg.agentId) setNodeExecState(msg.agentId, "done", msg.result?.slice(0, 200));
                  addLog(`[${msg.agentName || "Agent"}] ✓ Completed`, "done");
                  setIsExecuting(false);
                  break;
                case "execution_failed":
                  addLog(`✗ Execution failed: ${msg.error}`, "error");
                  setIsExecuting(false);
                  break;
                case "tool_call":
                  if (msg.agentId) setNodeExecState(msg.agentId, "running");
                  addLog(`[${msg.agentName}] 🔧 ${msg.tool}(${Object.values(msg.args || {}).map((v: unknown) => String(v).slice(0, 30)).join(", ")})`, "step");
                  break;
                case "tool_result":
                  addLog(`[${msg.agentName}] ← ${msg.tool}: ${(msg.content || "").slice(0, 100)}`, "done");
                  break;
                case "waiting_approval":
                  if (msg.agentId) setNodeExecState(msg.agentId, "waiting");
                  addLog(`[${msg.agentName}] Waiting for approval`, "waiting");
                  break;
              }
            } catch {}
          };

          ws.onclose = () => {
            addLog("Live feed disconnected", "info");
            if (isExecuting) setIsExecuting(false);
          };
          ws.onerror = () => addLog("WebSocket error", "error");
        } catch {
          addLog("Could not connect to execution feed", "error");
        }
      }, 1000);

    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to start");
      setIsExecuting(false);
    }
    setRunTitle("");
    setRunInput("");
  }, [runTitle, runInput, rootAgents, resetAllExecStates, addLog, setNodeExecState, setEdges, isExecuting]);

  // Cleanup WS on unmount
  useEffect(() => () => { wsRef.current?.close(); }, []);

  /* ---- listen for dirty events from custom edge delete ---- */
  useEffect(() => {
    const handler = () => setIsDirty(true);
    window.addEventListener("canvas-dirty", handler);
    return () => window.removeEventListener("canvas-dirty", handler);
  }, []);

  /* ---- load ---- */
  useEffect(() => {
    savedPositionsRef.current = loadPositions();
    api.agents
      .list()
      .then((items) => {
        setAgents(items);
        const { nodes: n, edges: e } = buildNodesAndEdges(items, selectedNodeId, savedPositionsRef.current);
        setNodes(n);
        setEdges(e);
      })
      .catch((err: Error) => setLoadError(err.message || "Failed to load agents."))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- highlight selection ---- */
  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        data: { ...n.data, isSelected: n.id === selectedNodeId },
      }))
    );

    setEdges((eds) =>
      eds.map((e) => {
        const connected = e.source === selectedNodeId || e.target === selectedNodeId;
        return { ...e, animated: connected, selected: false };
      })
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodeId, setNodes, setEdges]); // Removed self-reference loop risk

  /* ---- connection validation (prevent cycles) ---- */
  const isValidConnection = useCallback(
    (connection: Edge | Connection) => {
      const src = connection.source;
      const tgt = connection.target;
      if (!src || !tgt) return false;
      if (src === tgt) return false;

      // Check duplicates
      const exists = edges.some(
        (e) => e.source === src && e.target === tgt
      );
      if (exists) return false;

      // Check reverse (bidirectional)
      const reverseExists = edges.some(
        (e) => e.source === tgt && e.target === src
      );
      if (reverseExists) return false;

      // Check cycles: build temp adjacency and run DFS
      const adjMap: Record<string, string[]> = {};
      for (const a of agents) adjMap[a.id] = [];
      for (const e of edges) {
        if (adjMap[e.source]) adjMap[e.source].push(e.target);
      }
      if (!adjMap[src]) adjMap[src] = [];
      adjMap[src].push(tgt);

      return !hasHierarchyCycle(adjMap);
    },
    [edges, agents]
  );

  /* ---- callbacks ---- */
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNodeId((prev) => (prev === node.id ? null : node.id));
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            type: "deletableEdge",
          },
          eds
        )
      );
      setIsDirty(true);
      setStatusMessage("");
    },
    [setEdges]
  );

  const onEdgesDelete = useCallback(() => {
    setIsDirty(true);
  }, []);

  const onNodeDragStop = useCallback((_: React.MouseEvent, node: Node) => {
    savedPositionsRef.current[node.id] = node.position;
    savePositions(savedPositionsRef.current);
  }, []);

  const autoLayout = useCallback(() => {
    savedPositionsRef.current = {};
    savePositions({});
    const { nodes: n, edges: e } = buildNodesAndEdges(agents, selectedNodeId, {});
    setNodes(n);
    setEdges(e);
  }, [agents, selectedNodeId, setNodes, setEdges]);

  const disconnectSelected = useCallback(() => {
    if (!selectedNodeId) return;
    setEdges((eds) =>
      eds.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId)
    );
    setIsDirty(true);
    setStatusMessage("");
  }, [selectedNodeId, setEdges]);

  const removeEdgeBetween = useCallback(
    (sourceId: string, targetId: string) => {
      setEdges((eds) =>
        eds.filter((e) => !(e.source === sourceId && e.target === targetId))
      );
      setIsDirty(true);
      setStatusMessage("");
    },
    [setEdges]
  );

  const revertChanges = useCallback(() => {
    const { nodes: n, edges: e } = buildNodesAndEdges(
      agents,
      selectedNodeId,
      savedPositionsRef.current
    );
    setNodes(n);
    setEdges(e);
    setIsDirty(false);
    setStatusMessage("");
    setLoadError("");
  }, [agents, selectedNodeId, setNodes, setEdges]);

  /* ---- save ---- */
  const saveHierarchy = useCallback(async () => {
    setSaving(true);
    setLoadError("");
    setStatusMessage("");

    try {
      const subAgentsMap: Record<string, string[]> = {};
      for (const agent of agents) subAgentsMap[agent.id] = [];
      for (const edge of edges) {
        if (subAgentsMap[edge.source]) subAgentsMap[edge.source].push(edge.target);
      }

      if (hasHierarchyCycle(subAgentsMap)) {
        throw new Error("Cycle detected — remove a connection to break the loop.");
      }

      const knownIds = new Set(agents.map((a) => a.id));
      const changed: { id: string; subs: string[] }[] = [];
      for (const agent of agents) {
        const oldSubs = new Set(sanitizeAllowedSubAgents(agent, knownIds));
        const newSubs = subAgentsMap[agent.id] ?? [];
        const newSet = new Set(newSubs);
        if (oldSubs.size !== newSet.size || [...oldSubs].some((s) => !newSet.has(s))) {
          changed.push({ id: agent.id, subs: newSubs });
        }
      }

      for (const item of changed) {
        await api.agents.update(item.id, { allowedSubAgents: item.subs });
      }

      const updated = await api.agents.list();
      setAgents(updated);

      for (const n of nodes) savedPositionsRef.current[n.id] = n.position;
      savePositions(savedPositionsRef.current);

      const { nodes: nn, edges: ne } = buildNodesAndEdges(
        updated,
        selectedNodeId,
        savedPositionsRef.current
      );
      setNodes(nn);
      setEdges(ne);
      setIsDirty(false);
      setStatusMessage(`Saved — ${changed.length} agent(s) updated.`);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }, [agents, edges, nodes, selectedNodeId, setNodes, setEdges]);

  /* ---- hierarchy info (reactive to current edges, not just DB) ---- */
  const hierarchyInfo = useMemo(() => {
    if (!selectedNodeId || agents.length === 0) return null;

    // Build from CURRENT edges (includes unsaved changes)
    const parentEdge = edges.find((e) => e.target === selectedNodeId);
    const parent = parentEdge
      ? agents.find((a) => a.id === parentEdge.source) ?? null
      : null;

    const children = edges
      .filter((e) => e.source === selectedNodeId)
      .map((e) => agents.find((a) => a.id === e.target))
      .filter(Boolean) as Agent[];

    // Input edges (edges where this node is the target)
    const inputEdges = edges.filter((e) => e.target === selectedNodeId);
    const inputs = inputEdges
      .map((e) => agents.find((a) => a.id === e.source))
      .filter(Boolean) as Agent[];

    return { parent, children, inputs };
  }, [selectedNodeId, agents, edges]);

  /* ---------- render ---------- */
  return (
    <>
      <PageHeader
        title="Agent Canvas"
        description="Visual workflow — connect agents to define delegation chains."
        actions={
          <>
            {!isExecuting ? (
              <Button
                onClick={() => setShowRunDialog(true)}
                className="border-0 font-medium text-white hover:opacity-90"
                style={{ background: "linear-gradient(135deg, #4edea3, #00c853)" }}
                disabled={agents.length === 0}
              >
                <Play className="mr-2 h-4 w-4" />
                Run Workflow
              </Button>
            ) : (
              <Button
                onClick={() => { wsRef.current?.close(); setIsExecuting(false); }}
                className="border-0 font-medium text-white hover:opacity-90"
                style={{ background: "#ff6d5a" }}
              >
                <Square className="mr-2 h-4 w-4" />
                Stop
              </Button>
            )}
            <Link href="/agents">
              <Button variant="secondary" className="border-0 bg-surface-high text-foreground">
                <GitBranch className="mr-2 h-4 w-4" />
                All Agents
              </Button>
            </Link>
            <Link href="/agents/new">
              <Button className="gradient-primary border-0 font-medium text-[#060e20] hover:opacity-90">
                <Plus className="mr-2 h-4 w-4" />
                New Agent
              </Button>
            </Link>
          </>
        }
      />

      {/* Banners */}
      {(loadError || statusMessage) && (
        <div className="mb-3 space-y-2">
          {loadError && (
            <div className="flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm" style={{ background: "rgba(255,180,171,0.12)", color: "#ffb4ab" }}>
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <p className="flex-1">{loadError}</p>
              <button onClick={() => setLoadError("")}><X className="h-4 w-4" /></button>
            </div>
          )}
          {statusMessage && (
            <div className="flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm" style={{ background: "rgba(78,222,163,0.12)", color: "#4edea3" }}>
              <p className="flex-1">{statusMessage}</p>
              <button onClick={() => setStatusMessage("")}><X className="h-4 w-4" /></button>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center rounded-2xl py-24 text-sm" style={{ background: "#1a1d26", color: "rgba(232,234,237,0.5)" }}>
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading canvas...
        </div>
      ) : agents.length === 0 ? (
        <div className="rounded-2xl px-6 py-20 text-center" style={{ background: "#1a1d26" }}>
          <Bot className="mx-auto mb-4 h-12 w-12" style={{ color: "rgba(232,234,237,0.3)" }} />
          <p className="font-heading text-xl font-semibold" style={{ color: "#e8eaed" }}>No agents yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm" style={{ color: "rgba(232,234,237,0.5)" }}>
            Create agents to start building your workflow.
          </p>
          <Link href="/agents/new" className="mt-6 inline-flex">
            <Button className="gradient-primary border-0 font-medium text-[#060e20] hover:opacity-90">
              <Plus className="mr-2 h-4 w-4" />
              Create Agent
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-0 xl:grid-cols-[1fr_300px]">
          {/* ---- Canvas ---- */}
          <div
            className="rounded-l-2xl xl:rounded-r-none rounded-r-2xl xl:border-r-0 border border-white/5 overflow-hidden"
            style={{ background: "#1a1d26", height: "calc(100vh - 190px)", minHeight: "560px" }}
          >
            {/* CSS for edge delete button hover */}
            <style>{`
              .react-flow__edge:hover .edge-delete-btn,
              .react-flow__edge.selected .edge-delete-btn {
                opacity: 1 !important;
                pointer-events: auto !important;
              }
              .edge-delete-btn {
                opacity: 0;
                transition: opacity 0.15s ease;
              }
              .react-flow__connection-line {
                stroke: #7bd0ff !important;
                stroke-width: 2 !important;
                stroke-dasharray: 5 5;
              }
              .react-flow__edge.selected path:first-of-type ~ path {
                stroke: #7bd0ff !important;
              }
            `}</style>

            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onEdgesDelete={onEdgesDelete}
              onNodeClick={onNodeClick}
              onPaneClick={onPaneClick}
              onNodeDragStop={onNodeDragStop}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              isValidConnection={isValidConnection}
              connectionMode={ConnectionMode.Loose}
              fitView
              fitViewOptions={{ padding: 0.2, maxZoom: 1.5 }}
              defaultEdgeOptions={{ type: "deletableEdge" }}
              deleteKeyCode={["Backspace", "Delete"]}
              proOptions={{ hideAttribution: true }}
              style={{ background: "transparent" }}
              connectionLineStyle={{
                stroke: "#7bd0ff",
                strokeWidth: 2,
                strokeDasharray: "5 5",
              }}
            >
              <Background
                variant={BackgroundVariant.Dots}
                gap={16}
                size={1}
                color="rgba(255,255,255,0.04)"
              />
              <Controls
                showInteractive={false}
                className="!bg-[#2a2e3a] !border-white/10 !rounded-lg !shadow-xl [&>button]:!bg-transparent [&>button]:!border-white/5 [&>button]:!text-white/50 [&>button:hover]:!bg-white/10 [&>button:hover]:!text-white"
              />
              <MiniMap
                nodeColor={() => "rgba(123,208,255,0.4)"}
                maskColor="rgba(26,29,38,0.9)"
                className="!bg-[#2a2e3a] !rounded-lg !border-white/10"
                pannable
                zoomable
              />

              {/* Top-right toolbar */}
              <Panel position="top-right" className="flex items-center gap-2">
                {selectedAgent && (
                  <button
                    onClick={disconnectSelected}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors hover:brightness-125"
                    style={{ background: "#2a2e3a", color: "#ffb4ab" }}
                    title="Disconnect all"
                  >
                    <Unlink className="h-3.5 w-3.5" />
                    Disconnect
                  </button>
                )}

                <button
                  onClick={autoLayout}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors hover:brightness-125"
                  style={{ background: "#2a2e3a", color: "#e8eaed" }}
                  title="Auto-arrange"
                >
                  <LayoutGrid className="h-3.5 w-3.5" style={{ color: "#7bd0ff" }} />
                  Tidy Up
                </button>

                {isDirty && (
                  <>
                    <button
                      onClick={revertChanges}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors hover:brightness-125"
                      style={{ background: "#2a2e3a", color: "#e8eaed" }}
                      title="Revert unsaved changes"
                    >
                      <Undo2 className="h-3.5 w-3.5" />
                      Revert
                    </button>
                    <button
                      onClick={saveHierarchy}
                      disabled={saving}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors hover:brightness-110"
                      style={{ background: "#ff6d5a", color: "#fff" }}
                    >
                      {saving ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Save className="h-3.5 w-3.5" />
                      )}
                      Save
                    </button>
                  </>
                )}
              </Panel>

              {/* Bottom hint */}
              <Panel position="bottom-center">
                <div
                  className="rounded-lg px-4 py-1.5 text-[10px] flex items-center gap-3"
                  style={{ background: "#2a2e3a", color: "rgba(232,234,237,0.45)" }}
                >
                  <span>Drag to move</span>
                  <span className="w-px h-2.5 bg-white/10" />
                  <span>Pull handle → connect</span>
                  <span className="w-px h-2.5 bg-white/10" />
                  <span>Hover edge → × to delete</span>
                  <span className="w-px h-2.5 bg-white/10" />
                  <span>Scroll to zoom</span>
                </div>
              </Panel>
            </ReactFlow>
          </div>

          {/* ---- Sidebar Inspector (n8n-style tabbed) ---- */}
          <div
            className="rounded-r-2xl border border-l-0 border-white/5 flex flex-col overflow-hidden"
            style={{ background: "#1f222c", height: "calc(100vh - 190px)", minHeight: "560px" }}
          >
            {!selectedAgent ? (
              <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-3" style={{ background: "rgba(255,255,255,0.04)" }}>
                  <Info className="h-5 w-5" style={{ color: "rgba(232,234,237,0.25)" }} />
                </div>
                <p className="text-sm font-medium" style={{ color: "rgba(232,234,237,0.5)" }}>Select a node</p>
                <p className="text-[11px] mt-1" style={{ color: "rgba(232,234,237,0.3)" }}>Click any agent to configure.</p>
              </div>
            ) : (
              <SidebarInspector
                key={selectedAgent.id}
                agent={selectedAgent}
                agents={agents}
                edges={edges}
                selectedNodeId={selectedNodeId!}
                setSelectedNodeId={setSelectedNodeId}
                disconnectSelected={disconnectSelected}
                removeEdgeBetween={removeEdgeBetween}
                hierarchyInfo={hierarchyInfo}
                colorIndex={agents.findIndex((a) => a.id === selectedAgent.id) % NODE_COLORS.length}
                onAgentUpdated={(updated) => {
                  setAgents((prev) => prev.map((a) => a.id === updated.id ? updated : a));
                  setNodes((nds) => nds.map((n) => n.id === updated.id ? { ...n, data: { ...n.data, agent: updated } } : n));
                }}
              />
            )}
          </div>
        </div>
      )}

      {/* ---- Run Dialog Modal ---- */}
      <RunWorkflowDialog
        showDialog={showRunDialog}
        setShowDialog={setShowRunDialog}
        runTitle={runTitle}
        setRunTitle={setRunTitle}
        runInput={runInput}
        setRunInput={setRunInput}
        rootAgents={rootAgents}
        runWorkflow={runWorkflow}
      />

      {/* ---- Execution Log Panel ---- */}
      <ExecutionLog
         execLog={execLog}
         isExecuting={isExecuting}
         execTaskId={execTaskId}
         resetAllExecStates={resetAllExecStates}
      />

      {/* Global CSS */}
      <style>{`
        .react-flow__edge-path {
          transition: stroke 0.15s ease, stroke-width 0.15s ease;
        }
        .react-flow__handle {
          transition: all 0.15s ease;
          cursor: crosshair;
        }
        .react-flow__handle:hover,
        .handle-glow:hover {
          transform: scale(1.4);
          box-shadow: 0 0 10px rgba(123,208,255,0.6), 0 0 20px rgba(123,208,255,0.3);
        }
        .react-flow__edge:hover .react-flow__edge-path {
          stroke: rgba(123,208,255,0.6) !important;
          stroke-width: 2.5px !important;
        }
        .react-flow .react-flow__node .react-flow__handle {
          width: 14px;
          height: 14px;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.1);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255,255,255,0.2);
        }
      `}</style>
    </>
  );
}
