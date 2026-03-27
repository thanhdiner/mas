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
  Play,
  Square,
} from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api, type Agent } from "@/lib/api";
import { getExecutionWebSocketUrl } from "@/lib/api";
import {
  sanitizeAllowedSubAgents,
  buildAgentHierarchy,
  hasHierarchyCycle,
  getDescendantIds,
} from "@/lib/agent-hierarchy";

/* ======================================================================
   N8N-STYLE AGENT CANVAS — WORKFLOW RUNNER
   ====================================================================== */

/* ---------- constants ---------- */
const NODE_W = 200;
const NODE_H = 76;
const STORAGE_KEY = "mas_canvas_positions_v2";

/* ---------- types ---------- */
type ExecState = "idle" | "running" | "done" | "failed" | "waiting";

type AgentNodeData = {
  agent: Agent;
  isSelected: boolean;
  childCount: number;
  colorIndex: number;
  execState: ExecState;
  execOutput: string;
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
      execState: "idle" as ExecState,
      execOutput: "",
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
  const { agent, isSelected, childCount, colorIndex, execState, execOutput } = data;
  const color = NODE_COLORS[colorIndex];
  const Icon = getRoleIcon(agent.role);

  const execRing = {
    idle: "",
    running: "ring-2 ring-[#7bd0ff] animate-pulse shadow-[0_0_20px_rgba(123,208,255,0.35)]",
    done: "ring-2 ring-[#4edea3] shadow-[0_0_16px_rgba(78,222,163,0.25)]",
    failed: "ring-2 ring-[#ff6d5a] shadow-[0_0_16px_rgba(255,109,90,0.25)]",
    waiting: "ring-2 ring-[#ffc107] animate-pulse shadow-[0_0_16px_rgba(255,193,7,0.25)]",
  }[execState];

  const selectedRing = isSelected && execState === "idle"
    ? "ring-2 ring-[#7bd0ff] shadow-[0_0_20px_rgba(123,208,255,0.2)]"
    : "";

  return (
    <div
      className={`relative flex items-stretch rounded-lg overflow-visible transition-all duration-150 ${
        execRing || selectedRing || "shadow-[0_2px_8px_rgba(0,0,0,0.3)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.4)]"
      }`}
      style={{ width: NODE_W, height: NODE_H }}
    >
      {/* Exec state indicator dot */}
      {execState !== "idle" && (
        <div className="absolute -top-1.5 -right-1.5 z-20 flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold"
          style={{
            background: execState === "running" ? "#7bd0ff" : execState === "done" ? "#4edea3" : execState === "failed" ? "#ff6d5a" : "#ffc107",
            color: "#fff",
            boxShadow: "0 2px 6px rgba(0,0,0,0.4)",
          }}
        >
          {execState === "running" && <Loader2 className="w-3 h-3 animate-spin" />}
          {execState === "done" && "✓"}
          {execState === "failed" && "✗"}
          {execState === "waiting" && "⏳"}
        </div>
      )}

      {/* Output badge */}
      {execState === "done" && execOutput && (
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 z-20 px-2 py-0.5 rounded text-[8px] font-medium truncate max-w-[180px]"
          style={{ background: "rgba(78,222,163,0.2)", color: "#4edea3", border: "1px solid rgba(78,222,163,0.3)" }}
          title={execOutput}
        >
          ✓ Output ready
        </div>
      )}

      {/* Input handle */}
      <div className="absolute -left-[15px] top-1/2 -translate-y-1/2 w-[30px] h-[30px] flex items-center justify-center" style={{ zIndex: 10 }}>
        <Handle type="target" position={Position.Left}
          className="!w-[14px] !h-[14px] !rounded-full !border-[2px] !bg-[#1a1d26] !border-[rgba(255,255,255,0.25)] hover:!border-[#7bd0ff] hover:!bg-[#7bd0ff] !transition-all !relative !left-0 !top-0 !translate-x-0 !translate-y-0 handle-glow"
        />
      </div>

      <div className="flex items-center justify-center shrink-0 rounded-l-lg" style={{ background: color.bg, width: 52 }}>
        <Icon className="w-5 h-5" style={{ color: color.icon }} strokeWidth={2} />
      </div>

      <div className="flex-1 flex flex-col justify-center px-3 min-w-0 rounded-r-lg" style={{ background: "#2a2e3a" }}>
        <p className="text-[12px] font-semibold truncate leading-tight" style={{ color: "#e8eaed" }}>{agent.name}</p>
        <p className="text-[10px] truncate mt-0.5 leading-tight" style={{ color: "rgba(232,234,237,0.5)" }}>
          {execState === "running" ? "Processing..." : execState === "waiting" ? "Waiting for sub-agent..." : agent.role}
        </p>
        {childCount > 0 && execState === "idle" && (
          <div className="flex items-center gap-1 mt-1.5">
            <div className="text-[9px] px-1.5 py-[1px] rounded-sm font-medium"
              style={{ background: "rgba(255,255,255,0.08)", color: "rgba(232,234,237,0.6)" }}
            >{childCount} sub</div>
          </div>
        )}
      </div>

      {/* Output handle */}
      <div className="absolute -right-[15px] top-1/2 -translate-y-1/2 w-[30px] h-[30px] flex items-center justify-center" style={{ zIndex: 10 }}>
        <Handle type="source" position={Position.Right}
          className="!w-[14px] !h-[14px] !rounded-full !border-[2px] !bg-[#1a1d26] !border-[rgba(255,255,255,0.25)] hover:!border-[#7bd0ff] hover:!bg-[#7bd0ff] !transition-all !relative !right-0 !top-0 !translate-x-0 !translate-y-0 handle-glow"
        />
      </div>
    </div>
  );
}

