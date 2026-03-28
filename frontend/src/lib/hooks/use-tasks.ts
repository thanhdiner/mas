import useSWR from "swr";
import { api, type Task } from "@/lib/api";

export function useTasks(filters?: Parameters<typeof api.tasks.list>[0]) {
  const { data, error, isLoading, mutate } = useSWR<Task[]>(
    ["tasks", filters],
    () => api.tasks.list(filters),
    { refreshInterval: 5000 } // Auto-refresh tasks list
  );
  return { tasks: data ?? [], error, isLoading, mutate };
}

export function useTask(id: string) {
  const { data, error, isLoading, mutate } = useSWR<Task>(
    id ? ["task", id] : null,
    () => api.tasks.get(id)
  );
  return { task: data ?? null, error, isLoading, mutate };
}
