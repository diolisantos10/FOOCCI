/**
 * O GASTO DE IA, DIA A DIA — a primeira metade da conta que o CEO pediu.
 *
 * Pedido do CEO em 29/08/2026: *"toda hora estamos gastando com inteligência
 * artificial, crédito, tudo precisa ser medido, a gente precisa saber qual é o
 * custo desses produtos todos os dias (…) a gente precisa contabilizar
 * absolutamente tudo que é gasto."*
 *
 * ── ⚠️ O QUE ESTE ARQUIVO **NÃO** FAZ ───────────────────────────────────────
 *
 * Não tem tabela própria e não grava nada. O dado já existe em
 * `AIInteractionLog` desde a primeira chamada de IA da casa — cada linha com
 * modelo, tokens e agente. Criar uma tabela de "gasto de IA" ao lado dela seria
 * ter duas verdades sobre o mesmo fato, e a segunda começaria a divergir no
 * primeiro log que alguém esquecesse de espelhar.
 *
 * Também não recalcula preço: quem sabe o preço é `modelPricing`, e quem soma é
 * `aggregateCost`. Este arquivo LÊ o banco, corta por dia civil e delega.
 *
 * ── ⚠️ AUSÊNCIA NUNCA VIRA ZERO ─────────────────────────────────────────────
 *
 * `aggregateCost` já distingue quatro estados, e essa distinção é o bem mais
 * valioso que existe aqui:
 *
 *   · `PRICED`   — sabemos quanto custou;
 *   · `PARTIAL`  — sabemos de parte; o resto usou modelo sem preço na tabela;
 *   · `UNPRICED` — usou IA e NÃO sabemos o custo de nada;
 *   · `NO_USAGE` — não usou.
 *
 * Um dia sem linha nenhuma sai daqui como `NO_USAGE`, e não como custo zero. Um
 * dia inteiro em modelo fora da tabela sai como `UNPRICED`, e não como custo
 * zero. Os dois viram "R$ 0,00" na hora em que alguém somar `?? 0` — e a partir
 * daí a tela mente com cara de precisão. É o guardrail 1 aplicado a dinheiro.
 *
 * ── ⚠️ POR QUE DÓLAR, E NÃO REAL ────────────────────────────────────────────
 *
 * A tabela de preços de `modelPricing` é em USD, que é como OpenAI, Anthropic e
 * Google cobram. Converter para real aqui exigiria uma cotação — e não há
 * nenhuma fonte de câmbio neste repositório. Inventar uma taxa (ou fixar "5,40"
 * num `const`) produziria um número em reais que ninguém consegue conferir
 * contra fatura nenhuma.
 *
 * Então o gasto de IA sai em **dólar**, dito com esse nome na tela, e o gasto
 * lançado à mão sai na moeda em que foi lançado. Somar as duas é proibido, e a
 * proibição está no tipo: não existe função aqui que devolva "o total".
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import {
  aggregateCost,
  UNATTRIBUTED,
  UNATTRIBUTED_LABEL,
  type CostBucket,
  type UsageRow,
  type UsageStatus,
} from "@/services/ai/pricing/costAggregation";
import { diaEmSaoPaulo, diasDaFaixa, janelaDeConsulta } from "./dia";
import { MICRO_POR_CENTAVO, dolaresEscritos } from "./valor";

type Cliente = PrismaClient | Prisma.TransactionClient;

// ─────────────────────────────────────────────────────────────────────────────
// O DINHEIRO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ── ⚠️ MICRODÓLAR: POR QUE CENTAVO NÃO BASTA COMO UNIDADE INTERNA ───────────
 *
 * Dinheiro é inteiro aqui, sem exceção — nenhum float atravessa este arquivo
 * como valor monetário. Mas o **centavo** não pode ser a unidade de conta do
 * gasto de IA, e a razão é aritmética:
 *
 *   mil tokens de entrada em gpt-4o-mini custam US$ 0,00015 — 0,015 centavo.
 *
 * Arredondar cada chamada para centavo daria zero em TODAS elas, e a soma do
 * dia seria zero depois de dez mil chamadas. O gasto que o CEO quer enxergar
 * desapareceria justamente por ser miúdo e constante, que é exatamente o tipo
 * de gasto que sangra sem ninguém ver.
 *
 * Então a conta é feita em **microdólares** (milionésimos de dólar), inteiros —
 * o mesmo grão do `Decimal(10,6)` da coluna do banco. O centavo é derivado no
 * fim, para a tela, e vem acompanhado de `abaixoDeUmCentavo` para que
 * "US$ 0,00" nunca seja escrito sobre um gasto que existe.
 */

/** Converte o dólar somado por `aggregateCost` no inteiro que se guarda. */
function microDolares(usd: number): number {
  return Math.round(usd * 1_000_000);
}

/**
 * O gasto de UM balde — um dia, ou um agente.
 *
 * Todo valor monetário é inteiro. `estado` viaja junto porque, sem ele, os
 * campos numéricos deste objeto são indistinguíveis entre "não gastou" e "não
 * sabemos quanto gastou".
 */
