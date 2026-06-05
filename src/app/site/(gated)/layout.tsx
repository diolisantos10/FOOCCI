/**
 * Gated marketing layout — wraps every public marketing page under /site.
 *
 * PRIVATE PRE-LAUNCH GATE: if the request has no valid preview cookie, this layout
 * `redirect()`s to /site/entrar BEFORE the page renders. Because the redirect aborts
 * the subtree, the marketing pages never render and never stream into the response —
 * unauthenticated visitors get no marketing content at all (not even in the flight
 * payload). Fail-closed: no `MARKETING_PREVIEW_PASSWORD` → redirect → gate.
 *
 * This gate is done here (NOT in middleware), so it is naturally scoped to the
 * marketing pages and never touches product routes, auth or webhooks.
 */

import { redirect } from "next/navigation";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { StickyMobileCta } from "@/components/marketing/StickyMobileCta";
import { isPreviewAuthed } from "@/components/marketing/preview/previewAuth";

export default function GatedMarketingLayout({ children }: { children: React.ReactNode }) {
  if (!isPreviewAuthed()) {
    redirect("/site/entrar");
  }

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <MarketingHeader />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
      {/* Discreet pre-launch preview affordance (removed at public launch). */}
      <div className="border-t border-gray-100 bg-white py-3 text-center">
        <a
          href="/site/sair"
          className="rounded text-xs text-gray-400 transition-colors hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
        >
          Prévia privada · Sair
        </a>
      </div>
      {/* breathing room so the mobile sticky CTA never covers footer content */}
      <div aria-hidden className="h-20 lg:hidden" />
      <StickyMobileCta />
    </div>
  );
}
