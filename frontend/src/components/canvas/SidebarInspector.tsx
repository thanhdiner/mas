import { useState, useEffect, useCallback, createElement } from "react";
import Link from "next/link";
import { Loader2, ExternalLink, Unlink, X } from "lucide-react";
import type { Edge } from "@xyflow/react";

import { api, type Agent } from "@/lib/api";
import { NODE_COLORS, INPUT_CLS, INPUT_STYLE, LABEL_CLS, LABEL_STYLE } from "./constants";
import { getRoleIcon } from "./utils";
import { ToolPicker } from "./ToolPicker";

type SidebarTab = "settings" | "connections";

export function SidebarInspector({
  agent, agents, edges, selectedNodeId, setSelectedNodeId,
  disconnectSelected, removeEdgeBetween, hierarchyInfo, colorIndex,
  onAgentUpdated,
}: {
  agent: Agent;
  agents: Agent[];
  edges: Edge[];
  selectedNodeId: string;
  setSelectedNodeId: (id: string | null) => void;
  disconnectSelected: () => void;
  removeEdgeBetween: (s: string, t: string) => void;
  hierarchyInfo: { parent: Agent | null; children: Agent[]; inputs: Agent[] } | null;
  colorIndex: number;
  onAgentUpdated: (a: Agent) => void;
}) {
  const [tab, setTab] = useState<SidebarTab>("settings");
  const [form, setForm] = useState({
    name: agent.name, role: agent.role, description: agent.description,
    systemPrompt: agent.systemPrompt, maxSteps: agent.maxSteps, active: agent.active,
  });
  const [savingField, setSavingField] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  const saveField = useCallback(async (field: string, value: unknown) => {
    setSavingField(true);
    setSaveMsg("");
    try {
      const updated = await api.agents.update(agent.id, { [field]: value });
      onAgentUpdated(updated);
      setSaveMsg("Saved");
      setTimeout(() => setSaveMsg(""), 1500);
    } catch {
      setSaveMsg("Error");
    }
    setSavingField(false);
  }, [agent.id, onAgentUpdated]);

  const handleBlur = (field: string, value: unknown, original: unknown) => {
    if (value !== original) saveField(field, value);
  };

  const toggleActive = async () => {
    const next = !form.active;
    setForm((f) => ({ ...f, active: next }));
    await saveField("active", next);
  };

  const color = NODE_COLORS[colorIndex];

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header */}
      <div className="p-4 pb-3 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg shrink-0" style={{ background: color.bg }}>
            {createElement(getRoleIcon(agent.role) as React.ElementType, {
              className: "h-4 w-4 text-white"
            })}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold truncate" style={{ color: "#e8eaed" }}>{agent.name}</p>
            <p className="text-[9px] uppercase tracking-wider" style={{ color: "rgba(232,234,237,0.4)" }}>{agent.role}</p>
          </div>
          {savingField && <Loader2 className="h-3 w-3 animate-spin" style={{ color: "#7bd0ff" }} />}
          {saveMsg && <span className="text-[9px] font-medium" style={{ color: saveMsg === "Saved" ? "#4edea3" : "#ffb4ab" }}>{saveMsg}</span>}
        </div>

        {/* Tabs */}
        <div className="flex gap-0 mt-3 rounded-lg overflow-hidden" style={{ background: "#2a2e3a" }}>
          {(["settings", "connections"] as SidebarTab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className="flex-1 py-1.5 text-[10px] font-medium uppercase tracking-wider transition-colors"
              style={{
                background: tab === t ? "rgba(123,208,255,0.15)" : "transparent",
                color: tab === t ? "#7bd0ff" : "rgba(232,234,237,0.4)",
              }}
            >{t === "settings" ? "⚙ Settings" : "🔗 Connections"}</button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar">
        <div className="p-4 space-y-3">
          {tab === "settings" ? (
            <>
              {/* Name */}
              <div>
                <label className={LABEL_CLS} style={LABEL_STYLE}>Name</label>
                <input className={INPUT_CLS} style={INPUT_STYLE} value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  onBlur={() => handleBlur("name", form.name, agent.name)}
                />
              </div>

              {/* Role */}
              <div>
                <label className={LABEL_CLS} style={LABEL_STYLE}>Role</label>
                <input className={INPUT_CLS} style={INPUT_STYLE} value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                  onBlur={() => handleBlur("role", form.role, agent.role)}
                />
              </div>

              {/* Description */}
              <div>
                <label className={LABEL_CLS} style={LABEL_STYLE}>Description</label>
                <textarea className={`${INPUT_CLS} resize-none`} style={INPUT_STYLE} rows={2}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  onBlur={() => handleBlur("description", form.description, agent.description)}
                />
              </div>

              {/* System Prompt */}
              <div>
                <label className={LABEL_CLS} style={LABEL_STYLE}>System Prompt</label>
                <textarea className={`${INPUT_CLS} resize-none font-mono`} style={{ ...INPUT_STYLE, fontSize: 10, lineHeight: 1.5 }} rows={5}
                  value={form.systemPrompt}
                  onChange={(e) => setForm((f) => ({ ...f, systemPrompt: e.target.value }))}
                  onBlur={() => handleBlur("systemPrompt", form.systemPrompt, agent.systemPrompt)}
                />
              </div>

              <div className="h-px" style={{ background: "rgba(255,255,255,0.06)" }} />

              {/* Max Steps */}
              <div className="flex items-center justify-between">
                <label className="text-[9px] uppercase tracking-wider font-medium" style={LABEL_STYLE}>Max Steps</label>
                <input type="number" className={`${INPUT_CLS} !w-16 text-center`} style={INPUT_STYLE}
                  value={form.maxSteps} min={1} max={100}
                  onChange={(e) => setForm((f) => ({ ...f, maxSteps: parseInt(e.target.value) || 1 }))}
                  onBlur={() => handleBlur("maxSteps", form.maxSteps, agent.maxSteps)}
                />
              </div>

              {/* Active toggle */}
              <div className="flex items-center justify-between">
                <label className="text-[9px] uppercase tracking-wider font-medium" style={LABEL_STYLE}>Active</label>
                <button onClick={toggleActive}
                  className="relative w-9 h-5 rounded-full transition-colors"
                  style={{ background: form.active ? "#4edea3" : "rgba(255,255,255,0.1)" }}
                >
                  <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow-sm"
                    style={{ left: form.active ? 18 : 2 }}
                  />
                </button>
              </div>

              {/* Tools picker */}
              <ToolPicker agent={agent} onAgentUpdated={onAgentUpdated} />

              <div className="h-px" style={{ background: "rgba(255,255,255,0.06)" }} />

              {/* Quick actions */}
              <div className="flex flex-wrap gap-1.5">
                <Link href={`/agents/${agent.id}`}>
                  <button className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[10px] font-medium transition-colors hover:bg-white/10"
                    style={{ background: "rgba(255,255,255,0.05)", color: "#e8eaed" }}>
                    <ExternalLink className="h-3 w-3" style={{ color: "#7bd0ff" }} /> Full Editor
                  </button>
                </Link>
                <button onClick={disconnectSelected}
                  className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[10px] font-medium transition-colors hover:bg-white/10"
                  style={{ background: "rgba(255,255,255,0.05)", color: "#ffb4ab" }}>
                  <Unlink className="h-3 w-3" /> Disconnect
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Inputs */}
              <div>
                <p className={LABEL_CLS} style={LABEL_STYLE}>Inputs — Reports To ({hierarchyInfo?.inputs.length ?? 0})</p>
                {hierarchyInfo?.inputs && hierarchyInfo.inputs.length > 0 ? (
                  <div className="space-y-1">
                    {hierarchyInfo.inputs.map((inp) => (
                      <div key={inp.id} className="flex items-center gap-2 rounded-lg p-2 group" style={{ background: "rgba(255,255,255,0.02)" }}>
                        <button onClick={() => setSelectedNodeId(inp.id)} className="flex items-center gap-2 min-w-0 flex-1 text-left hover:opacity-80">
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ background: NODE_COLORS[agents.findIndex(a => a.id === inp.id) % NODE_COLORS.length]?.bg ?? "#7bd0ff" }} />
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-medium truncate" style={{ color: "#e8eaed" }}>{inp.name}</p>
                            <p className="text-[9px] truncate" style={{ color: "rgba(232,234,237,0.4)" }}>{inp.role}</p>
                          </div>
                        </button>
                        <button onClick={() => removeEdgeBetween(inp.id, selectedNodeId)} className="rounded p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/10" title="Remove">
                          <X className="h-3 w-3" style={{ color: "#ffb4ab" }} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg p-2.5 text-[11px]" style={{ background: "rgba(255,255,255,0.03)", color: "rgba(232,234,237,0.35)" }}>No input — root agent</div>
                )}
              </div>

              {/* Outputs */}
              <div>
                <p className={LABEL_CLS} style={LABEL_STYLE}>Outputs — Sub-Agents ({hierarchyInfo?.children.length ?? 0})</p>
                {hierarchyInfo?.children && hierarchyInfo.children.length > 0 ? (
                  <div className="space-y-1">
                    {hierarchyInfo.children.map((child) => (
                      <div key={child.id} className="flex items-center gap-2 rounded-lg p-2 group" style={{ background: "rgba(255,255,255,0.02)" }}>
                        <button onClick={() => setSelectedNodeId(child.id)} className="flex items-center gap-2 min-w-0 flex-1 text-left hover:opacity-80">
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ background: NODE_COLORS[agents.findIndex(a => a.id === child.id) % NODE_COLORS.length]?.bg ?? "#7bd0ff" }} />
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-medium truncate" style={{ color: "#e8eaed" }}>{child.name}</p>
                            <p className="text-[9px] truncate" style={{ color: "rgba(232,234,237,0.4)" }}>{child.role}</p>
                          </div>
                        </button>
                        <button onClick={() => removeEdgeBetween(selectedNodeId, child.id)} className="rounded p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/10" title="Remove">
                          <X className="h-3 w-3" style={{ color: "#ffb4ab" }} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg p-2.5 text-[11px]" style={{ background: "rgba(255,255,255,0.03)", color: "rgba(232,234,237,0.35)" }}>No outputs — leaf agent</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
