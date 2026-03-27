"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Save, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

export default function AgentFormPage() {
  const router = useRouter();
  const params = useParams();
  const isEdit = params.id !== "new";
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);

  const [form, setForm] = useState({
    name: "",
    role: "",
    description: "",
    systemPrompt: "You are a helpful AI assistant.",
    allowedTools: "",
    allowedSubAgents: "",
    maxSteps: 10,
    active: true,
  });

  useEffect(() => {
    if (isEdit) {
      api.agents
        .get(params.id as string)
        .then((agent) => {
          setForm({
            name: agent.name,
            role: agent.role,
            description: agent.description,
            systemPrompt: agent.systemPrompt,
            allowedTools: agent.allowedTools.join(", "),
            allowedSubAgents: agent.allowedSubAgents.join(", "),
            maxSteps: agent.maxSteps,
            active: agent.active,
          });
        })
        .catch(() => router.push("/agents"))
        .finally(() => setLoading(false));
    }
  }, [isEdit, params.id, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const payload = {
      name: form.name,
      role: form.role,
      description: form.description,
      systemPrompt: form.systemPrompt,
      allowedTools: form.allowedTools
        ? form.allowedTools.split(",").map((s) => s.trim()).filter(Boolean)
        : [],
      allowedSubAgents: form.allowedSubAgents
        ? form.allowedSubAgents.split(",").map((s) => s.trim()).filter(Boolean)
        : [],
      maxSteps: form.maxSteps,
      active: form.active,
    };

    try {
      if (isEdit) {
        await api.agents.update(params.id as string, payload);
      } else {
        await api.agents.create(payload);
      }
      router.push("/agents");
    } catch (error: unknown) {
      alert(error instanceof Error ? error.message : "Failed to save agent.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div
        className="flex items-center justify-center py-20 text-sm"
        style={{ color: "var(--on-surface-dim)" }}
      >
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading agent...
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title={isEdit ? "Edit Agent" : "Create Agent"}
        description={
          isEdit
            ? "Update agent configuration"
            : "Configure a new AI agent for your system"
        }
      />

      <form
        onSubmit={handleSubmit}
        className="max-w-2xl space-y-6"
      >
        {/* Name & Role */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label
              htmlFor="name"
              className="text-[11px] uppercase tracking-[0.05rem]"
              style={{ color: "var(--on-surface-dim)" }}
            >
              Agent Name
            </Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g., Research Agent"
              required
              className="bg-surface-container border-0 text-foreground"
            />
          </div>
          <div className="space-y-2">
            <Label
              htmlFor="role"
              className="text-[11px] uppercase tracking-[0.05rem]"
              style={{ color: "var(--on-surface-dim)" }}
            >
              Role
            </Label>
            <Input
              id="role"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              placeholder="e.g., Senior Researcher"
              required
              className="bg-surface-container border-0 text-foreground"
            />
          </div>
        </div>

        {/* Description */}
        <div className="space-y-2">
          <Label
            htmlFor="description"
            className="text-[11px] uppercase tracking-[0.05rem]"
            style={{ color: "var(--on-surface-dim)" }}
          >
            Description
          </Label>
          <Textarea
            id="description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="What does this agent do?"
            rows={3}
            className="bg-surface-container border-0 text-foreground resize-none"
          />
        </div>

        {/* System Prompt */}
        <div className="space-y-2">
          <Label
            htmlFor="systemPrompt"
            className="text-[11px] uppercase tracking-[0.05rem]"
            style={{ color: "var(--on-surface-dim)" }}
          >
            System Prompt
          </Label>
          <Textarea
            id="systemPrompt"
            value={form.systemPrompt}
            onChange={(e) =>
              setForm({ ...form, systemPrompt: e.target.value })
            }
            placeholder="Define the agent's behavior and personality..."
            rows={6}
            className="bg-surface-lowest border-0 text-foreground font-mono text-sm resize-none"
          />
        </div>

        {/* Tools & Sub-agents */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label
              htmlFor="tools"
              className="text-[11px] uppercase tracking-[0.05rem]"
              style={{ color: "var(--on-surface-dim)" }}
            >
              Allowed Tools (comma-separated)
            </Label>
            <Input
              id="tools"
              value={form.allowedTools}
              onChange={(e) =>
                setForm({ ...form, allowedTools: e.target.value })
              }
              placeholder="web_search, code_exec"
              className="bg-surface-container border-0 text-foreground"
            />
          </div>
          <div className="space-y-2">
            <Label
              htmlFor="subAgents"
              className="text-[11px] uppercase tracking-[0.05rem]"
              style={{ color: "var(--on-surface-dim)" }}
            >
              Allowed Sub-Agents (comma-separated IDs)
            </Label>
            <Input
              id="subAgents"
              value={form.allowedSubAgents}
              onChange={(e) =>
                setForm({ ...form, allowedSubAgents: e.target.value })
              }
              placeholder="Agent IDs..."
              className="bg-surface-container border-0 text-foreground"
            />
            <p className="text-xs" style={{ color: "var(--on-surface-dim)" }}>
              Prefer visual management? Use the{" "}
              <Link href="/agents/canvas" className="text-accent-cyan hover:underline">
                hierarchy canvas
              </Link>
              .
            </p>
          </div>
        </div>

        {/* Max Steps & Active */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
          <div className="space-y-2">
            <Label
              htmlFor="maxSteps"
              className="text-[11px] uppercase tracking-[0.05rem]"
              style={{ color: "var(--on-surface-dim)" }}
            >
              Max Steps
            </Label>
            <Input
              id="maxSteps"
              type="number"
              min={1}
              max={50}
              value={form.maxSteps}
              onChange={(e) =>
                setForm({ ...form, maxSteps: parseInt(e.target.value) || 10 })
              }
              className="bg-surface-container border-0 text-foreground"
            />
          </div>
          <div
            className="flex items-center justify-between p-3 rounded-lg"
            style={{ background: "var(--surface-container)" }}
          >
            <Label
              htmlFor="active"
              className="text-sm font-medium cursor-pointer"
            >
              Active Status
            </Label>
            <Switch
              id="active"
              checked={form.active}
              onCheckedChange={(checked) =>
                setForm({ ...form, active: checked })
              }
            />
          </div>
        </div>

        {/* Submit */}
        <div className="flex items-center gap-3 pt-4">
          <Button
            type="submit"
            disabled={saving}
            className="gradient-primary text-[#060e20] font-medium border-0 hover:opacity-90 px-8"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            {isEdit ? "Update Agent" : "Create Agent"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.push("/agents")}
            className="bg-surface-high text-foreground border-0"
          >
            Cancel
          </Button>
        </div>
      </form>
    </>
  );
}
