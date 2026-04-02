import Dagre from "@dagrejs/dagre";
import type { Node, Edge } from "@xyflow/react";
import {
  Search,
  FileText,
  Code,
  Shield,
  Cpu,
  Brain,
  Cog,
} from "lucide-react";

import type { Agent } from "@/lib/api";
import { sanitizeAllowedSubAgents } from "@/lib/agent-hierarchy";
import { NODE_W, NODE_H, STORAGE_KEY, NODE_COLORS, type AgentNodeData, type ExecState } from "./constants";

export function getRoleIcon(role: string) {
  const r = role.toLowerCase();
  if (r.includes("research") || r.includes("search") || r.includes("retriev")) return Search;
  if (r.includes("write") || r.includes("content") || r.includes("scribe")) return FileText;
  if (r.includes("code") || r.includes("build") || r.includes("engineer") || r.includes("develop")) return Code;
  if (r.includes("test") || r.includes("review") || r.includes("qa")) return Shield;
  if (r.includes("plan") || r.includes("architect") || r.includes("solution")) return Cpu;
  if (r.includes("manag") || r.includes("coordinat") || r.includes("orchestrat")) return Brain;
  return Cog;
}

export function savePositions(positions: Record<string, { x: number; y: number }>) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(positions)); } catch {}
}

export function loadPositions(): Record<string, { x: number; y: number }> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

export function computeLayout(
  agents: Agent[],
  savedPositions: Record<string, { x: number; y: number }>
) {
  const knownIds = new Set(agents.map((a) => a.id));

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
    if (savedPositions[agent.id]) {
      positions[agent.id] = savedPositions[agent.id];
    } else {
      const n = g.node(agent.id);
      positions[agent.id] = { x: n.x - NODE_W / 2, y: n.y - NODE_H / 2 };
    }
  }
  return positions;
}

export function buildNodesAndEdges(
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
