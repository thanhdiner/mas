import type { Agent } from "@/lib/api";

export const ROOT_PARENT_VALUE = "__root__";

export interface DuplicateAssignment {
  childId: string;
  parentIds: string[];
}

export interface AgentHierarchyGraph {
  agentsById: Record<string, Agent>;
  childIdsById: Record<string, string[]>;
  parentIdById: Record<string, string | null>;
  rootIds: string[];
  managedLinkCount: number;
  duplicateAssignments: DuplicateAssignment[];
}

export function sanitizeAllowedSubAgents(
  agent: Agent,
  knownAgentIds: Set<string>
): string[] {
  const seen = new Set<string>();
  const sanitized: string[] = [];

  for (const childId of agent.allowedSubAgents) {
    if (childId === agent.id || !knownAgentIds.has(childId) || seen.has(childId)) {
      continue;
    }

    seen.add(childId);
    sanitized.push(childId);
  }

  return sanitized;
}

export function buildAgentHierarchy(agents: Agent[]): AgentHierarchyGraph {
  const knownAgentIds = new Set(agents.map((agent) => agent.id));
  const agentsById = Object.fromEntries(agents.map((agent) => [agent.id, agent]));
  const childIdsById: Record<string, string[]> = {};
  const parentIdById: Record<string, string | null> = {};
  const duplicateTracker = new Map<string, Set<string>>();
  let managedLinkCount = 0;

  for (const agent of agents) {
    childIdsById[agent.id] = sanitizeAllowedSubAgents(agent, knownAgentIds);
    parentIdById[agent.id] = null;
  }

  for (const agent of agents) {
    for (const childId of childIdsById[agent.id]) {
      managedLinkCount += 1;

      if (parentIdById[childId] === null) {
        parentIdById[childId] = agent.id;
        continue;
      }

      if (parentIdById[childId] !== agent.id) {
        const parents = duplicateTracker.get(childId) ?? new Set<string>();
        parents.add(parentIdById[childId] as string);
        parents.add(agent.id);
        duplicateTracker.set(childId, parents);
      }
    }
  }

  const rootIds = agents
    .filter((agent) => parentIdById[agent.id] === null)
    .map((agent) => agent.id);

  const reachable = new Set<string>();
  const visit = (agentId: string, lineage: Set<string>) => {
    if (lineage.has(agentId) || reachable.has(agentId)) {
      return;
    }

    reachable.add(agentId);
    const nextLineage = new Set(lineage);
    nextLineage.add(agentId);

    for (const childId of childIdsById[agentId] ?? []) {
      visit(childId, nextLineage);
    }
  };

  for (const rootId of rootIds) {
    visit(rootId, new Set<string>());
  }

  for (const agent of agents) {
    if (!reachable.has(agent.id)) {
      rootIds.push(agent.id);
      visit(agent.id, new Set<string>());
    }
  }

  return {
    agentsById,
    childIdsById,
    parentIdById,
    rootIds,
    managedLinkCount,
    duplicateAssignments: Array.from(duplicateTracker.entries()).map(
      ([childId, parentIds]) => ({
        childId,
        parentIds: Array.from(parentIds),
      })
    ),
  };
}

export function getAncestorIds(
  agentId: string,
  parentIdById: Record<string, string | null>
): Set<string> {
  const ancestors = new Set<string>();
  let currentId = parentIdById[agentId];

  while (currentId) {
    if (ancestors.has(currentId)) {
      break;
    }
    ancestors.add(currentId);
    currentId = parentIdById[currentId];
  }

  return ancestors;
}

export function getDescendantIds(
  agentId: string,
  childIdsById: Record<string, string[]>
): Set<string> {
  const descendants = new Set<string>();
  const stack = [...(childIdsById[agentId] ?? [])];

  while (stack.length > 0) {
    const childId = stack.pop() as string;
    if (descendants.has(childId)) {
      continue;
    }

    descendants.add(childId);
    stack.push(...(childIdsById[childId] ?? []));
  }

  return descendants;
}

export function hasHierarchyCycle(
  childIdsById: Record<string, string[]>
): boolean {
  const visited = new Set<string>();
  const stack = new Set<string>();

  const visit = (agentId: string) => {
    if (stack.has(agentId)) {
      return true;
    }
    if (visited.has(agentId)) {
      return false;
    }

    visited.add(agentId);
    stack.add(agentId);

    for (const childId of childIdsById[agentId] ?? []) {
      if (visit(childId)) {
        return true;
      }
    }

    stack.delete(agentId);
    return false;
  };

  return Object.keys(childIdsById).some(visit);
}

export function areIdListsEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}
