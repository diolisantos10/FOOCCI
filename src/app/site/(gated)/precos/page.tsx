/**
 * /site/precos — Planos e preços (público). Inherits /site/layout.tsx.
 *
 * Página estática (server component, sem fetch — não precisa dos estados
 * loading/vazio/erro). Preços e recursos vêm da proposta comercial fechada pelo
 * CEO ("Planos Foocci v3"); ver spec do bloco de lançamento. NÃO publicar nada da
 * camada interna (justificativas de precificação, tarja de decisão, teto acima de
 * 4.000 pedidos etc.). Palavra "contrato" é proibida — usar "serviço/serviços".
 *
 * CONVERSÃO (04/08, self-service; enxugada em 05/08): o cartão do plano tem UMA
 * ação — "Contratar agora", que leva ao checkout `/contratar/novo` já com plano e
 * ciclo escolhidos. Quem quer ver antes tem a degustação no topo (a
 * degustação) e a faixa de fechamento, que é o único CTA comercial da página.
 * Design: tokens do DESIGN.md (ink/ink2/muted/paper/canvas/line/line2 + escala
 * brand-*), ação primária brand-500/600, card rounded-2xl, pesos 400/600.
 *
 * PREÇO: nenhum número desta página é digitado aqui. Tudo vem de
 * `@/lib/billing/pricing`, a MESMA fonte que o checkout usa para cobrar. Antes
 * havia uma tabela local nesta página e outras três espalhadas pelo repositório —
 * com checkout self-service, tabela duplicada vira cobrança diferente do
 * anunciado. O "preço fundador" saiu: por decisão do CEO (04/08) ele não existe
 * no motor, e anunciar desconto que o motor não aplica é o mesmo furo ao contrário.
 *
 * ⚠️ TRAVA JURÍDICA (04/08) — vale para TODO número desta página que fale de outra
 * empresa. Publicidade comparativa é lícita no Brasil se o dado for **verdadeiro,
 * comprovável e não depreciativo**. Nós não conseguimos comprovar a tabela de
 * ninguém — contrato de marketplace varia por restaurante, por praça e por acordo.
 * Então esta página NÃO afirma taxa de concorrente. Ela:
 *
 *   1. Declara a taxa como PREMISSA, lida de `ASSUMED_RATE_PERCENT` (fonte única,
 *      a mesma da calculadora da home), com o convite para o dono ajustar.
 *   2. CALCULA os números do "Faz a conta" a partir dessa premissa e do preço real
 *      do plano — nenhum valor é digitado à mão, então nenhum pode divergir.
 *   3. Rotula as faixas de preço de categorias de serviço ("Substitui") como
 *      estimativa de mercado, com nota de rodapé — não como tabela de fornecedor.
 *   4. Mantém o tom factual. O nome do marketplace só aparece onde ele é CANAL DE
 *      VENDA do próprio lojista (preço por canal), nunca como alvo de comparação.
 *
 * Antes de 04/08 esta página dizia "Restaurante de R$ 20 mil/mês no iFood paga
 * R$ 3.040 de comissão" — 15,2% afirmados como fato, sem fonte, três vezes.
 */

import type { Metadata } from "next";
import { PageHero } from "@/components/marketing/PageHero";
import { SinaisDeVenda } from "@/components/marketing/SinaisDeVenda";
import { heroShot } from "@/components/marketing/HeroShot";
import { PRODUCT_SHOTS, SITE_ASSETS } from "@/components/marketing/siteAssets";
import { CtaBand } from "@/components/marketing/CtaBand";
import { PrimaryCta, SecondaryCta } from "@/components/marketing/Cta";
import { Eyebrow, DotGrid, Halo } from "@/components/marketing/premium";
import {
  CheckIcon,
  SparklesIcon,
  TrendingUpIcon,
  RepeatIcon,
} from "@/components/marketing/icons";
import {
  DEMO_URL,
  CALCULADORA_URL,
  EXPERIMENTE_URL,
} from "@/components/marketing/config";
import {
  ASSUMED_RATE_PERCENT,
  MIGRATION_RANGE,
  formatBRL as formatBRLReais,
} from "@/lib/site/commissionRates";
import { migrationSavings } from "@/lib/site/savings";
import {
  SITE_PLAN_IDS,
  SITE_PLAN_TO_CODE,
  CYCLE_CODES,
  CYCLE_LABEL,
  PLAN_LABEL,
  PLAN_CYCLE_CENTS,
  monthlyEquivalentCents,
  firstChargeCents,
  formatBRL,
  type SitePlanId,
  type CycleCode,
} from "@/lib/billing/pricing";

