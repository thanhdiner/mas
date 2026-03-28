import type { Metadata } from "next";

import { buildPageMetadata } from "@/lib/site";

export const metadata: Metadata = buildPageMetadata({
  title: "Webhooks",
  description:
    "Create inbound webhook endpoints that turn external events into agent tasks and executions.",
  path: "/webhooks",
  keywords: ["webhooks", "event triggers", "agent automation"],
});

export default function WebhooksLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
