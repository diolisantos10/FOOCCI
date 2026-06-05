/**
 * Public marketing site layout (/site).
 *
 * Isolated from the dashboard/admin. Wraps the page with the marketing header,
 * footer and the mobile sticky CTA. Inherits the root <html>/<body> shell.
 *
 * PRE-LAUNCH INDEXABILITY (single source of truth): the marketing site lives
 * under /site as a preview/pre-launch environment and must NOT be indexed yet.
 * The `robots: noindex, follow` below applies to the whole /site subtree, so the
 * individual pages don't set robots themselves.
 * LAUNCH (~julho): when /site moves to /, flip this to `{ index: true, follow: true }`
 * (one line) so the official public pages become indexable.
 */

import type { Metadata } from "next";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { StickyMobileCta } from "@/components/marketing/StickyMobileCta";

export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <MarketingHeader />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
      {/* breathing room so the mobile sticky CTA never covers footer content */}
      <div aria-hidden className="h-20 lg:hidden" />
      <StickyMobileCta />
    </div>
  );
}
