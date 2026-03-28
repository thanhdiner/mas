import { useCallback } from "react";
import {
  BaseEdge,
  getBezierPath,
  useReactFlow,
  type EdgeProps,
} from "@xyflow/react";
import { X } from "lucide-react";

export function DeletableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  animated,
  style,
}: EdgeProps) {
  const { setEdges } = useReactFlow();

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    curvature: 0.25,
  });

  const isHighlighted = selected || animated;

  const onDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setEdges((eds) => eds.filter((edge) => edge.id !== id));
      // dispatch dirty flag via custom event
      window.dispatchEvent(new CustomEvent("canvas-dirty"));
    },
    [id, setEdges]
  );

  return (
    <>
      {/* Invisible wider path for easier selection */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        style={{ cursor: "pointer" }}
      />
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: isHighlighted ? "#7bd0ff" : "rgba(255,255,255,0.15)",
          strokeWidth: isHighlighted ? 2.5 : 2,
          ...(style ?? {}),
        }}
      />
      {/* Delete button — shown on hover/select via CSS group */}
      <foreignObject
        width={22}
        height={22}
        x={labelX - 11}
        y={labelY - 11}
        className="edge-delete-btn overflow-visible pointer-events-none"
        style={{ opacity: isHighlighted ? 1 : undefined }}
      >
        <div className="flex items-center justify-center w-[22px] h-[22px] pointer-events-auto">
          <button
            type="button"
            onClick={onDelete}
            className="w-[18px] h-[18px] rounded-full flex items-center justify-center transition-all hover:scale-110"
            style={{
              background: "#ff6d5a",
              boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
            }}
          >
            <X className="w-[10px] h-[10px] text-white" strokeWidth={3} />
          </button>
        </div>
      </foreignObject>
    </>
  );
}
