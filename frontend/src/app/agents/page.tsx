"use client";

import { useEffect, useState, useMemo } from "react";
import Fuse from "fuse.js";
import Link from "next/link";
import { Bot, Check, GitBranch, Plus, Power, PowerOff, Search, Trash2, X } from "lucide-react";
import { useAgents } from "@/lib/hooks/use-agents";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function AgentsPage() {
  const { agents, isLoading: loading, mutate } = useAgents();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  const filtered = useMemo(() => {
    const query = debouncedSearch.trim();
    if (!query) return agents;

    const fuse = new Fuse(agents, {
      keys: ["name", "role", "description"],
      threshold: 0.4,
      ignoreLocation: true,
      includeMatches: false,
    });

    return fuse.search(query).map((result) => result.item);
  }, [agents, debouncedSearch]);

  const handleArchive = async (e: React.MouseEvent, id: string, name: string) => {
    e.preventDefault();
    e.stopPropagation();

    mutate(
      (currentAgents) => {
        if (!currentAgents) return currentAgents;
        return currentAgents.filter((a) => a.id !== id);
      },
      false
    );

    try {
      await api.agents.delete(id);
      toast.success(`Agent "${name}" moved to trash`);
      mutate();
    } catch (err) {
      toast.error(`Failed to move agent "${name}" to trash`);
      console.error(err);
      mutate();
    }
  };

  const toggleSelect = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (selectedIds.size === filtered.length && filtered.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(a => a.id)));
    }
  };

  const handleBulkArchive = async () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);

    mutate(
      (currentAgents) => {
        if (!currentAgents) return currentAgents;
        return currentAgents.filter((a) => !ids.includes(a.id));
      },
      false
    );

    try {
      await Promise.all(ids.map(id => api.agents.delete(id)));
      toast.success(`${ids.length} agents moved to trash`);
      setSelectedIds(new Set());
      mutate();
    } catch (err) {
      toast.error("Failed to move some agents to trash");
      console.error(err);
      mutate();
    }
  };

  return (
    <>
      <PageHeader
        title="Agents"
        description="Manage your AI agent fleet"
        actions={
          <>
            <Link href="/agents/canvas">
              <Button
                variant="secondary"
                className="bg-surface-high text-foreground border-0"
              >
                <GitBranch className="w-4 h-4 mr-2" />
                Canvas
              </Button>
            </Link>
            <Link href="/agents/new">
              <Button className="gradient-primary text-[#060e20] font-medium border-0 hover:opacity-90">
                <Plus className="w-4 h-4 mr-2" />
                New Agent
              </Button>
            </Link>
          </>
        }
      />

      {/* Search */}
      <div className="mb-6 max-w-md">
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
            style={{ color: "var(--on-surface-dim)" }}
          />
          <Input
            placeholder="Search agents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 pr-10 bg-surface-container border-0 text-foreground placeholder:text-on-surface-dim"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 transition-colors hover:bg-white/10 hover:text-foreground"
              style={{ color: "var(--on-surface-dim)" }}
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
      
      <div className="mb-4 flex items-center justify-between px-1">
        <div className="flex items-center gap-3">
          {filtered.length > 0 && (
            <div 
              className="flex items-center justify-center cursor-pointer w-4 h-4 rounded border transition-colors shrink-0"
              style={{
                borderColor: selectedIds.size === filtered.length ? "var(--accent-cyan)" : "rgba(255,255,255,0.2)",
                background: selectedIds.size === filtered.length ? "var(--accent-cyan)" : "var(--surface-lowest)"
              }}
              onClick={(e: any) => toggleAll(e)}
              title="Select all"
            >
              {selectedIds.size === filtered.length && <Check className="w-3 h-3 text-[#060e20]" strokeWidth={3} />}
            </div>
          )}
          <p className="text-[10px] font-bold uppercase tracking-widest opacity-70" style={{ color: "var(--on-surface-dim)" }}>
            {search ? (
              <>
                Found <span className="font-extrabold text-accent-cyan">{filtered.length}</span> match{filtered.length === 1 ? "" : "es"} for &quot;{search}&quot;
              </>
            ) : (
              <>
                Total <span className="font-extrabold text-accent-cyan">{agents.length}</span> agents
              </>
            )}
          </p>
        </div>
      </div>

      {/* Agents Grid */}
      {loading ? (
        <div
          className="text-center py-20 text-sm"
          style={{ color: "var(--on-surface-dim)" }}
        >
          Loading agents...
        </div>
      ) : filtered.length === 0 ? (
        <div
          className="text-center py-20 rounded-xl"
          style={{ background: "var(--surface-container)" }}
        >
          <Bot
            className="w-12 h-12 mx-auto mb-4"
            style={{ color: "var(--on-surface-dim)", opacity: 0.4 }}
          />
          <p className="text-lg font-heading font-medium mb-2">
            No agents found
          </p>
          <p
            className="text-sm mb-6"
            style={{ color: "var(--on-surface-dim)" }}
          >
            {search
              ? "Try a different search term"
              : "Create your first agent to get started"}
          </p>
          {!search ? (
            <Link href="/agents/new">
              <Button className="gradient-primary text-[#060e20] font-medium border-0">
                <Plus className="w-4 h-4 mr-2" />
                Create Agent
              </Button>
            </Link>
          ) : (
            <Button
              variant="secondary"
              onClick={() => setSearch("")}
              className="border-0 bg-surface-base text-foreground mt-4"
            >
              Clear Search
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((agent, i) => (
            <Link
              href={`/agents/${agent.id}`}
              key={agent.id}
              className="group relative rounded-xl p-5 transition-all duration-200 hover:scale-[1.02] animate-slide-in block overflow-hidden"
              style={{
                background: "var(--surface-container)",
                animationDelay: `${i * 50}ms`,
              }}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="relative shrink-0">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden"
                      style={{
                        background: agent.active
                          ? "linear-gradient(135deg, #7bd0ff, #008abb)"
                          : "var(--surface-high)",
                      }}
                    >
                      <Bot
                        className={`w-5 h-5 transition-all duration-200 ${selectedIds.has(agent.id) ? "scale-50 opacity-0" : "group-hover:scale-50 group-hover:opacity-0"}`}
                        style={{
                          color: agent.active ? "#060e20" : "var(--on-surface-dim)",
                        }}
                      />
                      
                      {/* Custom Checkbox Overlay (Centered inside Avatar) */}
                      <div 
                        className={`absolute inset-0 flex items-center justify-center transition-all duration-200 cursor-pointer ${selectedIds.has(agent.id) ? "opacity-100 scale-100" : "opacity-0 scale-50 group-hover:opacity-100 group-hover:scale-100"}`}
                        onClick={(e) => toggleSelect(e, agent.id)}
                        style={{
                          background: selectedIds.has(agent.id) ? "var(--accent-cyan)" : "transparent"
                        }}
                      >
                         {selectedIds.has(agent.id) ? (
                           <Check className="w-5 h-5 text-[#060e20]" strokeWidth={3} />
                         ) : (
                           <div className="w-5 h-5 border-2 border-white/50 rounded flex items-center justify-center p-[1px] bg-black/20" />
                         )}
                      </div>
                    </div>
                  </div>
                  <div>
                    <h3 className="font-heading text-base font-semibold group-hover:text-accent-cyan transition-colors">
                      {agent.name}
                    </h3>
                    <p
                      className="text-[11px] uppercase tracking-[0.05rem]"
                      style={{ color: "var(--on-surface-dim)" }}
                    >
                      {agent.role}
                    </p>
                  </div>
                </div>
                <div className="flex items-center h-6 relative overflow-hidden flex-1 justify-end min-w-[70px]">
                  {/* Status Indicator */}
                  <div className="flex items-center gap-1.5 absolute right-0 transition-all duration-300 group-hover:opacity-0 group-hover:translate-x-8">
                    {agent.active ? (
                      <Power className="w-3.5 h-3.5 text-accent-teal" />
                    ) : (
                      <PowerOff
                        className="w-3.5 h-3.5"
                        style={{ color: "var(--on-surface-dim)" }}
                      />
                    )}
                    <span
                      className="text-[11px]"
                      style={{
                        color: agent.active
                          ? "var(--accent-teal)"
                          : "var(--on-surface-dim)",
                      }}
                    >
                      {agent.active ? "Active" : "Inactive"}
                    </span>
                  </div>

                  {/* Archive Button */}
                  <button
                    onClick={(e) => handleArchive(e, agent.id, agent.name)}
                    className="flex items-center gap-1.5 text-red-500 hover:text-red-400 transition-all duration-300 absolute right-0 opacity-0 translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 p-1 rounded-md"
                    title="Archive Agent"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <p
                className="text-sm line-clamp-2 mb-4"
                style={{ color: "var(--on-surface-dim)" }}
              >
                {agent.description || "No description"}
              </p>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <span
                    className="text-[11px] uppercase tracking-[0.05rem]"
                    style={{ color: "var(--on-surface-dim)" }}
                  >
                    Tools
                  </span>
                  <span className="text-xs font-medium text-accent-cyan">
                    {agent.allowedTools.length}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    className="text-[11px] uppercase tracking-[0.05rem]"
                    style={{ color: "var(--on-surface-dim)" }}
                  >
                    Sub-agents
                  </span>
                  <span className="text-xs font-medium text-accent-cyan">
                    {agent.allowedSubAgents.length}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    className="text-[11px] uppercase tracking-[0.05rem]"
                    style={{ color: "var(--on-surface-dim)" }}
                  >
                    Max Steps
                  </span>
                  <span className="text-xs font-medium text-accent-cyan">
                    {agent.maxSteps}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Floating Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#060e20] border border-white/10 rounded-full px-6 py-3 flex items-center gap-4 shadow-2xl animate-in slide-in-from-bottom-5">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <div className="w-px h-4 bg-white/10" />
          <button
            onClick={handleBulkArchive}
            className="flex items-center gap-2 text-sm text-red-500 hover:text-red-400 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Archive Selected
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="flex items-center gap-2 text-sm text-on-surface-dim hover:text-white transition-colors ml-2"
          >
            Cancel
          </button>
        </div>
      )}
    </>
  );
}
