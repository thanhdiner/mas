import { useState, useEffect, useMemo } from "react";
import Fuse from "fuse.js";
import { type Agent, api } from "@/lib/api";
import { useTools } from "@/lib/hooks/use-tools";
import { TOOL_ICONS } from "./constants";

interface ToolConfigSchema {
  name: string;
  type: "string" | "number";
  label: string;
  description: string;
  default: unknown;
}

interface ToolCatalogItem {
  name: string;
  description: string;
  configSchema?: ToolConfigSchema[];
}

export function ToolPicker({ agent, onAgentUpdated }: { agent: Agent; onAgentUpdated: (a: Agent) => void }) {
  const { tools: catalog } = useTools();
  const [saving, setSaving] = useState(false);
  const [expandedSettings, setExpandedSettings] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  const filteredCatalog = useMemo(() => {
    if (!debouncedSearch.trim()) return catalog;
    const fuse = new Fuse(catalog, {
      keys: ["name", "description"],
      threshold: 0.4,
    });
    return fuse.search(debouncedSearch.trim()).map((res) => res.item);
  }, [catalog, debouncedSearch]);

  const toggle = async (toolName: string) => {
    const has = agent.allowedTools.includes(toolName);
    const next = has ? agent.allowedTools.filter((t) => t !== toolName) : [...agent.allowedTools, toolName];
    
    // Automatically open settings if the tool has config and is being enabled
    if (!has && catalog.find(t => t.name === toolName)?.configSchema?.length) {
      setExpandedSettings(toolName);
    } else if (has && expandedSettings === toolName) {
      setExpandedSettings(null);
    }

    setSaving(true);
    try {
      const updated = await api.agents.update(agent.id, { allowedTools: next });
      onAgentUpdated(updated);
    } catch {}
    setSaving(false);
  };

  const updateConfig = async (toolName: string, configKey: string, value: unknown) => {
    const currentConfig = agent.toolConfig || {};
    const toolConf = currentConfig[toolName] || {};
    const nextConfig = { ...currentConfig, [toolName]: { ...toolConf, [configKey]: value } };

    setSaving(true);
    try {
      const updated = await api.agents.update(agent.id, { toolConfig: nextConfig });
      onAgentUpdated(updated);
    } catch {}
    setSaving(false);
  };

  return (
    <div>
      <label className="text-[9px] uppercase tracking-wider font-medium mb-1.5 block" style={{ color: "rgba(232,234,237,0.35)" }}>
        Tools ({agent.allowedTools.length}/{catalog.length})
        {saving && <span className="ml-1 text-[8px]" style={{ color: "#7bd0ff" }}>saving...</span>}
      </label>
      <input
        type="text"
        placeholder="Search tools..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full text-[10px] bg-transparent border rounded px-2 py-1.5 mb-2 outline-none focus:border-[#7bd0ff] transition-colors"
        style={{ borderColor: "rgba(255,255,255,0.1)", color: "#e8eaed" }}
      />
      <div className="space-y-1">
        {filteredCatalog.map((tool) => {
          const active = agent.allowedTools.includes(tool.name);
          const hasConfig = tool.configSchema && tool.configSchema.length > 0;
          const isExpanded = expandedSettings === tool.name;

          return (
            <div key={tool.name} className="flex flex-col rounded-lg transition-all"
                 style={{
                   background: active ? "rgba(78,222,163,0.05)" : "rgba(255,255,255,0.02)",
                   border: `1px solid ${active ? "rgba(78,222,163,0.25)" : "rgba(255,255,255,0.04)"}`,
                 }}>
              
              <div className="flex items-center group w-full px-2.5 py-2">
                <button onClick={() => toggle(tool.name)} className="flex items-center gap-2 flex-1 text-left min-w-0">
                  <span className="text-sm shrink-0">{TOOL_ICONS[tool.name] ?? "🔧"}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-medium" style={{ color: active ? "#4edea3" : "#e8eaed" }}>{tool.name}</p>
                    <p className="text-[8px] truncate" style={{ color: "rgba(232,234,237,0.35)" }}>{tool.description}</p>
                  </div>
                </button>
                
                {active && hasConfig && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); setExpandedSettings(isExpanded ? null : tool.name); }}
                    className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors hover:bg-white/10 shrink-0"
                    style={{ color: isExpanded ? "#7bd0ff" : "rgba(232,234,237,0.5)", background: isExpanded ? "rgba(123,208,255,0.1)" : "transparent" }}
                  >
                    Setup
                  </button>
                )}
                
                <button onClick={() => toggle(tool.name)} className="ml-2 w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0"
                  style={{
                    borderColor: active ? "#4edea3" : "rgba(255,255,255,0.15)",
                    background: active ? "#4edea3" : "transparent",
                  }}>
                  {active && <span className="text-[8px] text-white font-bold">✓</span>}
                </button>
              </div>

              {/* Configuration Panel */}
              {active && isExpanded && hasConfig && (
                <div className="px-2.5 pb-2.5 pt-1 border-t" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
                  <div className="space-y-2 mt-1">
                    {tool.configSchema!.map((field) => {
                      const currentValue = agent.toolConfig?.[tool.name]?.[field.name] ?? field.default;
                      return (
                        <div key={field.name}>
                          <label className="text-[9px] mb-0.5 block" style={{ color: "rgba(232,234,237,0.6)" }}>
                            {field.label}
                          </label>
                          <input
                            type={field.type === "number" ? "number" : "text"}
                            value={String(currentValue ?? "")}
                            onChange={(e) => updateConfig(tool.name, field.name, field.type === "number" ? Number(e.target.value) : e.target.value)}
                            onBlur={(e) => updateConfig(tool.name, field.name, field.type === "number" ? Number(e.target.value) : e.target.value)}
                            placeholder={String(field.default ?? "")}
                            className="w-full text-[10px] bg-transparent border rounded px-1.5 py-1 outline-none focus:border-[#7bd0ff] transition-colors"
                            style={{ borderColor: "rgba(255,255,255,0.1)", color: "#e8eaed" }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {filteredCatalog.length === 0 && (
          <p className="text-[10px]" style={{ color: "rgba(232,234,237,0.3)" }}>
            {catalog.length === 0 ? "Loading tools..." : "No tools found."}
          </p>
        )}
      </div>
    </div>
  );
}
