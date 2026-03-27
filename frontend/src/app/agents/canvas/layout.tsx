import type { Metadata } from "next";

import { buildPageMetadata } from "@/lib/site";

export const metadata: Metadata = buildPageMetadata({
  title: "Hierarchy Canvas",
  description:
    "Visualize and manage manager-to-sub-agent relationships as a clean delegation tree.",
  path: "/agents/canvas",
  keywords: ["hierarchy canvas", "agent tree", "delegation tree"],
});

export default function AgentCanvasLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
