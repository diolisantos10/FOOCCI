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
 */

import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: true, follow: true },
};

export const dynamic = "force-dynamic";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
