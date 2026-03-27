"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Dagre from "@dagrejs/dagre";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
  type Connection,
  type NodeTypes,
  type EdgeTypes,
  type OnConnect,
  type NodeProps,
  type EdgeProps,
  Handle,
  Position,
  MarkerType,
  BackgroundVariant,
  ConnectionMode,
  BaseEdge,
  getBezierPath,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import Link from "next/link";
import {
  AlertTriangle,
  Bot,
  ChevronRight,
  GitBranch,
  Loader2,
  Plus,
  Save,
  Unlink,
  X,
  Info,
  ExternalLink,
  LayoutGrid,
  Brain,
  Search,
  FileText,
  Code,
  Shield,
  Cpu,
  Cog,
  Undo2,
  Trash2,
  Link2,
} from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api, type Agent } from "@/lib/api";
import {
  sanitizeAllowedSubAgents,
  buildAgentHierarchy,
  hasHierarchyCycle,
  getDescendantIds,
} from "@/lib/agent-hierarchy";

/* ======================================================================
   N8N-STYLE AGENT CANVAS — FULL INTERACTIONS
   ====================================================================== */

/* ---------- constants ---------- */
const NODE_W = 200;
const NODE_H = 76;
const STORAGE_KEY = "mas_canvas_positions_v2";

/* ---------- types ---------- */
type AgentNodeData = {
  agent: Agent;
  isSelected: boolean;
  childCount: number;
  colorIndex: number;
};

/* ---------- color palette ---------- */
const NODE_COLORS = [
  { bg: "#ff6d5a", icon: "#fff" },
  { bg: "#1a73e8", icon: "#fff" },
  { bg: "#e95dac", icon: "#fff" },
  { bg: "#ff9800", icon: "#fff" },
  { bg: "#00c853", icon: "#fff" },
  { bg: "#9c27b0", icon: "#fff" },
  { bg: "#00bcd4", icon: "#fff" },
  { bg: "#ef5350", icon: "#fff" },
  { bg: "#7c4dff", icon: "#fff" },
  { bg: "#26a69a", icon: "#fff" },
];

function getRoleIcon(role: string) {
  const r = role.toLowerCase();
  if (r.includes("research") || r.includes("search") || r.includes("retriev")) return Search;
  if (r.includes("write") || r.includes("content") || r.includes("scribe")) return FileText;
  if (r.includes("code") || r.includes("build") || r.includes("engineer") || r.includes("develop")) return Code;
  if (r.includes("test") || r.includes("review") || r.includes("qa")) return Shield;
  if (r.includes("plan") || r.includes("architect") || r.includes("solution")) return Cpu;
  if (r.includes("manag") || r.includes("coordinat") || r.includes("orchestrat")) return Brain;
  return Cog;
}

/* ---------- position persistence ---------- */
function savePositions(positions: Record<string, { x: number; y: number }>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(positions)); } catch {}
}

function loadPositions(): Record<string, { x: number; y: number }> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

/* ---------- layout ---------- */
function computeLayout(
  agents: Agent[],
  savedPositions: Record<string, { x: number; y: number }>
) {
  const knownIds = new Set(agents.map((a) => a.id));
  const allSaved = agents.length > 0 && agents.every((a) => savedPositions[a.id]);
  if (allSaved) {
    return agents.reduce((acc, a) => {
      acc[a.id] = savedPositions[a.id];
      return acc;
    }, {} as Record<string, { x: number; y: number }>);
  }

  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: "LR",
    nodesep: 50,
    ranksep: 80,
    marginx: 50,
    marginy: 50,
    align: "UL",
    acyclicer: "greedy",
    ranker: "network-simplex",
  });

  for (const agent of agents) g.setNode(agent.id, { width: NODE_W, height: NODE_H });
  for (const agent of agents) {
    for (const subId of sanitizeAllowedSubAgents(agent, knownIds)) {
      g.setEdge(agent.id, subId);
    }
  }

  Dagre.layout(g);

  const positions: Record<string, { x: number; y: number }> = {};
  for (const agent of agents) {
    const n = g.node(agent.id);
    positions[agent.id] = { x: n.x - NODE_W / 2, y: n.y - NODE_H / 2 };
  }
  return positions;
}

