"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useNodesState, useEdgesState, addEdge } from "@xyflow/react";
import type { Node, Edge, Connection, OnConnect } from "@xyflow/react";

import { api, type Agent } from "@/lib/api";
import {
  hasHierarchyCycle,
  sanitizeAllowedSubAgents,
} from "@/lib/agent-hierarchy";
import type { AgentNodeData } from "./constants";
import { loadPositions, savePositions, buildNodesAndEdges } from "./utils";

export function useCanvasGraph() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const savedPositionsRef = useRef<Record<string, { x: number; y: number }>>(
    {}
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<AgentNodeData>>(
    []
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const selectedAgent = useMemo(
    () => agents.find((a) => a.id === selectedNodeId) ?? null,
    [agents, selectedNodeId]
  );

  /* ---- root agents (no parent edge) ---- */
  const rootAgents = useMemo(() => {
    const targets = new Set(edges.map((e) => e.target));
    return agents.filter((a) => !targets.has(a.id));
  }, [agents, edges]);

  /* ---- hierarchy info for sidebar ---- */
  const hierarchyInfo = useMemo(() => {
    if (!selectedNodeId || agents.length === 0) return null;

    const parentEdge = edges.find((e) => e.target === selectedNodeId);
    const parent = parentEdge
      ? agents.find((a) => a.id === parentEdge.source) ?? null
      : null;

    const children = edges
      .filter((e) => e.source === selectedNodeId)
      .map((e) => agents.find((a) => a.id === e.target))
      .filter(Boolean) as Agent[];

    const inputEdges = edges.filter((e) => e.target === selectedNodeId);
    const inputs = inputEdges
      .map((e) => agents.find((a) => a.id === e.source))
      .filter(Boolean) as Agent[];

    return { parent, children, inputs };
  }, [selectedNodeId, agents, edges]);

  /* ---- load ---- */
  useEffect(() => {
    savedPositionsRef.current = loadPositions();
    api.agents
      .list()
      .then((items) => {
        setAgents(items);
        const { nodes: n, edges: e } = buildNodesAndEdges(
          items,
          selectedNodeId,
          savedPositionsRef.current
        );
        setNodes(n);
        setEdges(e);
      })
      .catch((err: Error) => setLoadError(err.message || "Failed to load agents."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- listen for dirty events from custom edge delete ---- */
  useEffect(() => {
    const handler = () => setIsDirty(true);
    window.addEventListener("canvas-dirty", handler);
    return () => window.removeEventListener("canvas-dirty", handler);
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
        const connected =
          e.source === selectedNodeId || e.target === selectedNodeId;
        return { ...e, animated: connected, selected: false };
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodeId, setNodes, setEdges]);

  /* ---- connection validation (prevent cycles) ---- */
  const isValidConnection = useCallback(
    (connection: Edge | Connection) => {
      const src = connection.source;
      const tgt = connection.target;
      if (!src || !tgt) return false;
      if (src === tgt) return false;

      const exists = edges.some(
        (e) => e.source === src && e.target === tgt
      );
      if (exists) return false;

      const reverseExists = edges.some(
        (e) => e.source === tgt && e.target === src
      );
      if (reverseExists) return false;

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
    const { nodes: n, edges: e } = buildNodesAndEdges(
      agents,
      selectedNodeId,
      {}
    );
    setNodes(n);
    setEdges(e);
  }, [agents, selectedNodeId, setNodes, setEdges]);

  const disconnectSelected = useCallback(() => {
    if (!selectedNodeId) return;
    setEdges((eds) =>
      eds.filter(
        (e) => e.source !== selectedNodeId && e.target !== selectedNodeId
      )
    );
    setIsDirty(true);
    setStatusMessage("");
  }, [selectedNodeId, setEdges]);

  const removeEdgeBetween = useCallback(
    (sourceId: string, targetId: string) => {
      setEdges((eds) =>
        eds.filter(
          (e) => !(e.source === sourceId && e.target === targetId)
        )
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
        if (subAgentsMap[edge.source])
          subAgentsMap[edge.source].push(edge.target);
      }

      if (hasHierarchyCycle(subAgentsMap)) {
        throw new Error(
          "Cycle detected — remove a connection to break the loop."
        );
      }

      const knownIds = new Set(agents.map((a) => a.id));
      const changed: { id: string; subs: string[] }[] = [];
      for (const agent of agents) {
        const oldSubs = new Set(sanitizeAllowedSubAgents(agent, knownIds));
        const newSubs = subAgentsMap[agent.id] ?? [];
        const newSet = new Set(newSubs);
        if (
          oldSubs.size !== newSet.size ||
          [...oldSubs].some((s) => !newSet.has(s))
        ) {
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
      setLoadError(
        error instanceof Error ? error.message : "Failed to save."
      );
    } finally {
      setSaving(false);
    }
  }, [agents, edges, nodes, selectedNodeId, setNodes, setEdges]);

  const onAgentUpdated = useCallback(
    (updated: Agent) => {
      setAgents((prev) =>
        prev.map((a) => (a.id === updated.id ? updated : a))
      );
      setNodes((nds) =>
        nds.map((n) =>
          n.id === updated.id
            ? { ...n, data: { ...n.data, agent: updated } }
            : n
        )
      );
    },
    [setNodes]
  );

  return {
    // data
    agents,
    loading,
    loadError,
    setLoadError,
    selectedNodeId,
    setSelectedNodeId,
    selectedAgent,
    rootAgents,
    hierarchyInfo,
    // graph state
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    isDirty,
    saving,
    statusMessage,
    setStatusMessage,
    setNodes,
    setEdges,
    // graph actions
    isValidConnection,
    onNodeClick,
    onPaneClick,
    onConnect,
    onEdgesDelete,
    onNodeDragStop,
    autoLayout,
    disconnectSelected,
    removeEdgeBetween,
    revertChanges,
    saveHierarchy,
    onAgentUpdated,
  };
}