const nodeTypes: NodeTypes = { n8nNode: N8nNode };

/* ======================================================================
   TOOL PICKER — interactive tool toggle for agents
   ====================================================================== */
const TOOL_ICONS: Record<string, string> = {
  web_search: "🌐",
  read_website: "📖",
  execute_code: "💻",
  write_file: "💾",
};

function ToolPicker({ agent, onAgentUpdated }: { agent: Agent; onAgentUpdated: (a: Agent) => void }) {
  const [catalog, setCatalog] = useState<{ name: string; description: string }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.tools.list().then(setCatalog).catch(() => {});
  }, []);

  const toggle = async (toolName: string) => {
    const has = agent.allowedTools.includes(toolName);
    const next = has ? agent.allowedTools.filter((t) => t !== toolName) : [...agent.allowedTools, toolName];
    setSaving(true);
    try {
      const updated = await api.agents.update(agent.id, { allowedTools: next });
      onAgentUpdated(updated);
    } catch {}
    setSaving(false);
  };

  return (
    <div>
      <label className="text-[9px] uppercase tracking-wider font-medium mb-1.5 block" style={{ color: "rgba(232,234,237,0.35)" }}>
        Tools ({agent.allowedTools.length}/{catalog.length})
        {saving && <span className="ml-1 text-[8px]" style={{ color: "#7bd0ff" }}>saving…</span>}
      </label>
      <div className="space-y-1">
        {catalog.map((tool) => {
          const active = agent.allowedTools.includes(tool.name);
          return (
            <button key={tool.name} onClick={() => toggle(tool.name)}
              className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-all"
              style={{
                background: active ? "rgba(78,222,163,0.1)" : "rgba(255,255,255,0.02)",
                border: `1px solid ${active ? "rgba(78,222,163,0.25)" : "rgba(255,255,255,0.04)"}`,
              }}>
              <span className="text-sm">{TOOL_ICONS[tool.name] ?? "🔧"}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-medium" style={{ color: active ? "#4edea3" : "#e8eaed" }}>{tool.name}</p>
                <p className="text-[8px] truncate" style={{ color: "rgba(232,234,237,0.35)" }}>{tool.description.slice(0, 60)}…</p>
              </div>
              <div className="w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0"
                style={{
                  borderColor: active ? "#4edea3" : "rgba(255,255,255,0.15)",
                  background: active ? "#4edea3" : "transparent",
                }}>
                {active && <span className="text-[8px] text-white font-bold">✓</span>}
              </div>
            </button>
          );
        })}
        {catalog.length === 0 && (
          <p className="text-[10px]" style={{ color: "rgba(232,234,237,0.3)" }}>Loading tools…</p>
        )}
      </div>
    </div>
  );
}

