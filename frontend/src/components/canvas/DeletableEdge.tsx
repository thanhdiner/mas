import { useCallback, memo } from "react";
import {
  BaseEdge,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";
import { X } from "lucide-react";

export const DeletableEdge = memo(function DeletableEdge({
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
    (event: React.MouseEvent) => {
      event.stopPropagation();
      window.dispatchEvent(
        new CustomEvent("canvas-edge-delete", {
          detail: { edgeId: id },
        })
      );
    },
    [id]
  );

  return (
    <>
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
});
