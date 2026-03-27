import type { Metadata } from "next";

import { buildPageMetadata } from "@/lib/site";

export const metadata: Metadata = buildPageMetadata({
  title: "Register",
  description: "Create a MAS account to manage AI agents and orchestrated tasks.",
  path: "/register",
  keywords: ["register", "sign up", "MAS account"],
});

export default function RegisterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
