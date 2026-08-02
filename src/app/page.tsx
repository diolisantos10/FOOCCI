/**
 * Root route.
 *
 * Since the commercial launch (2026-08-03) an anonymous visitor typing the bare
 * domain must land on the marketing site, not on a login form. A logged-in owner
 * still goes straight to the panel.
 *
 * Why a redirect and not a render: the marketing pages need the /site chrome
 * (header, footer, sticky mobile CTA) that lives in `site/(gated)/layout.tsx`.
 * Rendering them from here would either duplicate that shell or restructure the
 * route tree on launch weekend — risk with no user-visible payoff. `/site` is the
 * canonical marketing URL and is the one that is indexed.
 *
 * `redirect()` throws by design in the App Router, so it must stay OUTSIDE the
 * try/catch — otherwise the catch swallows the control-flow signal and the page
 * falls through to the wrong destination.
 */

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export default async function RootPage() {
  let authed = false;
  try {
    authed = (await getServerSession(authOptions)) !== null;
  } catch {
    // getServerSession throws when NEXTAUTH_SECRET is missing or misconfigured.
    // Treat as anonymous: the marketing site is never a blank error page.
  }

  redirect(authed ? "/dashboard" : "/site");
}
