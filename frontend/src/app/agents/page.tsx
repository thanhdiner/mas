"use client";

import { useEffect, useState, useMemo } from "react";
import Fuse from "fuse.js";
import Link from "next/link";
import { Bot, GitBranch, Plus, Power, PowerOff, Search, X } from "lucide-react";
import { useAgents } from "@/lib/hooks/use-agents";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function AgentsPage() {
  const { agents, isLoading: loading } = useAgents();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

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
              className="group rounded-xl p-5 transition-all duration-200 hover:scale-[1.02] animate-slide-in"
              style={{
                background: "var(--surface-container)",
                animationDelay: `${i * 50}ms`,
              }}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                    style={{
                      background: agent.active
                        ? "linear-gradient(135deg, #7bd0ff, #008abb)"
                        : "var(--surface-high)",
                    }}
                  >
                    <Bot
                      className="w-5 h-5"
                      style={{
                        color: agent.active ? "#060e20" : "var(--on-surface-dim)",
                      }}
                    />
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
                <div className="flex items-center gap-1.5">
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
    </>
  );
}
