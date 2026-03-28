"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  BookOpen,
  Code,
  PencilLine,
  FileDown,
  Globe,
  KeyRound,
  Plus,
  Search,
  Send,
  Trash2,
  Wrench,
} from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  api,
  type ToolCatalogItem,
  type ToolCredential,
  type ToolPreset,
} from "@/lib/api";

const TOOL_ICONS: Record<string, typeof Wrench> = {
  web_search: Globe,
  read_website: BookOpen,
  execute_code: Code,
  write_file: FileDown,
  http_request: Send,
};

interface HeaderRow {
  id: string;
  name: string;
  value: string;
}

type ToolPresetFormValues = Record<string, string>;

function createHeaderRow(): HeaderRow {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: "",
    value: "",
  };
}

function buildPresetFormValues(
  tool: ToolCatalogItem,
  values?: Record<string, string | number | unknown>
): ToolPresetFormValues {
  const nextValues: ToolPresetFormValues = {};
  for (const field of tool.configSchema || []) {
    const fieldValue = values?.[field.name];
    const fallbackValue = tool.globalSettings?.[field.name] ?? field.default ?? "";
    const resolvedValue =
      fieldValue !== undefined && fieldValue !== null ? fieldValue : fallbackValue;
    nextValues[field.name] =
      resolvedValue === undefined || resolvedValue === null
        ? ""
        : String(resolvedValue);
  }
  return nextValues;
}

function sanitizePresetValues(
  tool: ToolCatalogItem,
  values: ToolPresetFormValues
): Record<string, string | number> {
  const nextValues: Record<string, string | number> = {};
  for (const field of tool.configSchema || []) {
    const rawValue = values[field.name]?.trim() || "";
    if (!rawValue) {
      continue;
    }
    if (field.type === "number") {
      const parsed = Number(rawValue);
      if (Number.isFinite(parsed)) {
        nextValues[field.name] = parsed;
      }
      continue;
    }
    nextValues[field.name] = rawValue;
  }
  return nextValues;
}

