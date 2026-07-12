/**
 * Wide social/WhatsApp preview banner for /pedido/[slug].
 *
 * Without an explicit og:image, WhatsApp scraped the big square header logo and
 * rendered a tall preview card. A controlled 1200×630 landscape image renders as
 * a COMPACT card instead — the logo appears small inside it — and drops Foocci's
 * internal tagline in favor of a clean, customer-facing message.
 *
 * Falls back to a text-only banner when the restaurant has no usable (absolute)
 * logo URL. Worst case (any failure) → WhatsApp falls back to scraping, i.e. the
 * previous behavior.
 */

import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { getPublicSiteUrl } from "@/lib/public-url";

export const runtime = "nodejs";
export const alt = "Cardápio digital";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Resolve a stored logo path to an absolute URL that ImageResponse can fetch.
 * Logos live at relative `/api/media/<id>` (public), so a bare "/…" path is
 * prefixed with the site origin. data:/unknown → null (emoji fallback).
 */
function resolveLogoUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/")) return `${getPublicSiteUrl()}${url}`;
  return null;
}

function safeHexColor(color: string | null | undefined, fallback: string): string {
  return color && /^#[0-9a-fA-F]{3,8}$/.test(color) ? color : fallback;
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  let name = "Cardápio";
  let logoUrl: string | null = null;
  let brand = "#e11d48";

  try {
    const restaurant = await prisma.restaurant.findUnique({
      where: { slug },
      select: {
        name: true,
        logoUrl: true,
        brandConfig: { select: { brandPrimaryColor: true, brandPersona: true } },
      },
    });
    if (restaurant) {
      name = restaurant.name || name;
      const persona = restaurant.brandConfig?.brandPersona;
      const personaLogo =
        persona && typeof persona === "object"
          ? ((persona as Record<string, unknown>).logoUrl as string | undefined)
          : undefined;
      logoUrl = resolveLogoUrl(personaLogo ?? restaurant.logoUrl);
      brand = safeHexColor(restaurant.brandConfig?.brandPrimaryColor, brand);
    }
  } catch {
    // fall through to defaults — a text banner still renders
  }

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#ffffff",
          padding: "64px",
        }}
      >
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} width={200} height={200} style={{ objectFit: "contain" }} alt="" />
        ) : (
          <div style={{ display: "flex", fontSize: "112px" }}>🍽️</div>
        )}
        <div
          style={{
            display: "flex",
            marginTop: "32px",
            fontSize: "58px",
            fontWeight: 800,
            color: "#111827",
            textAlign: "center",
          }}
        >
          {name}
        </div>
        <div style={{ display: "flex", marginTop: "14px", fontSize: "30px", color: "#6b7280" }}>
          Cardápio digital · peça pelo link
        </div>
        <div
          style={{
            display: "flex",
            marginTop: "40px",
            height: "10px",
            width: "200px",
            borderRadius: "9999px",
            backgroundColor: brand,
          }}
        />
      </div>
    ),
    { ...size },
  );
}
