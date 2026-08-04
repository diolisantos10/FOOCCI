/**
 * sitemap.xml — the seven public marketing pages, and nothing else.
 *
 * Deliberately hand-listed instead of crawled: the route tree is mostly the owner
 * panel and per-restaurant customer surfaces, none of which belong in a search for
 * "Foocci". A generated sitemap that walked the app would leak them.
 *
 * `/` is not listed on purpose — it redirects to `/site`, which is the canonical
 * marketing URL. Listing both would ask Google to index a redirect.
 */

import type { MetadataRoute } from "next";
import { getPublicSiteUrl } from "@/lib/public-url";

const PAGES: { path: string; priority: number; changeFrequency: "weekly" | "monthly" | "yearly" }[] = [
  { path: "/site",                          priority: 1.0, changeFrequency: "weekly" },
  { path: "/site/atendimento-com-ia",       priority: 0.9, changeFrequency: "monthly" },
  { path: "/site/crm",                      priority: 0.9, changeFrequency: "monthly" },
  { path: "/site/solucoes",                 priority: 0.9, changeFrequency: "monthly" },
  { path: "/site/experimente",              priority: 0.9, changeFrequency: "monthly" },
  { path: "/site/como-funciona",            priority: 0.7, changeFrequency: "monthly" },
  { path: "/site/precos",                   priority: 0.9, changeFrequency: "monthly" },
  { path: "/site/demonstracao",             priority: 0.9, changeFrequency: "monthly" },
  { path: "/site/sobre",                    priority: 0.6, changeFrequency: "monthly" },
  { path: "/site/politica-de-privacidade",  priority: 0.3, changeFrequency: "yearly" },
  { path: "/site/termos-de-uso",            priority: 0.3, changeFrequency: "yearly" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getPublicSiteUrl();
  const lastModified = new Date();

  return PAGES.map((p) => ({
    url: `${base}${p.path}`,
    lastModified,
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }));
}
