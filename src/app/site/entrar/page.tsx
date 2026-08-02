/**
 * /site/entrar — the private-preview password screen. NEUTRALIZED at launch.
 *
 * The site is public since 2026-08-03, so this page has nothing left to guard. It
 * is not deleted: `PreviewGate` and `previewAuth` stay in the repo so a future
 * private preview is a small change here plus restoring the gate.
 *
 * Why it must NOT keep rendering the password form: it lives OUTSIDE the (gated)
 * group, so it stayed publicly reachable after the gate came down — and the whole
 * /site subtree is now indexable. A visitor (or Google) landing here would find a
 * password prompt on a site that has no password.
 *
 * To bring the preview back: restore the gate in `site/(gated)/layout.tsx` AND in
 * `middleware.ts` — it lived in both — then render <PreviewGate /> here again.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

export const dynamic = "force-dynamic";

export default function EntrarPage() {
  redirect("/site");
}
