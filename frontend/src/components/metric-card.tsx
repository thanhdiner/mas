"use client";

import type { ReactNode } from "react";

interface MetricCardProps {
  title: string;
  value: string | number;
  icon?: ReactNode;
  trend?: { value: string; positive: boolean };
  className?: string;
}

export function MetricCard({
  title,
  value,
  icon,
  trend,
  className = "",
}: MetricCardProps) {
  return (
    <div
      className={`rounded-xl p-5 transition-all duration-200 hover:scale-[1.02] ${className}`}
      style={{ background: "var(--surface-container)" }}
    >
      <div className="flex items-start justify-between mb-3">
        <span
          className="text-[11px] font-medium uppercase tracking-[0.05rem]"
          style={{ color: "var(--on-surface-dim)" }}
        >
          {title}
        </span>
        {icon && (
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: "var(--surface-high)" }}
          >
            {icon}
          </div>
        )}
      </div>
      <div className="font-heading text-3xl font-semibold text-accent-cyan">
        {value}
      </div>
      {trend && (
        <div className="mt-2">
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium`}
            style={{
              background: trend.positive
                ? "rgba(78, 222, 163, 0.15)"
                : "rgba(255, 180, 171, 0.15)",
              color: trend.positive ? "#4edea3" : "#ffb4ab",
            }}
          >
            {trend.positive ? "↑" : "↓"} {trend.value}
          </span>
        </div>
      )}
    </div>
  );
}
