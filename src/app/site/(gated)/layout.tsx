/**
 * Marketing layout — wraps every public marketing page under /site.
 *
 * PUBLIC SINCE 2026-08-03. Until launch this layout enforced a password gate
 * (`isPreviewAuthed()` → redirect to /site/entrar) so the founder could review the
 * site on a real URL without it being reachable. The gate machinery is deliberately
 * KEPT in the repo — `preview/previewAuth.ts`, `/site/entrar`, `/site/acesso`,
 * `/site/sair` — so a future private preview is one import away.
 *
 * ⚠️ Do NOT "re-enable" the gate by setting MARKETING_PREVIEW_PASSWORD alone: the
 * gate is applied HERE, not by the env var. Conversely, deleting that env var does
 * not open a gated site — the helper fails closed and would lock everyone out.
 */

import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { StickyMobileCta } from "@/components/marketing/StickyMobileCta";
import { LeadOriginTracker } from "@/components/marketing/LeadOriginTracker";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* Guarda o primeiro toque (utm/fbclid/referrer) da visita para o formulário
          mandar junto. NÃO é tag de analytics — nenhum terceiro, nenhuma
          requisição; a medição do site continua em SiteAnalytics. */}
      <LeadOriginTracker />
      <MarketingHeader />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
      {/* breathing room so the mobile sticky CTA never covers footer content */}
      <div aria-hidden className="h-16 lg:hidden" />
      <StickyMobileCta />
    </div>
  );
}
