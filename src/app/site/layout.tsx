/**
 * /site segment shell (root of the marketing area).
 *
 * Intentionally minimal: it only sets pre-launch indexability and forces dynamic
 * rendering for the whole /site subtree. It does NOT render the marketing chrome
 * and does NOT gate — that lives in `(gated)/layout.tsx`, so the gate page
 * (`/site/entrar`) and the login/logout route handlers are reachable while every
 * marketing page sits behind the password gate.
 *
 * PRE-LAUNCH INDEXABILITY (single source of truth): the marketing site lives under
 * /site as a private preview and must NOT be indexed yet. `robots: noindex, follow`
 * applies to the whole subtree. LAUNCH (~julho): flip to `{ index: true, follow: true }`.
 *
 * force-dynamic: the gate reads the preview cookie per request, so /site must never
 * be statically prerendered (a static render would freeze the gate and embed page
 * content in the flight payload).
 */

import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

export const dynamic = "force-dynamic";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
