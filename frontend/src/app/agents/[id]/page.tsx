"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Loader2, Save, Settings2 } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  api,
  type Agent,
  type ToolCatalogItem,
  type ToolCredential,
} from "@/lib/api";

type ToolConfigFormState = Record<string, Record<string, string>>;
type ToolOverridePreset = {
  id: string;
  label: string;
  description: string;
  values: Record<string, string>;
};

function buildToolConfigForm(
  tool: ToolCatalogItem,
  config: Record<string, unknown> | undefined
): Record<string, string> {
  const form: Record<string, string> = {};

  for (const field of tool.configSchema || []) {
    const value = config?.[field.name];
    form[field.name] =
      value === undefined || value === null ? "" : String(value);
  }

  return form;
}

function buildToolConfigForms(
  tools: ToolCatalogItem[],
  toolConfig: Record<string, Record<string, unknown>>
): ToolConfigFormState {
  const forms: ToolConfigFormState = {};

  for (const tool of tools) {
    if (!tool.configSchema?.length) {
      continue;
    }
    forms[tool.name] = buildToolConfigForm(tool, toolConfig[tool.name]);
  }

  return forms;
}

function sanitizeToolConfig(
  tool: ToolCatalogItem,
  config: Record<string, string> | undefined
): Record<string, string | number> {
  const sanitized: Record<string, string | number> = {};

  for (const field of tool.configSchema || []) {
    const value = config?.[field.name]?.trim() || "";
    if (!value) {
      continue;
    }

    if (field.type === "number") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        sanitized[field.name] = parsed;
      }
      continue;
    }

    sanitized[field.name] = value;
  }

  return sanitized;
}

function hasToolOverrideValues(config: Record<string, string> | undefined): boolean {
  return Object.values(config || {}).some((value) => value.trim() !== "");
}

function getInheritedToolFieldValue(
  tool: ToolCatalogItem,
  fieldName: string
): string {
  const field = (tool.configSchema || []).find(
    (candidate) => candidate.name === fieldName
  );
  const inheritedValue = tool.globalSettings?.[fieldName] ?? field?.default ?? "";
  return inheritedValue === undefined || inheritedValue === null
    ? ""
    : String(inheritedValue);
}

function buildInheritedToolConfigForm(tool: ToolCatalogItem): Record<string, string> {
  const form: Record<string, string> = {};

  for (const field of tool.configSchema || []) {
    const inheritedValue = getInheritedToolFieldValue(tool, field.name);
    if (inheritedValue) {
      form[field.name] = inheritedValue;
    }
  }

  return form;
}

function getCurrentOrInheritedToolFieldValue(
  tool: ToolCatalogItem,
  config: Record<string, string> | undefined,
  fieldName: string
): string {
  const currentValue = config?.[fieldName]?.trim();
  if (currentValue) {
    return currentValue;
  }

  return getInheritedToolFieldValue(tool, fieldName);
}

function deriveAllowedDomainFromBaseUrl(baseUrl: string): string {
  const trimmedValue = baseUrl.trim();
  if (!trimmedValue) {
    return "";
  }

  try {
    const parsedUrl = new URL(trimmedValue);
    return parsedUrl.hostname.replace(/^\.+/, "");
  } catch {
    return "";
  }
}