/** O link do botão de comprar: plano e ciclo já escolhidos no checkout. */
function checkoutUrl(planId: SitePlanId, cycle: CycleCode = "MENSAL"): string {
  return `/contratar/novo?plano=${planId}&ciclo=${cycle}`;
}

const TITLE = "Planos Foocci | Três planos, e o motivo de cada um valer o preço";
const DESCRIPTION =
  "Três planos com valor fixo, sem comissão sobre as suas vendas. Cada plano abre pelo que só ele tem. Veja preços, ciclos e o que vem em cada um — e peça uma demonstração.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  openGraph: { type: "website", locale: "pt_BR", siteName: "Foocci", title: TITLE, description: DESCRIPTION },
};

/* ── Dados dos planos ──────────────────────────────────────────────────────── */

type FeatureGroupData = { label: string; items: string[] };

type Plan = {
  /** Id comercial — é ele que viaja para o checkout e vira o enum do banco. */
  id: SitePlanId;
  name: string;
  tagline: string;
  limit: string;
  limitSub: string;
  onlyHere: string[];
  /**
   * O faturamento de EXEMPLO do bloco "Faz a conta", em reais por mês. É o único
   * número desse bloco que fica escrito: comissão, economia e retorno são
   * CALCULADOS da premissa declarada (`ASSUMED_RATE_PERCENT`) e do preço real do
   * plano. Número comparativo digitado à mão é número que envelhece mentindo.
   */
  roiRevenue: number;
  substitui: string;
  inheritLabel?: string;
  groups: FeatureGroupData[];
  highlighted?: boolean;
};