function buildNodesAndEdges(
  agents: Agent[],
  selectedId: string | null,
  savedPositions: Record<string, { x: number; y: number }>
) {
  const knownIds = new Set(agents.map((a) => a.id));
  const positions = computeLayout(agents, savedPositions);

  const nodes: Node<AgentNodeData>[] = agents.map((agent, idx) => ({
    id: agent.id,
    type: "n8nNode",
    position: positions[agent.id] ?? { x: 0, y: 0 },
    data: {
      agent,
      isSelected: agent.id === selectedId,
      childCount: sanitizeAllowedSubAgents(agent, knownIds).length,
      colorIndex: idx % NODE_COLORS.length,
    },
  }));

  const edges: Edge[] = [];
  const seen = new Set<string>();
  for (const agent of agents) {
    for (const subId of sanitizeAllowedSubAgents(agent, knownIds)) {
      const eid = `${agent.id}->${subId}`;
      if (!seen.has(eid)) {
        seen.add(eid);
        edges.push({
          id: eid,
          source: agent.id,
          target: subId,
          type: "deletableEdge",
        });
      }
    }
  }

  return { nodes, edges };
}

/* ======================================================================
   CUSTOM EDGE — with delete button on hover (n8n-style)
   ====================================================================== */
function DeletableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  animated,
  style,
}: EdgeProps) {
  const { setEdges } = useReactFlow();

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    curvature: 0.25,
  });

  const isHighlighted = selected || animated;

  const onDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setEdges((eds) => eds.filter((edge) => edge.id !== id));
      // dispatch dirty flag via custom event
      window.dispatchEvent(new CustomEvent("canvas-dirty"));
    },
    [id, setEdges]
  );

  return (
    <>
      {/* Invisible wider path for easier selection */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        style={{ cursor: "pointer" }}
      />
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: isHighlighted ? "#7bd0ff" : "rgba(255,255,255,0.15)",
          strokeWidth: isHighlighted ? 2.5 : 2,
          ...(style ?? {}),
        }}
      />
      {/* Delete button — shown on hover/select via CSS group */}
      <foreignObject
        width={22}
        height={22}
        x={labelX - 11}
        y={labelY - 11}
        className="edge-delete-btn overflow-visible pointer-events-none"
        style={{ opacity: isHighlighted ? 1 : undefined }}
      >
        <div className="flex items-center justify-center w-[22px] h-[22px] pointer-events-auto">
          <button
            type="button"
            onClick={onDelete}
            className="w-[18px] h-[18px] rounded-full flex items-center justify-center transition-all hover:scale-110"
            style={{
              background: "#ff6d5a",
              boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
            }}
          >
            <X className="w-[10px] h-[10px] text-white" strokeWidth={3} />
          </button>
        </div>
      </foreignObject>
    </>
  );
}

const edgeTypes: EdgeTypes = {
  deletableEdge: DeletableEdge,
};

/* ======================================================================
   CUSTOM NODE
   ====================================================================== */
function N8nNode({ data }: NodeProps<Node<AgentNodeData>>) {
  const { agent, isSelected, childCount, colorIndex } = data;
  const color = NODE_COLORS[colorIndex];
  const Icon = getRoleIcon(agent.role);

  return (
    <div
      className={`flex items-stretch rounded-lg overflow-hidden transition-all duration-150 ${
        isSelected
          ? "ring-2 ring-[#7bd0ff] shadow-[0_0_20px_rgba(123,208,255,0.2)]"
          : "shadow-[0_2px_8px_rgba(0,0,0,0.3)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.4)]"
      }`}
      style={{ width: NODE_W, height: NODE_H }}
    >
      {/* Input handle — large hit area */}
      <div
        className="absolute -left-[15px] top-1/2 -translate-y-1/2 w-[30px] h-[30px] flex items-center justify-center"
        style={{ zIndex: 10 }}
      >
        <Handle
          type="target"
          position={Position.Left}
          className="!w-[14px] !h-[14px] !rounded-full !border-[2px] !bg-[#1a1d26] !border-[rgba(255,255,255,0.25)] hover:!border-[#7bd0ff] hover:!bg-[#7bd0ff] !transition-all !relative !left-0 !top-0 !translate-x-0 !translate-y-0 handle-glow"
        />
      </div>

      <div
        className="flex items-center justify-center shrink-0"
        style={{ background: color.bg, width: 52 }}
      >
        <Icon className="w-5 h-5" style={{ color: color.icon }} strokeWidth={2} />
      </div>

      <div
        className="flex-1 flex flex-col justify-center px-3 min-w-0"
        style={{ background: "#2a2e3a" }}
      >
        <p className="text-[12px] font-semibold truncate leading-tight" style={{ color: "#e8eaed" }}>
          {agent.name}
        </p>
        <p className="text-[10px] truncate mt-0.5 leading-tight" style={{ color: "rgba(232,234,237,0.5)" }}>
          {agent.role}
        </p>
        {childCount > 0 && (
          <div className="flex items-center gap-1 mt-1.5">
            <div
              className="text-[9px] px-1.5 py-[1px] rounded-sm font-medium"
              style={{ background: "rgba(255,255,255,0.08)", color: "rgba(232,234,237,0.6)" }}
            >
              {childCount} sub
            </div>
          </div>
        )}
      </div>

      {/* Output handle — large hit area */}
      <div
        className="absolute -right-[15px] top-1/2 -translate-y-1/2 w-[30px] h-[30px] flex items-center justify-center"
        style={{ zIndex: 10 }}
      >
        <Handle
          type="source"
          position={Position.Right}
          className="!w-[14px] !h-[14px] !rounded-full !border-[2px] !bg-[#1a1d26] !border-[rgba(255,255,255,0.25)] hover:!border-[#7bd0ff] hover:!bg-[#7bd0ff] !transition-all !relative !right-0 !top-0 !translate-x-0 !translate-y-0 handle-glow"
        />
      </div>
    </div>
  );
}

