"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Bot,
  GitBranch,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Search,
} from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, type Agent } from "@/lib/api";
import {
  ROOT_PARENT_VALUE,
  areIdListsEqual,
  buildAgentHierarchy,
  getAncestorIds,
  getDescendantIds,
  hasHierarchyCycle,
  sanitizeAllowedSubAgents,
} from "@/lib/agent-hierarchy";

const CANVAS_GRID_STYLE = {
  backgroundImage:
    "linear-gradient(rgba(123,208,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(123,208,255,0.06) 1px, transparent 1px)",
  backgroundSize: "36px 36px",
};

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint: string;
}) {
  return (
    <div
      className="rounded-2xl p-4"
      style={{ background: "var(--surface-container)" }}
    >
      <p
        className="text-[11px] uppercase tracking-[0.08rem]"
        style={{ color: "var(--on-surface-dim)" }}
      >
        {label}
      </p>
      <p className="mt-2 font-heading text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs" style={{ color: "var(--on-surface-dim)" }}>
        {hint}
      </p>
    </div>
  );
}

function TreeNode({
  agentId,
  graph,
  selectedAgentId,
  onSelect,
  lineage = [],
}: {
  agentId: string;
  graph: ReturnType<typeof buildAgentHierarchy>;
  selectedAgentId: string | null;
  onSelect: (agentId: string) => void;
  lineage?: string[];
}) {
  const agent = graph.agentsById[agentId];
  const children = (graph.childIdsById[agentId] ?? []).filter(
    (childId) => !lineage.includes(childId)
  );
  const childCount = graph.childIdsById[agentId]?.length ?? 0;

  if (!agent) {
    return null;
  }

  return (
    <div className="flex flex-col items-center gap-5">
      <button
        type="button"
        onClick={() => onSelect(agentId)}
        className={`w-[240px] rounded-2xl p-4 text-left transition-all duration-200 ${
          selectedAgentId === agentId ? "ring-2 ring-accent-cyan" : ""
        }`}
        style={{
          background:
            selectedAgentId === agentId
              ? "var(--surface-high)"
              : "rgba(23,31,51,0.92)",
          boxShadow:
            selectedAgentId === agentId
              ? "0 0 0 1px rgba(123,208,255,0.15), 0 20px 40px rgba(6,14,32,0.28)"
              : "0 16px 36px rgba(6,14,32,0.18)",
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{
                background: agent.active
                  ? "linear-gradient(135deg, #7bd0ff, #008abb)"
                  : "var(--surface-highest)",
              }}
            >
              <Bot
                className="h-5 w-5"
                style={{
                  color: agent.active ? "#060e20" : "var(--on-surface-dim)",
                }}
              />
            </div>
            <div>
              <p className="font-heading text-sm font-semibold">{agent.name}</p>
              <p
                className="text-[11px] uppercase tracking-[0.05rem]"
                style={{ color: "var(--on-surface-dim)" }}
              >
                {agent.role}
              </p>
            </div>
          </div>
          <Badge
            variant={agent.active ? "secondary" : "outline"}
            className="border-0 bg-white/6 text-[10px] uppercase tracking-[0.08rem]"
            style={{
              color: agent.active ? "var(--accent-teal)" : "var(--on-surface-dim)",
            }}
          >
            {agent.active ? "Active" : "Inactive"}
          </Badge>
        </div>

        <div className="mt-4 flex items-center gap-3 text-xs">
          <span style={{ color: "var(--on-surface-dim)" }}>Direct reports</span>
          <span className="font-medium text-accent-cyan">{childCount}</span>
          <span style={{ color: "var(--on-surface-dim)" }}>Max steps</span>
          <span className="font-medium text-accent-cyan">{agent.maxSteps}</span>
        </div>
      </button>

      {children.length > 0 && (
        <>
          <div className="h-5 w-px bg-white/10" />
          {children.length === 1 ? (
            <div className="relative pt-5 before:absolute before:left-1/2 before:top-0 before:h-5 before:w-px before:-translate-x-1/2 before:bg-white/10">
              <TreeNode
                agentId={children[0]}
                graph={graph}
                selectedAgentId={selectedAgentId}
                onSelect={onSelect}
                lineage={[...lineage, agentId]}
              />
            </div>
          ) : (
            <div className="relative flex items-start justify-center gap-6 pt-5">
              <div className="absolute left-10 right-10 top-0 h-px bg-white/10" />
              {children.map((childId) => (
                <div
                  key={childId}
                  className="relative pt-5 before:absolute before:left-1/2 before:top-0 before:h-5 before:w-px before:-translate-x-1/2 before:bg-white/10"
                >
                  <TreeNode
                    agentId={childId}
                    graph={graph}
                    selectedAgentId={selectedAgentId}
                    onSelect={onSelect}
                    lineage={[...lineage, agentId]}
                  />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function AgentHierarchyCanvas() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [draftParentId, setDraftParentId] = useState(ROOT_PARENT_VALUE);
  const [draftChildIds, setDraftChildIds] = useState<string[]>([]);
  const [childSearch, setChildSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  const graph = buildAgentHierarchy(agents);
  const knownAgentIds = new Set(agents.map((agent) => agent.id));
  const selectedAgent = selectedAgentId ? graph.agentsById[selectedAgentId] : null;
  const currentParentId =
    selectedAgentId && graph.parentIdById[selectedAgentId]
      ? graph.parentIdById[selectedAgentId]
      : ROOT_PARENT_VALUE;
  const currentChildIds = selectedAgent
    ? sanitizeAllowedSubAgents(selectedAgent, knownAgentIds)
    : [];
  const isDirty =
    selectedAgent !== null &&
    (currentParentId !== draftParentId ||
      !areIdListsEqual(currentChildIds, draftChildIds));
  const ancestorIds = selectedAgentId
    ? getAncestorIds(selectedAgentId, graph.parentIdById)
    : new Set<string>();
  const descendantIds = selectedAgentId
    ? getDescendantIds(selectedAgentId, graph.childIdsById)
    : new Set<string>();
  const hierarchyHasCycle = hasHierarchyCycle(graph.childIdsById);

  useEffect(() => {
    api.agents
      .list()
      .then((items) => {
        setAgents(items);
        if (items.length > 0) {
          const initialSelection = buildAgentHierarchy(items).rootIds[0] ?? items[0].id;
          setSelectedAgentId(initialSelection);
        }
      })
      .catch((error: Error) => {
        setLoadError(error.message || "Failed to load agents.");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedAgentId && graph.rootIds.length > 0) {
      setSelectedAgentId(graph.rootIds[0]);
      return;
    }

    if (selectedAgentId && !graph.agentsById[selectedAgentId]) {
      setSelectedAgentId(graph.rootIds[0] ?? null);
    }
  }, [graph.agentsById, graph.rootIds, selectedAgentId]);

  useEffect(() => {
    if (!selectedAgentId) {
      return;
    }

    const nextSelectedAgent = agents.find((agent) => agent.id === selectedAgentId);
    if (!nextSelectedAgent) {
      return;
    }

    const nextGraph = buildAgentHierarchy(agents);
    const nextKnownAgentIds = new Set(agents.map((agent) => agent.id));

    setDraftParentId(
      nextGraph.parentIdById[nextSelectedAgent.id] ?? ROOT_PARENT_VALUE
    );
    setDraftChildIds(
      sanitizeAllowedSubAgents(nextSelectedAgent, nextKnownAgentIds)
    );
    setChildSearch("");
    setStatusMessage("");
  }, [agents, selectedAgentId]);

  const handleSelectAgent = (nextAgentId: string) => {
    if (nextAgentId === selectedAgentId) {
      return;
    }

    if (isDirty) {
      const shouldDiscard = window.confirm(
        "You have unsaved hierarchy changes. Discard them and switch agents?"
      );
      if (!shouldDiscard) {
        return;
      }
    }

    setSelectedAgentId(nextAgentId);
  };

  const toggleDraftChild = (childId: string) => {
    setStatusMessage("");
    setDraftChildIds((current) =>
      current.includes(childId)
        ? current.filter((id) => id !== childId)
        : [...current, childId]
    );
  };

  const resetDraft = () => {
    if (!selectedAgent) {
      return;
    }

    setDraftParentId(currentParentId);
    setDraftChildIds(currentChildIds);
    setStatusMessage("");
  };

  const saveHierarchy = async () => {
    if (!selectedAgent) {
      return;
    }

    setSaving(true);
    setLoadError("");
    setStatusMessage("");

    try {
      const workingAgents = agents.map((agent) => ({
        ...agent,
        allowedSubAgents: sanitizeAllowedSubAgents(agent, knownAgentIds),
      }));
      const agentById = new Map(workingAgents.map((agent) => [agent.id, agent]));
      const nextParentId =
        draftParentId === ROOT_PARENT_VALUE ? null : draftParentId;
      const nextChildIds = draftChildIds.filter(
        (childId) =>
          childId !== selectedAgent.id &&
          knownAgentIds.has(childId) &&
          childId !== nextParentId
      );

      for (const agent of workingAgents) {
        if (agent.id === selectedAgent.id) {
          agent.allowedSubAgents = nextChildIds;
          continue;
        }

        agent.allowedSubAgents = agent.allowedSubAgents.filter(
          (childId) =>
            childId !== selectedAgent.id && !nextChildIds.includes(childId)
        );
      }

      if (nextParentId) {
        const nextParent = agentById.get(nextParentId);
        if (nextParent) {
          nextParent.allowedSubAgents = [
            ...nextParent.allowedSubAgents,
            selectedAgent.id,
          ].filter(
            (childId, index, list) => list.indexOf(childId) === index
          );
        }
      }

      const nextGraph = buildAgentHierarchy(workingAgents);
      if (hasHierarchyCycle(nextGraph.childIdsById)) {
        throw new Error(
          "This change would create a management loop. Pick a different manager or direct report."
        );
      }

      const originalById = new Map(
        agents.map((agent) => [
          agent.id,
          sanitizeAllowedSubAgents(agent, knownAgentIds),
        ])
      );

      const changedAgents = workingAgents.filter(
        (agent) =>
          !areIdListsEqual(
            originalById.get(agent.id) ?? [],
            agent.allowedSubAgents
          )
      );

      for (const agent of changedAgents) {
        await api.agents.update(agent.id, {
          allowedSubAgents: agent.allowedSubAgents,
        });
      }

      setAgents(workingAgents);
      setStatusMessage("Hierarchy updated.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save hierarchy.";
      setLoadError(message);
    } finally {
      setSaving(false);
    }
  };

  const directReports = draftChildIds
    .map((childId) => graph.agentsById[childId])
    .filter((agent): agent is Agent => Boolean(agent));
  const parentOptions = agents.filter(
    (agent) => agent.id !== selectedAgentId && !descendantIds.has(agent.id)
  );
  const childOptions = agents
    .filter((agent) => agent.id !== selectedAgentId)
    .filter((agent) => {
      const query = childSearch.trim().toLowerCase();
      if (!query) {
        return true;
      }

      return (
        agent.name.toLowerCase().includes(query) ||
        agent.role.toLowerCase().includes(query)
      );
    });

  return (
    <>
      <PageHeader
        title="Agent Canvas"
        description="Build manager-to-sub-agent chains visually and keep delegation relationships in a clean tree."
        actions={
          <>
            <Link href="/agents">
              <Button
                variant="secondary"
                className="border-0 bg-surface-high text-foreground"
              >
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

      {(loadError || graph.duplicateAssignments.length > 0 || hierarchyHasCycle) && (
        <div className="mb-6 space-y-3">
          {loadError && (
            <div
              className="flex items-start gap-3 rounded-2xl px-4 py-3 text-sm"
              style={{
                background: "rgba(255, 180, 171, 0.12)",
                color: "#ffb4ab",
              }}
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{loadError}</p>
            </div>
          )}
          {graph.duplicateAssignments.length > 0 && (
            <div
              className="flex items-start gap-3 rounded-2xl px-4 py-3 text-sm"
              style={{
                background: "rgba(240, 198, 116, 0.12)",
                color: "#f0c674",
              }}
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Some agents currently appear under multiple managers. Saving from
                this canvas will normalize them back into a single-parent tree.
              </p>
            </div>
          )}
          {hierarchyHasCycle && (
            <div
              className="flex items-start gap-3 rounded-2xl px-4 py-3 text-sm"
              style={{
                background: "rgba(240, 198, 116, 0.12)",
                color: "#f0c674",
              }}
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                A loop exists in the current hierarchy. Use the inspector to move
                one of the linked agents back to root and save.
              </p>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div
          className="flex items-center justify-center rounded-3xl py-24 text-sm"
          style={{
            background: "var(--surface-container)",
            color: "var(--on-surface-dim)",
          }}
        >
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading hierarchy canvas...
        </div>
      ) : agents.length === 0 ? (
        <div
          className="rounded-3xl px-6 py-20 text-center"
          style={{ background: "var(--surface-container)" }}
        >
          <Bot
            className="mx-auto mb-4 h-12 w-12"
            style={{ color: "var(--on-surface-dim)", opacity: 0.45 }}
          />
          <p className="font-heading text-xl font-semibold">No agents yet</p>
          <p
            className="mx-auto mt-2 max-w-md text-sm"
            style={{ color: "var(--on-surface-dim)" }}
          >
            Create a few agents first, then come back here to wire up the
            manager-to-specialist hierarchy.
          </p>
          <Link href="/agents/new" className="mt-6 inline-flex">
            <Button className="gradient-primary border-0 font-medium text-[#060e20] hover:opacity-90">
              <Plus className="mr-2 h-4 w-4" />
              Create Agent
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard
                label="Root Agents"
                value={graph.rootIds.length}
                hint="Agents with no manager above them"
              />
              <StatCard
                label="Management Links"
                value={graph.managedLinkCount}
                hint="Direct manager-to-sub-agent relationships"
              />
              <StatCard
                label="Leaf Agents"
                value={agents.filter((agent) => agent.allowedSubAgents.length === 0).length}
                hint="Agents that do not delegate further"
              />
            </div>

            <div
              className="overflow-hidden rounded-3xl border border-white/5"
              style={{ background: "var(--surface-low)" }}
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 px-5 py-4">
                <div>
                  <p className="font-heading text-lg font-semibold">
                    Delegation Tree
                  </p>
                  <p
                    className="text-sm"
                    style={{ color: "var(--on-surface-dim)" }}
                  >
                    Click any node to edit who it reports to and who it can
                    manage.
                  </p>
                </div>
                {selectedAgent && (
                  <div className="flex items-center gap-2 text-xs">
                    <Badge
                      variant="outline"
                      className="border-white/10 bg-white/5 text-foreground"
                    >
                      Focus: {selectedAgent.name}
                    </Badge>
                    {isDirty && (
                      <Badge className="border-0 bg-[#7bd0ff1a] text-accent-cyan">
                        Unsaved changes
                      </Badge>
                    )}
                  </div>
                )}
              </div>

              <ScrollArea className="h-[720px] w-full">
                <div className="min-w-full px-8 py-8" style={CANVAS_GRID_STYLE}>
                  <div className="inline-flex min-w-full items-start gap-10">
                    {graph.rootIds.map((rootId) => (
                      <div
                        key={rootId}
                        className="rounded-[28px] border border-white/5 p-6"
                        style={{
                          background: "rgba(11,19,38,0.75)",
                          minWidth: "320px",
                        }}
                      >
                        <TreeNode
                          agentId={rootId}
                          graph={graph}
                          selectedAgentId={selectedAgentId}
                          onSelect={handleSelectAgent}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </ScrollArea>
            </div>
          </div>

          <Card
            className="h-fit border-0 bg-surface-container xl:sticky xl:top-8"
            style={{ boxShadow: "0 24px 60px rgba(6,14,32,0.22)" }}
          >
            <CardHeader className="border-b border-white/5">
              <CardTitle>Hierarchy Inspector</CardTitle>
              <CardDescription>
                Use one agent as a manager and define which agents it can direct.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              {!selectedAgent ? (
                <div
                  className="rounded-2xl px-4 py-6 text-sm"
                  style={{
                    background: "var(--surface-low)",
                    color: "var(--on-surface-dim)",
                  }}
                >
                  Pick an agent from the canvas to edit its place in the tree.
                </div>
              ) : (
                <>
                  <div
                    className="rounded-2xl p-4"
                    style={{ background: "var(--surface-low)" }}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl gradient-primary">
                        <Bot className="h-5 w-5 text-[#060e20]" />
                      </div>
                      <div>
                        <p className="font-heading text-lg font-semibold">
                          {selectedAgent.name}
                        </p>
                        <p
                          className="text-[11px] uppercase tracking-[0.05rem]"
                          style={{ color: "var(--on-surface-dim)" }}
                        >
                          {selectedAgent.role}
                        </p>
                      </div>
                    </div>

                    <p
                      className="mt-3 text-sm"
                      style={{ color: "var(--on-surface-dim)" }}
                    >
                      {selectedAgent.description || "No description"}
                    </p>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <Badge
                        variant="outline"
                        className="border-white/10 bg-white/5 text-foreground"
                      >
                        {draftChildIds.length} direct reports
                      </Badge>
                      <Badge
                        variant="outline"
                        className="border-white/10 bg-white/5 text-foreground"
                      >
                        {currentParentId === ROOT_PARENT_VALUE
                          ? "Root manager"
                          : `Reports to ${graph.agentsById[currentParentId]?.name ?? "Unknown"}`}
                      </Badge>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label
                      className="text-[11px] uppercase tracking-[0.05rem]"
                      style={{ color: "var(--on-surface-dim)" }}
                    >
                      Reports To
                    </Label>
                    <Select
                      value={draftParentId}
                      onValueChange={(value) => {
                        setDraftParentId(value ?? ROOT_PARENT_VALUE);
                        setStatusMessage("");
                      }}
                    >
                      <SelectTrigger className="w-full border-0 bg-surface-low text-foreground">
                        <SelectValue placeholder="Choose a manager" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ROOT_PARENT_VALUE}>
                          No manager (root)
                        </SelectItem>
                        {parentOptions.map((agent) => (
                          <SelectItem key={agent.id} value={agent.id}>
                            {agent.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p
                      className="text-xs"
                      style={{ color: "var(--on-surface-dim)" }}
                    >
                      Descendants are excluded here so the hierarchy stays a tree.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <Label
                          className="text-[11px] uppercase tracking-[0.05rem]"
                          style={{ color: "var(--on-surface-dim)" }}
                        >
                          Direct Reports
                        </Label>
                        <p
                          className="mt-1 text-xs"
                          style={{ color: "var(--on-surface-dim)" }}
                        >
                          Toggle which agents this manager can instruct.
                        </p>
                      </div>
                      {directReports.length > 0 && (
                        <Badge
                          variant="outline"
                          className="border-white/10 bg-white/5 text-foreground"
                        >
                          {directReports.length} selected
                        </Badge>
                      )}
                    </div>

                    <div className="relative">
                      <Search
                        className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
                        style={{ color: "var(--on-surface-dim)" }}
                      />
                      <Input
                        value={childSearch}
                        onChange={(event) => setChildSearch(event.target.value)}
                        placeholder="Search agents to attach..."
                        className="border-0 bg-surface-low pl-10 text-foreground"
                      />
                    </div>

                    {directReports.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {directReports.map((agent) => (
                          <Badge
                            key={agent.id}
                            variant="outline"
                            className="border-[#7bd0ff33] bg-[#7bd0ff14] text-accent-cyan"
                          >
                            {agent.name}
                          </Badge>
                        ))}
                      </div>
                    )}

                    <ScrollArea className="h-[320px] rounded-2xl bg-surface-low">
                      <div className="space-y-2 p-3">
                        {childOptions.map((agent) => {
                          const isSelected = draftChildIds.includes(agent.id);
                          const isDisabled =
                            draftParentId === agent.id || ancestorIds.has(agent.id);
                          const currentManagerId = graph.parentIdById[agent.id];
                          const currentManagerName = currentManagerId
                            ? graph.agentsById[currentManagerId]?.name
                            : null;

                          return (
                            <button
                              key={agent.id}
                              type="button"
                              disabled={isDisabled}
                              onClick={() => toggleDraftChild(agent.id)}
                              className={`w-full rounded-2xl border px-3 py-3 text-left transition-all duration-200 ${
                                isSelected
                                  ? "border-[#7bd0ff55] bg-[#7bd0ff14]"
                                  : "border-transparent bg-white/[0.03] hover:bg-white/[0.05]"
                              } disabled:cursor-not-allowed disabled:opacity-45`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-medium">
                                    {agent.name}
                                  </p>
                                  <p
                                    className="text-[11px] uppercase tracking-[0.05rem]"
                                    style={{ color: "var(--on-surface-dim)" }}
                                  >
                                    {agent.role}
                                  </p>
                                </div>
                                <Badge
                                  variant={isSelected ? "secondary" : "outline"}
                                  className="border-0 bg-white/6 text-[10px] uppercase tracking-[0.08rem]"
                                  style={{
                                    color: isSelected
                                      ? "var(--accent-cyan)"
                                      : "var(--on-surface-dim)",
                                  }}
                                >
                                  {isSelected ? "Attached" : "Available"}
                                </Badge>
                              </div>

                              <div
                                className="mt-2 text-xs"
                                style={{ color: "var(--on-surface-dim)" }}
                              >
                                {isDisabled
                                  ? "Unavailable here because it sits above this agent in the tree."
                                  : currentManagerName && currentManagerName !== selectedAgent.name
                                    ? `Currently managed by ${currentManagerName}. Saving here will reassign it.`
                                    : "Can be attached under this manager."}
                              </div>
                            </button>
                          );
                        })}

                        {childOptions.length === 0 && (
                          <div
                            className="rounded-2xl px-4 py-6 text-sm text-center"
                            style={{ color: "var(--on-surface-dim)" }}
                          >
                            No matching agents.
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <Button
                      type="button"
                      onClick={saveHierarchy}
                      disabled={saving || !isDirty}
                      className="gradient-primary border-0 font-medium text-[#060e20] hover:opacity-90"
                    >
                      {saving ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="mr-2 h-4 w-4" />
                      )}
                      Save Tree
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={resetDraft}
                      disabled={saving || !isDirty}
                      className="border-0 bg-surface-high text-foreground"
                    >
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Reset
                    </Button>
                  </div>

                  {statusMessage && (
                    <div
                      className="rounded-2xl px-4 py-3 text-sm"
                      style={{
                        background: "rgba(78, 222, 163, 0.12)",
                        color: "var(--accent-teal)",
                      }}
                    >
                      {statusMessage}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
