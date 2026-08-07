/**
 * /site/precos — Planos e preços (público). Inherits /site/layout.tsx.
 *
 * Página estática (server component, sem fetch — não precisa dos estados
 * loading/vazio/erro). NÃO publicar nada da camada interna (justificativas de
 * precificação, tarja de decisão, teto acima de 4.000 pedidos etc.). Palavra
 * "contrato" é proibida — usar "serviço/serviços".
 *
 * ⚠️ "PLANOS FOOCCI V3" NÃO EXISTE (achado de 06/08/2026). Este cabeçalho dizia,
 * até hoje, que preços e recursos vinham "da proposta comercial fechada pelo CEO
 * (Planos Foocci v3)". Não há documento com esse nome no repositório — e a seção
 * que mais se apoiava nele, os seis add-ons de "Cobrado à parte", foi lida pelo
 * próprio CEO com um "não sei de onde vieram essas ideias". Cinco daqueles seis
 * preços foram aposentados; o que sobrou está em `@/lib/site/servicosAParte`, com
 * o motivo de cada corte. **Não cite fonte comercial que ninguém consegue abrir:**
 * um comentário assim faz o número seguinte parecer decidido quando não foi.
 *
 * CONVERSÃO (04/08, self-service; enxugada em 05/08): o cartão do plano tem UMA
 * ação — "Contratar agora", que leva ao checkout `/contratar/novo` já com plano e
 * ciclo escolhidos. Quem quer ver antes tem a degustação no topo.
 * Design: tokens do DESIGN.md (ink/ink2/muted/paper/canvas/line/line2 + escala
 * brand-*), ação primária brand-500/600, card rounded-2xl, pesos 400/600.
 *
 * ⚑ ESTA PÁGINA VIROU A PORTA DO SDR (06/08, decisão do CEO). `/site/demonstracao`
 * foi eliminada e o formulário de demonstração é a ÚLTIMA SEÇÃO daqui,
 * `id="demonstracao"` — o destino de `DEMO_URL` e, portanto, de TODO botão
 * "Agende uma demonstração" do site (header, barra fixa do celular, faixa de
 * fechamento das outras oito páginas). Duas consequências para quem mexer aqui:
 *
 *   1. **O `id="demonstracao"` não é decoração.** Renomeá-lo ou tirá-lo derruba o
 *      funil inteiro em silêncio — o link continua abrindo a página, só que no
 *      topo, e ninguém vê defeito nenhum.
 *   2. **A faixa de fechamento (`CtaBand`) saiu.** Ver o comentário na seção 6:
 *      convite para o formulário que está logo abaixo é botão que só rola a tela.
 *      Se um dia voltar um CTA comercial a esta página, ele é o SEGUNDO — e a
 *      regra é um por página.
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
import { SinaisDeVenda, firstMonthDiscountPercent } from "@/components/marketing/SinaisDeVenda";
import { heroShot } from "@/components/marketing/HeroShot";
import { PRODUCT_SHOTS, SITE_ASSETS } from "@/components/marketing/siteAssets";
import { DemoForm } from "@/components/marketing/DemoForm";
import { PrimaryCta } from "@/components/marketing/Cta";
import { Eyebrow, DotGrid, Halo } from "@/components/marketing/premium";
import {
  CheckIcon,
  SparklesIcon,
  TrendingUpIcon,
  RepeatIcon,
} from "@/components/marketing/icons";
/* `EXPERIMENTE_URL` saiu daqui em 06/08: estava importado e não usado desde a
   enxugada de 05/08 — import morto que o `tsc` não acusa. */
import { DEMO_URL, CALCULADORA_URL } from "@/components/marketing/config";
import {
  ASSUMED_RATE_PERCENT,
  MIGRATION_RANGE,
  formatBRL as formatBRLReais,
} from "@/lib/site/commissionRates";
import { migrationSavings } from "@/lib/site/savings";
import { SERVICOS_A_PARTE, NOTA_FISCAL_A_PARTE } from "@/lib/site/servicosAParte";
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

