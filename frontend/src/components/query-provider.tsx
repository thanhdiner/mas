"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

/**
 * App-level React Query provider.
 *
 * Creates ONE QueryClient per browser tab (via `useState` so it survives
 * re-renders but is unique per SSR request).
 *
 * Default options:
 * - `staleTime: 30s` — cached data is considered fresh for 30 seconds,
 *   so navigating between pages doesn't re-fetch immediately.
 * - `refetchOnWindowFocus: true` — stale data is refreshed when the user
 *   tabs back into the app (the "automatic re-fetch" UX benefit).
 * - `retry: 1` — one automatic retry on transient network errors.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,
            refetchOnWindowFocus: true,
            retry: 1,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
