/**
 * /site segment shell (root of the marketing area).
 *
 * Intentionally minimal: it only sets pre-launch indexability and forces dynamic
 * rendering for the whole /site subtree. It does NOT render the marketing chrome
 * and does NOT gate — that lives in `(gated)/layout.tsx`, so the gate page
 * (`/site/entrar`) and the login/logout route handlers are reachable while every
 * marketing page sits behind the password gate.
 *
 * INDEXABILITY (single source of truth for the subtree): the site went public on
 * 2026-08-03, so `robots: index, follow`. It was `noindex` while the marketing area
 * was a password-gated private preview.
 *
 * force-dynamic is kept: `/` renders the same marketing home, and the pages read
 * request-scoped data. Static prerendering here has bitten this subtree before.
 *
 * ANALYTICS: this is the SINGLE mount point of SiteAnalytics (GA4 + Meta Pixel,
 * ids resolved at request time by SiteSettingsService — database, then env, then
 * the launch default). It sits here, and not in the root layout, on purpose:
 * the owner panel is authenticated product usage, not marketing traffic, and the
 * customer-facing store (/pedido, /qr) is white-label — those visitors are the
 * restaurant's diners, not our leads, and Foocci analytics has no business on a
 * page carrying the restaurant's brand.
 *
 * On 03/08 two analytics implementations were built in parallel and one merge
 * unmounted the other. If you are about to add a tracking tag anywhere under
 * /site: it goes through SiteAnalytics + SiteSettingsService, not a new component.
 */

import type { Metadata } from "next";
import { SiteAnalytics } from "@/components/marketing/SiteAnalytics";
import { SiteSettingsService } from "@/services/site/SiteSettingsService";

export const metadata: Metadata = {
  robots: { index: true, follow: true },
};

export const dynamic = "force-dynamic";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const settings = await SiteSettingsService.getResolved();

  return (
    <>
      <SiteAnalytics settings={settings} />
      {children}
    </>
  );
}