/**
 * HIERARQUIA DO CARTÃO (05/08, ordem do CEO) — depois do preço e do botão vêm
 * DOIS blocos, nesta ordem:
 *
 *   1. `benefits` — 3 vantagens, tipografia grande. É o que o dono GANHA, no
 *      vocabulário dele. A PRIMEIRA de cada plano entrega a manchete daquele
 *      plano ("Pare de pagar comissão" → venda direta sem comissão), e nunca se
 *      repete entre os cartões.
 *   2. O resto (prova + lista completa), visualmente subordinado.
 *
 * A regra que organiza a ordem: **benefício sobe, prova desce.** "A comanda não
 * some: volta pra fila 5×" é ótima prova e péssima primeira linha — ela prova
 * antes de o dono ter entendido o que ganha. Por isso `onlyHere` ficou no bloco
 * de baixo. Teto de 3: a quarta vantagem enfraquece as três primeiras.
 *
 * Toda vantagem tem lastro em recurso que já está na lista do próprio plano —
 * nada aqui é escrito solto (guardrail 7).
 */
type Benefit = { title: string; sub: string };

type Plan = {
  /** Id comercial — é ele que viaja para o checkout e vira o enum do banco. */
  id: SitePlanId;
  name: string;
  tagline: string;
  limit: string;
  limitSub: string;
  benefits: Benefit[];
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
    benefits: [
      {
        title: "Venda direto, sem comissão nenhuma",
        sub: "Sua loja, com a sua marca — o cliente não vê Foocci. Você paga um valor fixo, venda o quanto vender.",
      },
      {
        title: "O cliente passa a ser seu",
        sub: "Nome, telefone e histórico de quem pede ficam na sua base — não na do aplicativo.",
      },
      {
        title: "Um preço para cada canal, no mesmo prato",
        sub: "Delivery, salão e iFood com três preços. E a cozinha só recebe pedido que ela confirmou.",
      },
    ],
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
    benefits: [
      {
        title: "O cliente volta sem você lembrar dele",
        sub: "16 campanhas prontas e resgate automático de quem está esfriando — antes de ele virar cliente do concorrente.",
      },
      {
        title: "Atendimento com IA que vende",
        sub: "No WhatsApp e no cardápio, a qualquer hora: sugere, monta o combo, respeita alergia — e você assume quando quiser.",
      },
      {
        title: "O mesmo cliente reconhecido nos três canais",
        sub: "WhatsApp, site e QR da mesa numa Central de Conversas só, com o histórico junto.",
      },
    ],
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
    benefits: [
      {
        title: "Saber se cada prato dá lucro",
        sub: "Ficha técnica real, CMV do mês e o preço que fecha a conta. Subiu o insumo, o custo do prato sobe junto.",
      },
      {
        title: "O preço se corrige sozinho",
        sub: "Reprecificação automática até o teto que você define, com histórico de cada mudança.",
      },
      {
        title: "A IA escreve a campanha e explica a queda",
        sub: "Ela monta a campanha com o contexto de cada cliente e diz, em português, por que as vendas caíram.",
      },
    ],
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

/*
  ⚠️ A IMPLANTAÇÃO SAIU DAQUI EM 06/08 — e não é enfeite de texto.

  As três linhas prometiam desconto de implantação ("cheia", "pela metade",
  "grátis à vista"). O desconto era sobre R$ 299/599/1.490, faixas que o CEO
  aposentou no mesmo dia; a implantação virou "Configuração", sob consulta. Manter
  a promessa era publicar meia-entrada de um ingresso sem preço — e o motor de
  cobrança nunca soube cobrar nem descontar nada disso.

  Se um dia a Configuração tiver preço decidido E cobrança no checkout, o desconto
  por ciclo volta aqui — junto do número, nunca antes dele.
*/
const CYCLE_COPY: Record<CycleCode, { badge: string; gain: string }> = {
  MENSAL: { badge: "Sem fidelidade", gain: "Cancela avisando 30 dias antes." },
  TRIMESTRAL: { badge: "−10%", gain: "10% de desconto em cada mês." },
  ANUAL: { badge: "2 meses grátis", gain: "Paga 10 meses e usa 12." },
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

/**
 * O compromisso da seção do formulário, em três passos — e nenhum deles tem prazo.
 * Texto VINDO DA PÁGINA `/site/demonstracao`, eliminada em 06/08; ele nasceu lá
 * respondendo à pergunta que trava o envio, e mudou de endereço sem mudar de
 * palavra.
 *
 * Quem faz a demonstração é uma PESSOA do Foocci (o SDR), não um vídeo automático
 * nem um robô: dizer isso com todas as letras é o que separa "deixei meu telefone
 * num site" de "combinei uma conversa". "Uma pessoa do Foocci" e não "nossa
 * equipe": equipe é abstração, pessoa é quem vai chamar.
 */
const DEPOIS_DE_ENVIAR = [
  "Seus dados chegam para uma pessoa do Foocci — ninguém mais recebe.",
  "Ela chama você no WhatsApp que você informou aqui, para entender o seu restaurante e combinar um horário.",
  "Na conversa, ela mostra o Foocci funcionando com o cardápio do seu restaurante. Sem compromisso e sem custo.",
];

/**
 * As três linhas do "Fora a mensalidade", na ordem em que o dono pergunta: o que
 * a gente faz por ele (Configuração), o que a agência faz (hora humana) e a nota
 * fiscal — que entra na lista por ser a dúvida, não por ser cobrança nossa. Os
 * textos e o motivo de cada preço estar como está vivem em `servicosAParte.ts`;
 * aqui só se decide a ordem.
 */
const LINHAS_A_PARTE: { name: string; price: string; desc: string }[] = [
  ...SERVICOS_A_PARTE,
  NOTA_FISCAL_A_PARTE,
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
      {/* Escala subordinada de propósito: 12,5px contra os 16px das vantagens —
          é o que faz o olho ler "lista completa", não "manchete". */}
      <CheckIcon className="mt-[3px] h-3.5 w-3.5 shrink-0 text-brand-500/70" />
      <span className="text-[12.5px] leading-relaxed text-ink2">{children}</span>
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
  /*
    TRÊS APARIÇÕES DA MESMA OFERTA VIRARAM DUAS (07/08). O CEO perguntou se o
    desconto aparecendo no anúncio, no quadrinho "1º mês" e na linha embaixo do
    botão reforça ou dilui. Dilui: o quadrinho e a linha diziam o MESMO número a
    três centímetros de distância, e nenhum dos dois dizia nada que o outro já não
    dissesse.

    O que ficou, e por que cada um tem trabalho diferente:
      · o anúncio no topo da seção  → cria o desejo, em porcentagem;
      · este quadrinho              → traduz a porcentagem no VALOR DESTE plano;
      · a linha embaixo do botão    → deixou de repetir o valor e passou a
        responder a pergunta que trava o dedo no botão ("e se eu quiser sair?").
  */
  const highlights = [
    { label: "Anual", value: `${formatBRL(monthlyEquivalentCents(code, "ANUAL"))}/mês`, oferta: false },
    {
      /* O `−50%` sai da mesma função que cobra o cartão — nunca digitado. É ele que
         amarra este quadrinho ao anúncio lá em cima: sem a porcentagem, "R$ 89,50"
         é só mais um número entre os quatro do cartão. */
      label: `1º mês −${firstMonthDiscountPercent()}%`,
      value: formatBRL(firstChargeCents(code, "MENSAL")),
      oferta: true,
    },
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
          <div
            key={d.label}
            className={`rounded-xl border px-2 py-2 text-center ${
              d.oferta ? "border-brand-200 bg-brand-50" : "border-line bg-canvas"
            }`}
          >
            <p
              className={`text-[10.5px] uppercase tracking-wide ${
                d.oferta ? "font-semibold text-brand-600" : "text-muted"
              }`}
            >
              {d.label}
            </p>
            <p
              className={`mt-0.5 text-[12.5px] font-semibold tabular-nums ${
                d.oferta ? "text-brand-700" : "text-ink"
              }`}
            >
              {d.value}
            </p>
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
        {/* Lida de `CYCLE_COPY` — a mesma fonte que a tabela de ciclos usa, para a
            página não prometer 30 dias aqui e outra coisa lá embaixo. */}
        <p className="text-center text-[11.5px] text-muted">
          {CYCLE_COPY.MENSAL.badge}. {CYCLE_COPY.MENSAL.gain}
        </p>
      </div>

      {/* ── BLOCO 1: as vantagens ─────────────────────────────────────────────
          O que o dono ganha, grande e em primeiro lugar. Três, no vocabulário
          dele, começando pela dor que a manchete deste plano promete resolver. */}
      <div className="mt-7 space-y-4">
        {plan.benefits.map((b) => (
          <div key={b.title} className="flex items-start gap-2.5">
            <CheckIcon className="mt-[5px] h-4 w-4 shrink-0 text-brand-500" />
            <div>
              <p className="text-[16px] font-semibold leading-snug tracking-tight text-ink">{b.title}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-ink2">{b.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ROI — premissa declarada, números calculados (ver trava jurídica no topo) */}
      <RoiBlock revenue={plan.roiRevenue} planMonthlyCents={monthly} />

      {/* ── BLOCO 2: o resto ──────────────────────────────────────────────────
          Nada se perde — a prova e a lista inteira continuam no cartão, abaixo
          e menores. A divisória é dupla de propósito (linha + rótulo), para o
          olho enxergar dois blocos e não uma lista longa. */}
      <div className="mt-7 border-t border-line pt-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            Tudo que está incluído
          </p>
          {/* A herança abre o bloco: quem lê "Crescimento" precisa saber que o
              Essencial inteiro está aqui ANTES de correr a lista. */}
          {plan.inheritLabel && (
            <p className="inline-flex items-center gap-2 rounded-lg bg-canvas px-3 py-1.5 text-[12.5px] font-semibold text-ink">
              <RepeatIcon className="h-3.5 w-3.5 text-brand-500" />
              {plan.inheritLabel}
            </p>
          )}
        </div>

        {/* Só aqui você tem — prova, não manchete */}
        <div className="mt-4 rounded-2xl border border-brand-100 bg-brand-50/60 p-4">
          <div className="flex items-center gap-2">
            <SparklesIcon className="h-3.5 w-3.5 text-brand-600" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-700">Só aqui você tem</p>
          </div>
          <ul className="mt-3 space-y-2.5">
            {plan.onlyHere.map((o) => (
              <li key={o} className="flex items-start gap-2">
                <span aria-hidden className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                <span className="text-[12.5px] leading-relaxed text-ink2">{o}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-5 space-y-5">
          {plan.groups.map((g) => (
            <FeatureGroup key={g.label} label={g.label} items={g.items} />
          ))}
        </div>

        {/* Substitui — fecha o bloco de baixo (é comparação de custo, não vantagem) */}
        <p className="mt-6 border-t border-line pt-4 text-[12.5px] leading-relaxed text-muted">
          <span className="font-semibold text-ink2">Substitui:</span> {plan.substitui}
        </p>
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
              O mesmo produto inteiro nos três ciclos — o que muda é só a mensalidade.
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
                  É só o primeiro mês; a partir do segundo, o valor cheio.
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

      {/*
        4. FORA A MENSALIDADE — nota, não seção de venda.

        Era "Cobrado à parte": eyebrow, manchete de 4xl e SEIS cartões com preço.
        Cinco daqueles preços foram aposentados pelo CEO em 06/08 (o porquê está em
        `@/lib/site/servicosAParte`) e sobraram três linhas — duas "Sob consulta" e
        uma que nem é cobrança nossa.

        Manchete de 4xl anuncia tabela; entregar "Sob consulta" duas vezes depois
        dela é anticlímax — e foi essa seção que o CEO leu dizendo "não estava
        entendendo nada". Então ela deixou de competir com "Escolha o ciclo" e
        "Primeiro mês pela metade": virou uma caixa discreta, com título pequeno,
        que responde a pergunta de quem procura ("o que mais eu vou pagar?") sem
        fingir que tem preço para mostrar.

        O `id="aparte-title"` é o rótulo acessível da seção — o `h2` é pequeno de
        propósito, mas continua sendo um `h2` na árvore do documento.
      */}
      <section aria-labelledby="aparte-title" className="bg-paper py-12 lg:py-16">
        <div className="mx-auto max-w-3xl px-5 lg:px-8">
          <div className="rounded-2xl border border-line bg-canvas p-6 sm:p-7">
            <h2 id="aparte-title" className="text-[12.5px] font-semibold uppercase tracking-[.04em] text-ink2">
              Fora a mensalidade
            </h2>
            <p className="mt-2 text-[15px] leading-relaxed text-ink2">
              Não existe taxa escondida no meio do caminho. Isto é tudo o que pode aparecer na
              conta além do plano — e nada aqui é obrigatório para usar o Foocci.
            </p>

            <dl className="mt-5 divide-y divide-line border-t border-line">
              {LINHAS_A_PARTE.map((l) => (
                <div key={l.name} className="py-4 last:pb-0">
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="text-sm font-semibold text-ink">{l.name}</dt>
                    <dd className="shrink-0 whitespace-nowrap text-[12.5px] font-semibold text-ink2">
                      {l.price}
                    </dd>
                  </div>
                  <dd className="mt-1.5 text-[13px] leading-relaxed text-ink2">{l.desc}</dd>
                </div>
              ))}
            </dl>
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

      {/*
        6. O FORMULÁRIO — a última seção, e o único CTA comercial da página.

        A `CtaBand` que ficava aqui SAIU, e não por gosto: ela convidava a pedir a
        demonstração que o formulário logo abaixo já está pedindo. Seria um botão
        laranja cuja única função é rolar 200px até o campo "Nome" — o mesmo
        defeito que fez a antiga `/site/demonstracao` tirar a faixa dela em 05/08.
        Nada se perdeu: o título e a linha de apoio da faixa viraram o cabeçalho
        DESTA seção, e o botão virou o próprio formulário.

        `scroll-mt-20` (80px) porque o cabeçalho do site é `sticky top-0 h-16`
        (64px): sem isso a âncora entrega o título embaixo da barra.

        A ordem interna é deliberada — formulário PRIMEIRO, "depois que você
        enviar" abaixo dele. Quem chega pela âncora tem que cair vendo os campos,
        não uma lista para ler antes; e o que acontece após o envio é, literalmente,
        o que vem depois do botão.
      */}
      <section
        id="demonstracao"
        aria-labelledby="demonstracao-title"
        className="relative scroll-mt-20 overflow-hidden bg-paper py-16 lg:py-20"
      >
        <Halo className="left-1/2 top-0 h-64 w-[40rem] -translate-x-1/2" color="rgba(249,115,22,0.10)" />
        <div className="relative mx-auto max-w-2xl px-5 lg:px-8">
          <div className="text-center">
            <Eyebrow>Prefere ver antes de contratar?</Eyebrow>
            <h2
              id="demonstracao-title"
              className="mt-3 text-balance text-2xl font-semibold tracking-tight text-ink sm:text-3xl"
            >
              Veja o Foocci rodando com o cardápio do seu restaurante.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-ink2">
              Uma pessoa do Foocci mostra o sistema rodando com o cardápio e os números do
              seu restaurante. São dois campos: seu nome e seu WhatsApp.
            </p>
          </div>

          {/*
            Cartão BRANCO sobre seção branca, com borda e anel — o mesmo tratamento
            que a antiga página do formulário usava, e não é decoração: os dois
            estados de sucesso do `DemoForm` moram DENTRO deste cartão e cada um
            escolheu o próprio fundo contra o branco (`brand-50` na confirmação,
            `canvas` no painel do WhatsApp). Tingir o cartão apagaria os dois.
          */}
          <div className="mt-8 rounded-2xl border border-line bg-paper p-6 shadow-sm ring-1 ring-ink/[0.03] sm:p-8">
            <DemoForm includeChallenge />

            {/*
              O QUE ACONTECE DEPOIS DE ENVIAR — a pergunta que segura o dedo em cima
              do botão. Sem PRAZO de propósito: não existe compromisso de "em até X
              horas", e prometer prazo que não se cumpre é o contrário do que esta
              casa faz (guardrail 7). O que se promete aqui é o que de fato acontece:
              uma PESSOA recebe, chama no WhatsApp e mostra o produto com o cardápio
              do restaurante dela.
            */}
            <div className="mt-7 border-t border-line pt-7">
              <h3 className="text-[12.5px] font-semibold uppercase tracking-[.04em] text-ink2">
                Depois que você enviar
              </h3>
              <ol className="mt-4 space-y-3.5">
                {DEPOIS_DE_ENVIAR.map((passo, i) => (
                  <li key={passo} className="flex items-start gap-3">
                    <span
                      aria-hidden
                      className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[12.5px] font-semibold text-brand-600 ring-1 ring-brand-100"
                    >
                      {i + 1}
                    </span>
                    <span className="text-[15px] leading-relaxed text-ink2">{passo}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
