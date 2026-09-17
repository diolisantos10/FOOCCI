/**
 * O FUNIL DE RECEITA DE PONTA A PONTA — o topo que só passou a existir com o B1.
 *
 * ── O QUE ESTE ARQUIVO ACRESCENTA AO QUE JÁ HAVIA ───────────────────────────
 *
 * `painel.ts` já contava o funil DO LEAD (`conversaoDoPeriodo`) e já tinha a
 * doutrina de honestidade (`taxa`, `MINIMO_PARA_TAXA`, `{medido:false,motivo}`).
 * Nada disso é reescrito aqui: este arquivo IMPORTA aquela régua e a estende
 * para as sete etapas que o projeto pede e que o banco só passou a suportar
 * quando `Empresa`, `Contato`, `Oportunidade` e `Cliente` nasceram:
 *
 *   Empresas encontradas → Prospects válidos → Prontas para SDR →
 *   Decisores encontrados → Oportunidades → Vendas → Clientes ativos
 *
 * ── A REGRA QUE GOVERNA TODO NÚMERO DAQUI ───────────────────────────────────
 *
 * **Número não medido aparece como não medido — nunca zero.** E aqui isso exige
 * uma distinção que o painel do lead não precisava fazer, porque lá sempre houve
 * leads: uma etapa pode devolver zero por dois motivos opostos.
 *
 *   1. A máquina rodou e não produziu nada no período → zero MEDIDO. É notícia
 *      ruim, e o supervisor precisa vê-la em vermelho.
 *   2. A máquina daquela etapa nunca rodou — a tabela está vazia desde sempre →
 *      **não medido**. Pintar isso de zero mandaria o time caçar uma queda que
 *      nunca existiu, e esconderia o defeito real: a etapa não está ligada.
 *
 * `volumeDeEtapa` distingue as duas com uma segunda contagem, sem recorte de
 * data. É uma consulta a mais por etapa e ela paga o preço: zero inventado some
 * do radar, e o que some do radar ninguém conserta.
 *
 * ── E A TENDÊNCIA ───────────────────────────────────────────────────────────
 *
 * Toda etapa é medida duas vezes: no período pedido e na JANELA ANTERIOR DE
 * MESMO TAMANHO. Sem isso não existe "caiu" — existe só "está baixo", que é
 * outra afirmação e não sustenta diagnóstico nenhum.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import { taxa, type Taxa } from "./painel";

type Banco = PrismaClient | Prisma.TransactionClient;

export interface Periodo {
  de: Date;
  ate: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Volume: um número, ou a recusa honesta de dar um número
// ─────────────────────────────────────────────────────────────────────────────

export type Volume =
  | { medido: true; total: number }
  /** A tabela desta etapa está vazia desde sempre: a etapa não está ligada. */
  | { medido: false; motivo: "semFonte" };

/** Açúcar para quem lê: o total, ou `null` quando não há total a dar. */
export function totalDe(v: Volume): number | null {
  return v.medido ? v.total : null;
}

/**
 * Conta no período e, se der zero, pergunta de novo SEM recorte de data.
 *
 * A segunda pergunta é a que separa "não vendemos nada esta semana" de "nunca
 * houve venda nenhuma neste sistema". As duas escrevem `0` numa consulta só.
 */
async function volumeDeEtapa(
  contarNoPeriodo: () => Promise<number>,
  contarSempre: () => Promise<number>,
): Promise<Volume> {
  const noPeriodo = await contarNoPeriodo();
  if (noPeriodo > 0) return { medido: true, total: noPeriodo };

  const sempre = await contarSempre();
  if (sempre === 0) return { medido: false, motivo: "semFonte" };
  return { medido: true, total: 0 };
}

// ─────────────────────────────────────────────────────────────────────────────
// As sete etapas
// ─────────────────────────────────────────────────────────────────────────────

export const ETAPAS_DA_RECEITA = [
  "EMPRESAS_ENCONTRADAS",
  "PROSPECTS_VALIDOS",
  "PRONTAS_PARA_SDR",
  "DECISORES_ENCONTRADOS",
  "OPORTUNIDADES",
  "VENDAS",
  "CLIENTES_ATIVOS",
] as const;

export type EtapaDaReceita = (typeof ETAPAS_DA_RECEITA)[number];

