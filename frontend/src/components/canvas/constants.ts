import type { Agent } from "@/lib/api";

/* ---------- constants ---------- */
export const NODE_W = 200;
export const NODE_H = 76;
export const STORAGE_KEY = "mas_canvas_positions_v2";

/* ---------- types ---------- */
export type ExecState = "idle" | "running" | "done" | "failed" | "waiting";

export type AgentNodeData = {
  agent: Agent;
  isSelected: boolean;
  childCount: number;
  colorIndex: number;
  execState: ExecState;
  execOutput: string;
};

/* ---------- color palette ---------- */
export const NODE_COLORS = [
  { bg: "#ff6d5a", icon: "#fff" },
  { bg: "#1a73e8", icon: "#fff" },
  { bg: "#e95dac", icon: "#fff" },
  { bg: "#ff9800", icon: "#fff" },
  { bg: "#00c853", icon: "#fff" },
  { bg: "#9c27b0", icon: "#fff" },
  { bg: "#00bcd4", icon: "#fff" },
  { bg: "#ef5350", icon: "#fff" },
  { bg: "#7c4dff", icon: "#fff" },
  { bg: "#26a69a", icon: "#fff" },
];

/* ---------- style constants ---------- */
export const INPUT_CLS = "w-full rounded-md px-2.5 py-1.5 text-[11px] outline-none focus:ring-1 focus:ring-[#7bd0ff] transition-all";
export const INPUT_STYLE: React.CSSProperties = { background: "#2a2e3a", color: "#e8eaed", border: "1px solid rgba(255,255,255,0.06)" };
export const LABEL_CLS = "text-[9px] uppercase tracking-wider font-medium mb-1 block";
export const LABEL_STYLE: React.CSSProperties = { color: "rgba(232,234,237,0.35)" };

/* ---------- tool icons ---------- */
export const TOOL_ICONS: Record<string, string> = {
  web_search: "🌐",
  read_website: "📖",
  execute_code: "💻",
  write_file: "💾",
};
