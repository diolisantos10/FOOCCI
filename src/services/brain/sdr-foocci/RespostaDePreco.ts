/**
 * A RESPOSTA DE PREÇO DO SDR DO FOOCCI — decisão do CEO, 08/08/2026.
 *
 * *"Ele passa o valor dos planos."* Lead perguntou quanto custa, o SDR responde
 * na hora. Não puxa para reunião antes, não pede o telefone em troca do número.
 *
 * ── A TRAVA, QUE VALE MAIS QUE A RESPOSTA ───────────────────────────────────
 *
 * Nenhum valor abaixo é digitado. Todos saem de `@/lib/billing/pricing` — a
 * MESMA função que a página `/site/precos` imprime e que o checkout cobra do
 * cartão. O nome comercial e o "para quem serve" saem de `@/lib/site/plans`,
 * que é a mesma camada de copy que o site lê.
 *
 * Por que isso não é preciosismo: **preço copiado envelhece calado.** No dia em
 * que a tabela mudar, a página muda sozinha e a cópia no texto do agente não —
 * o site mostra um valor, o SDR vende outro, e ninguém percebe até um cliente
 * cobrar a diferença na fatura. Duas fontes para o mesmo número não é descuido,
 * é o defeito.
 *
 * A prova de que a ligação existe está no teste ao lado: ele troca a tabela por
 * baixo (`vi.mock`) e exige que a fala mude junto. Fala que não muda quando a
 * fonte muda tem cópia escondida — e o teste que continuasse verde seria o
 * atestado do defeito, não da saúde.
 *
 * ── ESCOPO, DITO COM HONESTIDADE ────────────────────────────────────────────
 *
 * Isto **não é o agente SDR**. O agente não existe (`docs/sdr-foocci-desenho.md`:
 * número, freios de contato, opt-out e esteira de treino continuam abertos).
 * Isto é o tijolo que a decisão do CEO destravou: o que ele responde quando
 * perguntam o preço, e o portão que impede a resposta de virar negociação.
 *
 * Determinístico: sem IA, sem banco, sem rede. Ninguém envia nada daqui.
 */

import {
  CYCLE_CODES,
  PLAN_CYCLE_CENTS,
  SITE_PLAN_TO_CODE,
  firstChargeCents,
  firstMonthDiscountCents,
  formatBRL,
  monthlyEquivalentCents,
  type CycleCode,
  type PlanCode,
  type SitePlanId,
} from "@/lib/billing/pricing";
import { PLANS } from "@/lib/site/plans";

// ─────────────────────────────────────────────────────────────────────────────
//  O que a resposta carrega
// ─────────────────────────────────────────────────────────────────────────────

export interface PlanoNaResposta {
  id: SitePlanId;
  codigo: PlanCode;
  nome: string;
  /** Mensalidade cheia, em centavos, lida da tabela. */
  mensalCents: number;
  mensalFormatado: string;
  /** O que sai do cartão na primeira cobrança do ciclo mensal. */
  primeiroMesCents: number;
  primeiroMesFormatado: string;
  /** Para quem serve — a mesma linha que o cartão do site usa. */
  paraQuem: string;
}

export interface RespostaDePreco {
  planos: PlanoNaResposta[];
  /** O desconto do primeiro mês, em pontos percentuais, derivado da tabela. */
  descontoPercent: number;
  /** A fala pronta, do jeito que vai para o WhatsApp. */
  texto: string;
  /** Onde conferir cada número. Vai no registro, não na fala. */
  fonte: string;
}

/**
 * O DESCONTO EM PORCENTAGEM, derivado do que o cartão paga.
 *
 * O site já tem esta conta em `components/marketing/SinaisDeVenda`. Ela não é
 * importada daqui de propósito: aquele módulo exporta componentes React, e um
 * serviço do Brain que arrasta JSX para dentro passa a quebrar por motivo que
 * não tem nada a ver com preço. O que importa é que **as duas leem a mesma
 * função** (`firstMonthDiscountCents`) — se o desconto mudar, mudam juntas.
 * Nenhuma das duas guarda o número.
 */
