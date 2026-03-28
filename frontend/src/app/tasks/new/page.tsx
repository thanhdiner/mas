"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ListTodo, Play, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import type { Agent } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

export default function CreateTaskPage() {
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    title: "",
    input: "",
    assignedAgentId: "",
    allowDelegation: true,
    requiresApproval: false,
  });

  useEffect(() => {
    api.agents
      .list(true)
      .then(setAgents)
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const task = await api.tasks.create(form);
      // Auto-execute
      await api.tasks.execute(task.id);
      router.push(`/tasks/${task.id}`);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Create Task"
        description="Assign a task to an agent for execution"
      />

      <form onSubmit={handleSubmit} className="max-w-6xl space-y-6 md:space-y-0 md:grid md:grid-cols-12 md:gap-8 w-full mb-10">
        {/* Left Column: Task Info & Input */}
        <div className="md:col-span-8 space-y-6">
          {/* Title */}
          <div className="space-y-3">
            <Label
              htmlFor="title"
              className="text-xs uppercase tracking-[0.05rem] font-bold"
              style={{ color: "var(--on-surface-dim)" }}
            >
              Task Title
            </Label>
            <Input
              id="title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g., Research latest AI trends"
              required
              className="bg-surface-container border-0 text-foreground h-12 text-base px-4"
            />
          </div>

          {/* Input */}
          <div className="space-y-3 pt-2">
            <Label
              htmlFor="input"
              className="text-xs uppercase tracking-[0.05rem] font-bold"
              style={{ color: "var(--on-surface-dim)" }}
            >
              Task Input / Instructions
            </Label>
            <Textarea
              id="input"
              value={form.input}
              onChange={(e) => setForm({ ...form, input: e.target.value })}
              placeholder="Describe what the agent should do in detail..."
              rows={16}
              required
              className="bg-surface-lowest border-0 text-foreground font-mono text-sm resize-y p-5 rounded-xl shadow-sm leading-relaxed min-h-[300px]"
            />
          </div>

          {/* Submit Desktop */}
          <div className="hidden md:flex items-center gap-4 pt-4">
            <Button
              type="submit"
              disabled={saving || !form.assignedAgentId}
              className="gradient-primary text-[#060e20] font-medium border-0 hover:opacity-90 px-8 h-12 text-base"
            >
              {saving ? (
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              ) : (
                <Play className="w-5 h-5 mr-2" />
              )}
              Create & Execute
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => router.push("/tasks")}
              className="bg-surface-high text-foreground border-0 h-12 px-6"
            >
              Cancel
            </Button>
          </div>
        </div>

        {/* Right Column: Agents & Options */}
        <div className="md:col-span-4 space-y-8 mt-6 md:mt-0">
          {/* Agent Selection */}
          <div className="space-y-3 relative">
            <Label
              className="text-xs uppercase tracking-[0.05rem] font-bold"
              style={{ color: "var(--on-surface-dim)" }}
            >
              Assign Agent
            </Label>
            {agents.length === 0 ? (
              <div
                className="p-5 rounded-xl text-sm justify-center flex flex-col items-center gap-3 border border-white/[0.05]"
                style={{
                  background: "var(--surface-container)",
                  color: "var(--on-surface-dim)",
                }}
              >
                No active agents available.
                <Button variant="outline" size="sm" onClick={() => router.push("/agents/new")}>Create Agent</Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 max-h-[480px] overflow-y-auto pr-2 custom-scrollbar">
                {agents.map((agent) => (
                  <button
                    type="button"
                    key={agent.id}
                    onClick={() =>
                      setForm({ ...form, assignedAgentId: agent.id })
                    }
                    className={`text-left p-4 rounded-xl transition-all duration-200 border border-transparent shadow-sm ${
                      form.assignedAgentId === agent.id
                        ? "border-accent-cyan/50"
                        : "hover:border-white/[0.05]"
                    }`}
                    style={{
                      background:
                        form.assignedAgentId === agent.id
                          ? "var(--surface-high)"
                          : "var(--surface-lowest)",
                    }}
                  >
                    <div className="flex items-center justify-between space-x-2">
                       <p className="text-sm font-semibold truncate">{agent.name}</p>
                       {form.assignedAgentId === agent.id && (
                          <div className="w-2 h-2 rounded-full bg-accent-cyan shrink-0 animate-pulse" />
                       )}
                    </div>
                    <p
                      className="text-xs mt-1.5 leading-snug line-clamp-2"
                      style={{ color: "var(--on-surface-dim)" }}
                    >
                      {agent.role}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="h-px bg-white/[0.05] w-full" />

          {/* Options */}
          <div className="space-y-3">
             <Label
              className="text-xs uppercase tracking-[0.05rem] font-bold"
              style={{ color: "var(--on-surface-dim)" }}
            >
              Execution Options
            </Label>
            <div className="flex flex-col gap-3">
              <div
                className="flex items-center justify-between p-4 rounded-xl shadow-sm bg-surface-lowest border border-white/[0.02]"
              >
                <div>
                   <Label htmlFor="delegation" className="text-sm font-semibold cursor-pointer block">
                     Allow Delegation
                   </Label>
                   <span className="text-xs text-on-surface-dim">Agent can spawn sub-agents</span>
                </div>
                <Switch
                  id="delegation"
                  checked={form.allowDelegation}
                  onCheckedChange={(checked) =>
                    setForm({ ...form, allowDelegation: checked })
                  }
                />
              </div>
              <div
                className="flex items-center justify-between p-4 rounded-xl shadow-sm bg-surface-lowest border border-white/[0.02]"
              >
                <div>
                   <Label htmlFor="approval" className="text-sm font-semibold cursor-pointer block">
                     Requires Approval
                   </Label>
                   <span className="text-xs text-on-surface-dim">Pause execution for human review</span>
                </div>
                <Switch
                  id="approval"
                  checked={form.requiresApproval}
                  onCheckedChange={(checked) =>
                    setForm({ ...form, requiresApproval: checked })
                  }
                />
              </div>
            </div>
          </div>

          {/* Submit Mobile */}
          <div className="flex md:hidden items-center gap-3 pt-4">
            <Button
              type="submit"
              disabled={saving || !form.assignedAgentId}
              className="gradient-primary text-[#060e20] font-medium border-0 hover:opacity-90 px-6 h-12 flex-1 shadow-sm"
            >
              {saving ? (
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              ) : (
                <Play className="w-5 h-5 mr-2" />
              )}
              Execute
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => router.push("/tasks")}
              className="bg-surface-high text-foreground border-0 h-12 shadow-sm"
            >
              Cancel
            </Button>
          </div>
        </div>
      </form>
    </>
  );
}