export const ROTULO_DA_ETAPA: Record<EtapaDaReceita, string> = {
  EMPRESAS_ENCONTRADAS: "Empresas encontradas",
  PROSPECTS_VALIDOS: "Prospects válidos",
  PRONTAS_PARA_SDR: "Prontas para SDR",
  DECISORES_ENCONTRADOS: "Decisores encontrados",
  OPORTUNIDADES: "Oportunidades",
  VENDAS: "Vendas",
  CLIENTES_ATIVOS: "Clientes ativos",
};

export const COMO_SE_MEDE: Record<EtapaDaReceita, string> = {
  EMPRESAS_ENCONTRADAS: "empresas descobertas no período",
  PROSPECTS_VALIDOS: "das descobertas, as que não foram descartadas",
  PRONTAS_PARA_SDR: "empresas que a trilha registra chegando a PRONTA_PARA_SDR no período",
  DECISORES_ENCONTRADOS: "empresas que ganharam ao menos um contato decisor no período",
  OPORTUNIDADES: "oportunidades abertas no período",
  VENDAS: "oportunidades fechadas como GANHA no período",
  CLIENTES_ATIVOS: "clientes em situação ATIVO agora — é retrato, não fluxo",
};

/**
 * ⚠️ A última etapa é RETRATO, não fluxo.
 *
 * "Clientes ativos" responde quantos estão ativos AGORA, e não quantos ficaram
 * ativos dentro da janela. Misturar as duas contas num gráfico só é o erro que
 * faz a conversão do fim do funil crescer em mês parado. Fica declarado aqui e
 * a tela repete a ressalva.
 */
export const ETAPAS_DE_RETRATO: readonly EtapaDaReceita[] = ["CLIENTES_ATIVOS"];

export interface DegrauDaReceita {
  etapa: EtapaDaReceita;
  rotulo: string;
  comoSeMede: string;
  /** Retrato do agora, e não fluxo do período. */
  ehRetrato: boolean;
  volume: Volume;
  /** O mesmo volume, na janela anterior de igual tamanho. */
  volumeAnterior: Volume;
  /** Conversão desde a etapa imediatamente acima. A primeira etapa não tem. */
  conversao: Taxa | null;
  conversaoAnterior: Taxa | null;
  /** Variação do volume contra a janela anterior, em fração (-0,18 = −18%). */
  tendencia: Tendencia;
}

export type Tendencia =
  | { medido: true; variacao: number; de: number; para: number }
  /** Não dá para comparar: faltou número de um dos dois lados. */
  | { medido: false; motivo: "semComparacao" }
  /** A janela anterior teve zero: crescer a partir de zero não tem percentual. */
  | { medido: false; motivo: "baseZero"; para: number };

export function tendencia(anterior: Volume, atual: Volume): Tendencia {
  if (!anterior.medido || !atual.medido) return { medido: false, motivo: "semComparacao" };
  if (anterior.total === 0) return { medido: false, motivo: "baseZero", para: atual.total };
  return {
    medido: true,
    variacao: (atual.total - anterior.total) / anterior.total,
    de: anterior.total,
    para: atual.total,
  };
}

/** A conversão de um degrau para o seguinte, respeitando a amostra mínima. */
function conversaoEntre(acima: Volume, abaixo: Volume): Taxa | null {
  if (!acima.medido || !abaixo.medido) return null;
  return taxa(abaixo.total, acima.total);
}

/** A janela anterior, do mesmo tamanho, imediatamente colada. */
export function janelaAnterior(p: Periodo): Periodo {
  const duracao = p.ate.getTime() - p.de.getTime();
  return { de: new Date(p.de.getTime() - duracao), ate: new Date(p.de) };
}

// ─────────────────────────────────────────────────────────────────────────────
// A leitura do banco, etapa a etapa
// ─────────────────────────────────────────────────────────────────────────────

/** Quantas EMPRESAS distintas a trilha registra chegando a um estágio. */
async function empresasDistintas(
  db: Banco,
  filtro: { paraEstagio: string; criadoEm?: { gte: Date; lt: Date } },
): Promise<number> {
  const linhas = await db.eventoDaJornada.groupBy({
    by: ["empresaId"],
    where: {
      entidade: "EMPRESA",
      tipo: "MUDANCA_DE_ESTAGIO",
      paraEstagio: filtro.paraEstagio,
      empresaId: { not: null },
      ...(filtro.criadoEm ? { criadoEm: filtro.criadoEm } : {}),
    },
  });
  return linhas.length;
}

/** Quantas EMPRESAS distintas ganharam ao menos um contato decisor. */
async function empresasComDecisor(
  db: Banco,
  janela: { gte: Date; lt: Date } | null,
): Promise<number> {
  const linhas = await db.contato.groupBy({
    by: ["empresaId"],
    where: { ehDecisor: true, ...(janela ? { criadoEm: janela } : {}) },
  });
  return linhas.length;
}

