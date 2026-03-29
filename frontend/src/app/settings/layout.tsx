import type { Metadata } from "next";

import { buildPageMetadata } from "@/lib/site";

export const metadata: Metadata = buildPageMetadata({
  title: "Settings",
  description:
    "Configure LLM providers, API keys, and system preferences for MAS.",
  path: "/settings",
  keywords: ["settings", "configuration", "API keys", "LLM providers"],
});

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
