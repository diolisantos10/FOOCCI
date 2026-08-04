/**
 * /site/solucoes — TODO o resto do produto, num lugar só. Herda /site/layout.tsx.
 * Página estática (server component, sem fetch — não precisa dos estados
 * loading/vazio/erro).
 *
 * Os dois carros-chefe têm página própria: o atendimento por IA (/atendimento-com-ia)
 * e o CRM (/crm). ESTA página reúne as demais soluções — loja própria, cardápio
 * digital, cozinha/comanda, pagamento, entrega, nota fiscal, gestão/PDV e custo do
 * prato — organizadas por tema. Conteúdo consolidado do que a home e a página de
 * planos já descreviam (ProductModulesSection + grupos de recursos de /precos).
 *
 * Nada em piloto é vendido como pronto (guardrail 7): os recursos aparecem como
 * capacidade, sem número inventado. Toda conversão aponta pro FORMULÁRIO (DEMO_URL).
 *
 * Design: tokens do DESIGN.md (ink/ink2/muted/paper/canvas/line + escala brand-*),
 * ação primária brand-500/600, card rounded-2xl, botão rounded-xl, pesos 400/600.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/marketing/PageHero";
import { CtaBand } from "@/components/marketing/CtaBand";
import { Eyebrow, DotGrid } from "@/components/marketing/premium";
import {
  StorefrontIcon,
  MenuBookIcon,
  PrinterIcon,
  CreditCardIcon,
  TruckIcon,
  ReceiptIcon,
  ChartIcon,
  TrendingUpIcon,
  ChatIcon,
  UsersIcon,
  CheckIcon,
  ArrowRightIcon,
} from "@/components/marketing/icons";
import {
  DEMO_URL,
  DEMO_CTA_LABEL,
  ATENDIMENTO_IA_URL,
  CRM_URL,
} from "@/components/marketing/config";

const TITLE = "Soluções do Foocci | Loja, cardápio, cozinha, pagamento e gestão";
const DESCRIPTION =
  "Loja própria, cardápio digital, comanda que não some, pagamento, entrega, nota fiscal e gestão/PDV — todas as soluções do Foocci num sistema só, conversando entre si.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  openGraph: { type: "website", locale: "pt_BR", siteName: "Foocci", title: TITLE, description: DESCRIPTION },
};

type Group = {
  icon: (p: { className?: string }) => JSX.Element;
  title: string;
  desc: string;
  items: string[];
};

const GROUPS: Group[] = [
  {
    icon: StorefrontIcon,
    title: "Sua loja própria",
    desc: "O canal de venda direto, com a sua marca — o cliente não vê o Foocci.",
    items: [
      "Loja e cardápio com a sua identidade",
      "Preço por canal: delivery, salão e marketplace",
      "Cardápio de mesa por QR Code, com preço próprio",
      "Links rastreáveis por origem",
      "Pedido numerado (“Pedido #47”)",
    ],
  },
  {
    icon: MenuBookIcon,
    title: "Cardápio digital",
    desc: "Um cardápio que vende — visual, simples e feito para conversão.",
    items: [
      "Variantes e adicionais com mínimo e máximo",
      "Importação do cardápio por planilha",
      "Esgotar um item num clique",
      "Item que aparece no delivery e some do salão",
      "Foto, descrição e destaque por prato",
    ],
  },
  {
    icon: PrinterIcon,
    title: "Cozinha e comanda",
    desc: "A cozinha confia: o pedido não se perde entre o app e o fogão.",
    items: [
      "Alarme de pedido novo que repete até alguém aceitar",
      "Comanda que não some — até 5 tentativas de impressão",
      "Impressão por estação, com letra grande",
      "Só um aparelho toca",
      "Pausa de emergência com motivo e prazo",
    ],
  },
  {
    icon: CreditCardIcon,
    title: "Pagamento",
    desc: "O cliente paga do jeito dele; troco e taxas já entram na conta.",
    items: [
      "Pix, dinheiro, cartão e link de pagamento",
      "Troco calculado no pedido em dinheiro",
      "Pedido mínimo e frete grátis acima de um valor",
      "Pagar na entrega, na retirada ou antecipado",
    ],
  },
  {
    icon: TruckIcon,
    title: "Entrega e retirada",
    desc: "Cada bairro com a sua taxa, cada pedido com o seu tempo.",
    items: [
      "Taxa de entrega por bairro ou por distância",
      "Zonas de atendimento configuráveis",
      "Retirada no balcão",
      "Previsão de tempo no pedido do cliente",
    ],
  },
  {
    icon: ReceiptIcon,
    title: "Nota fiscal",
    desc: "NFC-e emitida junto do pedido, sem sistema à parte.",
    items: [
      "Emissão de NFC-e integrada ao pedido",
      "Certificado digital do lojista",
      "Custo por documento transparente",
    ],
  },
  {
    icon: ChartIcon,
    title: "Gestão e PDV",
    desc: "Os números do restaurante num painel só — e integração com quem você já usa.",
    items: [
      "Relatórios de vendas, clientes e oportunidades",
      "Equipe com papéis e permissões",
      "Integração com PDV (Saipos) e API própria",
      "Base de clientes com histórico",
    ],
  },
  {
    icon: TrendingUpIcon,
    title: "Custo e lucro do prato",
    desc: "Saber se o prato dá lucro — e reprecificar quando o insumo sobe.",
    items: [
      "Ficha técnica real do prato",
      "CMV do mês",
      "Reprecificação automática até um teto",
      "Histórico de mudança de preço",
    ],
  },
];

const FLAGSHIPS = [
  {
    icon: ChatIcon,
    title: "Atendimento com IA",
    copy: "O garçom de IA que atende o cliente, sugere pratos e fecha o pedido — pelo seu cardápio.",
    href: ATENDIMENTO_IA_URL,
  },
  {
    icon: UsersIcon,
    title: "CRM",
    copy: "Classifica a base, dispara as campanhas certas e traz o cliente de volta antes de perder.",
    href: CRM_URL,
  },
];

export default function SolucoesPage() {
  return (
    <>
      <PageHero
        badge="Soluções"
        title="Todo o resto que faz o restaurante rodar — num sistema só."
        subtitle="Do cardápio à nota fiscal, tudo conversa entre si e nada é ferramenta solta. O atendimento por IA e o CRM, os dois carros-chefe, têm página própria."
        primaryLabel={DEMO_CTA_LABEL}
        primaryHref={DEMO_URL}
      />

      {/* As demais soluções, por tema */}
      <section aria-labelledby="solucoes-title" className="relative overflow-hidden bg-canvas py-16 lg:py-20">
        <DotGrid className="[mask-image:radial-gradient(ellipse_at_top,black,transparent_65%)]" />
        <div className="relative mx-auto max-w-6xl px-5 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <Eyebrow>O sistema inteiro</Eyebrow>
            <h2 id="solucoes-title" className="mt-3 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              Um só sistema, do primeiro pedido ao fechamento do caixa.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-ink2">
              Cada peça abaixo já vem incluída — sem contratar quatro empresas
              diferentes que não trocam dado entre si.
            </p>
          </div>

          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {GROUPS.map(({ icon: Icon, title, desc, items }) => (
              <div
                key={title}
                className="flex flex-col rounded-2xl border border-line bg-paper p-6 shadow-[0_1px_2px_rgba(11,11,11,0.03)]"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-ink">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink2">{desc}</p>
                <ul className="mt-4 space-y-2 border-t border-line pt-4">
                  {items.map((it) => (
                    <li key={it} className="flex items-start gap-2">
                      <CheckIcon className="mt-[3px] h-3.5 w-3.5 shrink-0 text-brand-500" />
                      <span className="text-[13px] leading-relaxed text-ink2">{it}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Os dois carros-chefe — cross-link para as páginas próprias */}
      <section aria-labelledby="flagships-title" className="bg-paper py-16 lg:py-20">
        <div className="mx-auto max-w-6xl px-5 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <Eyebrow>Os dois carros-chefe</Eyebrow>
            <h2 id="flagships-title" className="mt-3 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              A inteligência que faz o resto valer mais.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-ink2">
              O que vende sozinho e o que traz o cliente de volta merecem uma página só
              deles — com as telas reais.
            </p>
          </div>

          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            {FLAGSHIPS.map(({ icon: Icon, title, copy, href }) => (
              <Link
                key={title}
                href={href}
                className="group flex flex-col rounded-2xl border border-line bg-paper p-6 shadow-[0_1px_2px_rgba(11,11,11,0.03)] transition-colors hover:border-brand-200 hover:bg-brand-50/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 sm:p-7"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-ink">{title}</h3>
                <p className="mt-1.5 flex-1 text-sm leading-relaxed text-ink2">{copy}</p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600">
                  Ver a página
                  <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <CtaBand
        title="Veja todas as soluções rodando com o cardápio do seu restaurante."
        label={DEMO_CTA_LABEL}
        href={DEMO_URL}
      />
    </>
  );
}