/** Os volumes das sete etapas numa janela. Cada uma sabe dizer "não medido". */
export async function volumesDaJanela(db: Banco, p: Periodo): Promise<Record<EtapaDaReceita, Volume>> {
  const janela = { gte: p.de, lt: p.ate };

  const [encontradas, validos, prontas, decisores, oportunidades, vendas, ativos] = await Promise.all([
    volumeDeEtapa(
      () => db.empresa.count({ where: { descobertaEm: janela } }),
      () => db.empresa.count({}),
    ),
    volumeDeEtapa(
      () => db.empresa.count({ where: { descobertaEm: janela, estagio: { not: "DESCARTADA" } } }),
      () => db.empresa.count({}),
    ),
    // Pela TRILHA, e não pelo estágio atual: o campo diz onde a empresa está
    // hoje; só a trilha diz que ela PASSOU por aqui dentro da janela. Contar
    // pelo campo faria uma empresa que avançou até QUALIFICADA sumir da etapa
    // que ela cumpriu.
    volumeDeEtapa(
      () => empresasDistintas(db, { paraEstagio: "PRONTA_PARA_SDR", criadoEm: janela }),
      () => empresasDistintas(db, { paraEstagio: "PRONTA_PARA_SDR" }),
    ),
    // Empresas, e não contatos: o funil conta CASAS que ganharam porta de
    // entrada. Somar dois decisores da mesma empresa daria conversão acima de
    // 100% no degrau de cima.
    volumeDeEtapa(
      () => empresasComDecisor(db, janela),
      () => empresasComDecisor(db, null),
    ),
    volumeDeEtapa(
      () => db.oportunidade.count({ where: { criadoEm: janela } }),
      () => db.oportunidade.count({}),
    ),
    volumeDeEtapa(
      () => db.oportunidade.count({ where: { estagio: "GANHA", fechadaEm: janela } }),
      () => db.oportunidade.count({ where: { estagio: "GANHA" } }),
    ),
    // Retrato: não leva recorte de data, de propósito. A janela anterior devolve
    // o mesmo número, e por isso a tendência de "clientes ativos" nasce 0% —
    // o campo `ehRetrato` é o que impede a tela de ler isso como estabilidade.
    volumeDeEtapa(
      () => db.cliente.count({ where: { situacao: "ATIVO" } }),
      () => db.cliente.count({}),
    ),
  ]);

  return {
    EMPRESAS_ENCONTRADAS: encontradas,
    PROSPECTS_VALIDOS: validos,
    PRONTAS_PARA_SDR: prontas,
    DECISORES_ENCONTRADOS: decisores,
    OPORTUNIDADES: oportunidades,
    VENDAS: vendas,
    CLIENTES_ATIVOS: ativos,
  };
}

export interface FunilDeReceita {
  degraus: DegrauDaReceita[];
  /** Da primeira etapa medida até Vendas. */
  pontaAPonta: Taxa | null;
  periodo: Periodo;
  periodoAnterior: Periodo;
}

export async function funilDeReceita(db: Banco, p: Periodo): Promise<FunilDeReceita> {
  const anterior = janelaAnterior(p);
  const [atuais, passados] = await Promise.all([
    volumesDaJanela(db, p),
    volumesDaJanela(db, anterior),
  ]);

  const degraus: DegrauDaReceita[] = ETAPAS_DA_RECEITA.map((etapa, i) => {
    const acima = i === 0 ? null : ETAPAS_DA_RECEITA[i - 1];
    return {
      etapa,
      rotulo: ROTULO_DA_ETAPA[etapa],
      comoSeMede: COMO_SE_MEDE[etapa],
      ehRetrato: ETAPAS_DE_RETRATO.includes(etapa),
      volume: atuais[etapa],
      volumeAnterior: passados[etapa],
      conversao: acima ? conversaoEntre(atuais[acima], atuais[etapa]) : null,
      conversaoAnterior: acima ? conversaoEntre(passados[acima], passados[etapa]) : null,
      tendencia: tendencia(passados[etapa], atuais[etapa]),
    };
  });

  const topo = atuais.EMPRESAS_ENCONTRADAS;
  const vendas = atuais.VENDAS;

  return {
    degraus,
    pontaAPonta: conversaoEntre(topo, vendas),
    periodo: p,
    periodoAnterior: anterior,
  };
}
