import useSWR from "swr";
import { api, type FacebookPage } from "@/lib/api";

export function useFacebookPages(skip = 0, limit = 10) {
  const { data, error, isLoading, mutate } = useSWR(
    ["facebook-pages", skip, limit],
    () => api.social.facebook.listPages({ skip, limit }),
    { refreshInterval: 10000 }
  );
  return {
    pages: (data?.items ?? []) as FacebookPage[],
    total: data?.total ?? 0,
    error,
    isLoading,
    mutate,
  };
}