export default function ToolsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const [tools, setTools] = useState<ToolCatalogItem[]>([]);
  const [credentials, setCredentials] = useState<ToolCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [loadError, setLoadError] = useState("");
  const [savingSettings, setSavingSettings] = useState<Record<string, boolean>>(
    {}
  );
  const [credentialDialogOpen, setCredentialDialogOpen] = useState(false);
  const [editingCredential, setEditingCredential] = useState<ToolCredential | null>(
    null
  );
  const [credentialName, setCredentialName] = useState("");
  const [credentialDescription, setCredentialDescription] = useState("");
  const [credentialHeaders, setCredentialHeaders] = useState<HeaderRow[]>([
    createHeaderRow(),
  ]);
  const [replaceCredentialHeaders, setReplaceCredentialHeaders] = useState(true);
  const [credentialStatus, setCredentialStatus] = useState("");
  const [creatingCredential, setCreatingCredential] = useState(false);
  const [deletingCredentialId, setDeletingCredentialId] = useState<string | null>(
    null
  );
  const [presetDialogOpen, setPresetDialogOpen] = useState(false);
  const [editingPreset, setEditingPreset] = useState<ToolPreset | null>(null);
  const [presetName, setPresetName] = useState("");
  const [presetDescription, setPresetDescription] = useState("");
  const [presetValues, setPresetValues] = useState<ToolPresetFormValues>({});
  const [presetStatus, setPresetStatus] = useState("");
  const [savingPreset, setSavingPreset] = useState(false);
  const [deletingPresetId, setDeletingPresetId] = useState<string | null>(null);

  const openToolName = searchParams.get("setup");
  const activeTool = tools.find((tool) => tool.name === openToolName);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setLoading(true);
      let nextError = "";

      const [toolsResult, credentialsResult] = await Promise.allSettled([
        api.tools.list(),
        api.tools.listCredentials(),
      ]);

      if (cancelled) {
        return;
      }

      if (toolsResult.status === "fulfilled") {
        setTools(toolsResult.value);
      } else {
        nextError =
          toolsResult.reason instanceof Error
            ? toolsResult.reason.message
            : "Failed to load tools.";
      }

      if (credentialsResult.status === "fulfilled") {
        setCredentials(credentialsResult.value);
      } else if (!nextError) {
        nextError =
          credentialsResult.reason instanceof Error
            ? credentialsResult.reason.message
            : "Failed to load credentials.";
      }

      setLoadError(nextError);
      setLoading(false);
    }

    loadData();

    return () => {
      cancelled = true;
    };
  }, []);

  const refreshCredentials = async () => {
    try {
      const items = await api.tools.listCredentials();
      setCredentials(items);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Failed to load credentials."
      );
    }
  };

  const refreshTools = async () => {
    try {
      const items = await api.tools.list();
      setTools(items);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to load tools.");
    }
  };

  const updateSetting = async (
    toolName: string,
    fieldName: string,
    value: string | number
  ) => {
    const tool = tools.find((item) => item.name === toolName);
    if (!tool) {
      return;
    }

    const currentSettings = tool.globalSettings || {};
    const nextSettings = { ...currentSettings, [fieldName]: value };

    setTools((current) =>
      current.map((item) =>
        item.name === toolName
          ? { ...item, globalSettings: nextSettings }
          : item
      )
    );
    setSavingSettings((current) => ({ ...current, [toolName]: true }));

    try {
      await api.tools.updateSettings(toolName, nextSettings);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Failed to update tool settings."
      );
    } finally {
      setSavingSettings((current) => ({ ...current, [toolName]: false }));
    }
  };

  const openSettings = (toolName: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("setup", toolName);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };

  const closeSettings = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("setup");
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };

  const resetPresetForm = () => {
    setEditingPreset(null);
    setPresetName("");
    setPresetDescription("");
    setPresetValues({});
    setPresetStatus("");
  };

  const resetCredentialForm = () => {
    setEditingCredential(null);
    setCredentialName("");
    setCredentialDescription("");
    setCredentialHeaders([createHeaderRow()]);
    setReplaceCredentialHeaders(true);
    setCredentialStatus("");
  };

  const openCreateCredentialDialog = () => {
    resetCredentialForm();
    setCredentialDialogOpen(true);
  };

  const openCreatePresetDialog = () => {
    if (!activeTool) {
      return;
    }
    setEditingPreset(null);
    setPresetName("");
    setPresetDescription("");
    setPresetValues(buildPresetFormValues(activeTool));
    setPresetStatus("");
    setPresetDialogOpen(true);
  };

  const openEditCredentialDialog = (credential: ToolCredential) => {
    setEditingCredential(credential);
    setCredentialName(credential.name);
    setCredentialDescription(credential.description);
    setCredentialHeaders([createHeaderRow()]);
    setReplaceCredentialHeaders(false);
    setCredentialStatus("");
    setCredentialDialogOpen(true);
  };

  const openEditPresetDialog = (preset: ToolPreset) => {
    if (!activeTool) {
      return;
    }
    setEditingPreset(preset);
    setPresetName(preset.name);
    setPresetDescription(preset.description);
    setPresetValues(buildPresetFormValues(activeTool, preset.values));
    setPresetStatus("");
    setPresetDialogOpen(true);
  };

  const submitCredential = async () => {
    const normalizedHeaders = credentialHeaders.reduce<Record<string, string>>(
      (accumulator, row) => {
        const headerName = row.name.trim();
        const headerValue = row.value.trim();
        if (headerName && headerValue) {
          accumulator[headerName] = headerValue;
        }
        return accumulator;
      },
      {}
    );

    if (!credentialName.trim()) {
      setCredentialStatus("Credential name is required.");
      return;
    }

    if (!editingCredential && Object.keys(normalizedHeaders).length === 0) {
      setCredentialStatus("Add at least one secret header.");
      return;
    }

    if (editingCredential && replaceCredentialHeaders && Object.keys(normalizedHeaders).length === 0) {
      setCredentialStatus("Add at least one secret header to replace the current secret set.");
      return;
    }

    setCreatingCredential(true);
    setCredentialStatus("");

    try {
      if (editingCredential) {
        await api.tools.updateCredential(editingCredential.id, {
          name: credentialName.trim(),
          description: credentialDescription.trim(),
          ...(replaceCredentialHeaders ? { headers: normalizedHeaders } : {}),
        });
      } else {
        await api.tools.createCredential({
          name: credentialName.trim(),
          description: credentialDescription.trim(),
          headers: normalizedHeaders,
        });
      }
      await refreshCredentials();
      resetCredentialForm();
      setCredentialDialogOpen(false);
    } catch (error) {
      setCredentialStatus(
        error instanceof Error
          ? error.message
          : editingCredential
            ? "Failed to update credential."
            : "Failed to create credential."
      );
    } finally {
      setCreatingCredential(false);
    }
  };

  const submitPreset = async () => {
    if (!activeTool) {
      return;
    }
    if (!presetName.trim()) {
      setPresetStatus("Preset name is required.");
      return;
    }

    const normalizedValues = sanitizePresetValues(activeTool, presetValues);
    if (Object.keys(normalizedValues).length === 0) {
      setPresetStatus("Add at least one preset value.");
      return;
    }

    setSavingPreset(true);
    setPresetStatus("");

    try {
      if (editingPreset) {
        await api.tools.updatePreset(editingPreset.id, {
          name: presetName.trim(),
          description: presetDescription.trim(),
          values: normalizedValues,
        });
      } else {
        await api.tools.createPreset({
          name: presetName.trim(),
          description: presetDescription.trim(),
          toolName: activeTool.name,
          values: normalizedValues,
        });
      }
      await refreshTools();
      resetPresetForm();
      setPresetDialogOpen(false);
    } catch (error) {
      setPresetStatus(
        error instanceof Error
          ? error.message
          : editingPreset
            ? "Failed to update preset."
            : "Failed to create preset."
      );
    } finally {
      setSavingPreset(false);
    }
  };

  const deleteCredential = async (credential: ToolCredential) => {
    const confirmed = window.confirm(
      `Delete credential '${credential.name}'? This will break any tool settings still referencing it.`
    );
    if (!confirmed) {
      return;
    }

    setDeletingCredentialId(credential.id);
    setLoadError("");

    try {
      await api.tools.deleteCredential(credential.id);
      await refreshCredentials();
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Failed to delete credential."
      );
    } finally {
      setDeletingCredentialId(null);
    }
  };

  const deletePreset = async (preset: ToolPreset) => {
    const confirmed = window.confirm(
      `Delete preset '${preset.name}' for tool '${preset.toolName}'?`
    );
    if (!confirmed) {
      return;
    }

    setDeletingPresetId(preset.id);
    setLoadError("");

    try {
      await api.tools.deletePreset(preset.id);
      await refreshTools();
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Failed to delete preset."
      );
    } finally {
      setDeletingPresetId(null);
    }
  };

  const filteredTools = tools.filter(
    (tool) =>
      tool.name.toLowerCase().includes(search.toLowerCase()) ||
      tool.description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <PageHeader
        title="Tools Library"
        description="Built-in capabilities that agents can use to interact with the world."
        actions={
          <Button
            type="button"
            onClick={openCreateCredentialDialog}
            className="gradient-primary border-0 font-medium text-[#060e20] hover:opacity-90"
          >
            <Plus className="mr-2 h-4 w-4" />
            New Credential
          </Button>
        }
      />

      {loadError && (
        <div
          className="mb-6 rounded-2xl px-4 py-3 text-sm"
          style={{
            background: "rgba(255, 180, 171, 0.12)",
            color: "#ffb4ab",
          }}
        >
          {loadError}
        </div>
      )}

      <div
        className="mb-6 rounded-3xl border border-white/5 p-5"
        style={{ background: "var(--surface-container)" }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-accent-cyan" />
              <p className="font-heading text-lg font-semibold">
                Credentials Vault
              </p>
            </div>
            <p
              className="mt-1 text-sm"
              style={{ color: "var(--on-surface-dim)" }}
            >
              Store write-only secret headers once, then reference them in
              tools like <span className="text-accent-cyan">http_request</span>{" "}
              via <code>credential_ref</code>.
            </p>
          </div>
          <p
            className="text-xs uppercase tracking-[0.08rem]"
            style={{ color: "var(--on-surface-dim)" }}
          >
            {credentials.length} credential{credentials.length === 1 ? "" : "s"}
          </p>
        </div>

        {credentials.length === 0 ? (
          <div
            className="mt-4 rounded-2xl px-4 py-6 text-sm text-center"
            style={{
              background: "var(--surface-low)",
              color: "var(--on-surface-dim)",
            }}
          >
            No credentials yet. Create one, then set its name as the
            `credential_ref` in HTTP Request settings.
          </div>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {credentials.map((credential) => (
              <div
                key={credential.id}
                className="rounded-2xl border border-white/5 p-4"
                style={{ background: "var(--surface-low)" }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-foreground">
                      {credential.name}
                    </p>
                    <p
                      className="mt-1 text-xs"
                      style={{ color: "var(--on-surface-dim)" }}
                    >
                      {credential.description || "No description"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEditCredentialDialog(credential)}
                      className="rounded-lg p-2 text-on-surface-dim transition-colors hover:bg-white/5 hover:text-accent-cyan"
                      aria-label={`Edit ${credential.name}`}
                    >
                      <PencilLine className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteCredential(credential)}
                      disabled={deletingCredentialId === credential.id}
                      className="rounded-lg p-2 text-on-surface-dim transition-colors hover:bg-white/5 hover:text-[#ffb4ab] disabled:opacity-50"
                      aria-label={`Delete ${credential.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="mt-4">
                  <p
                    className="text-[11px] uppercase tracking-[0.08rem]"
                    style={{ color: "var(--on-surface-dim)" }}
                  >
                    Header Keys
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {credential.headerKeys.length > 0 ? (
                      credential.headerKeys.map((headerKey) => (
                        <span
                          key={headerKey}
                          className="rounded-full border border-[#7bd0ff33] bg-[#7bd0ff14] px-2.5 py-1 text-[11px] text-accent-cyan"
                        >
                          {headerKey}
                        </span>
                      ))
                    ) : (
                      <span
                        className="text-xs"
                        style={{ color: "var(--on-surface-dim)" }}
                      >
                        No secret headers stored.
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mb-6 max-w-md">
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
            style={{ color: "var(--on-surface-dim)" }}
          />
          <Input
            placeholder="Search tools..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="border-0 bg-surface-container pl-10 text-foreground placeholder:text-on-surface-dim"
          />
        </div>
      </div>

      {loading ? (
        <div
          className="py-20 text-center text-sm"
          style={{ color: "var(--on-surface-dim)" }}
        >
          Loading tools...
        </div>
      ) : filteredTools.length === 0 ? (
        <div
          className="rounded-xl py-20 text-center"
          style={{ background: "var(--surface-container)" }}
        >
          <Wrench
            className="mx-auto mb-4 h-12 w-12"
            style={{ color: "var(--on-surface-dim)", opacity: 0.4 }}
          />
          <p className="mb-2 text-lg font-heading font-medium">No tools found</p>
          <p
            className="text-sm"
            style={{ color: "var(--on-surface-dim)" }}
          >
            Try a different search term.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredTools.map((tool, index) => {
            const Icon = TOOL_ICONS[tool.name] || Wrench;
            const hasConfig = Boolean(tool.configSchema?.length);

            return (
              <div
                key={tool.name}
                className="group relative flex h-full flex-col overflow-hidden rounded-xl p-5 transition-all duration-200 hover:scale-[1.02] animate-slide-in"
                style={{
                  background: "var(--surface-base)",
                  border: "1px solid rgba(255,255,255,0.05)",
                  animationDelay: `${index * 50}ms`,
                }}
              >
                <div
                  className="absolute -right-8 -top-8 h-32 w-32 rounded-full opacity-10 blur-2xl transition-opacity group-hover:opacity-20"
                  style={{
                    background: "linear-gradient(135deg, #7bd0ff, #008abb)",
                    pointerEvents: "none",
                  }}
                />

                <div className="relative z-10 mb-4 flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-lg shrink-0"
                      style={{
                        background: "rgba(123, 208, 255, 0.1)",
                        border: "1px solid rgba(123, 208, 255, 0.2)",
                      }}
                    >
                      <Icon className="h-5 w-5 text-accent-cyan" />
                    </div>
                    <div>
                      <h3 className="font-heading text-base font-semibold text-foreground transition-colors group-hover:text-accent-cyan">
                        {tool.name}
                      </h3>
                      <span className="mt-1 flex w-fit items-center rounded-sm bg-surface-high/50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-accent-teal">
                        Built-in
                      </span>
                    </div>
                  </div>
                </div>

                <p
                  className="relative z-10 mb-5 flex-1 line-clamp-3 text-sm leading-relaxed"
                  style={{ color: "var(--on-surface-dim)" }}
                >
                  {tool.description}
                </p>

                <div className="relative z-10 mt-auto flex items-center justify-between border-t border-white/[0.05] pt-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-accent-cyan">
                    Available for Agents
                  </p>
                  {hasConfig && (
                    <button
                      type="button"
                      onClick={() => openSettings(tool.name)}
                      className="text-[10px] font-bold uppercase tracking-widest text-white/50 transition-colors hover:text-accent-cyan"
                    >
                      Configure
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!activeTool} onOpenChange={(open) => !open && closeSettings()}>
        <DialogContent
          className="sm:max-w-md"
          style={{
            background: "var(--surface-high)",
            borderColor: "rgba(255,255,255,0.1)",
            borderWidth: "1px",
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-heading">
              {activeTool ? (
                TOOL_ICONS[activeTool.name] ? (
                  (() => {
                    const Icon = TOOL_ICONS[activeTool.name];
                    return <Icon className="h-5 w-5 text-accent-cyan" />;
                  })()
                ) : (
                  <Wrench className="h-5 w-5 text-accent-cyan" />
                )
              ) : null}
              {activeTool?.name} Global Settings
            </DialogTitle>
          </DialogHeader>

          <div className="py-2">
            <p className="mb-6 text-sm" style={{ color: "var(--on-surface-dim)" }}>
              Customize global behavior for this tool across the entire workspace.
              These settings can be overridden on individual agents.
            </p>

            <div className="space-y-5">
              {activeTool?.configSchema?.map((field) => {
                const value = activeTool.globalSettings?.[field.name] ?? field.default;
                const inputValue =
                  typeof value === "number" || typeof value === "string"
                    ? value
                    : String(field.default);

                return (
                  <div key={field.name}>
                    <div className="mb-1.5 flex items-center justify-between">
                      <label className="text-sm font-medium text-foreground">
                        {field.label}
                      </label>
                      {savingSettings[activeTool.name] && (
                        <span className="text-[10px] text-accent-cyan animate-pulse">
                          Saving...
                        </span>
                      )}
                    </div>

                    <Input
                      type={field.type === "number" ? "number" : "text"}
                      value={inputValue}
                      onChange={(event) =>
                        updateSetting(
                          activeTool.name,
                          field.name,
                          field.type === "number"
                            ? Number(event.target.value)
                            : event.target.value
                        )
                      }
                      onBlur={(event) =>
                        updateSetting(
                          activeTool.name,
                          field.name,
                          field.type === "number"
                            ? Number(event.target.value)
                            : event.target.value
                        )
                      }
                      placeholder={String(field.default)}
                      className="w-full border-0 bg-surface-container text-foreground focus-visible:ring-1 focus-visible:ring-accent-cyan"
                    />

                    <p
                      className="mt-1.5 text-[11px]"
                      style={{ color: "var(--on-surface-dim)" }}
                    >
                      {field.description}
                    </p>

                    {field.name === "credential_ref" && credentials.length > 0 && (
                      <div className="mt-2 rounded-xl bg-surface-container px-3 py-2">
                        <p
                          className="text-[10px] uppercase tracking-[0.08rem]"
                          style={{ color: "var(--on-surface-dim)" }}
                        >
                          Available Credentials
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {credentials.map((credential) => (
                            <button
                              key={credential.id}
                              type="button"
                              onClick={() =>
                                updateSetting(
                                  activeTool.name,
                                  field.name,
                                  credential.name
                                )
                              }
                              className="rounded-full border border-[#7bd0ff33] bg-[#7bd0ff14] px-2.5 py-1 text-[11px] text-accent-cyan transition-opacity hover:opacity-80"
                            >
                              {credential.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {activeTool && (
                <div className="rounded-2xl border border-white/5 bg-surface-container p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-foreground">
                        Workspace Presets
                      </p>
                      <p
                        className="mt-1 text-xs"
                        style={{ color: "var(--on-surface-dim)" }}
                      >
                        Save reusable config bundles for this tool. These
                        presets appear in the agent form quick preset area.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={openCreatePresetDialog}
                      className="border-0 bg-surface-high text-foreground"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Save Current as Preset
                    </Button>
                  </div>

                  {activeTool.presets?.length ? (
                    <div className="mt-4 space-y-3">
                      {activeTool.presets.map((preset) => (
                        <div
                          key={preset.id}
                          className="rounded-xl border border-white/5 bg-surface-low p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-medium text-foreground">
                                {preset.name}
                              </p>
                              <p
                                className="mt-1 text-xs"
                                style={{ color: "var(--on-surface-dim)" }}
                              >
                                {preset.description || "No description"}
                              </p>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => openEditPresetDialog(preset)}
                                className="rounded-lg p-2 text-on-surface-dim transition-colors hover:bg-white/5 hover:text-accent-cyan"
                                aria-label={`Edit ${preset.name}`}
                              >
                                <PencilLine className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => deletePreset(preset)}
                                disabled={deletingPresetId === preset.id}
                                className="rounded-lg p-2 text-on-surface-dim transition-colors hover:bg-white/5 hover:text-[#ffb4ab] disabled:opacity-50"
                                aria-label={`Delete ${preset.name}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>

                          <div className="mt-3 flex flex-wrap gap-2">
                            {Object.entries(preset.values).map(([key, presetValue]) => (
                              <span
                                key={`${preset.id}-${key}`}
                                className="rounded-full border border-[#7bd0ff33] bg-[#7bd0ff14] px-2.5 py-1 text-[11px] text-accent-cyan"
                              >
                                {key}: {String(presetValue)}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div
                      className="mt-4 rounded-xl px-3 py-3 text-sm"
                      style={{
                        background: "var(--surface-low)",
                        color: "var(--on-surface-dim)",
                      }}
                    >
                      No saved presets for this tool yet.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={presetDialogOpen}
        onOpenChange={(open) => {
          setPresetDialogOpen(open);
          if (!open) {
            resetPresetForm();
          }
        }}
      >
        <DialogContent
          className="sm:max-w-lg"
          style={{
            background: "var(--surface-high)",
            borderColor: "rgba(255,255,255,0.1)",
            borderWidth: "1px",
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-heading">
              <PencilLine className="h-5 w-5 text-accent-cyan" />
              {editingPreset ? "Edit Tool Preset" : "New Tool Preset"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                Tool
              </label>
              <div
                className="rounded-xl px-3 py-3 text-sm"
                style={{
                  background: "var(--surface-container)",
                  color: "var(--on-surface-dim)",
                }}
              >
                {activeTool?.name || "No tool selected"}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                Preset Name
              </label>
              <Input
                value={presetName}
                onChange={(event) => setPresetName(event.target.value)}
                placeholder="e.g. GitHub Triage Repo"
                className="border-0 bg-surface-container text-foreground"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                Description
              </label>
              <Input
                value={presetDescription}
                onChange={(event) => setPresetDescription(event.target.value)}
                placeholder="What this preset is intended for"
                className="border-0 bg-surface-container text-foreground"
              />
            </div>

            <div className="space-y-4">
              {(activeTool?.configSchema || []).map((field) => {
                const inheritedValue =
                  activeTool?.globalSettings?.[field.name] ?? field.default ?? "";
                return (
                  <div key={`preset-${field.name}`}>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">
                      {field.label}
                    </label>
                    <Input
                      type={field.type === "number" ? "number" : "text"}
                      value={presetValues[field.name] || ""}
                      onChange={(event) =>
                        setPresetValues((current) => ({
                          ...current,
                          [field.name]: event.target.value,
                        }))
                      }
                      placeholder={String(inheritedValue)}
                      className="border-0 bg-surface-container text-foreground"
                    />
                    <p
                      className="mt-1.5 text-[11px]"
                      style={{ color: "var(--on-surface-dim)" }}
                    >
                      {field.description} Current workspace value:{" "}
                      <span className="text-foreground">
                        {String(inheritedValue || "Not set")}
                      </span>
                    </p>

                    {field.name === "credential_ref" && credentials.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {credentials.map((credential) => (
                          <button
                            key={`preset-${credential.id}`}
                            type="button"
                            onClick={() =>
                              setPresetValues((current) => ({
                                ...current,
                                credential_ref:
                                  current.credential_ref === credential.name
                                    ? ""
                                    : credential.name,
                              }))
                            }
                            className={`rounded-full px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.08rem] transition-colors ${
                              presetValues.credential_ref === credential.name
                                ? "bg-[#7bd0ff14] text-accent-cyan"
                                : "bg-surface-low text-on-surface-dim hover:text-accent-cyan"
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

            {presetStatus && (
              <div
                className="rounded-xl px-3 py-2 text-sm"
                style={{
                  background: "rgba(255, 180, 171, 0.12)",
                  color: "#ffb4ab",
                }}
              >
                {presetStatus}
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <Button
                type="button"
                onClick={submitPreset}
                disabled={savingPreset || !activeTool}
                className="gradient-primary border-0 font-medium text-[#060e20] hover:opacity-90"
              >
                <PencilLine className="mr-2 h-4 w-4" />
                {savingPreset
                  ? editingPreset
                    ? "Saving..."
                    : "Creating..."
                  : editingPreset
                    ? "Save Preset"
                    : "Create Preset"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setPresetDialogOpen(false);
                  resetPresetForm();
                }}
                className="border-0 bg-surface-container text-foreground"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={credentialDialogOpen}
        onOpenChange={(open) => {
          setCredentialDialogOpen(open);
          if (!open) {
            resetCredentialForm();
          }
        }}
      >
        <DialogContent
          className="sm:max-w-lg"
          style={{
            background: "var(--surface-high)",
            borderColor: "rgba(255,255,255,0.1)",
            borderWidth: "1px",
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-heading">
              <KeyRound className="h-5 w-5 text-accent-cyan" />
              {editingCredential ? "Edit Credential" : "New Credential"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                Credential Name
              </label>
              <Input
                value={credentialName}
                onChange={(event) => setCredentialName(event.target.value)}
                placeholder="e.g. slack-prod"
                className="border-0 bg-surface-container text-foreground"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                Description
              </label>
              <Input
                value={credentialDescription}
                onChange={(event) => setCredentialDescription(event.target.value)}
                placeholder="What API or integration this credential is for"
                className="border-0 bg-surface-container text-foreground"
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                  <label className="block text-sm font-medium text-foreground">
                    Secret Headers
                  </label>
                  {editingCredential && (
                    <p
                      className="mt-1 text-[11px]"
                      style={{ color: "var(--on-surface-dim)" }}
                    >
                      Existing secret values are hidden. Turn on replace only if
                      you want to rotate them.
                    </p>
                  )}
                </div>
                {editingCredential && (
                  <button
                    type="button"
                    onClick={() =>
                      setReplaceCredentialHeaders((current) => !current)
                    }
                    className={`rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.08rem] transition-colors ${
                      replaceCredentialHeaders
                        ? "bg-[#7bd0ff14] text-accent-cyan"
                        : "bg-surface-container text-on-surface-dim"
                    }`}
                  >
                    {replaceCredentialHeaders ? "Replacing" : "Keep Existing"}
                  </button>
                )}
                {(!editingCredential || replaceCredentialHeaders) && (
                  <button
                    type="button"
                    onClick={() =>
                      setCredentialHeaders((current) => [
                        ...current,
                        createHeaderRow(),
                      ])
                    }
                    className="text-xs uppercase tracking-[0.08rem] text-accent-cyan"
                  >
                    Add Header
                  </button>
                )}
              </div>
              {!editingCredential || replaceCredentialHeaders ? (
                <div className="space-y-3">
                  {credentialHeaders.map((row, index) => (
                    <div
                      key={row.id}
                      className="grid grid-cols-[1fr_1fr_auto] gap-2"
                    >
                      <Input
                        value={row.name}
                        onChange={(event) =>
                          setCredentialHeaders((current) =>
                            current.map((item) =>
                              item.id === row.id
                                ? { ...item, name: event.target.value }
                                : item
                            )
                          )
                        }
                        placeholder={index === 0 ? "Authorization" : "Header name"}
                        className="border-0 bg-surface-container text-foreground"
                      />
                      <Input
                        value={row.value}
                        onChange={(event) =>
                          setCredentialHeaders((current) =>
                            current.map((item) =>
                              item.id === row.id
                                ? { ...item, value: event.target.value }
                                : item
                            )
                          )
                        }
                        placeholder={
                          index === 0 ? "Bearer sk-..." : "Header value"
                        }
                        className="border-0 bg-surface-container text-foreground"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setCredentialHeaders((current) =>
                            current.length === 1
                              ? [createHeaderRow()]
                              : current.filter((item) => item.id !== row.id)
                          )
                        }
                        className="rounded-lg px-3 text-on-surface-dim transition-colors hover:bg-white/5 hover:text-[#ffb4ab]"
                        aria-label="Remove header row"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  className="rounded-xl px-3 py-3 text-sm"
                  style={{
                    background: "var(--surface-container)",
                    color: "var(--on-surface-dim)",
                  }}
                >
                  Current secret headers will stay unchanged.
                </div>
              )}
              <p
                className="mt-2 text-[11px]"
                style={{ color: "var(--on-surface-dim)" }}
              >
                Secret values are write-only. After save, the UI only shows
                header names, never header values.
              </p>
            </div>

            {credentialStatus && (
              <div
                className="rounded-xl px-3 py-2 text-sm"
                style={{
                  background: "rgba(255, 180, 171, 0.12)",
                  color: "#ffb4ab",
                }}
              >
                {credentialStatus}
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <Button
                type="button"
                onClick={submitCredential}
                disabled={creatingCredential}
                className="gradient-primary border-0 font-medium text-[#060e20] hover:opacity-90"
              >
                {editingCredential ? (
                  <PencilLine className="mr-2 h-4 w-4" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                {creatingCredential
                  ? editingCredential
                    ? "Saving..."
                    : "Creating..."
                  : editingCredential
                    ? "Save Changes"
                    : "Create Credential"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setCredentialDialogOpen(false);
                  resetCredentialForm();
                }}
                className="border-0 bg-surface-container text-foreground"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
