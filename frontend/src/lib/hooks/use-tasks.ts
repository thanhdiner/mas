import useSWR from "swr";
import { api, type Task, type TaskDetail } from "@/lib/api";

export function useTasks(filters?: Parameters<typeof api.tasks.list>[0]) {
  const { data, error, isLoading, mutate } = useSWR(
    ["tasks", filters],
    () => api.tasks.list(filters),
    { refreshInterval: 5000 }
  );
  return {
    tasks: data?.items ?? [],
    total: data?.total ?? 0,
    page: data?.page ?? 1,
    pageSize: data?.pageSize ?? 20,
    error,
    isLoading,
    mutate,
  };
}

export function useTask(id: string) {
  const { data, error, isLoading, mutate } = useSWR<TaskDetail>(
    id ? ["task", id] : null,
    () => api.tasks.get(id)
  );
  return { task: data ?? null, error, isLoading, mutate };
}
