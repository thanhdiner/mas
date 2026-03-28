import useSWR from "swr";
import { api, type Schedule } from "@/lib/api";

export function useSchedules() {
  const { data, error, isLoading, mutate } = useSWR<Schedule[]>(
    "schedules",
    () => api.schedules.list()
  );
  return { schedules: data ?? [], error, isLoading, mutate };
}