export function descontoDoPrimeiroMesPercent(
  plano: PlanCode = "STARTER",
  ciclo: CycleCode = "MENSAL",
): number {
  const total = PLAN_CYCLE_CENTS[plano][ciclo];
  if (!total) return 0;
  return Math.round((firstMonthDiscountCents(plano, ciclo) / total) * 100);
}

// ─────────────────────────────────────────────────────────────────────────────
//  A composição da fala
// ─────────────────────────────────────────────────────────────────────────────

function montarPlanos(): PlanoNaResposta[] {
  return PLANS.map((p) => {
    const codigo = SITE_PLAN_TO_CODE[p.id];
    const mensalCents = PLAN_CYCLE_CENTS[codigo].MENSAL;
    const primeiroMesCents = firstChargeCents(codigo, "MENSAL");
    return {
      id: p.id,
      codigo,
      nome: p.name,
      mensalCents,
      mensalFormatado: formatBRL(mensalCents),
      primeiroMesCents,
      primeiroMesFormatado: formatBRL(primeiroMesCents),
      paraQuem: p.forWho,
    };
  });
}

/**
 * A fala, e as escolhas de redação que ela carrega.
 *
 * · O preço vem antes do argumento. Quem pergunta "quanto custa" quer o número,
 *   e responder com discurso antes do valor é a forma educada de não responder.
 * · O desconto do primeiro mês entra na MESMA mensagem, com o valor de cada
 *   plano ao lado. Ele já está publicado e é o argumento mais forte da tabela —
 *   omitir aqui seria vender pior do que a própria página faz.
 * · "A partir do segundo mês, o valor cheio" é obrigatório. Anunciar a metade
 *   sem dizer que ela acaba é o começo da cobrança que o cliente não esperava.
 * · Nenhuma frase promete resultado, prazo ou percentual de aumento. O que o SDR
 *   tem para dar aqui é fato publicado; o resto sobe para humano.
 */
