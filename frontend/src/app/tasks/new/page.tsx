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
    } catch (err: any) {
      alert(err.message);
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

      <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
        {/* Title */}
        <div className="space-y-2">
          <Label
            htmlFor="title"
            className="text-[11px] uppercase tracking-[0.05rem]"
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
            className="bg-surface-container border-0 text-foreground"
          />
        </div>

        {/* Input */}
        <div className="space-y-2">
          <Label
            htmlFor="input"
            className="text-[11px] uppercase tracking-[0.05rem]"
            style={{ color: "var(--on-surface-dim)" }}
          >
            Task Input / Instructions
          </Label>
          <Textarea
            id="input"
            value={form.input}
            onChange={(e) => setForm({ ...form, input: e.target.value })}
            placeholder="Describe what the agent should do in detail..."
            rows={8}
            required
            className="bg-surface-lowest border-0 text-foreground font-mono text-sm resize-none"
          />
        </div>

        {/* Agent Selection */}
        <div className="space-y-2">
          <Label
            className="text-[11px] uppercase tracking-[0.05rem]"
            style={{ color: "var(--on-surface-dim)" }}
          >
            Assign Agent
          </Label>
          {agents.length === 0 ? (
            <div
              className="p-4 rounded-lg text-sm text-center"
              style={{
                background: "var(--surface-container)",
                color: "var(--on-surface-dim)",
              }}
            >
              No active agents available. Create one first.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {agents.map((agent) => (
                <button
                  type="button"
                  key={agent.id}
                  onClick={() =>
                    setForm({ ...form, assignedAgentId: agent.id })
                  }
                  className={`text-left p-4 rounded-lg transition-all duration-200 ${
                    form.assignedAgentId === agent.id
                      ? "ring-2 ring-accent-cyan"
                      : ""
                  }`}
                  style={{
                    background:
                      form.assignedAgentId === agent.id
                        ? "var(--surface-high)"
                        : "var(--surface-container)",
                  }}
                >
                  <p className="text-sm font-medium">{agent.name}</p>
                  <p
                    className="text-[11px] mt-0.5"
                    style={{ color: "var(--on-surface-dim)" }}
                  >
                    {agent.role}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Options */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div
            className="flex items-center justify-between p-3 rounded-lg"
            style={{ background: "var(--surface-container)" }}
          >
            <Label htmlFor="delegation" className="text-sm cursor-pointer">
              Allow Delegation
            </Label>
            <Switch
              id="delegation"
              checked={form.allowDelegation}
              onCheckedChange={(checked) =>
                setForm({ ...form, allowDelegation: checked })
              }
            />
          </div>
          <div
            className="flex items-center justify-between p-3 rounded-lg"
            style={{ background: "var(--surface-container)" }}
          >
            <Label htmlFor="approval" className="text-sm cursor-pointer">
              Requires Approval
            </Label>
            <Switch
              id="approval"
              checked={form.requiresApproval}
              onCheckedChange={(checked) =>
                setForm({ ...form, requiresApproval: checked })
              }
            />
          </div>
        </div>

        {/* Submit */}
        <div className="flex items-center gap-3 pt-4">
          <Button
            type="submit"
            disabled={saving || !form.assignedAgentId}
            className="gradient-primary text-[#060e20] font-medium border-0 hover:opacity-90 px-8"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Play className="w-4 h-4 mr-2" />
            )}
            Create & Execute
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.push("/tasks")}
            className="bg-surface-high text-foreground border-0"
          >
            Cancel
          </Button>
        </div>
      </form>
    </>
  );
}
