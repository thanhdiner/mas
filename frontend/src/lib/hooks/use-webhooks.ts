import useSWR from "swr";
import { api, type Webhook } from "@/lib/api";

export function useWebhooks() {
  const { data, error, isLoading, mutate } = useSWR<Webhook[]>(
    "webhooks",
    () => api.webhooks.list()
  );
  return { webhooks: data ?? [], error, isLoading, mutate };
}