function getToolOverridePresets(
  tool: ToolCatalogItem,
  config: Record<string, string> | undefined
): ToolOverridePreset[] {
  const presets: ToolOverridePreset[] = [];
  const inheritedDefaults = buildInheritedToolConfigForm(tool);

  if (Object.keys(inheritedDefaults).length > 0) {
    presets.push({
      id: `${tool.name}-copy-inherited`,
      label: "Copy Inherited Defaults",
      description:
        "Copy the current workspace/global values into this agent override card.",
      values: inheritedDefaults,
    });
  }

  if (tool.name === "gmail" && (tool.configSchema || []).some((field) => field.name === "user_id")) {
    presets.push({
      id: "gmail-authenticated-mailbox",
      label: "Use Authenticated Mailbox",
      description: "Set Gmail user_id to 'me' for the connected account.",
      values: {
        user_id: "me",
      },
    });
  }

  if (
    tool.name === "http_request" &&
    (tool.configSchema || []).some((field) => field.name === "base_url") &&
    (tool.configSchema || []).some((field) => field.name === "allowed_domains")
  ) {
    const derivedDomain = deriveAllowedDomainFromBaseUrl(
      getCurrentOrInheritedToolFieldValue(tool, config, "base_url")
    );
    if (derivedDomain) {
      presets.push({
        id: "http-request-mirror-base-host",
        label: "Mirror Base URL Host",
        description:
          "Derive allowed_domains from the current base_url to keep the agent scoped to one API host.",
        values: {
          allowed_domains: derivedDomain,
        },
      });
    }
  }

  if (
    tool.name === "slack" &&
    (tool.configSchema || []).some((field) => field.name === "default_channel_id")
  ) {
    const defaultChannelId = getCurrentOrInheritedToolFieldValue(
      tool,
      config,
      "default_channel_id"
    );
    if (defaultChannelId) {
      const values: Record<string, string> = {
        default_channel_id: defaultChannelId,
      };
      const credentialRef = getCurrentOrInheritedToolFieldValue(
        tool,
        config,
        "credential_ref"
      );
      if (credentialRef) {
        values.credential_ref = credentialRef;
      }
      presets.push({
        id: "slack-workspace-channel",
        label: "Use Workspace Channel",
        description:
          "Copy the current default Slack channel and credential into this agent override.",
        values,
      });
    }
  }

  if (
    tool.name === "github" &&
    (tool.configSchema || []).some((field) => field.name === "default_owner") &&
    (tool.configSchema || []).some((field) => field.name === "default_repo")
  ) {
    const defaultOwner = getCurrentOrInheritedToolFieldValue(
      tool,
      config,
      "default_owner"
    );
    const defaultRepo = getCurrentOrInheritedToolFieldValue(
      tool,
      config,
      "default_repo"
    );
    if (defaultOwner || defaultRepo) {
      const values: Record<string, string> = {};
      if (defaultOwner) {
        values.default_owner = defaultOwner;
      }
      if (defaultRepo) {
        values.default_repo = defaultRepo;
      }
      const credentialRef = getCurrentOrInheritedToolFieldValue(
        tool,
        config,
        "credential_ref"
      );
      if (credentialRef) {
        values.credential_ref = credentialRef;
      }
      presets.push({
        id: "github-workspace-repo",
        label: "Use Workspace Repo",
        description:
          "Copy the current default owner/repo pair into this agent override.",
        values,
      });
    }
  }

  if (tool.name === "notion") {
    const defaultDatabaseId = getCurrentOrInheritedToolFieldValue(
      tool,
      config,
      "default_database_id"
    );
    const defaultParentPageId = getCurrentOrInheritedToolFieldValue(
      tool,
      config,
      "default_parent_page_id"
    );
    if (defaultDatabaseId || defaultParentPageId) {
      const values: Record<string, string> = {};
      if (defaultDatabaseId) {
        values.default_database_id = defaultDatabaseId;
      }
      if (defaultParentPageId) {
        values.default_parent_page_id = defaultParentPageId;
      }
      const credentialRef = getCurrentOrInheritedToolFieldValue(
        tool,
        config,
        "credential_ref"
      );
      if (credentialRef) {
        values.credential_ref = credentialRef;
      }
      presets.push({
        id: "notion-workspace-target",
        label: "Use Workspace Target",
        description:
          "Copy the current default Notion database or parent page into this agent override.",
        values,
      });
    }
  }

  for (const preset of tool.presets || []) {
    presets.push({
      id: `workspace-${preset.id}`,
      label: preset.name,
      description:
        preset.description ||
        `Workspace preset for ${tool.name}. Saved in Tools Library.`,
      values: Object.fromEntries(
        Object.entries(preset.values).map(([key, value]) => [key, String(value)])
      ),
    });
  }

  return presets;
}

