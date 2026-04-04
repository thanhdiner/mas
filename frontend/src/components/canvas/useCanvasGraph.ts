"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useNodesState, useEdgesState, addEdge } from "@xyflow/react";
import type { Node, Edge, Connection, OnConnect } from "@xyflow/react";

import { api, type Agent } from "@/lib/api";
import {
  hasHierarchyCycle,
  sanitizeAllowedSubAgents,
} from "@/lib/agent-hierarchy";
import { NODE_COLORS, NODE_W, type AgentNodeData } from "./constants";
import { loadPositions, savePositions, buildNodesAndEdges } from "./utils";

const NEW_NODE_START_POSITION = { x: 80, y: 80 };
const NEW_NODE_OFFSET = { x: NODE_W + 80, y: 28 };

type PositionMap = Record<string, { x: number; y: number }>;

type GraphSnapshot = {
  agents: Agent[];
  edges: Edge[];
  positions: PositionMap;
  selectedNodeId: string | null;
};

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function clonePositions(positions: PositionMap): PositionMap {
  return Object.fromEntries(
    Object.entries(positions).map(([id, position]) => [id, { ...position }])
  );
}

function getNodePositions(nodes: Node<AgentNodeData>[]): PositionMap {
  return Object.fromEntries(
    nodes.map((node) => [node.id, { ...node.position }])
  );
}

function getSnapshotSignature(snapshot: GraphSnapshot): string {
  return JSON.stringify({
    agents: snapshot.agents,
    edges: snapshot.edges,
    positions: snapshot.positions,
  });
}

function getChildCountMap(edges: Edge[]) {
  const counts: Record<string, number> = {};

  for (const edge of edges) {
    counts[edge.source] = (counts[edge.source] ?? 0) + 1;
  }

  return counts;
}

function getAutoNodePosition(nodes: Node<AgentNodeData>[]) {
  const lastNode = nodes[nodes.length - 1];
  if (!lastNode) {
    return NEW_NODE_START_POSITION;
  }

  return {
    x: lastNode.position.x + NEW_NODE_OFFSET.x,
    y: lastNode.position.y + NEW_NODE_OFFSET.y,
  };
}

function buildCanvasNode(
  agent: Agent,
  position: { x: number; y: number },
  colorIndex: number,
  isSelected: boolean,
  childCount: number
): Node<AgentNodeData> {
  return {
    id: agent.id,
    type: "n8nNode",
    position,
    data: {
      agent,
      isSelected,
      childCount,
      colorIndex,
      execState: "idle",
      execOutput: "",
    },
  };
}

function getMutableAgentPayload(agent: Agent): Partial<Agent> {
  return {
    name: agent.name,
    role: agent.role,
    description: agent.description,
    systemPrompt: agent.systemPrompt,
    allowedTools: [...agent.allowedTools],
    toolConfig: cloneJson(agent.toolConfig ?? {}),
    allowedSubAgents: [...agent.allowedSubAgents],
    maxSteps: agent.maxSteps,
    active: agent.active,
    model: agent.model ?? null,
    provider: agent.provider ?? null,
  };
}

function areMutableAgentFieldsEqual(left: Agent, right: Agent): boolean {
  return (
    JSON.stringify(getMutableAgentPayload(left)) ===
    JSON.stringify(getMutableAgentPayload(right))
  );
}

function computeHierarchyDirty(agents: Agent[], edges: Edge[]): boolean {
  const subAgentsMap: Record<string, string[]> = {};
  for (const agent of agents) {
    subAgentsMap[agent.id] = [];
  }

  for (const edge of edges) {
    if (subAgentsMap[edge.source]) {
      subAgentsMap[edge.source].push(edge.target);
    }
  }

  const knownIds = new Set(agents.map((agent) => agent.id));
  for (const agent of agents) {
    const oldSubs = new Set(sanitizeAllowedSubAgents(agent, knownIds));
    const newSubs = subAgentsMap[agent.id] ?? [];
    const newSet = new Set(newSubs);

    if (
      oldSubs.size !== newSet.size ||
      [...oldSubs].some((subAgentId) => !newSet.has(subAgentId))
    ) {
      return true;
    }
  }

  return false;
}

