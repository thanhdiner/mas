import useSWR from "swr";
import { api, type DashboardStats, type ActivityItem, type TopAgent, type AnalyticsData, type Task } from "@/lib/api";

const REFRESH_INTERVAL = 10000;

export function useDashboardStats() {
  const { data, error, isLoading, mutate } = useSWR<DashboardStats>(
    "dashboard-stats",
    () => api.dashboard.stats(),
    { refreshInterval: REFRESH_INTERVAL }
  );
  return { stats: data ?? null, error, isLoading, mutate };
}

export function useDashboardActivity(limit: number = 15) {
  const { data, error, isLoading, mutate } = useSWR<ActivityItem[]>(
    ["dashboard-activity", limit],
    () => api.dashboard.activity(limit),
    { refreshInterval: REFRESH_INTERVAL }
  );
  return { activity: data ?? [], error, isLoading, mutate };
}

export function useDashboardTopAgents(limit: number = 5) {
  const { data, error, isLoading, mutate } = useSWR<TopAgent[]>(
    ["dashboard-top-agents", limit],
    () => api.dashboard.topAgents(limit),
    { refreshInterval: REFRESH_INTERVAL }
  );
  return { topAgents: data ?? [], error, isLoading, mutate };
}

export function useDashboardAnalytics() {
  const { data, error, isLoading, mutate } = useSWR<AnalyticsData | null>(
    "dashboard-analytics",
    () => api.dashboard.analytics().catch(() => null),
    { refreshInterval: REFRESH_INTERVAL }
  );
  return { analytics: data ?? null, error, isLoading, mutate };
}

export function useDashboardPendingTasks(limit: number = 3) {
  const { data, error, isLoading, mutate } = useSWR<Task[]>(
    ["dashboard-pending-tasks", limit],
    () => api.tasks.list({ status: "waiting_approval" }).then(res => res.items.slice(0, limit)).catch(() => []),
    { refreshInterval: REFRESH_INTERVAL }
  );
  return { pendingTasks: data ?? [], error, isLoading, mutate };
}
