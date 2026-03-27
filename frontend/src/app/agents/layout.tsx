import type { Metadata } from "next";

import { buildPageMetadata } from "@/lib/site";

export const metadata: Metadata = buildPageMetadata({
  title: "Agents",
  description:
    "Browse, search, and manage AI agents, roles, prompts, and delegation settings.",
  path: "/agents",
  keywords: ["agents", "agent management", "AI workforce"],
});

export default function AgentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
