import type { Metadata } from "next";

import { buildPageMetadata } from "@/lib/site";

export const metadata: Metadata = buildPageMetadata({
  title: "Create Task",
  description: "Create a new task and dispatch it to an available AI agent.",
  path: "/tasks/new",
  keywords: ["create task", "dispatch task", "agent execution"],
});

export default function CreateTaskLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