export function responderPreco(): RespostaDePreco {
  const planos = montarPlanos();
  const descontoPercent = descontoDoPrimeiroMesPercent();

  const linhas = planos.map(
    (p) => `• ${p.nome} — ${p.mensalFormatado}/mês. ${p.paraQuem}`,
  );

  const primeiroMes = planos
    .map((p) => `${p.nome} ${p.primeiroMesFormatado}`)
    .join(", ");

  const texto = [
    "São três planos, e o valor é este:",
    "",
    ...linhas,
    "",
    `O primeiro mês sai com ${descontoPercent}% de desconto, em qualquer um dos três: ` +
      `${primeiroMes}. A partir do segundo mês, o valor cheio.`,
    "",
    "Se quiser, eu te explico o que muda de um plano para o outro.",
  ].join("\n");

  return {
    planos,
    descontoPercent,
    texto,
    fonte:
      "src/lib/billing/pricing.ts (PLAN_CYCLE_CENTS, firstChargeCents) — a mesma tabela " +
      "que /site/precos imprime e que o checkout cobra; src/lib/site/plans.ts (nome e para quem)",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  O PORTÃO — o que o SDR continua não podendo fazer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Por que existe um auditor além da fala composta acima.
 *
 * A fala de `responderPreco()` é determinística e segura por construção. Mas o
 * SDR não vai só recitar: a partir da segunda mensagem ele responde a objeção, e
 * aí a fala passa a ser escrita por IA. "Não negocie desconto" escrito no perfil
 * do agente é aviso; aviso já falhou em produção nesta casa. Este auditor é a
 * trava — todo texto que o SDR emitir sobre dinheiro passa por aqui antes.
 */
export interface FaltaNaFala {
  /** O que está errado, em uma linha. */
  motivo: string;
  /** O trecho exato que causou. Alerta sem o caso concreto é ruído (guardrail 6). */
  trecho: string;
}

export interface AuditoriaDaFala {
  aprovado: boolean;
  faltas: FaltaNaFala[];
}

/**
 * TODO valor em reais que o SDR pode dizer, em centavos.
 *
 * Sai da tabela inteira — os três planos nos três ciclos, mais a mensalidade
 * equivalente, o abatimento e a primeira cobrança de cada combinação. Qualquer
 * outro número em reais na boca do SDR é valor que não existe na tabela, e é
 * assim que nasce o desconto inventado.
 */
export function valoresPermitidosCents(): Set<number> {
  const permitidos = new Set<number>();
  for (const codigo of Object.keys(PLAN_CYCLE_CENTS) as PlanCode[]) {
    for (const ciclo of CYCLE_CODES) {
      permitidos.add(PLAN_CYCLE_CENTS[codigo][ciclo]);
      permitidos.add(monthlyEquivalentCents(codigo, ciclo));
      permitidos.add(firstChargeCents(codigo, ciclo));
      permitidos.add(firstMonthDiscountCents(codigo, ciclo));
    }
  }
  return permitidos;
}

/**
 * TODA porcentagem que o SDR pode dizer.
 *
 * O desconto do primeiro mês, e a economia de cada ciclo contra o mensal — todas
 * derivadas, nenhuma digitada. É um conjunto pequeno de propósito, e ele faz
 * dois trabalhos ao mesmo tempo: barra o desconto inventado ("faço por 30% a
 * menos") e barra a promessa de número que os guardrails já proíbem ("aumenta
 * suas vendas em 40%"), porque 30 e 40 não saem de tabela nenhuma.
 */
export function percentuaisPermitidos(): Set<number> {
  const permitidos = new Set<number>([descontoDoPrimeiroMesPercent()]);
  for (const codigo of Object.keys(PLAN_CYCLE_CENTS) as PlanCode[]) {
    permitidos.add(descontoDoPrimeiroMesPercent(codigo, "MENSAL"));
    const mensal = PLAN_CYCLE_CENTS[codigo].MENSAL;
    for (const ciclo of CYCLE_CODES) {
      const equivalente = monthlyEquivalentCents(codigo, ciclo);
      permitidos.add(Math.round(((mensal - equivalente) / mensal) * 100));
    }
  }
  return permitidos;
}

/**
 * Valores em reais escritos em português — inclui separador de milhar.
 *
 * Escrito aqui e não reaproveitado do `SnapshotCoherenceVerifier` porque o regex
 * de lá (`R\$\s?(\d{1,4}(?:[.,]\d{2})?)`) para no separador de milhar: em
 * "R$ 4.290,00" ele captura "4.29" e conclui R$ 4,29. Para cardápio de
 * restaurante quase nunca importa; para mensalidade de plano no ciclo anual
 * importa em todos os casos.
 */
const DINHEIRO_NO_TEXTO = /R\$\s?(\d{1,3}(?:\.\d{3})*(?:,\d{2})?|\d+(?:,\d{2})?)/g;
const PORCENTAGEM_NO_TEXTO = /(\d{1,3})\s*%/g;

function paraCentavos(bruto: string): number {
  const normalizado = bruto.replace(/\./g, "").replace(",", ".");
  return Math.round(Number.parseFloat(normalizado) * 100);
}

function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** Negociar valor que a tabela não tem. O SDR informa preço; quem negocia é humano. */
const NEGOCIACAO: [RegExp, string][] = [
  [/\b(consigo|posso|d[aá]|dou|fa[çc]o|fecho|libero)\s+(um\s+)?(desconto|abatimento|condi[çc][aã]o)/, "oferece desconto que não está na tabela"],
  [/\b(consigo|posso|fa[çc]o|fecho|deixo)\s+(fazer\s+)?por\s+R?\$?\s*\d/, "negocia um valor por fora da tabela"],
  [/\bdesconto\s+(especial|extra|adicional|maior)/, "promete desconto além do publicado"],
  [/\bcondi[çc][aã]o\s+especial\b/, "promete condição especial que não existe"],
  [/\bs[oó]\s+(pra|para)\s+(voc[eê]|ti)\b/, "condição personalizada — não existe na tabela"],
  [/\babr(o|ir)\s+(uma\s+)?exce[çc][aã]o/, "abre exceção comercial sem autorização"],
  [/\b(cupom|voucher)\b/, "cupom não existe na tabela de planos"],
  [/\bpre[çc]o\s+(promocional|de\s+lan[çc]amento)/, "inventa promoção não publicada"],
];

/** Prazo de implantação. Ninguém combinou prazo; prometer prazo é dívida. */
const PRAZO: [RegExp, string][] = [
  [/\b(em|dentro de)\s+at[eé]?\s*\d+\s*(hora|dia|semana|m[eê]s)/, "promete prazo de implantação"],
  [/\b(fica|est[aá])\s+pronto\s+em\s+\d/, "promete prazo de implantação"],
  [/\b(no ar|rodando|funcionando|instalado|configurado)\s+em\s+\d/, "promete prazo de implantação"],
  [/\b(implanta|instala|configura|entrega)\w*\s+em\s+\d+\s*(hora|dia|semana)/, "promete prazo de implantação"],
  [/\bleva\s+\d+\s*(hora|dia|semana)/, "promete prazo de implantação"],
  [/\bem\s+\d+\s*(hora|dia|semana)s?\s+voc[eê]\s+(j[aá]\s+)?(est|vai|ta)/, "promete prazo de implantação"],
];

/** Resultado prometido. O guardrail é antigo: nunca prometer número. */
const PROMESSA: [RegExp, string][] = [
  [/\bgarant(o|ido|imos|ia)\b/, "garante resultado"],
  [/\b(vai|voc[eê] vai)\s+(vender|faturar|lucrar|aumentar|crescer)/, "promete resultado de venda"],
  [/\b(aumenta|dobra|triplica|multiplica)\s+(suas?|seu|o|a)\s+(venda|faturamento|lucro|receita)/, "promete resultado de venda"],
  [/\bcom certeza\s+(vai|voc[eê])/, "promete resultado"],
];

/**
 * O portão da fala de preço. Lista vazia = pode falar.
 *
 * Reprova quando não sabe: texto vazio não passa. Esquecer de compor nunca pode
 * significar "aprovado" (guardrail 2).
 */
export function auditarFalaDePreco(texto: string): AuditoriaDaFala {
  const faltas: FaltaNaFala[] = [];
  const limpo = (texto ?? "").trim();

  if (!limpo) {
    return {
      aprovado: false,
      faltas: [{ motivo: "fala vazia — sem texto não há o que aprovar", trecho: "" }],
    };
  }

  const permitidos = valoresPermitidosCents();
  for (const m of limpo.matchAll(DINHEIRO_NO_TEXTO)) {
    const bruto = m[1];
    if (!bruto) continue;
    if (!permitidos.has(paraCentavos(bruto))) {
      faltas.push({
        motivo: "valor em reais que não existe na tabela de planos",
        trecho: m[0],
      });
    }
  }

  const percentuais = percentuaisPermitidos();
  for (const m of limpo.matchAll(PORCENTAGEM_NO_TEXTO)) {
    const bruto = m[1];
    if (!bruto) continue;
    if (!percentuais.has(Number.parseInt(bruto, 10))) {
      faltas.push({
        motivo: "porcentagem que não sai da tabela — desconto inventado ou número prometido",
        trecho: m[0],
      });
    }
  }

  const normalizado = semAcento(limpo);
  for (const [re, motivo] of [...NEGOCIACAO, ...PRAZO, ...PROMESSA]) {
    const achado = normalizado.match(re);
    if (achado) faltas.push({ motivo, trecho: achado[0] });
  }

  return { aprovado: faltas.length === 0, faltas };
}
