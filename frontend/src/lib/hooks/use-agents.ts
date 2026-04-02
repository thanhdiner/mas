import useSWR from "swr";
import { api, type Agent } from "@/lib/api";

export function useAgents(activeOnly = false, isArchived = false) {
  const { data, error, isLoading, mutate } = useSWR<Agent[]>(
    ["agents", activeOnly, isArchived],
    () => api.agents.list(activeOnly, isArchived)
  );

  return {
    agents: data ?? [],
    error,
    isLoading,
    mutate,
  };
}

export function useAgent(id: string) {
  const { data, error, isLoading, mutate } = useSWR<Agent>(
    id ? ["agent", id] : null,
    () => api.agents.get(id)
  );

  return {
    agent: data ?? null,
    error,
    isLoading,
    mutate,
  };
}
