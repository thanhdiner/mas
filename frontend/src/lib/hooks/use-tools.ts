import useSWR from "swr";
import { api, type ToolCatalogItem } from "@/lib/api";

export function useTools() {
  const { data, error, isLoading, mutate } = useSWR<ToolCatalogItem[]>(
    "tools",
    () => api.tools.list()
  );
  return { tools: data ?? [], error, isLoading, mutate };
}
