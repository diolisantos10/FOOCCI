/**
 * robots.txt — generated, not a static file.
 *
 * There was none before the launch, and the consequence was worse than "missing":
 * `/robots.txt` is not in the middleware whitelist and has no file extension the
 * middleware skips, so the request fell through to the auth redirect and answered
 * **307 → /login**. A crawler asking for the rules got a login page.
 *
 * Disallow list = everything that is not the marketing site: the owner panel, the
 * global admin, the APIs, and the per-restaurant customer surfaces (`/pedido`,
 * `/qr`, and the `/r` + `/l` short links), which belong to each restaurant and must
 * not show up in a search for "Foocci".
 */

import type { MetadataRoute } from "next";
import { getPublicSiteUrl } from "@/lib/public-url";

export default function robots(): MetadataRoute.Robots {
  const base = getPublicSiteUrl();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/admin/",
        "/dashboard",
        "/login",
        "/setup",
        "/recover",
        "/preview",
        "/site/entrar",
        "/pedido/",
        "/qr/",
        "/r/",
        "/l/",
      ],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
