import type { Metadata } from "next";

import { buildPageMetadata } from "@/lib/site";

export const metadata: Metadata = buildPageMetadata({
  title: "Profile",
  description: "Manage account details, password, and profile settings in MAS.",
  path: "/profile",
  keywords: ["profile", "account settings", "security"],
});

export default function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
