/**
 * A META DE RECEITA DO COMERCIAL — e o que ela destrava, e o que ela NÃO.
 *
 * ── O QUE ESTE ARQUIVO FAZ ──────────────────────────────────────────────────
 *
 * Guarda e lê um número por mês (a meta que o CEO digitou) e, quando existem os
 * DOIS lados — meta cadastrada e receita medida —, calcula a fração atingida.
 *
 * ── ⛔ O QUE ELE NÃO FAZ, E NÃO PODE PASSAR A FAZER ─────────────────────────
 *
 * **Previsão de receita não existe.** Meta é número que o CEO digita; previsão
 * seria conta nossa sobre o futuro, e ela sairia desta função parecendo medição
 * e viraria decisão de dinheiro. O desenho do CEO pede "Previsão R$ 560.000" e
 * a tela continua sem isso, de propósito.
 *
 * ── ⛔ E MÊS SEM META NÃO É MÊS COM META ZERO ───────────────────────────────
 *
 * `semMeta` e `meta = 0` são estados opostos: o primeiro diz "ninguém decidiu",
 * o segundo diria "decidiram que não se espera receita nenhuma". Por isso
 * `progressoDaMeta` devolve `medido: false` com motivo, e nunca `0`. Ausência
 * de informação não é informação — barra em 0% é a forma mais convincente de
 * transformar uma em outra.
 */

import type { PrismaClient, Prisma } from "@prisma/client";

type Cliente = PrismaClient | Prisma.TransactionClient;

/** O que `receitaGanha` devolve — repetido aqui para não acoplar ao painel. */
export type ReceitaMedida =
  | { medido: true; centavos: number; propostas: number }
  | { medido: false; motivo: string; propostas?: number };

export type MetaDoMes =
  | {
      definida: true;
      competencia: string;
      centavos: number;
      definidoPorNome: string;
      definidoPorId: string | null;
      atualizadoEm: Date;
    }
  | { definida: false; competencia: string; motivo: "semMeta" };

export type ProgressoDaMeta =
  | { medido: true; fracao: number; metaCentavos: number; receitaCentavos: number }
  /** `semMeta` = ninguém decidiu. `receitaNaoMedida` = decidiram, e não há o que comparar. */
  | { medido: false; motivo: "semMeta" | "receitaNaoMedida"; detalhe: string };

const COMPETENCIA = /^\d{4}-(0[1-9]|1[0-2])$/;

export function competenciaValida(c: string): boolean {
  return COMPETENCIA.test(c);
}

/**
 * A competência de uma data — em UTC, como todo o resto das janelas desta casa
 * (`funilDeReceita`, `painel`). Misturar fuso local aqui faria o dia 1º às 00h
 * cair na competência anterior em metade do mundo.
 */
