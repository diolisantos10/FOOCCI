/**
 * Public marketing site layout (/site).
 *
 * Isolated from the dashboard/admin. Wraps the page with the marketing header,
 * footer and the mobile sticky CTA. Inherits the root <html>/<body> shell.
 */

import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { StickyMobileCta } from "@/components/marketing/StickyMobileCta";

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
