"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
  Brain,
  Zap,
  GitBranch,
  CheckCircle,
  AlertTriangle,
  Clock,
  Wrench,
  ChevronDown,
  ChevronRight,
  Search,
  Filter,
} from "lucide-react";
import type { ExecutionStep } from "@/lib/api";

const stepIcons: Record<string, typeof Brain> = {
  thinking: Brain,
  action: Zap,
  tool_call: Wrench,
  delegation: GitBranch,
  result: CheckCircle,
  error: AlertTriangle,
  waiting: Clock,
};

const stepColors: Record<string, string> = {
  thinking: "#7bd0ff",
  action: "#008abb",
  tool_call: "#c084fc",
  delegation: "#4edea3",
  result: "#4edea3",
  error: "#ffb4ab",
  waiting: "#f0c674",
};

const stepLabels: Record<string, string> = {
  thinking: "Thinking",
  action: "Action",
  tool_call: "Tool Call",
  delegation: "Delegation",
  result: "Result",
  error: "Error",
  waiting: "Waiting",
};

interface StepGroup {
  type: string;
  steps: ExecutionStep[];
  isCollapsible: boolean;
}

function groupSteps(steps: ExecutionStep[]): StepGroup[] {
  const groups: StepGroup[] = [];
  let currentGroup: StepGroup | null = null;

  for (const step of steps) {
    const isCollapsibleType = step.stepType === "tool_call" || step.stepType === "thinking";

    if (
      currentGroup &&
      currentGroup.type === step.stepType &&
      isCollapsibleType
    ) {
      currentGroup.steps.push(step);
    } else {
      currentGroup = {
        type: step.stepType,
        steps: [step],
        isCollapsible: isCollapsibleType,
      };
      groups.push(currentGroup);
    }
  }

  return groups;
}

// ─── Virtualized list: only renders visible items ───────────────

const ITEM_HEIGHT = 80; // Approximate height per step
const OVERSCAN = 5;

