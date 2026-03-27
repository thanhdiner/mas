"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Wrench, Globe, BookOpen, Code, FileDown, Search, X } from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Map tool names to Lucide icons
const TOOL_ICONS: Record<string, any> = {
  web_search: Globe,
  read_website: BookOpen,
  execute_code: Code,
  write_file: FileDown,
};

interface ToolConfigSchema {
  name: string;
  type: "string" | "number";
  label: string;
  description: string;
  default: any;
}

interface ToolCatalogItem {
  name: string;
  description: string;
  configSchema?: ToolConfigSchema[];
  globalSettings?: Record<string, any>;
}

export default function ToolsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const [tools, setTools] = useState<ToolCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [savingSettings, setSavingSettings] = useState<Record<string, boolean>>({});

  // Which tool is currently open in the settings modal
  const openToolName = searchParams.get("setup");
  const activeTool = tools.find(t => t.name === openToolName);

  useEffect(() => {
    fetchTools();
  }, []);

  const fetchTools = () => {
    api.tools
      .list()
      .then((data) => setTools(data as ToolCatalogItem[]))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const updateSetting = async (toolName: string, fieldName: string, value: any) => {
    const tool = tools.find(t => t.name === toolName);
    if (!tool) return;
    
    // Optimistic update locally
    const currentSettings = tool.globalSettings || {};
    const newSettings = { ...currentSettings, [fieldName]: value };
    
    setTools(prev => prev.map(t => 
      t.name === toolName ? { ...t, globalSettings: newSettings } : t
    ));

    setSavingSettings({ ...savingSettings, [toolName]: true });
    try {
      await api.tools.updateSettings(toolName, newSettings);
    } catch (err) {
      console.error(err);
    }
    setSavingSettings({ ...savingSettings, [toolName]: false });
  };

  const openSettings = (toolName: string) => {
    const params = new URLSearchParams(searchParams);
    params.set("setup", toolName);
    router.push(`${pathname}?${params.toString()}`);
  };

  const closeSettings = () => {
    const params = new URLSearchParams(searchParams);
    params.delete("setup");
    router.push(`${pathname}?${params.toString()}`);
  };

  const filtered = tools.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <PageHeader
        title="Tools Library"
        description="Built-in capabilities that agents can use to interact with the world."
      />

      <div className="mb-6 max-w-md">
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
            style={{ color: "var(--on-surface-dim)" }}
          />
          <Input
            placeholder="Search tools..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-surface-container border-0 text-foreground placeholder:text-on-surface-dim"
          />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-sm" style={{ color: "var(--on-surface-dim)" }}>
          Loading tools...
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 rounded-xl" style={{ background: "var(--surface-container)" }}>
          <Wrench className="w-12 h-12 mx-auto mb-4" style={{ color: "var(--on-surface-dim)", opacity: 0.4 }} />
          <p className="text-lg font-heading font-medium mb-2">No tools found</p>
          <p className="text-sm mb-6" style={{ color: "var(--on-surface-dim)" }}>Try a different search term</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 items-stretch">
          {filtered.map((tool, i) => {
            const Icon = TOOL_ICONS[tool.name] || Wrench;
            const hasConfig = tool.configSchema && tool.configSchema.length > 0;

            return (
              <div
                key={tool.name}
                className="group rounded-xl p-5 transition-all duration-200 hover:scale-[1.02] animate-slide-in relative overflow-hidden flex flex-col h-full"
                style={{
                  background: "var(--surface-base)",
                  border: "1px solid rgba(255,255,255,0.05)",
                  animationDelay: `${i * 50}ms`,
                }}
              >
                {/* Decorative background glow */}
                <div 
                  className="absolute -right-8 -top-8 w-32 h-32 rounded-full opacity-10 transition-opacity group-hover:opacity-20 blur-2xl"
                  style={{ background: "linear-gradient(135deg, #7bd0ff, #008abb)", pointerEvents: "none" }}
                />

                <div className="flex items-start justify-between mb-4 relative z-10">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                      style={{
                        background: "rgba(123, 208, 255, 0.1)",
                        border: "1px solid rgba(123, 208, 255, 0.2)"
                      }}
                    >
                      <Icon className="w-5 h-5 text-accent-cyan" />
                    </div>
                    <div>
                      <h3 className="font-heading text-base font-semibold text-foreground group-hover:text-accent-cyan transition-colors">
                        {tool.name}
                      </h3>
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-sm uppercase tracking-wider bg-surface-high/50 text-accent-teal mt-1 flex w-fit items-center">
                        Built-in
                      </span>
                    </div>
                  </div>
                </div>

                <p className="text-sm leading-relaxed relative z-10 line-clamp-3 flex-1 mb-5" style={{ color: "var(--on-surface-dim)" }}>
                  {tool.description}
                </p>

                <div className="pt-4 border-t border-white/[0.05] flex items-center justify-between relative z-10 mt-auto">
                   <p className="text-[10px] uppercase font-bold tracking-widest text-accent-cyan">
                     Available for Agents
                   </p>
                   {hasConfig && (
                     <button
                       onClick={() => openSettings(tool.name)}
                       className="text-[10px] uppercase font-bold tracking-widest transition-colors text-white/50 hover:text-accent-cyan"
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

      {/* Global Settings Modal */}
      <Dialog open={!!activeTool} onOpenChange={(open) => !open && closeSettings()}>
        <DialogContent className="sm:max-w-md" style={{ background: "var(--surface-high)", borderColor: "rgba(255,255,255,0.1)", borderWidth: "1px" }}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-heading">
              {activeTool ? (TOOL_ICONS[activeTool.name] ? (() => { const Icon = TOOL_ICONS[activeTool.name]; return <Icon className="w-5 h-5 text-accent-cyan"/>; })() : <Wrench className="w-5 h-5 text-accent-cyan"/>) : null}
              {activeTool?.name} Global Settings
            </DialogTitle>
          </DialogHeader>
          
          <div className="py-2">
            <p className="text-sm mb-6" style={{ color: "var(--on-surface-dim)" }}>
              Customize global behavior for this tool across the entire workspace. These settings can be overridden on individual agents.
            </p>

            <div className="space-y-5">
              {activeTool?.configSchema?.map(field => {
                 const val = activeTool.globalSettings?.[field.name] ?? field.default;
                 return (
                   <div key={field.name}>
                     <div className="flex items-center justify-between mb-1.5">
                       <label className="text-sm font-medium text-foreground">{field.label}</label>
                       {savingSettings[activeTool.name] && <span className="text-[10px] text-accent-cyan animate-pulse">Saving...</span>}
                     </div>
                     <Input 
                       type={field.type === "number" ? "number" : "text"}
                       value={val}
                       onChange={e => updateSetting(activeTool.name, field.name, field.type === "number" ? Number(e.target.value) : e.target.value)}
                       onBlur={e => updateSetting(activeTool.name, field.name, field.type === "number" ? Number(e.target.value) : e.target.value)}
                       placeholder={String(field.default)}
                       className="w-full bg-surface-container border-0 focus-visible:ring-1 focus-visible:ring-accent-cyan text-foreground"
                     />
                     <p className="text-[11px] mt-1.5" style={{ color: "var(--on-surface-dim)" }}>{field.description}</p>
                   </div>
                 );
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
