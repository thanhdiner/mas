import type { MetadataRoute } from "next";

import { absoluteUrl } from "@/lib/site";

const routes = [
  "/",
  "/login",
  "/register",
  "/profile",
  "/agents",
  "/agents/new",
  "/agents/canvas",
  "/tasks",
  "/tasks/new",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return routes.map((route) => ({
    url: absoluteUrl(route),
    lastModified: now,
    changeFrequency: route === "/" ? "daily" : "weekly",
    priority: route === "/" ? 1 : 0.7,
  }));
}
