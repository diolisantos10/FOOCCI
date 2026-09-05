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

const LEGAL = [
  { href: "/site/politica-de-privacidade", label: "Política de privacidade" },
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

        {/* ── A IDENTIFICAÇÃO DA EMPRESA (05/09/2026) ────────────────────────
            Quem vende pela internet precisa se identificar com CNPJ e endereço —
            é exigência do Código de Defesa do Consumidor, e é também o que faz o
            visitante frio, vindo de uma mensagem no WhatsApp, entender que do
            outro lado existe uma empresa.

            ⚠️ O QUE NÃO ENTRA AQUI, e é decisão do CEO: o NOME EMPRESARIAL. A
            empresa é MEI, e no MEI o nome empresarial é o nome civil da pessoa
            seguido do número — publicar isso é publicar o dono, não a marca. O
            CPF, por razão óbvia, também nunca entra. */}
        <div className="mt-8 space-y-2 border-t border-line pt-5 lg:mt-12">
          <p className="text-xs leading-relaxed text-muted">
            CNPJ 59.120.811/0001-79 · Rua Itápolis, 1167 — Pacaembu, São Paulo/SP,
            CEP 01245-000
          </p>
          {/* ⚠️ `tel:` e NÃO `wa.me`, e a diferença não é estética.
              O site tem UMA porta de WhatsApp — o desvio do servidor
              (`AGENTE_URL`), que pode ser ligado e desligado sem build novo, e
              que leva ao formulário para o lead não chegar anônimo. Um `wa.me`
              solto aqui seria uma segunda porta, fora desse controle: ela
              continuaria aberta no dia em que a primeira fosse fechada.
              Aqui o número é IDENTIFICAÇÃO da empresa, não canal de venda. */}
          <p className="text-xs text-muted">
            Contato:{" "}
            <a
              href="tel:+5511943723316"
              className="underline underline-offset-2 hover:text-ink2"
            >
              +55 11 94372-3316
            </a>
          </p>
          <p className="text-xs text-muted">© {year} Foocci. Todos os direitos reservados.</p>
        </div>
      </div>
    </footer>
  );
}
