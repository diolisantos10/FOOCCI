/**
 * O REVENUE SUPERVISOR — a quarta IA, a que fica ACIMA de Hunter, SDR, Vendas e CRM.
 *
 * Este arquivo não calcula quase nada: ele JUNTA. O funil de receita mora em
 * `funilDeReceita.ts`, a eficiência com SLA e o índice de saúde em
 * `eficiencia.ts`, o diagnóstico causal em `diagnostico.ts`, e as filas do agora
 * continuam vindo de `painel.ts`, intocadas. A tela pede uma coisa só, e é esta.
 *
 * ── AS AÇÕES RECOMENDADAS NÃO SÃO CONSELHO GENÉRICO ─────────────────────────
 *
 * Toda ação desta lista nasce de um número: ou da sonda do diagnóstico, ou de
 * uma etapa cuja gravidade foi MEDIDA. Etapa cega não gera ação — gera um aviso
 * de que ela está cega, que é outra coisa e exige outra providência.
 */

import type { PrismaClient } from "@prisma/client";
import { filasDoAgora, receitaGanha, type FilasDoAgora, type Receita } from "./painel";
import { funilDeReceita, type FunilDeReceita, type Periodo } from "./funilDeReceita";
import {
  eficienciaPorEtapa,
  indiceDeSaude,
  ROTULO_OPERACIONAL,
  type EficienciaDaOperacao,
  type IndiceDeSaude,
} from "./eficiencia";
import { diagnosticar, type ResultadoDoDiagnostico } from "./diagnostico";

type Banco = PrismaClient;

export interface AcaoRecomendada {
  /** De onde a recomendação veio: o diagnóstico, ou um gargalo medido. */
  origem: "diagnostico" | "gargalo";
  texto: string;
  /** A frase numérica que a sustenta. Nunca vazia. */
  porque: string;
}

export interface VisaoDoSupervisor {
  periodo: Periodo;
  funil: FunilDeReceita;
  eficiencia: EficienciaDaOperacao;
  saude: IndiceDeSaude;
  diagnostico: ResultadoDoDiagnostico;
  acoes: AcaoRecomendada[];
  agora: FilasDoAgora;
  receita: Receita;
  /** Etapas sem medição nenhuma — cegueira declarada, não saúde. */
  cegas: string[];
}

/** Quanto da fila ativa está em atraso, para a parcela "fila em dia" da saúde. */
async function fila(db: Banco, agora: FilasDoAgora): Promise<{ ativos: number; emAtraso: number } | null> {
  const ativos = await db.siteLead.count({
    where: { stage: { notIn: ["GANHO", "PERDIDO", "NUTRICAO"] } },
  });
  if (ativos === 0) return null;
  return {
    ativos,
    emAtraso: Math.min(ativos, agora.slaEstourado + agora.followUpVencido + agora.semResponsavel),
  };
}

/** Quantos clientes ganhos no período chegaram a ativar. */
async function ativacao(db: Banco, p: Periodo): Promise<{ ganhos: number; ativados: number } | null> {
  const janela = { gte: p.de, lt: p.ate };
  const [ganhos, ativados] = await Promise.all([
    db.cliente.count({ where: { ganhoEm: janela } }),
    db.cliente.count({ where: { ganhoEm: janela, ativadoEm: { not: null } } }),
  ]);
  if (ganhos === 0) return null;
  return { ganhos, ativados };
}

export function montarAcoes(
  diagnostico: ResultadoDoDiagnostico,
  eficiencia: EficienciaDaOperacao,
): AcaoRecomendada[] {
  const acoes: AcaoRecomendada[] = [];

  if (diagnostico.medido && diagnostico.acaoRecomendada) {
    acoes.push({
      origem: "diagnostico",
      texto: diagnostico.acaoRecomendada,
      porque: diagnostico.causaProvavel,
    });
  }

  for (const etapa of eficiencia.gargalos.slice(0, 3)) {
    if (!etapa.gravidade.medido) continue;
    const pior = [...etapa.gravidade.parcelas].sort((a, b) => b.nota - a.nota)[0];
    if (!pior || pior.nota === 0) continue;
    acoes.push({
      origem: "gargalo",
      texto: `atacar o gargalo em ${ROTULO_OPERACIONAL[etapa.etapa]}: ${pior.fator}`,
      porque: pior.evidencia,
    });
  }

  // Duas origens podem apontar o mesmo conserto; o supervisor não repete ordem.
  const vistos = new Set<string>();
  return acoes.filter((a) => (vistos.has(a.texto) ? false : (vistos.add(a.texto), true)));
}

export async function visaoDoSupervisor(
  db: Banco,
  params: Periodo & { agora?: Date; foco?: Parameters<typeof diagnosticar>[1]["foco"] },
): Promise<VisaoDoSupervisor> {
  const p: Periodo = { de: params.de, ate: params.ate };
  const relogio = params.agora ?? new Date();

  const funil = await funilDeReceita(db, p);

  const [eficiencia, diagnostico, agora, receita, clientes] = await Promise.all([
    eficienciaPorEtapa(db, p, funil),
    diagnosticar(db, { ...p, foco: params.foco, funil }),
    filasDoAgora(db, relogio),
    receitaGanha(db, p),
    ativacao(db, p),
  ]);

  const saude = indiceDeSaude({
    funil,
    eficiencia,
    fila: await fila(db, agora),
    ativacao: clientes,
  });

  return {
    periodo: p,
    funil,
    eficiencia,
    saude,
    diagnostico,
    acoes: montarAcoes(diagnostico, eficiencia),
    agora,
    receita,
    cegas: eficiencia.cegas.map((e) => ROTULO_OPERACIONAL[e]),
  };
}
