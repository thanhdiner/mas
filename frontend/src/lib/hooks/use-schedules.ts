import useSWR from "swr";
import { api, type Schedule } from "@/lib/api";

export function useSchedules() {
  const { data, error, isLoading, mutate } = useSWR<{ items: Schedule[]; total: number; page: number; pageSize: number }>(
    "schedules",
    () => api.schedules.list()
  );
  return { schedules: data?.items ?? [], total: data?.total ?? 0, error, isLoading, mutate };
}
