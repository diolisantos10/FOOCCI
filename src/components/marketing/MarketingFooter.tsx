/**
 * Marketing footer. Server component.
 * All links point to real routes or on-page anchors (no "#" placeholders).
 */

import Link from "next/link";
import Image from "next/image";
import {
  ATENDIMENTO_IA_URL,
  CRM_URL,
  SOLUCOES_URL,
  EXPERIMENTE_URL,
  PRECOS_URL,
  COMO_FUNCIONA_URL,
  AGENTE_URL,
} from "./config";
import { POLITICA_PRIVACIDADE_CAMINHO } from "@/lib/site/politicaPrivacidade";

// Espelha o menu (config.NAV_LINKS), sem âncoras órfãs. "Como funciona" segue como
// link extra de descoberta — a página existe, só saiu do menu principal.
//
// "Demonstração" saiu daqui em 05/08: ele e o "Contato" da coluna ao lado apontavam
// para a MESMA página, dois nomes para uma porta só, no mesmo rodapé. Quem procura
// falar com a gente procura "Contato" — esse ficou.
const PRODUTO = [
  { href: ATENDIMENTO_IA_URL, label: "Atendimento com IA" },
  { href: CRM_URL, label: "CRM" },
  { href: SOLUCOES_URL, label: "Soluções" },
  { href: EXPERIMENTE_URL, label: "Experimente" },
  { href: PRECOS_URL, label: "Planos e preços" },
  { href: COMO_FUNCIONA_URL, label: "Como funciona" },
];

const EMPRESA = [
  { href: "/site/sobre", label: "Sobre" },
  { href: AGENTE_URL, label: "Contato" },
];

// A política aponta para `/privacidade` — a ÚNICA. O rodapé levava a
// `/site/politica-de-privacidade`, que era um segundo documento, de
// pré-lançamento e com outra data; foi recolhida em 29/08/2026. O caminho vem da
// constante para o link do rodapé e a versão gravada no consentimento não
// poderem apontar para documentos diferentes.
const LEGAL = [
  { href: POLITICA_PRIVACIDADE_CAMINHO, label: "Política de privacidade" },
  { href: "/site/termos-de-uso", label: "Termos de uso" },
];

const FOCUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2";

function Column({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <div>
      {/* Drift do DESIGN.md corrigido de passagem: gray-* → tokens (muted/ink2). */}
      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted">{title}</h3>
      <ul className="mt-3 space-y-2">
        {links.map((l) => (
          <li key={l.label}>
            <Link href={l.href} className={`rounded-md text-sm text-ink2 hover:text-brand-600 ${FOCUS}`}>
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MarketingFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-line bg-paper">
      <div className="mx-auto max-w-6xl px-5 py-10 lg:px-8 lg:py-14">
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-2 lg:grid-cols-4 lg:gap-10">
          <div className="lg:col-span-1">
            <Link href="/site" className={`inline-flex items-center gap-2.5 rounded-md ${FOCUS}`} aria-label="Foocci">
              <Image
                src="/brand/foocci/foocci-wordmark.png"
                alt="Foocci"
                width={200}
                height={50}
                className="h-6 w-auto"
              />
            </Link>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-ink2">
              Foocci — sistema inteligente de vendas, relacionamento e fidelização
              para restaurantes.
            </p>
            {/* `font-medium` (500) não existe no arquivo da fonte — vira faux-bold
                (drift #9 do DESIGN.md). Só 400/600 são reais. */}
            <p className="mt-3 text-xs text-muted">
              Cardápio, pedido, pagamento e relacionamento no mesmo sistema.
            </p>
          </div>

          <Column title="Produto" links={PRODUTO} />
          <Column title="Empresa" links={EMPRESA} />
          <Column title="Legal" links={LEGAL} />
        </div>

        <div className="mt-8 border-t border-line pt-5 lg:mt-12">
          <p className="text-xs text-muted">© {year} Foocci. Todos os direitos reservados.</p>
        </div>
      </div>
    </footer>
  );
}