export default function AgentFormPage() {
  const router = useRouter();
  const params = useParams();
  const isEdit = params.id !== "new";
  const currentAgentId = typeof params.id === "string" ? params.id : "";
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [resourceError, setResourceError] = useState("");
  const [availableAgents, setAvailableAgents] = useState<Agent[]>([]);
  const [toolCatalog, setToolCatalog] = useState<ToolCatalogItem[]>([]);
  const [credentials, setCredentials] = useState<ToolCredential[]>([]);
  const [agentToolConfig, setAgentToolConfig] = useState<
    Record<string, Record<string, unknown>>
  >({});
  const [toolConfigForms, setToolConfigForms] = useState<ToolConfigFormState>({});
  const [expandedOverrideToolNames, setExpandedOverrideToolNames] = useState<
    string[]
  >([]);
  const [selectedToolNames, setSelectedToolNames] = useState<string[]>([]);
  const [toolSearch, setToolSearch] = useState("");
  const [selectedSubAgentIds, setSelectedSubAgentIds] = useState<string[]>([]);
  const [subAgentSearch, setSubAgentSearch] = useState("");

  const [form, setForm] = useState({
    name: "",
    role: "",
    description: "",
    systemPrompt: "You are a helpful AI assistant.",
    maxSteps: 10,
    active: true,
    model: "",
    provider: "",
  });

  useEffect(() => {
    let cancelled = false;

    async function loadPageData() {
      setLoading(true);
      setResourceError("");
      const loadedTools: ToolCatalogItem[] = [];

      const [toolsResult, credentialsResult, agentsResult, agentResult] =
        await Promise.allSettled([
          api.tools.list(),
          api.tools.listCredentials(),
          api.agents.list(),
          isEdit ? api.agents.get(params.id as string) : Promise.resolve(null),
        ]);

      if (cancelled) {
        return;
      }

      const nextErrors: string[] = [];

      if (toolsResult.status === "fulfilled") {
        setToolCatalog(toolsResult.value);
        loadedTools.push(...toolsResult.value);
      } else {
        nextErrors.push(
          toolsResult.reason instanceof Error
            ? toolsResult.reason.message
            : "Failed to load tool catalog."
        );
      }

      if (credentialsResult.status === "fulfilled") {
        setCredentials(credentialsResult.value);
      } else {
        nextErrors.push(
          credentialsResult.reason instanceof Error
            ? credentialsResult.reason.message
            : "Failed to load credentials."
        );
      }

      if (agentsResult.status === "fulfilled") {
        setAvailableAgents(agentsResult.value);
      } else {
        nextErrors.push(
          agentsResult.reason instanceof Error
            ? agentsResult.reason.message
            : "Failed to load agents."
        );
      }

      if (isEdit) {
        if (agentResult.status === "fulfilled" && agentResult.value) {
          const agent = agentResult.value;
          const nextToolConfig = (agent.toolConfig || {}) as Record<
            string,
            Record<string, unknown>
          >;

          setForm({
            name: agent.name,
            role: agent.role,
            description: agent.description,
            systemPrompt: agent.systemPrompt,
            maxSteps: agent.maxSteps,
            active: agent.active,
            model: (agent as any).model || "",
            provider: (agent as any).provider || "",
          });
          setAgentToolConfig(nextToolConfig);
          setToolConfigForms(buildToolConfigForms(loadedTools, nextToolConfig));
          setSelectedToolNames(agent.allowedTools);
          setSelectedSubAgentIds(
            agent.allowedSubAgents.filter((subAgentId) => subAgentId !== currentAgentId)
          );
        } else {
          router.push("/agents");
          return;
        }
      } else {
        setAgentToolConfig({});
        setToolConfigForms(buildToolConfigForms(loadedTools, {}));
        setSelectedToolNames([]);
        setSelectedSubAgentIds([]);
      }

      setResourceError(nextErrors[0] || "");
      setLoading(false);
    }

    loadPageData();

    return () => {
      cancelled = true;
    };
  }, [currentAgentId, isEdit, params.id, router]);

  const configurableTools = useMemo(
    () => toolCatalog.filter((tool) => (tool.configSchema || []).length > 0),
    [toolCatalog]
  );
  const configurableToolNames = useMemo(
    () => new Set(configurableTools.map((tool) => tool.name)),
    [configurableTools]
  );
  const visibleConfigurableTools = useMemo(
    () =>
      configurableTools.filter(
        (tool) =>
          selectedToolNames.includes(tool.name) ||
          hasToolOverrideValues(toolConfigForms[tool.name])
      ),
    [configurableTools, selectedToolNames, toolConfigForms]
  );
  const configuredOverrideToolCount = useMemo(
    () =>
      visibleConfigurableTools.filter((tool) =>
        hasToolOverrideValues(toolConfigForms[tool.name])
      ).length,
    [toolConfigForms, visibleConfigurableTools]
  );
  const filteredToolOptions = useMemo(() => {
    const query = toolSearch.trim().toLowerCase();
    return toolCatalog.filter((tool) => {
      if (!query) {
        return true;
      }
      return [tool.name, tool.description].join(" ").toLowerCase().includes(query);
    });
  }, [toolCatalog, toolSearch]);
  const selectedTools = useMemo(
    () =>
      selectedToolNames.map((toolName) => {
        const tool = toolCatalog.find((candidate) => candidate.name === toolName);
        return (
          tool || {
            name: toolName,
            description: "",
          }
        );
      }),
    [selectedToolNames, toolCatalog]
  );
  const selectedSubAgents = useMemo(
    () =>
      selectedSubAgentIds.map((agentId) => {
        const agent = availableAgents.find((candidate) => candidate.id === agentId);
        return (
          agent || {
            id: agentId,
            name: `Unknown agent (${agentId.slice(0, 8)}...)`,
            role: "Unavailable",
            active: false,
          }
        );
      }),
    [availableAgents, selectedSubAgentIds]
  );
  const filteredSubAgentOptions = useMemo(() => {
    const query = subAgentSearch.trim().toLowerCase();
    return availableAgents
      .filter((agent) => agent.id !== currentAgentId)
      .filter((agent) => {
        if (!query) {
          return true;
        }
        return [agent.name, agent.role, agent.description]
          .join(" ")
          .toLowerCase()
          .includes(query);
      });
  }, [availableAgents, currentAgentId, subAgentSearch]);

  useEffect(() => {
    const visibleNames = visibleConfigurableTools.map((tool) => tool.name);
    if (visibleNames.length === 0) {
      setExpandedOverrideToolNames([]);
      return;
    }

    setExpandedOverrideToolNames((current) => {
      if (visibleNames.length <= 2) {
        return visibleNames;
      }

      const visibleNameSet = new Set(visibleNames);
      const nextNames = current.filter((name) => visibleNameSet.has(name));

      visibleConfigurableTools.forEach((tool) => {
        if (hasToolOverrideValues(toolConfigForms[tool.name])) {
          nextNames.push(tool.name);
        }
      });

      if (nextNames.length === 0) {
        nextNames.push(visibleNames[0]);
      }

      return Array.from(new Set(nextNames));
    });
  }, [toolConfigForms, visibleConfigurableTools]);

  const updateToolConfigField = (
    toolName: string,
    fieldName: string,
    value: string
  ) => {
    setExpandedOverrideToolNames((current) =>
      current.includes(toolName) ? current : [...current, toolName]
    );
    setToolConfigForms((current) => ({
      ...current,
      [toolName]: {
        ...(current[toolName] || {}),
        [fieldName]: value,
      },
    }));
  };

  const applyToolPreset = (toolName: string, preset: ToolOverridePreset) => {
    setExpandedOverrideToolNames((current) =>
      current.includes(toolName) ? current : [...current, toolName]
    );
    setToolConfigForms((current) => ({
      ...current,
      [toolName]: {
        ...(current[toolName] || {}),
        ...preset.values,
      },
    }));
    setSelectedToolNames((current) =>
      current.includes(toolName) ? current : [...current, toolName]
    );
  };

  const toggleOverrideToolExpansion = (toolName: string) => {
    setExpandedOverrideToolNames((current) =>
      current.includes(toolName)
        ? current.filter((name) => name !== toolName)
        : [...current, toolName]
    );
  };

  const clearToolOverrides = (tool: ToolCatalogItem) => {
    setToolConfigForms((current) => ({
      ...current,
      [tool.name]: buildToolConfigForm(tool, undefined),
    }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);

    const allowedTools = selectedToolNames;
    const nextToolConfig = { ...agentToolConfig };

    for (const tool of configurableTools) {
      const sanitizedToolConfig = sanitizeToolConfig(
        tool,
        toolConfigForms[tool.name]
      );
      if (
        allowedTools.includes(tool.name) &&
        Object.keys(sanitizedToolConfig).length > 0
      ) {
        nextToolConfig[tool.name] = sanitizedToolConfig;
      } else {
        delete nextToolConfig[tool.name];
      }
    }

    const payload: Record<string, unknown> = {
      name: form.name,
      role: form.role,
      description: form.description,
      systemPrompt: form.systemPrompt,
      allowedTools,
      toolConfig: nextToolConfig,
      allowedSubAgents: selectedSubAgentIds,
      maxSteps: form.maxSteps,
      active: form.active,
      model: form.model || null,
      provider: form.provider || null,
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
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
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

      {resourceError && (
        <div
          className="mb-6 max-w-4xl rounded-2xl px-4 py-3 text-sm"
          style={{
            background: "rgba(255, 180, 171, 0.12)",
            color: "#ffb4ab",
          }}
        >
          {resourceError}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="mx-auto mb-16 grid max-w-[1560px] gap-6 px-4 sm:px-0 xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start xl:gap-8 2xl:max-w-[1640px] 2xl:grid-cols-[minmax(0,1fr)_400px]"
      >
        <div className="space-y-6 xl:min-w-0">
          {/* Basic Info */}
          <section
            className="rounded-3xl border border-white/5 p-6 shadow-sm"
            style={{ background: "var(--surface-container)" }}
          >
            <div className="mb-6 flex items-center gap-2 border-b border-white/5 pb-3">
              <div className="h-5 w-1.5 rounded-full bg-accent-cyan" />
              <h2 className="font-heading text-lg font-semibold text-foreground">
                Agent Identity & Prompt
              </h2>
            </div>

            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label
                    htmlFor="name"
                    className="text-xs uppercase tracking-[0.05rem] font-bold"
                    style={{ color: "var(--on-surface-dim)" }}
                  >
                    Agent Name
                  </Label>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    placeholder="e.g., Research Agent"
                    required
                    className="h-11 border-0 bg-surface-lowest text-foreground"
                  />
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor="role"
                    className="text-xs uppercase tracking-[0.05rem] font-bold"
                    style={{ color: "var(--on-surface-dim)" }}
                  >
                    Role
                  </Label>
                  <Input
                    id="role"
                    value={form.role}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        role: event.target.value,
                      }))
                    }
                    placeholder="e.g., Senior Researcher"
                    required
                    className="h-11 border-0 bg-surface-lowest text-foreground"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="description"
                  className="text-xs uppercase tracking-[0.05rem] font-bold"
                  style={{ color: "var(--on-surface-dim)" }}
                >
                  Description
                </Label>
                <Textarea
                  id="description"
                  value={form.description}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  placeholder="What does this agent do?"
                  rows={3}
                  className="resize-none border-0 bg-surface-lowest text-foreground"
                />
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="systemPrompt"
                  className="text-xs uppercase tracking-[0.05rem] font-bold"
                  style={{ color: "var(--on-surface-dim)" }}
                >
                  System Prompt
                </Label>
                <Textarea
                  id="systemPrompt"
                  value={form.systemPrompt}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      systemPrompt: event.target.value,
                    }))
                  }
                  placeholder="Define the agent's behavior and personality..."
                  rows={12}
                  className="min-h-[320px] resize-y border-0 bg-surface-lowest p-4 font-mono text-sm leading-relaxed text-foreground"
                />
              </div>
            </div>
          </section>

          {/* Tools Section */}
          <section
            className="rounded-3xl border border-white/5 p-5 shadow-sm"
            style={{ background: "var(--surface-container)" }}
          >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="font-heading text-lg font-semibold text-foreground">
                Allowed Tools
              </h2>
              <p
                className="mt-1 text-sm"
                style={{ color: "var(--on-surface-dim)" }}
              >
                Select which built-in tools this agent can call at runtime.
              </p>
            </div>
            <div
              className="rounded-full px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.08rem]"
              style={{
                background: "var(--surface-low)",
                color: "var(--on-surface-dim)",
              }}
            >
                {selectedToolNames.length} selected
              </div>
            </div>

          <div className="mt-5 space-y-4">
            <div
              className="rounded-2xl border border-white/5 p-3"
              style={{ background: "var(--surface-low)" }}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-foreground">
                  Selection Preview
                </p>
                <p
                  className="text-[11px] uppercase tracking-[0.08rem]"
                  style={{ color: "var(--on-surface-dim)" }}
                >
                  Click a chip to remove
                </p>
              </div>
              {selectedTools.length === 0 ? (
                <div
                  className="mt-3 rounded-xl px-3 py-3 text-sm"
                  style={{
                    background: "var(--surface-container)",
                    color: "var(--on-surface-dim)",
                  }}
                >
                  No tools selected yet.
                </div>
              ) : (
                <div className="mt-3 flex max-h-28 flex-wrap gap-2 overflow-y-auto pr-1">
                  {selectedTools.map((tool) => (
                    <button
                      key={tool.name}
                      type="button"
                      onClick={() =>
                        setSelectedToolNames((current) =>
                          current.filter((item) => item !== tool.name)
                        )
                      }
                      className={`rounded-full px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.08rem] transition-opacity hover:opacity-80 ${
                        configurableToolNames.has(tool.name)
                          ? "bg-[#14b8a61a] text-[#5eead4]"
                          : "bg-[#7bd0ff14] text-accent-cyan"
                      }`}
                      title={tool.description || "Remove tool"}
                    >
                      {tool.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <Label
                htmlFor="toolSearch"
                className="mb-1.5 block text-sm font-medium text-foreground"
              >
                Search Tools
              </Label>
              <Input
                id="toolSearch"
                value={toolSearch}
                onChange={(event) => setToolSearch(event.target.value)}
                placeholder="Search by tool name or description"
                className="border-0 bg-surface-low text-foreground"
              />

              <div className="mt-3 max-h-[240px] space-y-2 overflow-y-auto pr-1">
                {filteredToolOptions.length === 0 ? (
                  <div
                    className="rounded-2xl px-4 py-4 text-sm"
                    style={{
                      background: "var(--surface-low)",
                      color: "var(--on-surface-dim)",
                    }}
                  >
                    No tools match the current search.
                  </div>
                ) : (
                  filteredToolOptions.map((tool) => {
                    const selected = selectedToolNames.includes(tool.name);
                    const isConfigurable = configurableToolNames.has(tool.name);
                    return (
                      <button
                        key={tool.name}
                        type="button"
                        onClick={() =>
                          setSelectedToolNames((current) =>
                            current.includes(tool.name)
                              ? current.filter((item) => item !== tool.name)
                              : [...current, tool.name]
                          )
                        }
                        className={`w-full rounded-xl border px-3 py-2.5 text-left transition-colors ${
                          selected
                            ? "border-[#7bd0ff55] bg-[#7bd0ff14]"
                            : "border-white/5 bg-surface-low hover:border-[#7bd0ff33]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium text-foreground">
                                {tool.name}
                              </p>
                              {isConfigurable && (
                                <span className="rounded-full bg-[#14b8a61a] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08rem] text-[#5eead4]">
                                  configurable
                                </span>
                              )}
                            </div>
                            <p
                              className="mt-1.5 line-clamp-2 text-xs leading-5"
                              style={{ color: "var(--on-surface-dim)" }}
                            >
                              {tool.description}
                            </p>
                          </div>
                          <div
                            className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08rem] ${
                              selected
                                ? "bg-[#7bd0ff1a] text-accent-cyan"
                                : "bg-white/5 text-on-surface-dim"
                            }`}
                          >
                            {selected ? "Selected" : "Available"}
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <p className="text-xs" style={{ color: "var(--on-surface-dim)" }}>
              Configurable tools expose per-agent override cards in the
              section below.
            </p>
          </div>
          </section>

          <section
            className="rounded-3xl border border-white/5 p-5 shadow-sm"
            style={{ background: "var(--surface-container)" }}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="font-heading text-lg font-semibold text-foreground">
                  Allowed Sub-Agents
                </h2>
                <p
                  className="mt-1 text-sm"
                  style={{ color: "var(--on-surface-dim)" }}
                >
                  Choose which child agents this agent is allowed to delegate to.
                  For hierarchy-wide editing, use the{" "}
                  <Link
                    href="/agents/canvas"
                    className="text-accent-cyan hover:underline"
                  >
                    hierarchy canvas
                  </Link>
                  .
                </p>
              </div>
              <div
                className="rounded-full px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.08rem]"
                style={{
                  background: "var(--surface-low)",
                  color: "var(--on-surface-dim)",
                }}
              >
                {selectedSubAgentIds.length} selected
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <div
                className="rounded-2xl border border-white/5 p-3"
                style={{ background: "var(--surface-low)" }}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-foreground">
                    Selection Preview
                  </p>
                  <p
                    className="text-[11px] uppercase tracking-[0.08rem]"
                    style={{ color: "var(--on-surface-dim)" }}
                  >
                    Click a chip to remove
                  </p>
                </div>
                {selectedSubAgents.length === 0 ? (
                  <div
                    className="mt-3 rounded-xl px-3 py-3 text-sm"
                    style={{
                      background: "var(--surface-container)",
                      color: "var(--on-surface-dim)",
                    }}
                  >
                    No sub-agents selected yet.
                  </div>
                ) : (
                  <div className="mt-3 flex max-h-28 flex-wrap gap-2 overflow-y-auto pr-1">
                    {selectedSubAgents.map((agent) => (
                      <button
                        key={agent.id}
                        type="button"
                        onClick={() =>
                          setSelectedSubAgentIds((current) =>
                            current.filter((item) => item !== agent.id)
                          )
                        }
                        className="rounded-full bg-[#7bd0ff14] px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.08rem] text-accent-cyan transition-opacity hover:opacity-80"
                        title={agent.role || "Remove sub-agent"}
                      >
                        {agent.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <Label
                  htmlFor="subAgentSearch"
                  className="mb-1.5 block text-sm font-medium text-foreground"
                >
                  Search Agents
                </Label>
                <Input
                  id="subAgentSearch"
                  value={subAgentSearch}
                  onChange={(event) => setSubAgentSearch(event.target.value)}
                  placeholder="Search by name, role, or description"
                  className="border-0 bg-surface-low text-foreground"
                />

                <div className="mt-3 max-h-[240px] space-y-2 overflow-y-auto pr-1">
                  {filteredSubAgentOptions.length === 0 ? (
                    <div
                      className="rounded-2xl px-4 py-4 text-sm"
                      style={{
                        background: "var(--surface-low)",
                        color: "var(--on-surface-dim)",
                      }}
                    >
                      No agents match the current search.
                    </div>
                  ) : (
                    filteredSubAgentOptions.map((agent) => {
                      const selected = selectedSubAgentIds.includes(agent.id);
                      return (
                        <button
                          key={agent.id}
                          type="button"
                          onClick={() =>
                            setSelectedSubAgentIds((current) =>
                              current.includes(agent.id)
                                ? current.filter((item) => item !== agent.id)
                                : [...current, agent.id]
                            )
                          }
                          className={`w-full rounded-xl border px-3 py-2.5 text-left transition-colors ${
                            selected
                              ? "border-[#7bd0ff55] bg-[#7bd0ff14]"
                              : "border-white/5 bg-surface-low hover:border-[#7bd0ff33]"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-medium text-foreground">
                                {agent.name}
                              </p>
                              <p
                                className="mt-1 text-xs uppercase tracking-[0.08rem]"
                                style={{ color: "var(--on-surface-dim)" }}
                              >
                                {agent.role}
                              </p>
                            </div>
                            <div
                              className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08rem] ${
                                selected
                                  ? "bg-[#7bd0ff1a] text-accent-cyan"
                                  : "bg-white/5 text-on-surface-dim"
                              }`}
                            >
                              {selected ? "Selected" : "Available"}
                            </div>
                          </div>
                          <p
                            className="mt-1.5 line-clamp-2 text-xs leading-5"
                            style={{ color: "var(--on-surface-dim)" }}
                          >
                            {agent.description || "No description"}
                          </p>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {isEdit && (
                <p className="text-xs" style={{ color: "var(--on-surface-dim)" }}>
                  The current agent cannot select itself as a sub-agent.
                </p>
              )}
            </div>
          </section>

          <section
            className="rounded-3xl border border-white/5 p-5 shadow-sm"
            style={{ background: "var(--surface-container)" }}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Settings2 className="h-4 w-4 text-accent-cyan" />
                  <h2 className="font-heading text-lg font-semibold text-foreground">
                    Per-Agent Tool Overrides
                  </h2>
                </div>
                <p
                  className="mt-1 text-sm"
                  style={{ color: "var(--on-surface-dim)" }}
                >
                  Override selected tool defaults for this agent without changing
                  the global workspace settings.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-[#14b8a61a] px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.08rem] text-[#5eead4]">
                  {visibleConfigurableTools.length} visible
                </span>
                <span className="rounded-full bg-[rgba(250,204,21,0.16)] px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.08rem] text-[#fde68a]">
                  {configuredOverrideToolCount} configured
                </span>
              </div>
            </div>

            {configurableTools.length === 0 ? (
              <div
                className="mt-4 rounded-2xl px-4 py-4 text-sm"
                style={{
                  background: "var(--surface-low)",
                  color: "var(--on-surface-dim)",
                }}
              >
                No configurable tools are currently available in the tool
                registry.
              </div>
            ) : visibleConfigurableTools.length === 0 ? (
              <div
                className="mt-4 rounded-2xl px-4 py-4 text-sm"
                style={{
                  background: "var(--surface-low)",
                  color: "var(--on-surface-dim)",
                }}
              >
                Select a configurable tool above to add agent-specific overrides.
                Available:{" "}
                <span className="text-foreground">
                  {configurableTools.map((tool) => tool.name).join(", ")}
                </span>
              </div>
            ) : (
              <div className="mt-5 space-y-5">
                {visibleConfigurableTools.map((tool) => {
                  const toolConfigForm =
                    toolConfigForms[tool.name] ||
                    buildToolConfigForm(tool, agentToolConfig[tool.name]);
                  const toolEnabled = selectedToolNames.includes(tool.name);
                  const hasOverrides = hasToolOverrideValues(toolConfigForm);
                  const supportsCredentialRef = (tool.configSchema || []).some(
                    (field) => field.name === "credential_ref"
                  );
                  const toolPresets = getToolOverridePresets(
                    tool,
                    toolConfigForm
                  );
                  const isExpanded = expandedOverrideToolNames.includes(
                    tool.name
                  );
                  const overrideEntries = Object.entries(
                    sanitizeToolConfig(tool, toolConfigForm)
                  );

                  return (
                    <div
                      key={tool.name}
                      className="rounded-2xl border border-white/5 p-4"
                      style={{ background: "var(--surface-low)" }}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-medium text-foreground">
                              {tool.name}
                            </h3>
                            <span className="rounded-full bg-[#14b8a61a] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08rem] text-[#5eead4]">
                              configurable
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08rem] ${
                                toolEnabled
                                  ? "bg-[#7bd0ff14] text-accent-cyan"
                                  : "bg-white/5 text-on-surface-dim"
                              }`}
                            >
                              {toolEnabled ? "Enabled" : "Disabled"}
                            </span>
                            {hasOverrides && (
                              <span className="rounded-full bg-[rgba(250,204,21,0.16)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08rem] text-[#fde68a]">
                                Overrides set
                              </span>
                            )}
                          </div>
                          <p
                            className="mt-2 line-clamp-2 text-sm"
                            style={{ color: "var(--on-surface-dim)" }}
                          >
                            {tool.description}
                          </p>
                          {overrideEntries.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {overrideEntries.map(([fieldName, fieldValue]) => (
                                <span
                                  key={`${tool.name}-${fieldName}`}
                                  className="rounded-full border border-[#7bd0ff33] bg-[#7bd0ff14] px-2.5 py-1 text-[11px] text-accent-cyan"
                                >
                                  {fieldName}: {String(fieldValue)}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {!toolEnabled && (
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() =>
                                setSelectedToolNames((current) =>
                                  current.includes(tool.name)
                                    ? current
                                    : [...current, tool.name]
                                )
                              }
                              className="border-0 bg-surface-high text-foreground"
                            >
                              Enable Tool
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => clearToolOverrides(tool)}
                            className="border-0 bg-surface-high text-foreground"
                          >
                            Clear Overrides
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => toggleOverrideToolExpansion(tool.name)}
                            className="border-0 bg-surface-high text-foreground"
                          >
                            {isExpanded ? (
                              <ChevronUp className="mr-2 h-4 w-4" />
                            ) : (
                              <ChevronDown className="mr-2 h-4 w-4" />
                            )}
                            {isExpanded ? "Collapse" : "Expand"}
                          </Button>
                        </div>
                      </div>

                      {isExpanded && (
                        <>
                          {toolPresets.length > 0 && (
                            <div className="mt-4">
                              <p
                                className="mb-2 text-[11px] font-medium uppercase tracking-[0.08rem]"
                                style={{ color: "var(--on-surface-dim)" }}
                              >
                                Quick Presets
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {toolPresets.map((preset) => (
                                  <button
                                    key={`${tool.name}-${preset.id}`}
                                    type="button"
                                    onClick={() =>
                                      applyToolPreset(tool.name, preset)
                                    }
                                    className="rounded-full bg-[#14b8a61a] px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.08rem] text-[#5eead4] transition-opacity hover:opacity-85"
                                    title={preset.description}
                                  >
                                    {preset.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                            {(tool.configSchema || []).map((field) => {
                              const inheritedValue =
                                tool.globalSettings?.[field.name] ??
                                field.default ??
                                "";

                              return (
                                <div
                                  key={`${tool.name}-${field.name}`}
                                  className={
                                    field.name === "allowed_domains"
                                      ? "md:col-span-2"
                                      : ""
                                  }
                                >
                                  <Label
                                    htmlFor={`${tool.name}-${field.name}`}
                                    className="mb-1 block text-sm font-medium text-foreground"
                                  >
                                    {field.label}
                                  </Label>
                                  <Input
                                    id={`${tool.name}-${field.name}`}
                                    type={
                                      field.type === "number" ? "number" : "text"
                                    }
                                    value={toolConfigForm[field.name] || ""}
                                    onChange={(event) =>
                                      updateToolConfigField(
                                        tool.name,
                                        field.name,
                                        event.target.value
                                      )
                                    }
                                    placeholder={String(inheritedValue)}
                                    className="border-0 bg-surface-container text-foreground"
                                  />
                                  <p
                                    className="mt-1 text-[11px] leading-5"
                                    style={{ color: "var(--on-surface-dim)" }}
                                  >
                                    {field.description} Inherit current workspace
                                    value:{" "}
                                    <span className="text-foreground">
                                      {String(inheritedValue || "Not set")}
                                    </span>
                                  </p>

                                  {field.name === "credential_ref" &&
                                    credentials.length > 0 && (
                                      <div className="mt-2 flex flex-wrap gap-2">
                                        {credentials.map((credential) => (
                                          <button
                                            key={`${tool.name}-${credential.id}`}
                                            type="button"
                                            onClick={() =>
                                              updateToolConfigField(
                                                tool.name,
                                                "credential_ref",
                                                toolConfigForm.credential_ref ===
                                                  credential.name
                                                  ? ""
                                                  : credential.name
                                              )
                                            }
                                            className={`rounded-full px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.08rem] transition-colors ${
                                              toolConfigForm.credential_ref ===
                                              credential.name
                                                ? "bg-[#7bd0ff14] text-accent-cyan"
                                                : "bg-surface-container text-on-surface-dim hover:text-accent-cyan"
                                            }`}
                                          >
                                            {credential.name}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                </div>
                              );
                            })}
                          </div>
                        </>
                      )}

                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        {!toolEnabled && hasOverrides && (
                          <p
                            className="text-xs"
                            style={{ color: "var(--on-surface-dim)" }}
                          >
                            This tool has saved overrides but is not currently in
                            the agent&apos;s allowed tools.
                          </p>
                        )}
                        {supportsCredentialRef && credentials.length === 0 && (
                          <p
                            className="text-xs"
                            style={{ color: "var(--on-surface-dim)" }}
                          >
                            No credentials in the vault yet. Add one in{" "}
                            <Link
                              href="/tools"
                              className="text-accent-cyan hover:underline"
                            >
                              Tools Library
                            </Link>
                            .
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
          <section
            className="rounded-3xl border border-white/5 p-5 shadow-sm"
            style={{ background: "var(--surface-container)" }}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="font-heading text-lg font-semibold text-foreground">
                  Agent Setup
                </h2>
                <p
                  className="mt-1 text-sm"
                  style={{ color: "var(--on-surface-dim)" }}
                >
                  Final runtime controls and save actions for this agent.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-[#7bd0ff14] px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.08rem] text-accent-cyan">
                  {selectedToolNames.length} tools
                </span>
                <span className="rounded-full bg-[#14b8a61a] px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.08rem] text-[#5eead4]">
                  {selectedSubAgentIds.length} sub-agents
                </span>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4">
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
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      maxSteps: parseInt(event.target.value, 10) || 10,
                    }))
                  }
                  className="border-0 bg-surface-low text-foreground"
                />
              </div>

              {/* Model Selector */}
              <div className="space-y-2">
                <Label
                  htmlFor="model"
                  className="text-[11px] uppercase tracking-[0.05rem]"
                  style={{ color: "var(--on-surface-dim)" }}
                >
                  LLM Model
                </Label>
                <select
                  id="model"
                  value={form.model}
                  onChange={(event) => {
                    const val = event.target.value;
                    // Auto-detect provider from model
                    let provider = "";
                    if (val.startsWith("gpt-") || val.startsWith("o1") || val.startsWith("o3") || val.startsWith("o4")) provider = "openai";
                    else if (val.startsWith("claude")) provider = "anthropic";
                    else if (val.startsWith("llama") || val.startsWith("mixtral") || val.startsWith("gemma")) provider = "groq";
                    else if (val.includes("/")) provider = "together";
                    setForm((current) => ({ ...current, model: val, provider }));
                  }}
                  className="w-full h-10 rounded-lg border-0 px-3 text-sm text-foreground"
                  style={{ background: "var(--surface-low)" }}
                >
                  <option value="">System Default (auto)</option>
                  <optgroup label="OpenAI">
                    <option value="gpt-4o-mini">GPT-4o Mini</option>
                    <option value="gpt-4o">GPT-4o</option>
                    <option value="gpt-4.1-mini">GPT-4.1 Mini</option>
                    <option value="gpt-4.1">GPT-4.1</option>
                  </optgroup>
                  <optgroup label="Anthropic">
                    <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
                    <option value="claude-3-5-haiku-20241022">Claude 3.5 Haiku</option>
                  </optgroup>
                  <optgroup label="Groq (Fast Inference)">
                    <option value="llama-3.3-70b-versatile">Llama 3.3 70B</option>
                    <option value="mixtral-8x7b-32768">Mixtral 8x7B</option>
                  </optgroup>
                  <optgroup label="Together AI">
                    <option value="meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo">Llama 3.1 70B</option>
                    <option value="mistralai/Mixtral-8x7B-Instruct-v0.1">Mixtral 8x7B</option>
                  </optgroup>
                </select>
                {form.model && (
                  <p className="text-[11px]" style={{ color: "var(--on-surface-dim)" }}>
                    Provider: <span className="text-accent-cyan">{form.provider || "auto"}</span>
                  </p>
                )}
              </div>
              <div
                className="flex items-center justify-between rounded-2xl p-3"
                style={{ background: "var(--surface-low)" }}
              >
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Active Status
                  </p>
                  <p
                    className="mt-1 text-xs"
                    style={{ color: "var(--on-surface-dim)" }}
                  >
                    Inactive agents cannot receive tasks.
                  </p>
                </div>
                <Switch
                  id="active"
                  checked={form.active}
                  onCheckedChange={(checked) =>
                    setForm((current) => ({ ...current, active: checked }))
                  }
                />
              </div>
            </div>

            <div className="mt-5 grid gap-3">
              <Button
                type="submit"
                disabled={saving}
                className="border-0 px-8 font-medium text-[#060e20] hover:opacity-90 gradient-primary"
              >
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                {isEdit ? "Update Agent" : "Create Agent"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => router.push("/agents")}
                className="border-0 bg-surface-high text-foreground"
              >
                Cancel
              </Button>
            </div>
          </section>
        </aside>
      </form>
    </>
  );
}
