import type { Metadata } from "next";

import { buildPageMetadata } from "@/lib/site";

export const metadata: Metadata = buildPageMetadata({
  title: "Tasks",
  description:
    "Track task orchestration, execution status, and delegated work across agents.",
  path: "/tasks",
  keywords: ["tasks", "task orchestration", "agent execution"],
});

export default function TasksLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