export interface GastoDeIa {
  /** O dia (`YYYY-MM-DD`) ou o slug do agente. */
  readonly chave: string;
  /** Como a tela chama este balde. Agente sem atribuição tem nome próprio. */
  readonly rotulo: string;
  readonly chamadas: number;
  readonly tokensDeEntrada: number;
  readonly tokensDeSaida: number;
  readonly tokensTotais: number;
  /** Milionésimos de dólar, inteiro. A unidade de conta. */
  readonly microUsd: number;
  /** Centavos de dólar, inteiro. Derivado — para a tela, nunca para somar. */
  readonly centavosUsd: number;
  /** `true` quando gastou-se algo que arredonda para menos de um centavo. */
  readonly abaixoDeUmCentavo: boolean;
  /** Quantas chamadas ficaram sem preço conhecido. */
  readonly chamadasSemPreco: number;
  /** Quais modelos ficaram sem preço — a evidência do alerta. */
  readonly modelosSemPreco: readonly string[];
  readonly estado: UsageStatus;
}

/** A faixa pedida, e o que ela devolve. */
export interface FaixaDeDias {
  /** Primeiro dia, `YYYY-MM-DD`, no fuso de São Paulo. */
  de: string;
  /** Último dia, inclusive. */
  ate: string;
}

export interface GastoDeIaNaFaixa {
  readonly de: string;
  readonly ate: string;
  /** Um item por dia da faixa — os sem uso INCLUSIVE. */
  readonly dias: readonly GastoDeIa[];
  /** O total da faixa inteira, com o estado do conjunto. */
  readonly total: GastoDeIa;
}

export interface GastoDeIaPorAgente {
  readonly de: string;
  readonly ate: string;
  readonly agentes: readonly GastoDeIa[];
  readonly total: GastoDeIa;
}

// ─────────────────────────────────────────────────────────────────────────────
// A LEITURA
// ─────────────────────────────────────────────────────────────────────────────

interface LinhaDoBanco {
  model: string;
  agentSlug: string | null;
  promptTokens: number;
  completionTokens: number;
  createdAt: Date;
}

/**
 * As linhas de IA da faixa, já com a folga de fuso.
 *
 * `success` NÃO entra no filtro de propósito: uma chamada que falhou no meio
 * queimou os tokens que já tinha mandado, e o provedor cobra por eles. Filtrar
 * só o que deu certo produziria uma conta menor que a fatura — que é a direção
 * errada de errar quando o assunto é gasto.
 */
async function lerLinhas(db: Cliente, de: string, ate: string): Promise<LinhaDoBanco[]> {
  const { gte, lt } = janelaDeConsulta(de, ate);

  return db.aIInteractionLog.findMany({
    where: { createdAt: { gte, lt } },
    select: {
      model: true,
      agentSlug: true,
      promptTokens: true,
      completionTokens: true,
      createdAt: true,
    },
  }) as Promise<LinhaDoBanco[]>;
}

function paraUso(l: LinhaDoBanco): UsageRow {
  return {
    model: l.model,
    agentSlug: l.agentSlug,
    promptTokens: l.promptTokens,
    completionTokens: l.completionTokens,
  };
}

/** O balde de `aggregateCost` vira o balde do financeiro, com dinheiro inteiro. */
function daAgregacao(bucket: CostBucket, chave: string, rotulo: string): GastoDeIa {
  const micro = microDolares(bucket.knownCostUsd);
  const centavos = Math.round(micro / MICRO_POR_CENTAVO);

  return {
    chave,
    rotulo,
    chamadas: bucket.calls,
    tokensDeEntrada: bucket.promptTokens,
    tokensDeSaida: bucket.completionTokens,
    tokensTotais: bucket.totalTokens,
    microUsd: micro,
    centavosUsd: centavos,
    // Gastou e some no arredondamento. Sem esta bandeira, dez mil chamadas de
    // gpt-4o-mini apareceriam como "US$ 0,00" — o zero mais caro possível.
    abaixoDeUmCentavo: micro > 0 && centavos === 0,
    chamadasSemPreco: bucket.unpricedCalls,
    modelosSemPreco: bucket.unpricedModels,
    estado: bucket.status,
  };
}

/** O balde de um dia que não teve linha nenhuma. Existe para NÃO virar zero. */
function semUso(chave: string, rotulo: string): GastoDeIa {
  return {
    chave,
    rotulo,
    chamadas: 0,
    tokensDeEntrada: 0,
    tokensDeSaida: 0,
    tokensTotais: 0,
    microUsd: 0,
    centavosUsd: 0,
    abaixoDeUmCentavo: false,
    chamadasSemPreco: 0,
    modelosSemPreco: [],
    estado: "NO_USAGE",
  };
}

/**
 * O gasto de IA de cada dia da faixa.
 *
 * ⚠️ A lista de dias vem do CALENDÁRIO (`diasDaFaixa`), não do banco. Um dia sem
 * chamada nenhuma aparece com `estado: "NO_USAGE"` — some da tela seria lido
 * como "não gastou", e a tela precisa poder dizer que não houve uso.
 */
