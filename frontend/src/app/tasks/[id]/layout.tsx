import type { Metadata } from "next";

import { buildPageMetadata } from "@/lib/site";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }> | { id: string };
}): Promise<Metadata> {
  const { id } = await params;

  return buildPageMetadata({
    title: "Task Details",
    description:
      "Inspect execution steps, results, errors, and delegation chain for a task.",
    path: `/tasks/${id}`,
    keywords: ["task details", "execution timeline", "delegation chain"],
  });
}

export default function TaskDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