const PLANS: Plan[] = [
  {
    id: "essencial",
    name: "Essencial",
    tagline: "Pare de pagar comissão.",
    limit: "Até 300 pedidos/mês",
    limitSub: "≈ 10 por dia",
    onlyHere: [
      "Preço diferente por canal, no mesmo prato — delivery, salão e iFood com três preços.",
      "A comanda não some: não imprimiu, volta pra fila 5×, o alarme repete até alguém aceitar, e só um aparelho toca.",
    ],
    roiRevenue: 20_000,
    substitui:
      "O cardápio digital que você contrataria à parte — serviços dessa categoria costumam custar entre R$ 110 e R$ 224/mês. E faz mais.",
    groups: [
      {
        label: "Seu canal de venda",
        items: [
          "Loja com a sua marca (o cliente não vê Foocci)",
          "Preço por canal: delivery, salão e iFood",
          "Cardápio de mesa por QR, com preço próprio",
          "Item aparece no delivery e some do salão",
          "Links rastreáveis por origem",
          "Pedido numerado (“Pedido #47”)",
        ],
      },
      {
        label: "A cozinha confia",
        items: [
          "Alarme de pedido novo que repete até aceitar",
          "Comanda que não some (5 tentativas)",
          "Impressão por estação",
          "Volume até 400% e 3 sons",
          "Só um aparelho toca",
          "Letra grande na comanda",
          "Pausa de emergência com motivo e prazo",
          "Almoço e jantar com horários separados",
        ],
      },
      {
        label: "Cardápio e dinheiro",
        items: [
          "Variantes e adicionais com mín/máx",
          "Importar cardápio por planilha",
          "Esgotado num clique",
          "Pix, dinheiro, cartão e link, com troco",
          "Taxa por bairro, pedido mínimo e frete grátis acima de X",
          "Base de clientes com histórico",
          "Relatórios",
          "Equipe com papéis",
          "Ajuda por IA no painel",
        ],
      },
    ],
  },
  {
    id: "crescimento",
    name: "Crescimento",
    tagline: "Faça o cliente voltar.",
    highlighted: true,
    limit: "Até 1.200 pedidos/mês",
    limitSub: "≈ 40 por dia · 3.000 mensagens",
    onlyHere: [
      "Seu WhatsApp não queima: silêncio das 21h às 8h, teto diário, descanso por cliente, atraso aleatório e ninguém recebe a mesma campanha duas vezes.",
      "A IA é impedida de mentir: um verificador barra o que não bate com o cardápio, e toda madrugada um simulador testa o agente.",
      "Resgate antes de perder o cliente: quente esfriando → morno → frio.",
    ],
    roiRevenue: 40_000,
    substitui:
      "Cardápio digital, atendimento por IA e CRM de fidelidade, comprados separados: três serviços que costumam somar uns R$ 500/mês — e que não trocam dado entre si.",
    inheritLabel: "Tudo do Essencial, mais:",
    groups: [
      {
        label: "A IA que vende",
        items: [
          "Garçom de IA no cardápio (sugere, monta combo, respeita alergia)",
          "WhatsApp com atendente de IA",
          "Personalidade sua",
          "Central de Conversas (WhatsApp, site e QR num lugar)",
          "Humano assume quando quiser",
          "Mesmo cliente reconhecido nos 3 canais",
        ],
      },
      {
        label: "Trazer o cliente de volta",
        items: [
          "16 campanhas prontas",
          "Resgate antes de perder o cliente",
          "Clientes classificados sozinho (quente/morno/frio/perdido)",
          "Recuperação de carrinho",
          "Aniversário, avaliação no Google, boas-vindas e VIP",
          "Cupons e promoções (6 tipos) + carteira de cupons",
          "Importar base antiga",
          "Limpeza automática de telefone inválido",
        ],
      },
      {
        label: "Seu número não queima",
        items: [
          "Nada entre 21h e 8h",
          "Teto diário + descanso de 24h por cliente",
          "Atraso aleatório entre os envios",
          "Sem repetir a mesma campanha",
          "Para sozinho se a falha subir",
        ],
      },
      {
        label: "Entender o movimento",
        items: [
          "Quem volta e quem some",
          "Quanto a IA rendeu",
          "Quantos pedidos levam bebida ou sobremesa",
          "Entrega por distância e por zona",
        ],
      },
    ],
  },
  {
    id: "performance",
    name: "Performance",
    tagline: "Gerencie como gente grande.",
    limit: "Até 4.000 pedidos/mês",
    limitSub: "≈ 130 por dia · 10.000 mensagens",
    onlyHere: [
      "Saber se o prato dá lucro e reprecificar sozinho: ficha técnica real e markup sobre a despesa real.",
      "A IA escreve a campanha sozinha com o contexto de cada cliente — e explica, em português, por que as vendas caíram.",
      "Fidelidade que expira: de Bronze a Diamante com janela móvel, brinde com estoque real.",
    ],
    roiRevenue: 150_000,
    substitui:
      "Tudo acima, mais o PDV e o módulo de CMV: quatro serviços que costumam somar uns R$ 700/mês.",
    inheritLabel: "Tudo do Crescimento, mais:",
    groups: [
      {
        label: "Saber se o prato dá lucro",
        items: [
          "Ficha técnica real (subiu o insumo, subiu o custo do prato)",
          "O preço que fecha a conta",
          "Reprecificação automática até um teto",
          "CMV do mês",
          "Histórico de mudança de preço",
          "Arredondamento comercial",
        ],
      },
      {
        label: "Fidelizar de verdade",
        items: [
          "Níveis Bronze, Prata, Ouro e Diamante (quem para, desce)",
          "Brinde físico com estoque real",
          "Indicação (os dois ganham)",
          "Campanhas por nível",
        ],
      },
      {
        label: "A IA sozinha",
        items: [
          "Agente de CRM que escreve a campanha",
          "Diagnóstico automático de queda",
          "Melhoria de fotos por IA, com sua aprovação",
        ],
      },
      {
        label: "Integrar e medir",
        items: [
          "Integração com PDV (Saipos)",
          "API própria",
          "Eficiência (tempo do pedido até a entrega)",
          "Suporte humano prioritário",
        ],
      },
    ],
  },
];

/* ── Ciclos de pagamento ──────────────────────────────────────────────────── */

const CYCLE_COPY: Record<CycleCode, { badge: string; gain: string }> = {
  MENSAL: { badge: "Sem fidelidade", gain: "Cancela avisando 30 dias antes. Implantação cheia." },
  TRIMESTRAL: { badge: "−10%", gain: "10% de desconto. Implantação pela metade." },
  ANUAL: { badge: "2 meses grátis", gain: "Paga 10, usa 12. Implantação grátis à vista." },
};

/**
 * A tabela de ciclos, montada a partir dos centavos que o checkout cobra. O
 * "/mês" é a mensalidade EQUIVALENTE — ninguém é cobrado nesse valor no
 * trimestral e no anual, por isso o total do ciclo vem logo abaixo.
 */
const CYCLES = CYCLE_CODES.map((cycle) => ({
  cycle,
  name: CYCLE_LABEL[cycle],
  badge: CYCLE_COPY[cycle].badge,
  gain: CYCLE_COPY[cycle].gain,
  prices: SITE_PLAN_IDS.map((id) => {
    const code = SITE_PLAN_TO_CODE[id];
    const months = cycle === "MENSAL" ? 1 : cycle === "TRIMESTRAL" ? 3 : 12;
    return {
      planId: id,
      plan: PLAN_LABEL[code],
      value: formatBRL(monthlyEquivalentCents(code, cycle)),
      sub: months === 1 ? "" : `${formatBRL(PLAN_CYCLE_CENTS[code][cycle])} / ${months === 3 ? "3 meses" : "ano"}`,
    };
  }),
}));

