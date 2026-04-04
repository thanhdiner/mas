import { createElement, memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { Loader2 } from "lucide-react";

import { NODE_W, NODE_H, NODE_COLORS, type AgentNodeData } from "./constants";
import { getRoleIcon } from "./utils";

export const AgentNode = memo(function AgentNode({ data }: NodeProps<Node<AgentNodeData>>) {
  const { agent, isSelected, childCount, colorIndex, execState, execOutput } = data;
  const color = NODE_COLORS[colorIndex];

  const execRing = {
    idle: "",
    running: "ring-2 ring-[#7bd0ff] animate-pulse shadow-[0_0_20px_rgba(123,208,255,0.35)]",
    done: "ring-2 ring-[#4edea3] shadow-[0_0_16px_rgba(78,222,163,0.25)]",
    failed: "ring-2 ring-[#ff6d5a] shadow-[0_0_16px_rgba(255,109,90,0.25)]",
    waiting: "ring-2 ring-[#ffc107] animate-pulse shadow-[0_0_16px_rgba(255,193,7,0.25)]",
  }[execState];

  const selectedRing = isSelected && execState === "idle"
    ? "ring-2 ring-[#7bd0ff] shadow-[0_0_20px_rgba(123,208,255,0.2)]"
    : "";

  return (
    <div
      className={`relative flex items-stretch rounded-lg overflow-visible transition-shadow duration-150 ${
        execRing || selectedRing || "shadow-[0_2px_8px_rgba(0,0,0,0.3)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.4)]"
      }`}
      style={{
        width: NODE_W,
        height: NODE_H,
        willChange: "transform",
        contain: "layout style",
        backfaceVisibility: "hidden",
      }}
    >
      {/* Exec state indicator dot */}
      {execState !== "idle" && (
        <div className="absolute -top-1.5 -right-1.5 z-20 flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold"
          style={{
            background: execState === "running" ? "#7bd0ff" : execState === "done" ? "#4edea3" : execState === "failed" ? "#ff6d5a" : "#ffc107",
            color: "#fff",
            boxShadow: "0 2px 6px rgba(0,0,0,0.4)",
          }}
        >
          {execState === "running" && <Loader2 className="w-3 h-3 animate-spin" />}
          {execState === "done" && "✓"}
          {execState === "failed" && "✗"}
          {execState === "waiting" && "⏳"}
        </div>
      )}

      {/* Output badge */}
      {execState === "done" && execOutput && (
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 z-20 px-2 py-0.5 rounded text-[8px] font-medium truncate max-w-[180px]"
          style={{ background: "rgba(78,222,163,0.2)", color: "#4edea3", border: "1px solid rgba(78,222,163,0.3)" }}
          title={execOutput}
        >
          ✓ Output ready
        </div>
      )}

      {/* Input handle */}
      <div className="absolute -left-[15px] top-1/2 -translate-y-1/2 w-[30px] h-[30px] flex items-center justify-center" style={{ zIndex: 10 }}>
        <Handle type="target" position={Position.Left}
          className="!w-[14px] !h-[14px] !rounded-full !border-[2px] !bg-[#1a1d26] !border-[rgba(255,255,255,0.25)] hover:!border-[#7bd0ff] hover:!bg-[#7bd0ff] !transition-colors !relative !left-0 !top-0 !translate-x-0 !translate-y-0 handle-glow"
        />
      </div>

      <div className="flex items-center justify-center shrink-0 rounded-l-lg" style={{ background: color.bg, width: 52 }}>
        {createElement(getRoleIcon(agent.role) as React.ElementType, {
          className: "w-5 h-5",
          style: { color: color.icon },
          strokeWidth: 2
        })}
      </div>

      <div className="flex-1 flex flex-col justify-center px-3 min-w-0 rounded-r-lg" style={{ background: "#2a2e3a" }}>
        <p className="text-[12px] font-semibold truncate leading-tight" style={{ color: "#e8eaed" }}>{agent.name}</p>
        <p className="text-[10px] truncate mt-0.5 leading-tight" style={{ color: "rgba(232,234,237,0.5)" }}>
          {execState === "running" ? "Processing..." : execState === "waiting" ? "Waiting for sub-agent..." : agent.role}
        </p>
        {childCount > 0 && execState === "idle" && (
          <div className="flex items-center gap-1 mt-1.5">
            <div className="text-[9px] px-1.5 py-[1px] rounded-sm font-medium"
              style={{ background: "rgba(255,255,255,0.08)", color: "rgba(232,234,237,0.6)" }}
            >{childCount} sub</div>
          </div>
        )}
      </div>

      {/* Output handle */}
      <div className="absolute -right-[15px] top-1/2 -translate-y-1/2 w-[30px] h-[30px] flex items-center justify-center" style={{ zIndex: 10 }}>
        <Handle type="source" position={Position.Right}
          className="!w-[14px] !h-[14px] !rounded-full !border-[2px] !bg-[#1a1d26] !border-[rgba(255,255,255,0.25)] hover:!border-[#7bd0ff] hover:!bg-[#7bd0ff] !transition-colors !relative !right-0 !top-0 !translate-x-0 !translate-y-0 handle-glow"
        />
      </div>
    </div>
  );
});