function VirtualizedStepList({
  steps,
  collapsedGroups,
  toggleGroup,
  searchQuery,
}: {
  steps: ExecutionStep[];
  collapsedGroups: Set<number>;
  toggleGroup: (index: number) => void;
  searchQuery: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600);

  const groups = useMemo(() => groupSteps(steps), [steps]);

  // Filter steps by search query
  const filteredGroups = useMemo(() => {
    if (!searchQuery) return groups;
    return groups
      .map((group) => ({
        ...group,
        steps: group.steps.filter(
          (step) =>
            step.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
            step.stepType.toLowerCase().includes(searchQuery.toLowerCase())
        ),
      }))
      .filter((group) => group.steps.length > 0);
  }, [groups, searchQuery]);

  // Calculate visible items for virtualization
  const visibleItems = useMemo(() => {
    const items: { type: "header" | "step"; groupIndex: number; step?: ExecutionStep; group?: StepGroup }[] = [];

    filteredGroups.forEach((group, groupIndex) => {
      if (group.isCollapsible && group.steps.length > 1) {
        items.push({ type: "header", groupIndex, group });
        if (!collapsedGroups.has(groupIndex)) {
          group.steps.forEach((step) => {
            items.push({ type: "step", groupIndex, step });
          });
        }
      } else {
        group.steps.forEach((step) => {
          items.push({ type: "step", groupIndex, step });
        });
      }
    });

    return items;
  }, [filteredGroups, collapsedGroups]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      setContainerHeight(entries[0].contentRect.height);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const handleScroll = useCallback(() => {
    if (containerRef.current) {
      setScrollTop(containerRef.current.scrollTop);
    }
  }, []);

  // Only virtualize if we have many items
  const shouldVirtualize = visibleItems.length > 50;

  if (!shouldVirtualize) {
    // Render all items without virtualization for small lists
    return (
      <div className="relative">
        {/* Ghost Line */}
        <div
          className="absolute left-[15px] top-2 bottom-2 w-[1px]"
          style={{ background: "rgba(69, 70, 77, 0.1)" }}
        />
        <div className="space-y-1">
          {filteredGroups.map((group, groupIndex) => (
            <div key={groupIndex}>
              {group.isCollapsible && group.steps.length > 1 && (
                <button
                  onClick={() => toggleGroup(groupIndex)}
                  className="flex items-center gap-2 py-2 px-1 w-full text-left text-xs font-medium uppercase tracking-wide rounded-lg transition-colors hover:bg-[var(--surface-high)]"
                  style={{ color: stepColors[group.type] || "#8c92a4" }}
                >
                  {collapsedGroups.has(groupIndex) ? (
                    <ChevronRight className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                  {stepLabels[group.type] || group.type} ({group.steps.length} steps)
                </button>
              )}
              {(!group.isCollapsible || group.steps.length === 1 || !collapsedGroups.has(groupIndex)) &&
                group.steps.map((step, i) => (
                  <StepItem key={step.id} step={step} index={i} />
                ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Virtualized rendering for large lists
  const totalHeight = visibleItems.length * ITEM_HEIGHT;
  const startIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN);
  const endIndex = Math.min(
    visibleItems.length,
    Math.ceil((scrollTop + containerHeight) / ITEM_HEIGHT) + OVERSCAN
  );

  return (
    <div
      ref={containerRef}
      className="relative overflow-auto"
      style={{ maxHeight: "70vh" }}
      onScroll={handleScroll}
    >
      {/* Ghost Line */}
      <div
        className="absolute left-[15px] top-2 bottom-2 w-[1px] z-0"
        style={{ background: "rgba(69, 70, 77, 0.1)" }}
      />
      <div style={{ height: totalHeight, position: "relative" }}>
        {visibleItems.slice(startIndex, endIndex).map((item, i) => {
          const actualIndex = startIndex + i;
          const top = actualIndex * ITEM_HEIGHT;

          if (item.type === "header" && item.group) {
            return (
              <div
                key={`header-${item.groupIndex}`}
                style={{ position: "absolute", top, height: ITEM_HEIGHT, width: "100%" }}
              >
                <button
                  onClick={() => toggleGroup(item.groupIndex)}
                  className="flex items-center gap-2 py-2 px-1 w-full text-left text-xs font-medium uppercase tracking-wide rounded-lg transition-colors hover:bg-[var(--surface-high)]"
                  style={{ color: stepColors[item.group.type] || "#8c92a4" }}
                >
                  {collapsedGroups.has(item.groupIndex) ? (
                    <ChevronRight className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                  {stepLabels[item.group.type] || item.group.type} ({item.group.steps.length} steps)
                </button>
              </div>
            );
          }

          if (item.step) {
            return (
              <div
                key={item.step.id}
                style={{ position: "absolute", top, height: ITEM_HEIGHT, width: "100%" }}
              >
                <StepItem step={item.step} index={actualIndex} />
              </div>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}

function StepItem({ step, index }: { step: ExecutionStep; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = stepIcons[step.stepType] || Brain;
  const color = stepColors[step.stepType] || "#8c92a4";
  const isLong = step.content.length > 300;

  return (
    <div
      className="relative flex items-start gap-4 py-3 px-1 rounded-lg"
      style={{ animationDelay: `${Math.min(index, 20) * 30}ms` }}
    >
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 z-10"
        style={{ background: "var(--surface-high)" }}
      >
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <div className="flex-1 min-w-0 pt-1">
        <div className="flex items-center gap-2 mb-1.5">
          <span
            className="text-xs font-semibold uppercase tracking-wide"
            style={{ color }}
          >
            {stepLabels[step.stepType] || step.stepType}
          </span>
          <span
            className="text-xs"
            style={{ color: "var(--on-surface-dim)" }}
          >
            {new Date(step.createdAt).toLocaleTimeString()}
          </span>
        </div>
        <div
          className="text-sm whitespace-pre-wrap break-words leading-relaxed rounded-lg p-3 relative"
          style={{ background: "var(--surface-lowest)" }}
        >
          {isLong && !expanded ? (
            <>
              {step.content.slice(0, 300)}...
              <button
                onClick={() => setExpanded(true)}
                className="ml-1 text-accent-cyan text-xs hover:underline"
              >
                Show more
              </button>
            </>
          ) : (
            <>
              {step.content}
              {isLong && expanded && (
                <button
                  onClick={() => setExpanded(false)}
                  className="ml-1 text-accent-cyan text-xs hover:underline"
                >
                  Show less
                </button>
              )}
            </>
          )}
        </div>
        {step.meta && Object.keys(step.meta).length > 0 && (
          <details className="mt-2">
            <summary
              className="text-[11px] cursor-pointer hover:text-accent-cyan"
              style={{ color: "var(--on-surface-dim)" }}
            >
              Metadata
            </summary>
            <pre
              className="text-[11px] font-mono mt-1 p-2 rounded-lg overflow-auto"
              style={{ background: "var(--surface-lowest)", color: "var(--on-surface-dim)" }}
            >
              {JSON.stringify(step.meta, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}

// ─── Main Exported Component ────────────────────────────────────

export default function ExecutionTimeline({
  steps,
  isRunning = false,
}: {
  steps: ExecutionStep[];
  isRunning?: boolean;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<number>>(new Set());
  const [filterType, setFilterType] = useState<string>("");
  const stepsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new steps arrive
  useEffect(() => {
    if (isRunning) {
      stepsEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [steps.length, isRunning]);

  const filteredSteps = useMemo(() => {
    if (!filterType) return steps;
    return steps.filter((s) => s.stepType === filterType);
  }, [steps, filterType]);

  const toggleGroup = useCallback((index: number) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const collapseAll = useCallback(() => {
    const groups = groupSteps(filteredSteps);
    const collapsible = new Set<number>();
    groups.forEach((g, i) => {
      if (g.isCollapsible && g.steps.length > 1) collapsible.add(i);
    });
    setCollapsedGroups(collapsible);
  }, [filteredSteps]);

  const expandAll = useCallback(() => {
    setCollapsedGroups(new Set());
  }, []);

  // Get unique step types for filter
  const stepTypes = useMemo(
    () => [...new Set(steps.map((s) => s.stepType))],
    [steps]
  );

  return (
    <div>
      {/* Toolbar */}
      {steps.length > 5 && (
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
              style={{ color: "var(--on-surface-dim)" }}
            />
            <input
              type="text"
              placeholder="Search logs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-8 pl-9 pr-3 rounded-lg text-xs border-0 text-foreground"
              style={{ background: "var(--surface-lowest)" }}
            />
          </div>

          {/* Type filter */}
          <div className="relative">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="h-8 pl-2 pr-6 rounded-lg text-xs border-0 text-foreground appearance-none cursor-pointer"
              style={{ background: "var(--surface-lowest)" }}
            >
              <option value="">All types</option>
              {stepTypes.map((type) => (
                <option key={type} value={type}>
                  {stepLabels[type] || type}
                </option>
              ))}
            </select>
            <Filter
              className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none"
              style={{ color: "var(--on-surface-dim)" }}
            />
          </div>

          {/* Collapse/Expand buttons */}
          <button
            onClick={collapseAll}
            className="h-8 px-3 rounded-lg text-xs transition-colors hover:bg-[var(--surface-high)]"
            style={{ background: "var(--surface-lowest)", color: "var(--on-surface-dim)" }}
          >
            Collapse All
          </button>
          <button
            onClick={expandAll}
            className="h-8 px-3 rounded-lg text-xs transition-colors hover:bg-[var(--surface-high)]"
            style={{ background: "var(--surface-lowest)", color: "var(--on-surface-dim)" }}
          >
            Expand All
          </button>

          {/* Step count */}
          <span
            className="text-[11px] font-mono"
            style={{ color: "var(--on-surface-dim)" }}
          >
            {filteredSteps.length} steps
          </span>
        </div>
      )}

      {/* Steps */}
      {filteredSteps.length === 0 ? (
        <div
          className="text-center py-12 text-sm"
          style={{ color: "var(--on-surface-dim)" }}
        >
          {isRunning ? (
            <div className="flex items-center justify-center gap-2">
              <div className="w-4 h-4 animate-spin rounded-full border-2 border-accent-cyan border-t-transparent" />
              Waiting for execution steps...
            </div>
          ) : searchQuery ? (
            "No steps match your search"
          ) : (
            "No execution steps recorded yet"
          )}
        </div>
      ) : (
        <VirtualizedStepList
          steps={filteredSteps}
          collapsedGroups={collapsedGroups}
          toggleGroup={toggleGroup}
          searchQuery={searchQuery}
        />
      )}

      <div ref={stepsEndRef} />

      {isRunning && filteredSteps.length > 0 && (
        <div className="flex items-center gap-2 mt-4 text-accent-cyan text-sm">
          <div className="w-4 h-4 animate-spin rounded-full border-2 border-accent-cyan border-t-transparent" />
          Execution in progress...
        </div>
      )}
    </div>
  );
}
