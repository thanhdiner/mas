import Link from "next/link";
import { Loader2, ChevronDown, ChevronUp, X } from "lucide-react";
import { useState, useEffect } from "react";

export interface LogEntry {
  time: string;
  text: string;
  type: string;
}

export function ExecutionLog({
  execLog,
  isExecuting,
  execTaskId,
  resetAllExecStates,
}: {
  execLog: LogEntry[];
  isExecuting: boolean;
  execTaskId: string | null;
  resetAllExecStates: () => void;
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Auto-expand when a new execution starts
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isExecuting) setIsCollapsed(false);
  }, [isExecuting]);

  if (execLog.length === 0) return null;

  return (
    <div className="mt-3 rounded-2xl border border-white/5 overflow-hidden transition-all duration-200" style={{ background: "#1a1d26" }}>
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5" style={{ background: "#1f222c" }}>
        <div className="flex items-center gap-2">
          {isExecuting && <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: "#7bd0ff" }} />}
          <span className="text-xs font-medium" style={{ color: "#e8eaed" }}>
            Execution Log {isExecuting ? "(Live)" : "(Completed)"}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(232,234,237,0.45)" }}>
            {execLog.length} entries
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {execTaskId && (
            <Link href={`/tasks/${execTaskId}`}>
              <button className="text-[10px] px-2 py-1 rounded hover:bg-white/10 transition-colors" style={{ color: "#7bd0ff" }}>
                View Task →
              </button>
            </Link>
          )}
          <button
            onClick={resetAllExecStates}
            className="text-[10px] px-2 py-1 rounded hover:bg-white/10 transition-colors"
            style={{ color: "rgba(232,234,237,0.45)" }}
          >Clear</button>

          <div className="w-[1px] h-3 bg-white/10 mx-1"></div>

          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1 rounded hover:bg-white/10 transition-colors"
            style={{ color: "rgba(232,234,237,0.45)" }}
            title={isCollapsed ? "Expand" : "Collapse"}
          >
            {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={resetAllExecStates}
            className="p-1 rounded hover:bg-white/10 transition-colors"
            style={{ color: "rgba(232,234,237,0.45)" }}
            title="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      {!isCollapsed && (
        <div className="max-h-[250px] overflow-y-auto overflow-x-hidden px-4 pt-2 pb-8 space-y-1.5 font-mono">
        {execLog.map((log, i) => (
          <div key={i} className="flex items-start gap-2 text-[11px] leading-relaxed min-w-0">
            <span className="shrink-0 w-[60px]" style={{ color: "rgba(232,234,237,0.25)" }}>{log.time}</span>
            <span className="break-all" style={{
              color: log.type === "error" ? "#ffb4ab"
                : log.type === "done" ? "#4edea3"
                : log.type === "delegation" ? "#7bd0ff"
                : log.type === "step" ? "rgba(232,234,237,0.7)"
                : "rgba(232,234,237,0.4)",
            }}>{log.text}</span>
          </div>
        ))}
        {/* Spacer to guarantee padding is preserved in scroll views */}
        <div className="h-2 w-full shrink-0"></div>
      </div>
      )}
    </div>
  );
}
