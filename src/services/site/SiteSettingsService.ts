/**
 * Analytics settings for Foocci's OWN commercial site.
 *
 * Resolution order is database first, environment second — the same shape as the Meta
 * credentials screen, and for the same reason: the person holding the measurement id is
 * the CEO, and making him wait for a deploy to change it is how a value ends up never
 * being set at all.
 *
 * Nothing here is a secret. A GA4 measurement id and a Meta Pixel id ship to every
 * browser that loads the page; treating them as secrets would be theatre. They are
 * configuration, and they are validated so a typo cannot inject markup.
 */

import { prisma } from "@/lib/prisma";

const SINGLETON_ID = "singleton";

export interface SiteSettings {
  gaMeasurementId: string | null;
  metaPixelId: string | null;
  googleSiteVerification: string | null;
}

const EMPTY: SiteSettings = {
  gaMeasurementId: null,
  metaPixelId: null,
  googleSiteVerification: null,
};

/**
 * The launch GA4 property, created by the CEO on 2026-08-03. Hardcoded as the LAST
 * fallback (database and env var both override it) so the tag cannot silently drop
 * off the live site during the launch window — which is exactly what happened when
 * two analytics implementations collided on 03/08 and the mounted one lost its id.
 *
 * Production-only: in dev/test the default stays off so local browsing never
 * pollutes the launch numbers. To retire it, delete the constant — by then the id
 * should live in the database via /admin/site-analytics.
 */
const LAUNCH_GA_ID = "G-VERBSTGMDV";

function launchDefault(): string | null {
  return process.env.NODE_ENV === "production" ? LAUNCH_GA_ID : null;
}

/**
 * These values are interpolated into a <script> tag, so they are whitelisted rather
 * than escaped. A GA4 id is `G-` plus alphanumerics; a pixel id is digits. Anything
 * else is dropped — a malformed id would otherwise be a script-injection vector on
 * every page of the public site.
 */
function cleanGa(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return /^G-[A-Z0-9]{4,20}$/i.test(t) ? t : null;
}

function cleanPixel(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return /^\d{6,25}$/.test(t) ? t : null;
}

function cleanVerification(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return /^[A-Za-z0-9_-]{10,100}$/.test(t) ? t : null;
}

export const SiteSettingsService = {
  /** What the public site should render. Never throws — analytics must not break a page. */
  async getResolved(): Promise<SiteSettings> {
    let row: {
      gaMeasurementId: string | null;
      metaPixelId: string | null;
      googleSiteVerification: string | null;
    } | null = null;

    try {
      row = await prisma.siteSettings.findUnique({
        where: { id: SINGLETON_ID },
        select: { gaMeasurementId: true, metaPixelId: true, googleSiteVerification: true },
      });
    } catch {
      // Table may not exist yet (migration not applied). The site renders with the
      // launch default rather than 500-ing on every request.
      return {
        gaMeasurementId:
          cleanGa(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID) ?? launchDefault(),
        metaPixelId: cleanPixel(process.env.NEXT_PUBLIC_META_PIXEL_ID),
        googleSiteVerification: cleanVerification(process.env.GOOGLE_SITE_VERIFICATION),
      };
    }

    return {
      gaMeasurementId:
        cleanGa(row?.gaMeasurementId) ??
        cleanGa(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID) ??
        launchDefault(),
      metaPixelId:
        cleanPixel(row?.metaPixelId) ?? cleanPixel(process.env.NEXT_PUBLIC_META_PIXEL_ID),
      googleSiteVerification:
        cleanVerification(row?.googleSiteVerification) ??
        cleanVerification(process.env.GOOGLE_SITE_VERIFICATION),
    };
  },

  /** Raw stored values for the admin screen — shows exactly what was typed. */
  async getStored(): Promise<SiteSettings & { updatedAt: string | null; updatedBy: string | null }> {
    try {
      const row = await prisma.siteSettings.findUnique({ where: { id: SINGLETON_ID } });
      return {
        gaMeasurementId: row?.gaMeasurementId ?? null,
        metaPixelId: row?.metaPixelId ?? null,
        googleSiteVerification: row?.googleSiteVerification ?? null,
        updatedAt: row?.updatedAt?.toISOString() ?? null,
        updatedBy: row?.updatedBy ?? null,
      };
    } catch {
      return { ...EMPTY, updatedAt: null, updatedBy: null };
    }
  },

  /**
   * Saves what was sent. An EMPTY STRING clears the field — unlike the Meta screen,
   * these values are shown in full, so the operator can see what they are erasing.
   */
  async save(input: Partial<SiteSettings>, updatedBy = "admin"): Promise<void> {
    const data: Record<string, string | null> = { updatedBy };
    if (input.gaMeasurementId !== undefined) {
      data.gaMeasurementId = input.gaMeasurementId?.trim() || null;
    }
    if (input.metaPixelId !== undefined) {
      data.metaPixelId = input.metaPixelId?.trim() || null;
    }
    if (input.googleSiteVerification !== undefined) {
      data.googleSiteVerification = input.googleSiteVerification?.trim() || null;
    }

    await prisma.siteSettings.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, ...data },
      update: data,
    });
  },

  /** Exposed for tests and for the admin screen's "is this id valid?" feedback. */
  validate: { cleanGa, cleanPixel, cleanVerification },
};