export function useCanvasGraph() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);
  const savedPositionsRef = useRef<PositionMap>({});
  const undoStackRef = useRef<GraphSnapshot[]>([]);
  const redoStackRef = useRef<GraphSnapshot[]>([]);
  const dragSnapshotRef = useRef<GraphSnapshot | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<AgentNodeData>>(
    []
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const updateHistoryState = useCallback(() => {
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(redoStackRef.current.length > 0);
  }, []);

  const createSnapshot = useCallback(
    (overrides?: Partial<GraphSnapshot>): GraphSnapshot => {
      const positions =
        overrides?.positions ?? getNodePositions(nodes);

      return {
        agents: cloneJson(overrides?.agents ?? agents),
        edges: cloneJson(overrides?.edges ?? edges),
        positions: clonePositions(positions),
        selectedNodeId: overrides?.selectedNodeId ?? selectedNodeId,
      };
    },
    [agents, edges, nodes, selectedNodeId]
  );

  const pushHistory = useCallback(
    (snapshot?: GraphSnapshot) => {
      const nextSnapshot = snapshot ?? createSnapshot();
      const previousSnapshot =
        undoStackRef.current[undoStackRef.current.length - 1];

      if (
        previousSnapshot &&
        getSnapshotSignature(previousSnapshot) ===
          getSnapshotSignature(nextSnapshot) &&
        previousSnapshot.selectedNodeId === nextSnapshot.selectedNodeId
      ) {
        return;
      }

      undoStackRef.current.push(nextSnapshot);
      redoStackRef.current = [];
      updateHistoryState();
    },
    [createSnapshot, updateHistoryState]
  );

  const restoreLocalSnapshot = useCallback(
    (snapshot: GraphSnapshot) => {
      const nextPositions = clonePositions(snapshot.positions);
      const nextAgents = cloneJson(snapshot.agents);
      const nextEdges = cloneJson(snapshot.edges);

      savedPositionsRef.current = nextPositions;
      savePositions(nextPositions);
      setAgents(nextAgents);

      const { nodes: nextNodes } = buildNodesAndEdges(
        nextAgents,
        snapshot.selectedNodeId,
        nextPositions
      );

      setNodes(nextNodes);
      setEdges(nextEdges);
      setSelectedNodeId(snapshot.selectedNodeId);
      setIsDirty(computeHierarchyDirty(nextAgents, nextEdges));
      setLoadError("");
    },
    [setEdges, setNodes]
  );

  const syncSnapshotToBackend = useCallback(
    async (snapshot: GraphSnapshot) => {
      const currentAgentsById = new Map(
        agents.map((agent) => [agent.id, agent] as const)
      );
      const targetAgentsById = new Map(
        snapshot.agents.map((agent) => [agent.id, agent] as const)
      );

      for (const agentId of currentAgentsById.keys()) {
        if (!targetAgentsById.has(agentId)) {
          await api.agents.delete(agentId);
        }
      }

      for (const agentId of targetAgentsById.keys()) {
        if (!currentAgentsById.has(agentId)) {
          await api.agents.restore(agentId);
        }
      }

      for (const [agentId, targetAgent] of targetAgentsById.entries()) {
        const currentAgent = currentAgentsById.get(agentId);
        if (!currentAgent) {
          continue;
        }

        if (!areMutableAgentFieldsEqual(currentAgent, targetAgent)) {
          await api.agents.update(agentId, getMutableAgentPayload(targetAgent));
        }
      }
    },
    [agents]
  );

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedNodeId) ?? null,
    [agents, selectedNodeId]
  );

  const rootAgents = useMemo(() => {
    const targets = new Set(edges.map((edge) => edge.target));
    return agents.filter((agent) => !targets.has(agent.id));
  }, [agents, edges]);

  const hierarchyInfo = useMemo(() => {
    if (!selectedNodeId || agents.length === 0) {
      return null;
    }

    const parentEdge = edges.find((edge) => edge.target === selectedNodeId);
    const parent = parentEdge
      ? agents.find((agent) => agent.id === parentEdge.source) ?? null
      : null;

    const children = edges
      .filter((edge) => edge.source === selectedNodeId)
      .map((edge) => agents.find((agent) => agent.id === edge.target))
      .filter(Boolean) as Agent[];

    const inputs = edges
      .filter((edge) => edge.target === selectedNodeId)
      .map((edge) => agents.find((agent) => agent.id === edge.source))
      .filter(Boolean) as Agent[];

    return { parent, children, inputs };
  }, [selectedNodeId, agents, edges]);

  useEffect(() => {
    savedPositionsRef.current = loadPositions();

    api.agents
      .list()
      .then((items) => {
        const { nodes: nextNodes, edges: nextEdges } = buildNodesAndEdges(
          items,
          null,
          savedPositionsRef.current
        );

        setAgents(items);
        setNodes(nextNodes);
        setEdges(nextEdges);
        undoStackRef.current = [];
        redoStackRef.current = [];
        updateHistoryState();
        setIsDirty(false);
      })
      .catch((error: Error) => {
        setLoadError(error.message || "Failed to load agents.");
      })
      .finally(() => setLoading(false));
  }, [setEdges, setNodes, updateHistoryState]);

  useEffect(() => {
    const handler = (event: Event) => {
      const edgeId = (event as CustomEvent<{ edgeId?: string }>).detail?.edgeId;
      if (!edgeId) {
        return;
      }

      setStatusMessage("");
      setLoadError("");
      pushHistory();

      const nextEdges = edges.filter((edge) => edge.id !== edgeId);
      setEdges(nextEdges);
      setIsDirty(computeHierarchyDirty(agents, nextEdges));
    };

    window.addEventListener("canvas-edge-delete", handler as EventListener);
    return () =>
      window.removeEventListener("canvas-edge-delete", handler as EventListener);
  }, [agents, edges, pushHistory, setEdges]);

  useEffect(() => {
    const childCounts = getChildCountMap(edges);

    setNodes((currentNodes) =>
      currentNodes.map((node, index) => {
        const nextAgent =
          agents.find((agent) => agent.id === node.id) ?? node.data.agent;
        const nextChildCount = childCounts[node.id] ?? 0;
        const nextColorIndex = index % NODE_COLORS.length;

        if (
          nextAgent === node.data.agent &&
          nextChildCount === node.data.childCount &&
          nextColorIndex === node.data.colorIndex
        ) {
          return node;
        }

        return {
          ...node,
          data: {
            ...node.data,
            agent: nextAgent,
            childCount: nextChildCount,
            colorIndex: nextColorIndex,
          },
        };
      })
    );
  }, [agents, edges, setNodes]);

  useEffect(() => {
    setNodes((currentNodes) =>
      currentNodes.map((node) => {
        const shouldBeSelected = node.id === selectedNodeId;
        if (node.data.isSelected === shouldBeSelected) {
          return node;
        }

        return {
          ...node,
          data: { ...node.data, isSelected: shouldBeSelected },
        };
      })
    );

    setEdges((currentEdges) =>
      currentEdges.map((edge) => {
        const connected =
          edge.source === selectedNodeId || edge.target === selectedNodeId;

        if (edge.animated === connected && !edge.selected) {
          return edge;
        }

        return { ...edge, animated: connected, selected: false };
      })
    );
  }, [selectedNodeId, setEdges, setNodes]);

  const isValidConnection = useCallback(
    (connection: Edge | Connection) => {
      const source = connection.source;
      const target = connection.target;

      if (!source || !target || source === target) {
        return false;
      }

      if (edges.some((edge) => edge.source === source && edge.target === target)) {
        return false;
      }

      if (edges.some((edge) => edge.source === target && edge.target === source)) {
        return false;
      }

      const adjacencyMap: Record<string, string[]> = {};
      for (const agent of agents) {
        adjacencyMap[agent.id] = [];
      }

      for (const edge of edges) {
        if (adjacencyMap[edge.source]) {
          adjacencyMap[edge.source].push(edge.target);
        }
      }

      if (!adjacencyMap[source]) {
        adjacencyMap[source] = [];
      }
      adjacencyMap[source].push(target);

      return !hasHierarchyCycle(adjacencyMap);
    },
    [agents, edges]
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNodeId((current) => (current === node.id ? null : node.id));
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      const nextEdges = addEdge(
        {
          ...connection,
          type: "deletableEdge",
        },
        cloneJson(edges)
      );

      pushHistory();
      setEdges(nextEdges);
      setIsDirty(computeHierarchyDirty(agents, nextEdges));
      setStatusMessage("");
      setLoadError("");
    },
    [agents, edges, pushHistory, setEdges]
  );

  const onEdgesDelete = useCallback(() => {
    setIsDirty(computeHierarchyDirty(agents, edges));
  }, [agents, edges]);

  const onNodeDragStart = useCallback(() => {
    if (dragSnapshotRef.current || historyBusy) {
      return;
    }

    dragSnapshotRef.current = createSnapshot();
  }, [createSnapshot, historyBusy]);

  const onNodeDragStop = useCallback(() => {
    const currentPositions = getNodePositions(nodes);
    const dragSnapshot = dragSnapshotRef.current;

    if (
      dragSnapshot &&
      JSON.stringify(dragSnapshot.positions) !== JSON.stringify(currentPositions)
    ) {
      pushHistory(dragSnapshot);
    }

    dragSnapshotRef.current = null;
    savedPositionsRef.current = currentPositions;
    savePositions(currentPositions);
  }, [nodes, pushHistory]);

  const autoLayout = useCallback(() => {
    const historySnapshot = createSnapshot();
    const clearedPositions: PositionMap = {};
    const { nodes: nextNodes, edges: nextEdges } = buildNodesAndEdges(
      agents,
      selectedNodeId,
      clearedPositions
    );

    pushHistory(historySnapshot);
    savedPositionsRef.current = clearedPositions;
    savePositions(clearedPositions);
    setNodes(nextNodes);
    setEdges(nextEdges);
    setIsDirty(computeHierarchyDirty(agents, nextEdges));
    setStatusMessage("");
    setLoadError("");
  }, [agents, createSnapshot, pushHistory, selectedNodeId, setEdges, setNodes]);

  const removeEdgesByIds = useCallback(
    (edgeIds: string[], options?: { skipHistory?: boolean }) => {
      const uniqueEdgeIds = new Set(edgeIds);
      if (uniqueEdgeIds.size === 0) {
        return;
      }

      const nextEdges = edges.filter((edge) => !uniqueEdgeIds.has(edge.id));
      if (nextEdges.length === edges.length) {
        return;
      }

      if (!options?.skipHistory) {
        pushHistory();
      }

      setEdges(nextEdges);
      setIsDirty(computeHierarchyDirty(agents, nextEdges));
      setStatusMessage("");
      setLoadError("");
    },
    [agents, edges, pushHistory, setEdges]
  );

  const disconnectSelected = useCallback(() => {
    if (!selectedNodeId) {
      return;
    }

    const nextEdges = edges.filter(
      (edge) => edge.source !== selectedNodeId && edge.target !== selectedNodeId
    );

    if (nextEdges.length === edges.length) {
      return;
    }

    pushHistory();
    setEdges(nextEdges);
    setIsDirty(computeHierarchyDirty(agents, nextEdges));
    setStatusMessage("");
    setLoadError("");
  }, [agents, edges, pushHistory, selectedNodeId, setEdges]);

  const removeEdgeBetween = useCallback(
    (sourceId: string, targetId: string) => {
      const edgeIds = edges
        .filter((edge) => edge.source === sourceId && edge.target === targetId)
        .map((edge) => edge.id);

      removeEdgesByIds(edgeIds);
    },
    [edges, removeEdgesByIds]
  );

  const revertChanges = useCallback(() => {
    if (!isDirty) {
      return;
    }

    pushHistory();

    const { nodes: nextNodes, edges: nextEdges } = buildNodesAndEdges(
      agents,
      selectedNodeId,
      savedPositionsRef.current
    );

    setNodes(nextNodes);
    setEdges(nextEdges);
    setIsDirty(false);
    setStatusMessage("");
    setLoadError("");
  }, [agents, isDirty, pushHistory, selectedNodeId, setEdges, setNodes]);

  const saveHierarchy = useCallback(async () => {
    setSaving(true);
    setLoadError("");
    setStatusMessage("");

    try {
      const subAgentsMap: Record<string, string[]> = {};
      for (const agent of agents) {
        subAgentsMap[agent.id] = [];
      }

      for (const edge of edges) {
        if (subAgentsMap[edge.source]) {
          subAgentsMap[edge.source].push(edge.target);
        }
      }

      if (hasHierarchyCycle(subAgentsMap)) {
        throw new Error("Cycle detected - remove a connection to break the loop.");
      }

      const knownIds = new Set(agents.map((agent) => agent.id));
      const changed: { id: string; subs: string[] }[] = [];

      for (const agent of agents) {
        const oldSubs = new Set(sanitizeAllowedSubAgents(agent, knownIds));
        const newSubs = subAgentsMap[agent.id] ?? [];
        const newSet = new Set(newSubs);

        if (
          oldSubs.size !== newSet.size ||
          [...oldSubs].some((subAgentId) => !newSet.has(subAgentId))
        ) {
          changed.push({ id: agent.id, subs: newSubs });
        }
      }

      for (const item of changed) {
        await api.agents.update(item.id, { allowedSubAgents: item.subs });
      }

      const updatedAgents = await api.agents.list();
      const currentPositions = getNodePositions(nodes);

      savedPositionsRef.current = currentPositions;
      savePositions(currentPositions);
      setAgents(updatedAgents);

      const { nodes: nextNodes, edges: nextEdges } = buildNodesAndEdges(
        updatedAgents,
        selectedNodeId,
        currentPositions
      );

      setNodes(nextNodes);
      setEdges(nextEdges);
      setIsDirty(false);
      setStatusMessage(`Saved - ${changed.length} agent(s) updated.`);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }, [agents, edges, nodes, selectedNodeId, setEdges, setNodes]);

  const onAgentUpdated = useCallback(
    (updated: Agent) => {
      const historySnapshot = createSnapshot();
      const nextAgents = agents.map((agent) =>
        agent.id === updated.id ? updated : agent
      );

      pushHistory(historySnapshot);
      setAgents(nextAgents);
      setNodes((currentNodes) =>
        currentNodes.map((node) =>
          node.id === updated.id
            ? { ...node, data: { ...node.data, agent: updated } }
            : node
        )
      );
      setIsDirty(computeHierarchyDirty(nextAgents, edges));
      setStatusMessage("");
      setLoadError("");
    },
    [agents, createSnapshot, edges, pushHistory, setNodes]
  );

  const addAgent = useCallback(
    (agent: Agent, position?: { x: number; y: number }) => {
      const historySnapshot = createSnapshot();
      const nextPosition = position ?? getAutoNodePosition(nodes);
      const nextAgents = [...agents, agent];
      const knownIds = new Set(nextAgents.map((item) => item.id));
      const childCount = sanitizeAllowedSubAgents(agent, knownIds).length;
      const nextAgentEdges = sanitizeAllowedSubAgents(agent, knownIds).map(
        (subAgentId) => ({
          id: `${agent.id}->${subAgentId}`,
          source: agent.id,
          target: subAgentId,
          type: "deletableEdge" as const,
        })
      );
      const nextEdges = [...edges, ...nextAgentEdges];

      pushHistory(historySnapshot);

      savedPositionsRef.current = {
        ...savedPositionsRef.current,
        [agent.id]: nextPosition,
      };
      savePositions(savedPositionsRef.current);

      setAgents(nextAgents);
      setNodes((currentNodes) => [
        ...currentNodes.map((node) =>
          node.data.isSelected
            ? { ...node, data: { ...node.data, isSelected: false } }
            : node
        ),
        buildCanvasNode(
          agent,
          nextPosition,
          currentNodes.length % NODE_COLORS.length,
          true,
          childCount
        ),
      ]);
      setEdges(nextEdges);
      setSelectedNodeId(agent.id);
      setIsDirty(computeHierarchyDirty(nextAgents, nextEdges));
      setLoadError("");
      setStatusMessage(`Agent "${agent.name}" created.`);
    },
    [agents, createSnapshot, edges, nodes, pushHistory, setEdges, setNodes]
  );

  const deleteAgent = useCallback(
    async (agentId: string) => {
      const targetAgent = agents.find((agent) => agent.id === agentId);
      if (!targetAgent) {
        return;
      }

      const historySnapshot = createSnapshot();
      setLoadError("");
      setStatusMessage("");

      try {
        await api.agents.delete(agentId);

        const nextAgents = agents.filter((agent) => agent.id !== agentId);
        const nextEdges = edges.filter(
          (edge) => edge.source !== agentId && edge.target !== agentId
        );

        pushHistory(historySnapshot);
        setAgents(nextAgents);
        setNodes((currentNodes) =>
          currentNodes.filter((node) => node.id !== agentId)
        );
        setEdges(nextEdges);

        if (selectedNodeId === agentId) {
          setSelectedNodeId(null);
        }

        const nextPositions = clonePositions(savedPositionsRef.current);
        delete nextPositions[agentId];
        savedPositionsRef.current = nextPositions;
        savePositions(nextPositions);

        setIsDirty(computeHierarchyDirty(nextAgents, nextEdges));
        setStatusMessage(`Agent "${targetAgent.name}" moved to trash.`);
      } catch (error) {
        setLoadError(
          error instanceof Error ? error.message : "Failed to archive agent."
        );
        throw error;
      }
    },
    [agents, createSnapshot, edges, pushHistory, selectedNodeId, setEdges, setNodes]
  );

  const undo = useCallback(async () => {
    const snapshot = undoStackRef.current[undoStackRef.current.length - 1];
    if (!snapshot || historyBusy) {
      return;
    }

    const currentSnapshot = createSnapshot();
    setHistoryBusy(true);
    setLoadError("");

    try {
      await syncSnapshotToBackend(snapshot);
      undoStackRef.current.pop();
      redoStackRef.current.push(currentSnapshot);
      restoreLocalSnapshot(snapshot);
      setStatusMessage("Undo complete.");
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Failed to undo the last change."
      );
    } finally {
      setHistoryBusy(false);
      updateHistoryState();
    }
  }, [
    createSnapshot,
    historyBusy,
    restoreLocalSnapshot,
    syncSnapshotToBackend,
    updateHistoryState,
  ]);

  const redo = useCallback(async () => {
    const snapshot = redoStackRef.current[redoStackRef.current.length - 1];
    if (!snapshot || historyBusy) {
      return;
    }

    const currentSnapshot = createSnapshot();
    setHistoryBusy(true);
    setLoadError("");

    try {
      await syncSnapshotToBackend(snapshot);
      redoStackRef.current.pop();
      undoStackRef.current.push(currentSnapshot);
      restoreLocalSnapshot(snapshot);
      setStatusMessage("Redo complete.");
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Failed to redo the last change."
      );
    } finally {
      setHistoryBusy(false);
      updateHistoryState();
    }
  }, [
    createSnapshot,
    historyBusy,
    restoreLocalSnapshot,
    syncSnapshotToBackend,
    updateHistoryState,
  ]);

  return {
    agents,
    loading,
    loadError,
    setLoadError,
    selectedNodeId,
    setSelectedNodeId,
    selectedAgent,
    rootAgents,
    hierarchyInfo,
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
    canUndo,
    canRedo,
    historyBusy,
    isValidConnection,
    onNodeClick,
    onPaneClick,
    onConnect,
    onEdgesDelete,
    onNodeDragStart,
    onNodeDragStop,
    autoLayout,
    disconnectSelected,
    removeEdgeBetween,
    removeEdgesByIds,
    revertChanges,
    saveHierarchy,
    onAgentUpdated,
    addAgent,
    deleteAgent,
    undo,
    redo,
  };
}
