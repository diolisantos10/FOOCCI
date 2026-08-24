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

import { PainelAtalho } from "@/components/marketing/PainelAtalho";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { StickyMobileCta } from "@/components/marketing/StickyMobileCta";
import { LeadOriginTracker } from "@/components/marketing/LeadOriginTracker";
import { BotaoAgenteFlutuante } from "@/components/marketing/BotaoAgenteFlutuante";
import { chamadaComercial } from "@/lib/site/canalDeVendas";

/**
 * O estado do canal de vendas é resolvido AQUI, no servidor, e desce por
 * propriedade. O cabeçalho e a barra fixa são `"use client"`: se cada um lesse a
 * variável por conta própria, leriam vazio (só `NEXT_PUBLIC_*` chega ao
 * navegador) e o botão sumiria sem ninguém entender por quê.
 *
 * Como isto roda por requisição, acender o WhatsApp é trocar uma variável no
 * Railway — sem build novo, que é a armadilha que já mordeu esta casa.
 *
 * ⚖️ O PREÇO DISSO, dito por extenso: as páginas do /site deixam de ser geradas
 * no build e passam a ser renderizadas a cada visita. Custa mais CPU por
 * requisição e um TTFB um pouco maior. Foi aceito porque a alternativa era pior:
 * com página estática, o RÓTULO do botão ficaria congelado no build — o CEO
 * ligaria o canal no Railway, os botões continuariam dizendo "Agende uma
 * demonstração", e ninguém entenderia por quê. É exatamente a armadilha do
 * `NEXT_PUBLIC_`, só que mais difícil de enxergar.
 *
 * Se um dia o custo incomodar, o caminho de volta é conhecido: tirar esta linha e
 * aceitar que ligar o canal exige um deploy.
 */
export const dynamic = "force-dynamic";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  const chamada = chamadaComercial();

  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* Guarda o primeiro toque (utm/fbclid/referrer) da visita para o formulário
          mandar junto. NÃO é tag de analytics — nenhum terceiro, nenhuma
          requisição; a medição do site continua em SiteAnalytics. */}
      <LeadOriginTracker />
      {/* Atalho explícito para quem tem sessão ativa — a raiz não teleporta mais
          ninguém para o painel (ver src/app/page.tsx). */}
      <PainelAtalho />
      <MarketingHeader chamada={chamada} />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
      {/* breathing room so the mobile sticky CTA never covers footer content */}
      <div aria-hidden className="h-16 lg:hidden" />
      {/* O botãozinho do canto só existe quando há alguém do outro lado. */}
      {chamada.ativo && <BotaoAgenteFlutuante />}
      <StickyMobileCta chamada={chamada} />
    </div>
  );
}
