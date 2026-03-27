"use client";

import type { TaskStatus } from "@/lib/api";

const statusConfig: Record<
  TaskStatus,
  { label: string; dotClass: string; bgClass: string }
> = {
  queued: {
    label: "Queued",
    dotClass: "status-dot-queued",
    bgClass: "bg-[#222a3d]",
  },
  running: {
    label: "Running",
    dotClass: "status-dot-running",
    bgClass: "bg-[#222a3d]",
  },
  waiting_approval: {
    label: "Waiting",
    dotClass: "status-dot-waiting",
    bgClass: "bg-[#222a3d]",
  },
  done: {
    label: "Done",
    dotClass: "status-dot-done",
    bgClass: "bg-[#222a3d]",
  },
  failed: {
    label: "Failed",
    dotClass: "status-dot-failed",
    bgClass: "bg-[#222a3d]",
  },
  cancelled: {
    label: "Cancelled",
    dotClass: "status-dot-cancelled",
    bgClass: "bg-[#222a3d]",
  },
};

export function StatusBadge({ status }: { status: TaskStatus }) {
  const config = statusConfig[status] || statusConfig.queued;

  return (
    <span
      className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${config.bgClass}`}
    >
      <span className={`status-dot ${config.dotClass}`} />
      {config.label}
    </span>
  );
}
