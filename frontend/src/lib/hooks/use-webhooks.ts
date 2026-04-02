import useSWR from "swr";
import { api, type Webhook } from "@/lib/api";

export function useWebhooks(params?: { is_archived?: boolean; page?: number; pageSize?: number }) {
  const queryParams = new URLSearchParams();
  if (params?.is_archived) queryParams.set("is_archived", "true");
  if (params?.page) queryParams.set("page", params.page.toString());
  if (params?.pageSize) queryParams.set("pageSize", params.pageSize.toString());
  
  const keyStr = queryParams.toString();
  const key = `webhooks${keyStr ? '?' + keyStr : ''}`;
  
  const { data, error, isLoading, mutate } = useSWR<{ items: Webhook[]; total: number; page: number; pageSize: number }>(
    key,
    () => api.webhooks.list(params)
  );
  return { webhooks: data?.items ?? [], total: data?.total ?? 0, error, isLoading, mutate };
}