/**
 * Primeiro mês pela metade, no ciclo mensal. É exatamente 50% de R$ 179,00 —
 * portanto R$ 89,50, e não R$ 89,00. Este número é lido da mesma função que
 * calcula o que sai do cartão: anunciar arredondado e cobrar outra coisa é o
 * furo que a fonte única fecha.
 */
const DEGUSTACAO = SITE_PLAN_IDS.map((id) => {
  const code = SITE_PLAN_TO_CODE[id];
  return { planId: id, plan: PLAN_LABEL[code], value: formatBRL(firstChargeCents(code, "MENSAL")) };
});

const ADDONS = [
  { name: "Nota fiscal (NFC-e)", price: "R$ 89/mês", desc: "Custo por documento + certificado digital do lojista." },
  { name: "WhatsApp oficial da Meta", price: "R$ 149/mês", desc: "A Meta cobra por conversa; o repasse é transparente." },
  { name: "Pacote de 1.000 mensagens", price: "R$ 79", desc: "Pra quem estoura a cota sem precisar subir de plano." },
  { name: "Unidade adicional", price: "60% do plano", desc: "Segunda loja da mesma marca, com cardápio e base próprios." },
  { name: "Gestão pela agência", price: "Sob consulta", desc: "É serviço com hora humana." },
  { name: "Implantação", price: "R$ 299 / 599 / 1.490", desc: "Única, por faixa. Metade no trimestral, grátis no anual à vista." },
];

/* ── "Faz a conta" — premissa declarada, números calculados ──────────────────
   Nenhum valor deste bloco é digitado: a comissão sai da PREMISSA (que o dono
   pode ajustar na calculadora da home), a economia sai da faixa conservadora de
   migração, e o retorno sai do preço real do plano. Trocar a premissa em
   `commissionRates.ts` reescreve os três cartões de uma vez.

   ⚠️ CORREÇÃO DE 05/08/2026 — o mesmo vício da calculadora da home morava aqui,
   nos TRÊS planos: `commission × 20%` era anunciado como "ficam no caixa" sem
   descontar a mensalidade que o lojista passa a pagar. No Essencial isso inflava
   R$ 741 para R$ 920. A conta agora vem de `@/lib/site/savings` — o mesmo módulo
   puro e testado que a home usa —, e o "×" do retorno passou a ser calculado
   sobre o valor LÍQUIDO. Duas cópias da mesma conta foi como o erro nasceu; não
   recrie a terceira. */

const MIGRATION_PCT = Math.round(MIGRATION_RANGE.low * 100);

function RoiBlock({ revenue, planMonthlyCents }: { revenue: number; planMonthlyCents: number }) {
  const planMonthly = planMonthlyCents / 100;
  const conta = migrationSavings({
    monthlyRevenue: revenue,
    ratePercent: ASSUMED_RATE_PERCENT,
    planMonthly,
  });
  const payback = (conta.netLow / planMonthly).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

  return (
    <div className="mt-4 rounded-2xl border border-line bg-canvas p-4">
      <div className="flex items-center gap-2">
        <TrendingUpIcon className="h-4 w-4 text-ink2" />
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink2">Faz a conta</p>
      </div>
      <p className="mt-2 text-[13px] leading-relaxed text-ink2">
        Considerando uma comissão de{" "}
        <strong className="font-semibold text-ink tabular-nums">{ASSUMED_RATE_PERCENT}%</strong>{" "}
        <span className="text-muted">— ajuste para a sua —</span>, quem fatura{" "}
        <strong className="font-semibold text-ink tabular-nums">{formatBRLReais(revenue)}</strong>/mês no
        aplicativo paga{" "}
        <strong className="font-semibold text-ink tabular-nums">
          {formatBRLReais(conta.monthlyCommission)}
        </strong>{" "}
        de comissão. Levando <strong className="font-semibold text-ink">{MIGRATION_PCT}%</strong>{" "}
        desse movimento para o canal direto e{" "}
        <strong className="font-semibold text-ink">já descontada a mensalidade</strong>,{" "}
        {conta.outcome === "positivo" ? (
          <>
            sobram{" "}
            <strong className="font-semibold text-ink tabular-nums">
              {formatBRLReais(conta.netLow)}
            </strong>
            /mês no caixa —{" "}
            <strong className="font-semibold text-ink tabular-nums">{payback}×</strong> o que o
            plano custa.
          </>
        ) : (
          /* Nunca aconteceu com os faturamentos de exemplo de hoje — e é
             exatamente por isso que este ramo existe: se alguém trocar o
             `roiRevenue` de um plano, a página não pode voltar a prometer lucro
             onde ele não existe (guardrail 7). */
          <>
            a economia ainda não cobre a mensalidade neste exemplo — ela passa a sobrar a
            partir de{" "}
            <strong className="font-semibold text-ink tabular-nums">
              {formatBRLReais(conta.breakEvenLow)}
            </strong>
            /mês no aplicativo.
          </>
        )}
      </p>
      <a
        href={CALCULADORA_URL}
        className="mt-2.5 inline-block text-[12px] font-semibold text-brand-600 underline decoration-brand-100 underline-offset-4 hover:text-brand-700"
      >
        Fazer a conta com os meus números
      </a>
    </div>
  );
}

