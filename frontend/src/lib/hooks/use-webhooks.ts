import useSWR from "swr";
import { api, type Webhook } from "@/lib/api";

export function useWebhooks() {
  const { data, error, isLoading, mutate } = useSWR<{ items: Webhook[]; total: number; page: number; pageSize: number }>(
    "webhooks",
    () => api.webhooks.list()
  );
  return { webhooks: data?.items ?? [], total: data?.total ?? 0, error, isLoading, mutate };
}
