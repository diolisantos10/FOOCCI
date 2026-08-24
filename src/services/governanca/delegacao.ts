/**
 * DELEGAÇÃO — a ordem descendo a hierarquia.
 *
 * O documento 01 da v3 fez uma promessa que este arquivo cumpre:
 *
 *   "A regra vira número, e o número aparece. Um pulo é exceção; trinta pulos
 *    por mês é uma estrutura que não está funcionando."
 *
 * ── POR QUE NÃO BLOQUEAMOS O DIRETOR ──
 *
 * A regra 7 diz que o Diretor não deve operar delegando direto aos agentes. É um
 * hábito, e hábito não se implementa com `if`.
 *
 * Bloquear seria errado, e a razão é prática: numa urgência o Diretor PRECISA
 * falar direto com quem executa. Um sistema que impede isso é contornado no
 * primeiro incidente — por WhatsApp, fora do registro — e aí a empresa perde a
 * trilha inteira em vez de perder uma regra.
 *
 * O que não pode é o atalho virar rotina sem ninguém perceber. Então a delegação
 * é registrada com o caminho, e o caminho é contado.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

type Cliente = PrismaClient | Prisma.TransactionClient;

export interface NovaDelegacao {
  dePositionId: string;
  paraPositionId: string;
  departmentId?: string | null;
  objetivo: string;
  criterioDeAceite?: string | null;
  prazo?: Date | null;
  workOrderId?: string | null;
  taskId?: string | null;
  criadoPorId?: string | null;
}

export interface RecusaDeDelegacao {
  campo: string;
  motivo: string;
}

export function validarDelegacao(nova: NovaDelegacao): RecusaDeDelegacao[] {
  const recusas: RecusaDeDelegacao[] = [];

  if (!nova.objetivo?.trim()) {
    recusas.push({ campo: "objetivo", motivo: "sem objetivo não dá para saber o que se está pedindo" });
  }

  if (!nova.dePositionId || !nova.paraPositionId) {
    recusas.push({ campo: "cargos", motivo: "delegação precisa de quem manda e de quem recebe" });
  }

  if (nova.dePositionId && nova.dePositionId === nova.paraPositionId) {
    // Delegar para si mesmo não é delegação — é anotar uma tarefa. E poluiria o
    // indicador de pulo com linhas que não descrevem comando nenhum.
    recusas.push({ campo: "cargos", motivo: "ninguém delega para si mesmo" });
  }

  return recusas;
}

/**
 * A ordem pulou o Agente Gerente?
 *
 * Pula quando quem delega está ACIMA do gerente (Diretor ou CEO) e quem recebe
 * está ABAixo dele — ou seja, o gerente do departamento ficou de fora do caminho.
 *
 * Função pura, e recebe os níveis prontos: assim ela é exercitável sem banco e
 * sem organograma montado.
 */
export function pulouOGerente(params: {
  nivelDeQuemDelega: string;
  nivelDeQuemRecebe: string;
}): boolean {
  const acimaDoGerente = params.nivelDeQuemDelega === "CEO" || params.nivelDeQuemDelega === "DIRETOR";
  const abaixoDoGerente = params.nivelDeQuemRecebe === "OPERACAO";
  return acimaDoGerente && abaixoDoGerente;
}

export type ResultadoDeDelegar =
  | { ok: true; delegacaoId: string; pulouGerente: boolean }
  | { ok: false; recusas: RecusaDeDelegacao[] };

/**
 * Registra a delegação.
 *
 * `pulouGerente` é calculado aqui e GRAVADO, não deduzido na leitura. O
 * organograma muda — alguém vira gerente, um cargo é criado — e um relatório de
 * junho precisa dizer o que era verdade em junho, não o que seria verdade hoje.
 */
export async function delegar(
  db: Cliente,
  nova: NovaDelegacao,
): Promise<ResultadoDeDelegar> {
  const recusas = validarDelegacao(nova);
  if (recusas.length) return { ok: false, recusas };

  const [de, para] = await Promise.all([
    db.position.findUnique({ where: { id: nova.dePositionId }, select: { nivel: true } }),
    db.position.findUnique({ where: { id: nova.paraPositionId }, select: { nivel: true, departmentId: true } }),
  ]);

  if (!de || !para) {
    return {
      ok: false,
      recusas: [{ campo: "cargos", motivo: "cargo de origem ou de destino não existe" }],
    };
  }

  const pulou = pulouOGerente({ nivelDeQuemDelega: de.nivel, nivelDeQuemRecebe: para.nivel });

  const criada = await db.delegacao.create({
    data: {
      dePositionId: nova.dePositionId,
      paraPositionId: nova.paraPositionId,
      // Quando não vier explícito, o departamento é o de quem recebe: é lá que o
      // trabalho vai acontecer.
      departmentId: nova.departmentId ?? para.departmentId ?? null,
      objetivo: nova.objetivo.trim(),
      criterioDeAceite: nova.criterioDeAceite ?? null,
      prazo: nova.prazo ?? null,
      workOrderId: nova.workOrderId ?? null,
      taskId: nova.taskId ?? null,
      criadoPorId: nova.criadoPorId ?? null,
      pulouGerente: pulou,
    },
  });

  return { ok: true, delegacaoId: criada.id, pulouGerente: pulou };
}

// ── O indicador ───────────────────────────────────────────────────────────────

export interface CaminhoDoComando {
  total: number;
  pularamOGerente: number;
  /** Proporção de 0 a 1. `null` quando não houve delegação nenhuma. */
  proporcao: number | null;
  /** O que a tela deve dizer. Nunca "0%" quando não houve nada para medir. */
  leitura: "semDados" | "saudavel" | "atencao";
}

/** Acima disto, o atalho deixou de ser exceção. */
const LIMITE_DE_ATENCAO = 0.2;

/**
 * Quantas ordens pularam o Agente Gerente no período.
 *
 * Três leituras, e a primeira é a que evita a mentira: **sem delegação nenhuma
 * não é "saudável"**. Zero de zero não é zero por cento — é ausência de dado, e
 * pintar de verde afirmaria uma saúde que ninguém mediu.
 *
 * É a mesma regra do tipo `Medida` da Sala dos Agentes.
 */
export async function caminhoDoComando(
  db: Cliente,
  params: { departmentId?: string | null; de: Date; ate: Date },
): Promise<CaminhoDoComando> {
  const janela = {
    criadoEm: { gte: params.de, lte: params.ate },
    ...(params.departmentId ? { departmentId: params.departmentId } : {}),
  };

  const [total, pularam] = await Promise.all([
    db.delegacao.count({ where: janela }),
    db.delegacao.count({ where: { ...janela, pulouGerente: true } }),
  ]);

  if (total === 0) {
    return { total: 0, pularamOGerente: 0, proporcao: null, leitura: "semDados" };
  }

  const proporcao = pularam / total;
  return {
    total,
    pularamOGerente: pularam,
    proporcao,
    leitura: proporcao > LIMITE_DE_ATENCAO ? "atencao" : "saudavel",
  };
}
