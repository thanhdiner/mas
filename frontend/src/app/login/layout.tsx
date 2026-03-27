import type { Metadata } from "next";

import { buildPageMetadata } from "@/lib/site";

export const metadata: Metadata = buildPageMetadata({
  title: "Login",
  description: "Sign in to MAS and access your multi-agent command center.",
  path: "/login",
  keywords: ["login", "sign in", "MAS account"],
});

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