const nodeTypes: NodeTypes = { n8nNode: N8nNode };

/* ======================================================================
   MAIN COMPONENT
   ====================================================================== */
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

  const selectedAgent = useMemo(
    () => agents.find((a) => a.id === selectedNodeId) ?? null,
    [agents, selectedNodeId]
  );

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
        const { nodes: n, edges: e } = buildNodesAndEdges(items, null, savedPositionsRef.current);
        setNodes(n);
        setEdges(e);
      })
      .catch((err: Error) => setLoadError(err.message || "Failed to load agents."))
      .finally(() => setLoading(false));
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
  }, [selectedNodeId, setNodes, setEdges]);

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

          {/* ---- Sidebar Inspector ---- */}
          <div
            className="rounded-r-2xl border border-l-0 border-white/5 flex flex-col"
            style={{ background: "#1f222c", height: "calc(100vh - 190px)", minHeight: "560px" }}
          >
            {!selectedAgent ? (
              <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center mb-3"
                  style={{ background: "rgba(255,255,255,0.04)" }}
                >
                  <Info className="h-5 w-5" style={{ color: "rgba(232,234,237,0.25)" }} />
                </div>
                <p className="text-sm font-medium" style={{ color: "rgba(232,234,237,0.5)" }}>
                  Select a node
                </p>
                <p className="text-[11px] mt-1" style={{ color: "rgba(232,234,237,0.3)" }}>
                  Click any agent on the canvas to inspect relationships and manage connections.
                </p>
              </div>
            ) : (
              <ScrollArea className="flex-1">
                <div className="p-5 space-y-5">
                  {/* Header */}
                  <div className="flex items-start gap-3">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-lg shrink-0"
                      style={{
                        background: NODE_COLORS[agents.findIndex((a) => a.id === selectedAgent.id) % NODE_COLORS.length]?.bg ?? "#7bd0ff",
                      }}
                    >
                      {(() => {
                        const Icon = getRoleIcon(selectedAgent.role);
                        return <Icon className="h-5 w-5 text-white" />;
                      })()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate" style={{ color: "#e8eaed" }}>
                        {selectedAgent.name}
                      </p>
                      <p className="text-[10px] uppercase tracking-wider" style={{ color: "rgba(232,234,237,0.45)" }}>
                        {selectedAgent.role}
                      </p>
                    </div>
                    <Link href={`/agents/${selectedAgent.id}`}>
                      <button className="rounded-md p-1.5 hover:bg-white/5 transition-colors" title="Open details">
                        <ExternalLink className="h-3.5 w-3.5" style={{ color: "#7bd0ff" }} />
                      </button>
                    </Link>
                  </div>

                  {/* Description */}
                  {selectedAgent.description && (
                    <p className="text-[11px] leading-relaxed" style={{ color: "rgba(232,234,237,0.5)" }}>
                      {selectedAgent.description}
                    </p>
                  )}

                  {/* Badges */}
                  <div className="flex flex-wrap gap-1.5">
                    <span
                      className="text-[9px] font-medium uppercase tracking-wider px-2 py-0.5 rounded"
                      style={{
                        background: selectedAgent.active ? "rgba(0,200,83,0.15)" : "rgba(255,180,171,0.15)",
                        color: selectedAgent.active ? "#00c853" : "#ffb4ab",
                      }}
                    >
                      {selectedAgent.active ? "Active" : "Inactive"}
                    </span>
                    <span className="text-[9px] font-medium px-2 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(232,234,237,0.5)" }}>
                      {selectedAgent.maxSteps} steps
                    </span>
                    <span className="text-[9px] font-medium px-2 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(232,234,237,0.5)" }}>
                      {selectedAgent.allowedTools.length} tools
                    </span>
                  </div>

                  <div className="h-px" style={{ background: "rgba(255,255,255,0.06)" }} />

                  {/* Quick Actions */}
                  <div>
                    <p className="text-[10px] uppercase tracking-wider mb-2 font-medium" style={{ color: "rgba(232,234,237,0.35)" }}>
                      Actions
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      <Link href={`/agents/${selectedAgent.id}`}>
                        <button
                          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[10px] font-medium transition-colors hover:bg-white/10"
                          style={{ background: "rgba(255,255,255,0.05)", color: "#e8eaed" }}
                        >
                          <ExternalLink className="h-3 w-3" style={{ color: "#7bd0ff" }} />
                          Edit Agent
                        </button>
                      </Link>
                      <button
                        onClick={disconnectSelected}
                        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[10px] font-medium transition-colors hover:bg-white/10"
                        style={{ background: "rgba(255,255,255,0.05)", color: "#ffb4ab" }}
                      >
                        <Unlink className="h-3 w-3" />
                        Disconnect All
                      </button>
                    </div>
                  </div>

                  <div className="h-px" style={{ background: "rgba(255,255,255,0.06)" }} />

                  {/* Inputs (Reports To) */}
                  <div>
                    <p className="text-[10px] uppercase tracking-wider mb-2 font-medium" style={{ color: "rgba(232,234,237,0.35)" }}>
                      Inputs — Reports To ({hierarchyInfo?.inputs.length ?? 0})
                    </p>
                    {hierarchyInfo?.inputs && hierarchyInfo.inputs.length > 0 ? (
                      <div className="space-y-1">
                        {hierarchyInfo.inputs.map((inp) => (
                          <div key={inp.id} className="flex items-center gap-2 rounded-lg p-2 group" style={{ background: "rgba(255,255,255,0.02)" }}>
                            <button
                              onClick={() => setSelectedNodeId(inp.id)}
                              className="flex items-center gap-2 min-w-0 flex-1 text-left hover:opacity-80 transition-opacity"
                            >
                              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: NODE_COLORS[agents.findIndex(a => a.id === inp.id) % NODE_COLORS.length]?.bg ?? "#7bd0ff" }} />
                              <div className="min-w-0 flex-1">
                                <p className="text-[11px] font-medium truncate" style={{ color: "#e8eaed" }}>{inp.name}</p>
                                <p className="text-[9px] truncate" style={{ color: "rgba(232,234,237,0.4)" }}>{inp.role}</p>
                              </div>
                            </button>
                            <button
                              onClick={() => removeEdgeBetween(inp.id, selectedNodeId!)}
                              className="rounded p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/10"
                              title="Remove this connection"
                            >
                              <X className="h-3 w-3" style={{ color: "#ffb4ab" }} />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-lg p-2.5 text-[11px]" style={{ background: "rgba(255,255,255,0.03)", color: "rgba(232,234,237,0.35)" }}>
                        No input — root agent
                      </div>
                    )}
                  </div>

                  {/* Outputs (Sub-agents) */}
                  <div>
                    <p className="text-[10px] uppercase tracking-wider mb-2 font-medium" style={{ color: "rgba(232,234,237,0.35)" }}>
                      Outputs — Sub-Agents ({hierarchyInfo?.children.length ?? 0})
                    </p>
                    {hierarchyInfo?.children && hierarchyInfo.children.length > 0 ? (
                      <div className="space-y-1">
                        {hierarchyInfo.children.map((child) => (
                          <div key={child.id} className="flex items-center gap-2 rounded-lg p-2 group" style={{ background: "rgba(255,255,255,0.02)" }}>
                            <button
                              onClick={() => setSelectedNodeId(child.id)}
                              className="flex items-center gap-2 min-w-0 flex-1 text-left hover:opacity-80 transition-opacity"
                            >
                              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: NODE_COLORS[agents.findIndex(a => a.id === child.id) % NODE_COLORS.length]?.bg ?? "#7bd0ff" }} />
                              <div className="min-w-0 flex-1">
                                <p className="text-[11px] font-medium truncate" style={{ color: "#e8eaed" }}>{child.name}</p>
                                <p className="text-[9px] truncate" style={{ color: "rgba(232,234,237,0.4)" }}>{child.role}</p>
                              </div>
                            </button>
                            <button
                              onClick={() => removeEdgeBetween(selectedNodeId!, child.id)}
                              className="rounded p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/10"
                              title="Remove this connection"
                            >
                              <X className="h-3 w-3" style={{ color: "#ffb4ab" }} />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-lg p-2.5 text-[11px]" style={{ background: "rgba(255,255,255,0.03)", color: "rgba(232,234,237,0.35)" }}>
                        No outputs — leaf agent
                      </div>
                    )}
                  </div>
                </div>
              </ScrollArea>
            )}
          </div>
        </div>
      )}

      {/* Global CSS for connection line animation */}
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
      `}</style>
    </>
  );
}