export function competenciaDe(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** A janela `[de, ate)` da competência — a mesma forma que `Periodo` usa. */
export function janelaDaCompetencia(competencia: string): { de: Date; ate: Date } {
  const [ano, mes] = competencia.split("-").map(Number) as [number, number];
  return {
    de: new Date(Date.UTC(ano, mes - 1, 1)),
    ate: new Date(Date.UTC(ano, mes, 1)),
  };
}

/** "R$ 100.000,00" — uma função só, para tela e trilha falarem o mesmo. */
export function emReais(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

export async function lerMeta(db: Cliente, competencia: string): Promise<MetaDoMes> {
  const linha = await db.metaDeReceitaMensal.findUnique({ where: { competencia } });
  if (!linha) return { definida: false, competencia, motivo: "semMeta" };
  return {
    definida: true,
    competencia,
    centavos: linha.valorCentavos,
    definidoPorNome: linha.definidoPorNome,
    definidoPorId: linha.definidoPorId,
    atualizadoEm: linha.atualizadoEm,
  };
}

/**
 * ⭐ O CÁLCULO — e as duas portas fechadas.
 *
 * Sem meta, não há percentual: não se divide por um alvo que ninguém escolheu.
 * Sem receita medida, também não: dividir "não medido" por meta daria 0%, que é
 * exatamente a mentira que a barra de progresso torna convincente.
 */
export function progressoDaMeta(meta: MetaDoMes, receita: ReceitaMedida): ProgressoDaMeta {
  if (!meta.definida) {
    return {
      medido: false,
      motivo: "semMeta",
      detalhe: `nenhuma meta cadastrada para ${meta.competencia} — e mês sem meta não é mês com meta zero`,
    };
  }
  if (!receita.medido) {
    return {
      medido: false,
      motivo: "receitaNaoMedida",
      detalhe: `a meta existe (${emReais(meta.centavos)}), mas a receita do mês não foi medida (${receita.motivo})`,
    };
  }
  // Meta zero é recusada na escrita (`definirMeta`); a guarda aqui existe para
  // o caso de uma linha antiga, e devolve "não medido", nunca Infinity.
  if (meta.centavos <= 0) {
    return {
      medido: false,
      motivo: "semMeta",
      detalhe: `a meta de ${meta.competencia} está gravada como ${emReais(meta.centavos)} — não dá para dividir por ela`,
    };
  }
  return {
    medido: true,
    fracao: receita.centavos / meta.centavos,
    metaCentavos: meta.centavos,
    receitaCentavos: receita.centavos,
  };
}

export type ResultadoDaDefinicao =
  | { ok: true; meta: MetaDoMes; anteriorCentavos: number | null }
  | { ok: false; causa: "competenciaInvalida" | "valorInvalido"; detalhe: string };

/**
 * Grava a meta de UMA competência — e só dela.
 *
 * ⚠️ A trilha é escrita na MESMA transação do upsert. Meta trocada sem registro
 * de quem trocou é a pergunta "quem baixou a meta de setembro?" sem resposta.
 */
export async function definirMeta(
  db: PrismaClient,
  entrada: {
    competencia: string;
    valorCentavos: number;
    alteradoPorId: string | null;
    alteradoPorNome: string;
    motivo?: string | null;
  },
): Promise<ResultadoDaDefinicao> {
  if (!competenciaValida(entrada.competencia)) {
    return {
      ok: false,
      causa: "competenciaInvalida",
      detalhe: "a competência precisa estar no formato AAAA-MM",
    };
  }
  if (
    !Number.isInteger(entrada.valorCentavos) ||
    entrada.valorCentavos <= 0 ||
    entrada.valorCentavos > 1_000_000_000_00
  ) {
    return {
      ok: false,
      causa: "valorInvalido",
      detalhe: "a meta precisa ser um valor em centavos maior que zero",
    };
  }

  const anterior = await db.metaDeReceitaMensal.findUnique({
    where: { competencia: entrada.competencia },
    select: { valorCentavos: true },
  });

  const linha = await db.$transaction(async (tx) => {
    const gravada = await tx.metaDeReceitaMensal.upsert({
      where: { competencia: entrada.competencia },
      create: {
        competencia: entrada.competencia,
        valorCentavos: entrada.valorCentavos,
        definidoPorId: entrada.alteradoPorId,
        definidoPorNome: entrada.alteradoPorNome,
      },
      update: {
        valorCentavos: entrada.valorCentavos,
        definidoPorId: entrada.alteradoPorId,
        definidoPorNome: entrada.alteradoPorNome,
      },
    });

    await tx.metaDeReceitaHistorico.create({
      data: {
        metaId: gravada.id,
        competencia: entrada.competencia,
        valorAnteriorCentavos: anterior?.valorCentavos ?? null,
        valorNovoCentavos: entrada.valorCentavos,
        alteradoPorId: entrada.alteradoPorId,
        alteradoPorNome: entrada.alteradoPorNome,
        motivo: entrada.motivo ?? null,
      },
    });

    return gravada;
  });

  return {
    ok: true,
    anteriorCentavos: anterior?.valorCentavos ?? null,
    meta: {
      definida: true,
      competencia: linha.competencia,
      centavos: linha.valorCentavos,
      definidoPorNome: linha.definidoPorNome,
      definidoPorId: linha.definidoPorId,
      atualizadoEm: linha.atualizadoEm,
    },
  };
}

export async function historicoDaMeta(
  db: Cliente,
  params: { competencia?: string; limite?: number } = {},
) {
  return db.metaDeReceitaHistorico.findMany({
    where: params.competencia ? { competencia: params.competencia } : undefined,
    orderBy: { alteradoEm: "desc" },
    take: params.limite ?? 20,
  });
}

/** As metas já cadastradas, do mês mais novo para o mais velho. */
export async function metasCadastradas(db: Cliente, limite = 24) {
  return db.metaDeReceitaMensal.findMany({
    orderBy: { competencia: "desc" },
    take: limite,
  });
}