export async function gastoDeIaPorDia(
  db: Cliente,
  faixa: FaixaDeDias,
): Promise<GastoDeIaNaFaixa> {
  // Valida a faixa ANTES de encostar no banco: faixa invertida ou grande demais
  // é recusa nomeada, e não uma consulta que demora e falha sozinha.
  const dias = diasDaFaixa(faixa.de, faixa.ate);
  const linhas = await lerLinhas(db, faixa.de, faixa.ate);

  const porDia = new Map<string, LinhaDoBanco[]>();
  for (const l of linhas) {
    // O corte é pelo dia civil de SÃO PAULO — ver `dia.ts`. Cortar pelo UTC
    // jogaria o gasto das noites no dia seguinte.
    const dia = diaEmSaoPaulo(l.createdAt);
    // A janela de consulta sobra um dia em cada ponta; o que caiu fora da faixa
    // pedida é descartado aqui.
    if (dia < faixa.de || dia > faixa.ate) continue;
    const balde = porDia.get(dia);
    if (balde) balde.push(l);
    else porDia.set(dia, [l]);
  }

  const doDia = dias.map((dia) => {
    const linhasDoDia = porDia.get(dia);
    if (!linhasDoDia) return semUso(dia, dia);
    return daAgregacao(aggregateCost(linhasDoDia.map(paraUso)).total, dia, dia);
  });

  const todas = [...porDia.values()].flat();
  return {
    de: faixa.de,
    ate: faixa.ate,
    dias: doDia,
    total: todas.length === 0
      ? semUso("__total__", "Total do período")
      : daAgregacao(aggregateCost(todas.map(paraUso)).total, "__total__", "Total do período"),
  };
}

/**
 * O gasto de IA por agente, na mesma faixa e com a mesma régua.
 *
 * ⚠️ `aggregateCost` já separa o balde `__unattributed__` — chamadas cujo log
 * não sabe de qual agente vieram. Ele NÃO é somado a nenhum agente real, e
 * aparece na tela com nome próprio: um custo atribuído ao agente errado é pior
 * que um custo sem dono, porque leva alguém a desligar o agente errado.
 */
export async function gastoDeIaPorAgente(
  db: Cliente,
  faixa: FaixaDeDias,
): Promise<GastoDeIaPorAgente> {
  diasDaFaixa(faixa.de, faixa.ate);
  const linhas = await lerLinhas(db, faixa.de, faixa.ate);

  const dentro = linhas.filter((l) => {
    const dia = diaEmSaoPaulo(l.createdAt);
    return dia >= faixa.de && dia <= faixa.ate;
  });

  if (dentro.length === 0) {
    return {
      de: faixa.de,
      ate: faixa.ate,
      agentes: [],
      total: semUso("__total__", "Total do período"),
    };
  }

  const relatorio = aggregateCost(dentro.map(paraUso));

  return {
    de: faixa.de,
    ate: faixa.ate,
    agentes: relatorio.byAgent.map((b) =>
      daAgregacao(b, b.key, b.key === UNATTRIBUTED ? UNATTRIBUTED_LABEL : b.key),
    ),
    total: daAgregacao(relatorio.total, "__total__", "Total do período"),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// A FRASE QUE A TELA MOSTRA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A prestação de contas de um balde, em uma frase de português.
 *
 * ⚠️ É AQUI que "ausência não vira zero" deixa de ser doutrina e vira texto na
 * tela. Cada estado tem uma frase própria, e três delas não contêm valor nenhum
 * — porque não há valor a dizer.
 */
export function fraseDoGasto(g: GastoDeIa): string {
  switch (g.estado) {
    case "NO_USAGE":
      return "Sem uso de IA — nenhuma chamada registrada neste período.";

    case "UNPRICED":
      return (
        `Não precificado: ${g.chamadas} ${g.chamadas === 1 ? "chamada" : "chamadas"} de IA ` +
        `${g.chamadas === 1 ? "usou" : "usaram"} ${modelosEscritos(g.modelosSemPreco)}, que não ` +
        "está na tabela de preços. Houve gasto e não sabemos quanto."
      );

    case "PARTIAL":
      return (
        `${dolaresEscritos(g.microUsd)} medidos, mais ${g.chamadasSemPreco} ` +
        `${g.chamadasSemPreco === 1 ? "chamada" : "chamadas"} em ` +
        `${modelosEscritos(g.modelosSemPreco)} sem preço na tabela. ` +
        "O gasto real é MAIOR que este número."
      );

    case "PRICED":
      return g.abaixoDeUmCentavo
        ? `${dolaresEscritos(g.microUsd)} — menos de um centavo de dólar, mas não é zero.`
        : dolaresEscritos(g.microUsd);
  }
}

function modelosEscritos(modelos: readonly string[]): string {
  if (modelos.length === 0) return "modelo não identificado";
  if (modelos.length === 1) return `o modelo "${modelos[0]}"`;
  return `os modelos ${modelos.map((m) => `"${m}"`).join(", ")}`;
}
