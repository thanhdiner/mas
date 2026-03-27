import type { Metadata } from "next";

function normalizeSiteUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

const configuredSiteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
  process.env.NEXT_PUBLIC_APP_URL?.trim() ||
  "http://localhost:3000";

export const siteConfig = {
  name: "MAS",
  shortName: "MAS",
  locale: "en_US",
  url: normalizeSiteUrl(configuredSiteUrl),
  description:
    "Orchestrate AI agents with delegation, task tracking, hierarchy management, and real-time execution visibility.",
  keywords: [
    "multi-agent system",
    "AI agents",
    "agent orchestration",
    "task execution",
    "agent hierarchy",
    "automation dashboard",
  ],
};

export function absoluteUrl(path = "/"): string {
  return new URL(path, `${siteConfig.url}/`).toString();
}

interface BuildPageMetadataOptions {
  title: string;
  description: string;
  path: string;
  keywords?: string[];
  index?: boolean;
  follow?: boolean;
}

export function buildPageMetadata({
  title,
  description,
  path,
  keywords = [],
  index = true,
  follow = true,
}: BuildPageMetadataOptions): Metadata {
  const resolvedTitle = `${title} | ${siteConfig.name}`;
  const resolvedKeywords = Array.from(
    new Set([...siteConfig.keywords, ...keywords])
  );

  return {
    title,
    description,
    keywords: resolvedKeywords,
    alternates: {
      canonical: path,
    },
    openGraph: {
      title: resolvedTitle,
      description,
      url: absoluteUrl(path),
      siteName: siteConfig.name,
      locale: siteConfig.locale,
      type: "website",
      images: [
        {
          url: absoluteUrl("/opengraph-image"),
          width: 1200,
          height: 630,
          alt: `${siteConfig.name} preview`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: resolvedTitle,
      description,
      images: [absoluteUrl("/twitter-image")],
    },
    robots: {
      index,
      follow,
      googleBot: {
        index,
        follow,
        "max-video-preview": -1,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
  };
}
