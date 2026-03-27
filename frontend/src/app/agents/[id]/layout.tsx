import type { Metadata } from "next";

import { buildPageMetadata } from "@/lib/site";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }> | { id: string };
}): Promise<Metadata> {
  const { id } = await params;
  const isCreateRoute = id === "new";

  return buildPageMetadata({
    title: isCreateRoute ? "Create Agent" : "Edit Agent",
    description: isCreateRoute
      ? "Configure a new AI agent with prompts, tools, and delegation rules."
      : "Update agent configuration, prompts, tools, and allowed sub-agents.",
    path: isCreateRoute ? "/agents/new" : `/agents/${id}`,
    keywords: isCreateRoute
      ? ["create agent", "new agent"]
      : ["edit agent", "agent settings"],
  });
}

export default function AgentDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