/* ── Peças ────────────────────────────────────────────────────────────────── */

function CheckItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <CheckIcon className="mt-[3px] h-3.5 w-3.5 shrink-0 text-brand-500" />
      <span className="text-[13px] leading-relaxed text-ink2">{children}</span>
    </li>
  );
}

function FeatureGroup({ label, items }: FeatureGroupData) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{label}</p>
      <ul className="mt-2.5 space-y-2">
        {items.map((it) => (
          <CheckItem key={it}>{it}</CheckItem>
        ))}
      </ul>
    </div>
  );
}

function PlanCard({ plan }: { plan: Plan }) {
  const featured = Boolean(plan.highlighted);
  const code = SITE_PLAN_TO_CODE[plan.id];
  // Todo número abaixo sai da fonte única — a mesma que o checkout cobra.
  const monthly = PLAN_CYCLE_CENTS[code].MENSAL;
  const highlights = [
    { label: "Anual", value: `${formatBRL(monthlyEquivalentCents(code, "ANUAL"))}/mês` },
    { label: "1º mês", value: formatBRL(firstChargeCents(code, "MENSAL")) },
  ];
  return (
    <div
      className={`relative flex flex-col rounded-2xl bg-paper p-6 sm:p-7 ${
        featured
          ? "border-2 border-brand-500 shadow-[0_1px_2px_rgba(11,11,11,0.04),0_28px_56px_-28px_rgba(249,115,22,0.40)]"
          : "border border-line shadow-[0_1px_2px_rgba(11,11,11,0.04),0_18px_38px_-26px_rgba(11,11,11,0.22)]"
      }`}
    >
      {featured && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-brand-500 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-white shadow-[0_6px_16px_-6px_rgba(249,115,22,0.55)]">
          Mais vendido
        </span>
      )}

      {/* Nome + tagline */}
      <span
        className={`inline-flex w-fit items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] ${
          featured ? "bg-brand-50 text-brand-600" : "bg-canvas text-ink2"
        }`}
      >
        {plan.name}
      </span>
      <h2 className="mt-3 text-xl font-semibold tracking-tight text-ink">{plan.tagline}</h2>

      {/* Preço âncora */}
      <div className="mt-5 flex items-baseline gap-1.5">
        <span className="text-4xl font-semibold tabular-nums tracking-tight text-ink">{formatBRL(monthly)}</span>
        <span className="text-sm text-muted">/mês</span>
      </div>
      <p className="mt-0.5 text-xs text-muted">no plano mensal</p>

      {/* Os dois preços que mudam: ciclo anual e primeiro mês */}
      <div className="mt-4 grid grid-cols-2 gap-2">
        {highlights.map((d) => (
          <div key={d.label} className="rounded-xl border border-line bg-canvas px-2 py-2 text-center">
            <p className="text-[10.5px] uppercase tracking-wide text-muted">{d.label}</p>
            <p className="mt-0.5 text-[12.5px] font-semibold tabular-nums text-ink">{d.value}</p>
          </div>
        ))}
      </div>

      {/* Limite */}
      <div className="mt-4 flex items-baseline justify-between gap-2 border-t border-line pt-4">
        <span className="text-sm font-semibold text-ink">{plan.limit}</span>
        <span className="text-xs text-muted">{plan.limitSub}</span>
      </div>

      {/*
        UMA AÇÃO POR CARTÃO (05/08): contratar. O segundo botão levava ao formulário
        de demonstração — e, com três cartões na tela, virava o MESMO convite três
        vezes, competindo com o "Contratar agora" logo acima dele. Quem ainda não
        quer contratar tem duas saídas melhores nesta página: a degustação no topo
        (sem formulário) e a faixa de fechamento, no fim.
      */}
      <div className="mt-5 space-y-2.5">
        <PrimaryCta
          label="Contratar agora"
          href={checkoutUrl(plan.id)}
          block
          withArrow={false}
          className="!py-3 !text-[15px]"
        />
        <p className="text-center text-[11.5px] text-muted">
          Primeiro mês por {formatBRL(firstChargeCents(code, "MENSAL"))}. Sem fidelidade.
        </p>
      </div>

      {/* Só aqui você tem */}
      <div className="mt-6 rounded-2xl border border-brand-100 bg-brand-50/60 p-4">
        <div className="flex items-center gap-2">
          <SparklesIcon className="h-4 w-4 text-brand-600" />
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-700">Só aqui você tem</p>
        </div>
        <ul className="mt-3 space-y-2.5">
          {plan.onlyHere.map((o) => (
            <li key={o} className="flex items-start gap-2">
              <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
              <span className="text-[13px] leading-relaxed text-ink2">{o}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* ROI — premissa declarada, números calculados (ver trava jurídica no topo) */}
      <RoiBlock revenue={plan.roiRevenue} planMonthlyCents={monthly} />

      {/* Substitui */}
      <p className="mt-4 text-[13px] leading-relaxed text-muted">
        <span className="font-semibold text-ink2">Substitui:</span> {plan.substitui}
      </p>

      {/* Recursos agrupados */}
      <div className="mt-6 border-t border-line pt-6">
        {plan.inheritLabel && (
          <p className="mb-5 inline-flex items-center gap-2 rounded-lg bg-canvas px-3 py-1.5 text-[12.5px] font-semibold text-ink">
            <RepeatIcon className="h-3.5 w-3.5 text-brand-500" />
            {plan.inheritLabel}
          </p>
        )}
        <div className="space-y-5">
          {plan.groups.map((g) => (
            <FeatureGroup key={g.label} label={g.label} items={g.items} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Página ───────────────────────────────────────────────────────────────── */

export default function PrecosPage() {
  return (
    <>
      <PageHero
        badge="Planos"
        title="Três planos, e o motivo de cada um valer o preço."
        subtitle="Cada plano abre pelo que só ele tem. Sem comissão sobre as suas vendas — você paga um valor fixo, e pronto."
        /* SEM BOTÃO NO TOPO (CEO, 05/08 à noite): *"esses dois aqui não fazem
           sentido, porque logo embaixo já tem cinquenta botões falando do contrate
           agora — a gente JÁ está na página dos planos"*.

           Ele está certo, e o erro tinha nome: o "Contratar agora" do topo precisava
           escolher um plano por conta própria (mandava todo mundo para o Crescimento)
           uma tela ANTES de a pessoa ver os três preços. Botão que decide pelo
           visitante antes de ele ter a informação não acelera a compra — atropela.
           Cada cartão já tem o seu, com o plano certo. */
        /* Página de preço abre pelo que o dinheiro compra. Primeiro a tela de
           resultado — a que ele abre de manhã; sem ela, a cena que o resultado
           produz: o cliente sentado, voltando. `journey-5` é um recorte redondo,
           por isso vai como medalhão (o retângulo mostraria os cantos brancos). */
        visual={heroShot([
          {
            kind: "browser",
            src: PRODUCT_SHOTS.painelResultado,
            alt: "Painel do Foocci na tela do computador: a visão de resultado do restaurante, com vendas e clientes do período.",
            address: "foocci.com.br/dashboard",
          },
          {
            kind: "photo",
            shape: "circle",
            src: SITE_ASSETS.journey[4]!,
            alt: "Casal jantando e conversando em um restaurante aconchegante, com os pratos servidos à mesa.",
          },
        ])}
      />

      {/* 1. Os três planos */}
      <section aria-labelledby="planos-title" className="relative overflow-hidden bg-canvas py-16 lg:py-20">
        <DotGrid className="[mask-image:radial-gradient(ellipse_at_top,black,transparent_65%)]" />
        <div className="relative mx-auto max-w-6xl px-5 lg:px-8">
          <h2 id="planos-title" className="sr-only">
            Os três planos
          </h2>

          {/*
            Os dois fatos ANTES dos cartões, não depois: nesta página o visitante já
            está com a calculadora mental ligada. Ler "metade no primeiro mês" depois
            de ver os três preços é ler tarde — a comparação com o marketplace já foi
            feita com o número cheio.
          */}
          <SinaisDeVenda className="mb-8" />
          <div className="grid items-start gap-6 lg:grid-cols-3 lg:gap-5">
            {PLANS.map((plan) => (
              <PlanCard key={plan.name} plan={plan} />
            ))}
          </div>

          {/* EXCEÇÃO à regra de um CTA por página: isto é um LINK DE TEXTO dentro de
              uma frase, para um caso que os três cartões não atendem (acima de 4.000
              pedidos). Não disputa atenção com o botão laranja — é a saída de quem
              não cabe na tabela. */}
          <p className="mt-8 text-center text-sm text-muted">
            Passa de 4.000 pedidos por mês?{" "}
            <a href={DEMO_URL} className="font-semibold text-ink underline decoration-line2 underline-offset-2 hover:text-brand-600">
              Fale com a gente
            </a>{" "}
            — montamos o plano certo pra sua operação.
          </p>

          {/*
            A ORIGEM DE CADA NÚMERO QUE NÃO É NOSSO. Sem esta nota, os cartões
            afirmam a tabela de terceiros — que é exatamente o que não podemos
            comprovar. Ela fica junto dos cartões, não escondida no rodapé.
          */}
          <p className="mx-auto mt-6 max-w-3xl text-center text-xs leading-relaxed text-muted">
            Os {ASSUMED_RATE_PERCENT}% do “Faz a conta” são uma{" "}
            <strong className="font-semibold">premissa nossa</strong>, não a tabela de nenhum
            aplicativo — cada contrato é diferente, confira o seu extrato e{" "}
            <a
              href={CALCULADORA_URL}
              className="font-semibold text-ink2 underline decoration-line2 underline-offset-2 hover:text-brand-600"
            >
              refaça a conta com os seus números
            </a>
            . A faixa de {MIGRATION_PCT}% de migração é conservadora e varia por restaurante: não é
            promessa de resultado. As faixas citadas em “Substitui” são estimativas de mercado para
            categorias de serviço equivalentes, não a tabela de um fornecedor específico.
          </p>
        </div>
      </section>

      {/* 2. Como o cliente paga — ciclos */}
      <section aria-labelledby="ciclos-title" className="bg-paper py-16 lg:py-20">
        <div className="mx-auto max-w-6xl px-5 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <Eyebrow>Como o cliente paga</Eyebrow>
            <h2 id="ciclos-title" className="mt-3 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              Escolha o ciclo. Quanto mais longo, menor a mensalidade.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-ink2">
              O mesmo produto inteiro nos três ciclos — o que muda é a mensalidade e a implantação.
            </p>
          </div>

          {/* Desktop: tabela */}
          <div className="mt-12 hidden overflow-hidden rounded-2xl border border-line md:block">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="bg-canvas">
                  <th className="px-5 py-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">Ciclo</th>
                  <th className="px-5 py-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">Essencial</th>
                  <th className="px-5 py-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-600">Crescimento</th>
                  <th className="px-5 py-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">Performance</th>
                  <th className="px-5 py-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">O que ganha</th>
                </tr>
              </thead>
              <tbody>
                {CYCLES.map((c) => (
                  <tr key={c.name} className="border-t border-line align-top">
                    <td className="px-5 py-5">
                      <p className="text-sm font-semibold text-ink">{c.name}</p>
                      <span className="mt-1 inline-flex rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-600">
                        {c.badge}
                      </span>
                    </td>
                    {c.prices.map((p, i) => (
                      <td key={p.plan} className="px-5 py-5">
                        <p className={`text-lg font-semibold tabular-nums ${i === 1 ? "text-brand-600" : "text-ink"}`}>
                          {p.value}
                          <span className="text-xs font-normal text-muted">/mês</span>
                        </p>
                        {p.sub && <p className="mt-0.5 text-[11.5px] tabular-nums text-muted">{p.sub}</p>}
                        {/* Cada célula é um botão de compra: o cliente clica no
                            valor que escolheu e cai no checkout já configurado. */}
                        <a
                          href={checkoutUrl(p.planId, c.cycle)}
                          className="mt-2 inline-block text-[12px] font-semibold text-brand-600 underline decoration-brand-100 underline-offset-4 hover:text-brand-700"
                        >
                          Contratar
                        </a>
                      </td>
                    ))}
                    <td className="px-5 py-5 text-[13px] leading-relaxed text-ink2">{c.gain}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards por ciclo */}
          <div className="mt-10 space-y-4 md:hidden">
            {CYCLES.map((c) => (
              <div key={c.name} className="rounded-2xl border border-line bg-paper p-5">
                <div className="flex items-center justify-between">
                  <p className="text-base font-semibold text-ink">{c.name}</p>
                  <span className="inline-flex rounded-full bg-brand-50 px-2.5 py-0.5 text-[11px] font-semibold text-brand-600">
                    {c.badge}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {c.prices.map((p, i) => (
                    <a
                      key={p.plan}
                      href={checkoutUrl(p.planId, c.cycle)}
                      className="block rounded-xl border border-line bg-canvas px-2 py-2.5 text-center transition hover:border-brand-500"
                    >
                      <p className="text-[10.5px] uppercase tracking-wide text-muted">{p.plan}</p>
                      <p className={`mt-1 text-[15px] font-semibold tabular-nums ${i === 1 ? "text-brand-600" : "text-ink"}`}>
                        {p.value}
                      </p>
                      {p.sub && <p className="mt-0.5 text-[10px] tabular-nums text-muted">{p.sub}</p>}
                      <p className="mt-1 text-[10.5px] font-semibold text-brand-600">Contratar</p>
                    </a>
                  ))}
                </div>
                <p className="mt-3 text-[13px] leading-relaxed text-ink2">{c.gain}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3. Primeiro mês pela metade — degustação */}
      <section aria-labelledby="degustacao-title" className="bg-canvas py-16 lg:py-20">
        <div className="mx-auto max-w-5xl px-5 lg:px-8">
          <div className="relative overflow-hidden rounded-2xl border border-line bg-paper p-7 sm:p-10">
            <Halo className="right-0 top-0 h-56 w-72" color="rgba(249,115,22,0.08)" />
            <div className="relative grid gap-8 lg:grid-cols-2 lg:items-center">
              <div>
                <Eyebrow>Primeiro mês pela metade</Eyebrow>
                <h2 id="degustacao-title" className="mt-3 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                  Não é teste grátis. É o produto inteiro, por metade do preço.
                </h2>
                <p className="mt-4 text-base leading-relaxed text-ink2">
                  Você paga metade da mensalidade no primeiro mês — o de instalação e aprendizado — e
                  recebe o produto completo, sem recorte. Vale para <strong className="font-semibold text-ink">todo cliente novo, em qualquer plano</strong>.
                  É só o primeiro mês; a partir do segundo, o valor cheio. A implantação nunca entra no desconto.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                {DEGUSTACAO.map((d) => (
                  <a
                    key={d.plan}
                    href={checkoutUrl(d.planId)}
                    className="flex items-center justify-between rounded-xl border border-line bg-canvas px-4 py-3 transition hover:border-brand-500"
                  >
                    <span className="text-sm text-ink2">{d.plan}</span>
                    <span className="text-lg font-semibold tabular-nums text-ink">{d.value}</span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Cobrado à parte — add-ons */}
      <section aria-labelledby="addons-title" className="bg-paper py-16 lg:py-20">
        <div className="mx-auto max-w-5xl px-5 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <Eyebrow>Cobrado à parte</Eyebrow>
            <h2 id="addons-title" className="mt-3 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              O que vem só se você usar.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-ink2">
              Nada disso está embutido no preço — você só paga o que precisar, quando precisar.
            </p>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-2">
            {ADDONS.map((a) => (
              <div key={a.name} className="flex items-start justify-between gap-4 rounded-2xl border border-line bg-paper p-5">
                <div>
                  <p className="text-sm font-semibold text-ink">{a.name}</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink2">{a.desc}</p>
                </div>
                <span className="shrink-0 whitespace-nowrap rounded-lg bg-canvas px-2.5 py-1 text-[13px] font-semibold tabular-nums text-ink">
                  {a.price}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. A regra do limite */}
      <section aria-labelledby="limite-title" className="bg-canvas py-16 lg:py-20">
        <div className="mx-auto max-w-3xl px-5 lg:px-8">
          <div className="rounded-2xl border border-line bg-paper p-7 sm:p-9">
            <Eyebrow>Passou do limite?</Eyebrow>
            <h2 id="limite-title" className="mt-3 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Nada é bloqueado. Sua loja continua vendendo.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-ink2">
              Se passar do limite do seu plano, nenhum pedido é recusado — você só recebe um aviso no
              painel. Se passar dois meses seguidos, a gente conversa sobre subir de plano. Não existe
              cobrança por pedido extra, nem por “crédito” ou “token”.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-green-100 bg-green-50 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-green-700">Conta pro limite</p>
                <p className="mt-1.5 text-sm text-ink2">Pedidos de entrega e retirada.</p>
              </div>
              <div className="rounded-xl border border-line bg-canvas p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">Não conta</p>
                <p className="mt-1.5 text-sm text-ink2">Pedido feito na mesa pelo QR.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* O único CTA comercial da página — rótulo e destino pelo padrão da `CtaBand`. */}
      <CtaBand title="Veja o Foocci rodando com o cardápio do seu restaurante." />
    </>
  );
}
