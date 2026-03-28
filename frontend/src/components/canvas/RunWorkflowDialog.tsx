import { Play, X } from "lucide-react";
import type { Agent } from "@/lib/api";

export function RunWorkflowDialog({
  showDialog,
  setShowDialog,
  runTitle,
  setRunTitle,
  runInput,
  setRunInput,
  rootAgents,
  runWorkflow,
}: {
  showDialog: boolean;
  setShowDialog: (show: boolean) => void;
  runTitle: string;
  setRunTitle: (t: string) => void;
  runInput: string;
  setRunInput: (i: string) => void;
  rootAgents: Agent[];
  runWorkflow: () => void;
}) {
  if (!showDialog) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="rounded-2xl p-6 w-full max-w-lg" style={{ background: "#1f222c", border: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #4edea3, #00c853)" }}>
              <Play className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: "#e8eaed" }}>Run Workflow</p>
              <p className="text-[10px]" style={{ color: "rgba(232,234,237,0.45)" }}>
                Assigns to: {rootAgents[0]?.name ?? "No root agent"}
              </p>
            </div>
          </div>
          <button onClick={() => setShowDialog(false)} className="rounded-md p-1.5 hover:bg-white/10 transition-colors">
            <X className="h-4 w-4" style={{ color: "rgba(232,234,237,0.5)" }} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[10px] uppercase tracking-wider font-medium mb-1.5 block" style={{ color: "rgba(232,234,237,0.4)" }}>Task Title</label>
            <input
              value={runTitle}
              onChange={(e) => setRunTitle(e.target.value)}
              placeholder="e.g. Research and write a report on AI trends"
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-[#7bd0ff] transition-all"
              style={{ background: "#2a2e3a", color: "#e8eaed", border: "1px solid rgba(255,255,255,0.06)" }}
              autoFocus
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider font-medium mb-1.5 block" style={{ color: "rgba(232,234,237,0.4)" }}>Input / Instructions</label>
            <textarea
              value={runInput}
              onChange={(e) => setRunInput(e.target.value)}
              placeholder="Provide detailed instructions for your agents..."
              rows={4}
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none resize-none focus:ring-1 focus:ring-[#7bd0ff] transition-all"
              style={{ background: "#2a2e3a", color: "#e8eaed", border: "1px solid rgba(255,255,255,0.06)" }}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={() => setShowDialog(false)}
            className="rounded-lg px-4 py-2 text-sm font-medium transition-colors hover:bg-white/10"
            style={{ color: "rgba(232,234,237,0.6)" }}
          >Cancel</button>
          <button
            onClick={runWorkflow}
            disabled={!runTitle.trim() || !runInput.trim() || rootAgents.length === 0}
            className="rounded-lg px-5 py-2 text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-40"
            style={{ background: "linear-gradient(135deg, #4edea3, #00c853)" }}
          >
            <span className="flex items-center gap-2">
              <Play className="h-3.5 w-3.5" /> Execute
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