/* ======================================================================
   SIDEBAR INSPECTOR — n8n-style tabbed config panel
   ====================================================================== */
type SidebarTab = "settings" | "connections";

const INPUT_CLS = "w-full rounded-md px-2.5 py-1.5 text-[11px] outline-none focus:ring-1 focus:ring-[#7bd0ff] transition-all";
const INPUT_STYLE: React.CSSProperties = { background: "#2a2e3a", color: "#e8eaed", border: "1px solid rgba(255,255,255,0.06)" };
const LABEL_CLS = "text-[9px] uppercase tracking-wider font-medium mb-1 block";
const LABEL_STYLE: React.CSSProperties = { color: "rgba(232,234,237,0.35)" };

function SidebarInspector({
  agent, agents, edges, selectedNodeId, setSelectedNodeId,
  disconnectSelected, removeEdgeBetween, hierarchyInfo, colorIndex,
  onAgentUpdated,
}: {
  agent: Agent;
  agents: Agent[];
  edges: Edge[];
  selectedNodeId: string;
  setSelectedNodeId: (id: string | null) => void;
  disconnectSelected: () => void;
  removeEdgeBetween: (s: string, t: string) => void;
  hierarchyInfo: { parent: Agent | null; children: Agent[]; inputs: Agent[] } | null;
  colorIndex: number;
  onAgentUpdated: (a: Agent) => void;
}) {
  const [tab, setTab] = useState<SidebarTab>("settings");
  const [form, setForm] = useState({
    name: agent.name, role: agent.role, description: agent.description,
    systemPrompt: agent.systemPrompt, maxSteps: agent.maxSteps, active: agent.active,
  });
  const [savingField, setSavingField] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  // Sync form when agent changes
  useEffect(() => {
    setForm({
      name: agent.name, role: agent.role, description: agent.description,
      systemPrompt: agent.systemPrompt, maxSteps: agent.maxSteps, active: agent.active,
    });
    setSaveMsg("");
  }, [agent.id]);

  const saveField = useCallback(async (field: string, value: unknown) => {
    setSavingField(true);
    setSaveMsg("");
    try {
      const updated = await api.agents.update(agent.id, { [field]: value });
      onAgentUpdated(updated);
      setSaveMsg("Saved");
      setTimeout(() => setSaveMsg(""), 1500);
    } catch (e) {
      setSaveMsg("Error");
    }
    setSavingField(false);
  }, [agent.id, onAgentUpdated]);

  const handleBlur = (field: string, value: unknown, original: unknown) => {
    if (value !== original) saveField(field, value);
  };

  const toggleActive = async () => {
    const next = !form.active;
    setForm((f) => ({ ...f, active: next }));
    await saveField("active", next);
  };

  const color = NODE_COLORS[colorIndex];
  const Icon = getRoleIcon(agent.role);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header */}
      <div className="p-4 pb-3 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg shrink-0" style={{ background: color.bg }}>
            <Icon className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold truncate" style={{ color: "#e8eaed" }}>{agent.name}</p>
            <p className="text-[9px] uppercase tracking-wider" style={{ color: "rgba(232,234,237,0.4)" }}>{agent.role}</p>
          </div>
          {savingField && <Loader2 className="h-3 w-3 animate-spin" style={{ color: "#7bd0ff" }} />}
          {saveMsg && <span className="text-[9px] font-medium" style={{ color: saveMsg === "Saved" ? "#4edea3" : "#ffb4ab" }}>{saveMsg}</span>}
        </div>

        {/* Tabs */}
        <div className="flex gap-0 mt-3 rounded-lg overflow-hidden" style={{ background: "#2a2e3a" }}>
          {(["settings", "connections"] as SidebarTab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className="flex-1 py-1.5 text-[10px] font-medium uppercase tracking-wider transition-colors"
              style={{
                background: tab === t ? "rgba(123,208,255,0.15)" : "transparent",
                color: tab === t ? "#7bd0ff" : "rgba(232,234,237,0.4)",
              }}
            >{t === "settings" ? "⚙ Settings" : "🔗 Connections"}</button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar">
        <div className="p-4 space-y-3">
          {tab === "settings" ? (
            <>
              {/* Name */}
              <div>
                <label className={LABEL_CLS} style={LABEL_STYLE}>Name</label>
                <input className={INPUT_CLS} style={INPUT_STYLE} value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  onBlur={() => handleBlur("name", form.name, agent.name)}
                />
              </div>

              {/* Role */}
              <div>
                <label className={LABEL_CLS} style={LABEL_STYLE}>Role</label>
                <input className={INPUT_CLS} style={INPUT_STYLE} value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                  onBlur={() => handleBlur("role", form.role, agent.role)}
                />
              </div>

              {/* Description */}
              <div>
                <label className={LABEL_CLS} style={LABEL_STYLE}>Description</label>
                <textarea className={`${INPUT_CLS} resize-none`} style={INPUT_STYLE} rows={2}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  onBlur={() => handleBlur("description", form.description, agent.description)}
                />
              </div>

              {/* System Prompt */}
              <div>
                <label className={LABEL_CLS} style={LABEL_STYLE}>System Prompt</label>
                <textarea className={`${INPUT_CLS} resize-none font-mono`} style={{ ...INPUT_STYLE, fontSize: 10, lineHeight: 1.5 }} rows={5}
                  value={form.systemPrompt}
                  onChange={(e) => setForm((f) => ({ ...f, systemPrompt: e.target.value }))}
                  onBlur={() => handleBlur("systemPrompt", form.systemPrompt, agent.systemPrompt)}
                />
              </div>

              <div className="h-px" style={{ background: "rgba(255,255,255,0.06)" }} />

              {/* Max Steps */}
              <div className="flex items-center justify-between">
                <label className="text-[9px] uppercase tracking-wider font-medium" style={LABEL_STYLE}>Max Steps</label>
                <input type="number" className={`${INPUT_CLS} !w-16 text-center`} style={INPUT_STYLE}
                  value={form.maxSteps} min={1} max={100}
                  onChange={(e) => setForm((f) => ({ ...f, maxSteps: parseInt(e.target.value) || 1 }))}
                  onBlur={() => handleBlur("maxSteps", form.maxSteps, agent.maxSteps)}
                />
              </div>

              {/* Active toggle */}
              <div className="flex items-center justify-between">
                <label className="text-[9px] uppercase tracking-wider font-medium" style={LABEL_STYLE}>Active</label>
                <button onClick={toggleActive}
                  className="relative w-9 h-5 rounded-full transition-colors"
                  style={{ background: form.active ? "#4edea3" : "rgba(255,255,255,0.1)" }}
                >
                  <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow-sm"
                    style={{ left: form.active ? 18 : 2 }}
                  />
                </button>
              </div>

              {/* Tools picker */}
              <ToolPicker agent={agent} onAgentUpdated={onAgentUpdated} />

              <div className="h-px" style={{ background: "rgba(255,255,255,0.06)" }} />

              {/* Quick actions */}
              <div className="flex flex-wrap gap-1.5">
                <Link href={`/agents/${agent.id}`}>
                  <button className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[10px] font-medium transition-colors hover:bg-white/10"
                    style={{ background: "rgba(255,255,255,0.05)", color: "#e8eaed" }}>
                    <ExternalLink className="h-3 w-3" style={{ color: "#7bd0ff" }} /> Full Editor
                  </button>
                </Link>
                <button onClick={disconnectSelected}
                  className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[10px] font-medium transition-colors hover:bg-white/10"
                  style={{ background: "rgba(255,255,255,0.05)", color: "#ffb4ab" }}>
                  <Unlink className="h-3 w-3" /> Disconnect
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Inputs */}
              <div>
                <p className={LABEL_CLS} style={LABEL_STYLE}>Inputs — Reports To ({hierarchyInfo?.inputs.length ?? 0})</p>
                {hierarchyInfo?.inputs && hierarchyInfo.inputs.length > 0 ? (
                  <div className="space-y-1">
                    {hierarchyInfo.inputs.map((inp) => (
                      <div key={inp.id} className="flex items-center gap-2 rounded-lg p-2 group" style={{ background: "rgba(255,255,255,0.02)" }}>
                        <button onClick={() => setSelectedNodeId(inp.id)} className="flex items-center gap-2 min-w-0 flex-1 text-left hover:opacity-80">
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ background: NODE_COLORS[agents.findIndex(a => a.id === inp.id) % NODE_COLORS.length]?.bg ?? "#7bd0ff" }} />
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-medium truncate" style={{ color: "#e8eaed" }}>{inp.name}</p>
                            <p className="text-[9px] truncate" style={{ color: "rgba(232,234,237,0.4)" }}>{inp.role}</p>
                          </div>
                        </button>
                        <button onClick={() => removeEdgeBetween(inp.id, selectedNodeId)} className="rounded p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/10" title="Remove">
                          <X className="h-3 w-3" style={{ color: "#ffb4ab" }} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg p-2.5 text-[11px]" style={{ background: "rgba(255,255,255,0.03)", color: "rgba(232,234,237,0.35)" }}>No input — root agent</div>
                )}
              </div>

              {/* Outputs */}
              <div>
                <p className={LABEL_CLS} style={LABEL_STYLE}>Outputs — Sub-Agents ({hierarchyInfo?.children.length ?? 0})</p>
                {hierarchyInfo?.children && hierarchyInfo.children.length > 0 ? (
                  <div className="space-y-1">
                    {hierarchyInfo.children.map((child) => (
                      <div key={child.id} className="flex items-center gap-2 rounded-lg p-2 group" style={{ background: "rgba(255,255,255,0.02)" }}>
                        <button onClick={() => setSelectedNodeId(child.id)} className="flex items-center gap-2 min-w-0 flex-1 text-left hover:opacity-80">
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ background: NODE_COLORS[agents.findIndex(a => a.id === child.id) % NODE_COLORS.length]?.bg ?? "#7bd0ff" }} />
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-medium truncate" style={{ color: "#e8eaed" }}>{child.name}</p>
                            <p className="text-[9px] truncate" style={{ color: "rgba(232,234,237,0.4)" }}>{child.role}</p>
                          </div>
                        </button>
                        <button onClick={() => removeEdgeBetween(selectedNodeId, child.id)} className="rounded p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/10" title="Remove">
                          <X className="h-3 w-3" style={{ color: "#ffb4ab" }} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg p-2.5 text-[11px]" style={{ background: "rgba(255,255,255,0.03)", color: "rgba(232,234,237,0.35)" }}>No outputs — leaf agent</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

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

  /* ---- execution state ---- */
  const [showRunDialog, setShowRunDialog] = useState(false);
  const [runInput, setRunInput] = useState("");
  const [runTitle, setRunTitle] = useState("");
  const [isExecuting, setIsExecuting] = useState(false);
  const [execLog, setExecLog] = useState<{ time: string; text: string; type: string }[]>([]);
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

      const execRes = await api.tasks.execute(task.id);
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
        } catch (err) {
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
      {showRunDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="rounded-2xl p-6 w-full max-w-lg" style={{ background: "#1f222c", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #4edea3, #00c853)" }}>
                  <Play className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: "#e8eaed" }}>Run Workflow</p>
                  <p className="text-[10px]" style={{ color: "rgba(232,234,237,0.45)" }}>
                    Assigns to: {rootAgents[0]?.name ?? "No root agent"}
                  </p>
                </div>
              </div>
              <button onClick={() => setShowRunDialog(false)} className="rounded-md p-1.5 hover:bg-white/10 transition-colors">
                <X className="h-4 w-4" style={{ color: "rgba(232,234,237,0.5)" }} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider font-medium mb-1.5 block" style={{ color: "rgba(232,234,237,0.4)" }}>Task Title</label>
                <input
                  value={runTitle}
                  onChange={(e) => setRunTitle(e.target.value)}
                  placeholder="e.g. Research and write a report on AI trends"
                  className="w-full rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-[#7bd0ff] transition-all"
                  style={{ background: "#2a2e3a", color: "#e8eaed", border: "1px solid rgba(255,255,255,0.06)" }}
                  autoFocus
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider font-medium mb-1.5 block" style={{ color: "rgba(232,234,237,0.4)" }}>Input / Instructions</label>
                <textarea
                  value={runInput}
                  onChange={(e) => setRunInput(e.target.value)}
                  placeholder="Provide detailed instructions for your agents..."
                  rows={4}
                  className="w-full rounded-lg px-3 py-2.5 text-sm outline-none resize-none focus:ring-1 focus:ring-[#7bd0ff] transition-all"
                  style={{ background: "#2a2e3a", color: "#e8eaed", border: "1px solid rgba(255,255,255,0.06)" }}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setShowRunDialog(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium transition-colors hover:bg-white/10"
                style={{ color: "rgba(232,234,237,0.6)" }}
              >Cancel</button>
              <button
                onClick={runWorkflow}
                disabled={!runTitle.trim() || !runInput.trim() || rootAgents.length === 0}
                className="rounded-lg px-5 py-2 text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-40"
                style={{ background: "linear-gradient(135deg, #4edea3, #00c853)" }}
              >
                <span className="flex items-center gap-2">
                  <Play className="h-3.5 w-3.5" /> Execute
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Execution Log Panel ---- */}
      {execLog.length > 0 && (
        <div className="mt-3 rounded-2xl border border-white/5 overflow-hidden" style={{ background: "#1a1d26" }}>
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5" style={{ background: "#1f222c" }}>
            <div className="flex items-center gap-2">
              {isExecuting && <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: "#7bd0ff" }} />}
              <span className="text-xs font-medium" style={{ color: "#e8eaed" }}>
                Execution Log {isExecuting ? "(Live)" : "(Completed)"}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(232,234,237,0.45)" }}>
                {execLog.length} entries
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {execTaskId && (
                <Link href={`/tasks/${execTaskId}`}>
                  <button className="text-[10px] px-2 py-1 rounded hover:bg-white/10 transition-colors" style={{ color: "#7bd0ff" }}>
                    View Task →
                  </button>
                </Link>
              )}
              <button
                onClick={resetAllExecStates}
                className="text-[10px] px-2 py-1 rounded hover:bg-white/10 transition-colors"
                style={{ color: "rgba(232,234,237,0.45)" }}
              >Clear</button>
            </div>
          </div>
          <div className="max-h-[200px] overflow-y-auto px-4 py-2 space-y-1 font-mono">
            {execLog.map((log, i) => (
              <div key={i} className="flex items-start gap-2 text-[11px] leading-relaxed">
                <span className="shrink-0 w-[60px]" style={{ color: "rgba(232,234,237,0.25)" }}>{log.time}</span>
                <span style={{
                  color: log.type === "error" ? "#ffb4ab"
                    : log.type === "done" ? "#4edea3"
                    : log.type === "delegation" ? "#7bd0ff"
                    : log.type === "step" ? "rgba(232,234,237,0.7)"
                    : "rgba(232,234,237,0.4)",
                }}>{log.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

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
