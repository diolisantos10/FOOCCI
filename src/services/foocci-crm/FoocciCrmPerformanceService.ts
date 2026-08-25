/**
 * FoocciCrmPerformanceService — quantos contatos chegaram, de onde, e quanto
 * andaram no funil.
 *
 * DUAS DECISÕES QUE MUDAM O NÚMERO E PRECISAM SER LIDAS ANTES DE MEXER:
 *
 * 1. **O funil é por COORTE DE CHEGADA.** O período filtra `createdAt` do
 *    contato, não a data da mudança de etapa. "Dos contatos que chegaram em
 *    julho, quantos fecharam?" é a pergunta que decide mídia. A outra leitura —
 *    "quantos fechamentos aconteceram em julho" — misturaria contato de março
 *    com anúncio de julho e daria crédito ao anúncio errado.
 *
 * 2. **Métrica sem período é métrica errada.** Não existe visão vitalícia aqui.
 *    O período vem do motor canônico `computePeriodRange` (meia-noite de
 *    Brasília = 03:00 UTC), o mesmo do painel — não de um cálculo próprio, que é
 *    como o projeto acabou com três réguas de período diferentes.
 *
 * E a trava de sempre: taxa só sai com amostra. Ver `MIN_LEADS_PARA_TAXA`.
 */

import { prisma } from "@/lib/prisma";
import { computePeriodRange, type Period } from "@/lib/dashboard-periods";
import {
  computeFunnel,
  montaDegrau,
  indiceEtapa,
  MIN_LEADS_PARA_TAXA,
  type FoocciLeadStage,
  type ResultadoFunil,
} from "./foocciCrmFunnel";
import { maisAvancadaAlcancada } from "./FoocciCrmService";
import { rotuloDaOrigem, canalDoContato, ROTULO_CANAL } from "./leadOrigin";

/** Um contato reduzido ao que a performance precisa. Exportado para os testes. */
export interface LeadParaPerformance {
  id: string;
  createdAt: Date;
  stage: FoocciLeadStage;
  origem: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  clickId: string | null;
  landingPath: string | null;
  referrer: string | null;
  lastContactedAt: Date | null;
  /** toStage de cada MUDANCA_ETAPA deste contato. */
  historicoToStages: Array<FoocciLeadStage | null>;
}

export interface LinhaDeOrigem {
  rotulo: string;
  canal: string;
  canalRotulo: string;
  campanha: string | null;
  chegaram: number;
  qualificados: number;
  fechados: number;
  perdidos: number;
  /** null = amostra insuficiente. A tela é obrigada a dizer isso por extenso. */
  taxaFechamento: number | null;
  explicacaoTaxa: string;
}

export interface PerformanceFoocciCrm {
  periodo: {
    chave: Period;
    rotulo: string;
    rotuloAnterior: string;
    inicio: string;
    fim: string;
    dias: number;
  };
  /** Contagens que são FATO — sempre exibíveis, mesmo com 1 contato. */
  resumo: {
    chegaram: number;
    chegaramAnterior: number;
    /** null quando não havia base anterior — variação sobre zero não é variação. */
    variacaoPercentual: number | null;
    naoAbordados: number;
    fechados: number;
    perdidos: number;
    emAndamento: number;
    baseTotal: number;
  };
  funil: ResultadoFunil;
  origens: LinhaDeOrigem[];
  minimoParaTaxa: number;
  /** Quantos contatos do período não trazem NENHUM sinal de campanha. */
  semOrigemIdentificada: number;
}

export interface PerformanceInput {
  period?: Period;
  startDate?: string | null;
  endDate?: string | null;
  now?: Date;
}

/** Teto de leitura. A base da Foocci é de prospects, não de pedidos — cabe em memória. */
const TETO_LEITURA = 5000;

export async function getPerformance(input: PerformanceInput = {}): Promise<PerformanceFoocciCrm> {
  const range = computePeriodRange(
    input.period ?? "30d",
    input.startDate ?? null,
    input.endDate ?? null,
    input.now ?? new Date(),
  );

  const [noPeriodo, chegaramAnterior, baseTotal] = await Promise.all([
    prisma.siteLead.findMany({
      where: { createdAt: { gte: range.rangeStart, lte: range.rangeEnd } },
      orderBy: { createdAt: "desc" },
      take: TETO_LEITURA,
      include: {
        interactions: {
          where: { tipo: "MUDANCA_ETAPA" },
          select: { toStage: true },
        },
      },
    }),
    prisma.siteLead.count({
      where: { createdAt: { gte: range.prevStart, lte: range.prevEnd } },
    }),
    prisma.siteLead.count(),
  ]);

  const leads: LeadParaPerformance[] = noPeriodo.map((l) => ({
    id: l.id,
    createdAt: l.createdAt,
    stage: l.stage as FoocciLeadStage,
    origem: l.origem,
    utmSource: l.utmSource,
    utmMedium: l.utmMedium,
    utmCampaign: l.utmCampaign,
    utmContent: l.utmContent,
    utmTerm: l.utmTerm,
    clickId: l.clickId,
    landingPath: l.landingPath,
    referrer: l.referrer,
    lastContactedAt: l.lastContactedAt,
    historicoToStages: l.interactions.map((i) => i.toStage as FoocciLeadStage | null),
  }));

  return montaPerformance(leads, {
    chave: range.period,
    rotulo: range.label,
    rotuloAnterior: range.prevLabel,
    inicio: range.rangeStart.toISOString(),
    fim: range.rangeEnd.toISOString(),
    dias: range.days,
  }, chegaramAnterior, baseTotal);
}

/**
 * A parte pura — separada de propósito para os testes provarem a trava de
 * amostra sem precisar de banco.
 */
export function montaPerformance(
  leads: LeadParaPerformance[],
  periodo: PerformanceFoocciCrm["periodo"],
  chegaramAnterior: number,
  baseTotal: number,
): PerformanceFoocciCrm {
  const funil = computeFunnel(
    leads.map((l) => ({
      atual: l.stage,
      maisAvancada: maisAvancadaAlcancada(l.stage, l.historicoToStages),
    })),
  );

  const chegaram = leads.length;
  const fechados = leads.filter((l) => l.stage === "GANHO").length;
  const perdidos = leads.filter((l) => l.stage === "PERDIDO").length;
  const naoAbordados = leads.filter((l) => l.lastContactedAt === null).length;

  // Variação sobre uma base zero não é "+100%", é "não havia com o que comparar".
  const variacaoPercentual =
    chegaramAnterior > 0 ? (chegaram - chegaramAnterior) / chegaramAnterior : null;

  // ── Agrupamento por origem ─────────────────────────────────────────────────
  const porRotulo = new Map<string, LeadParaPerformance[]>();
  for (const l of leads) {
    const rotulo = rotuloDaOrigem(l);
    const lista = porRotulo.get(rotulo);
    if (lista) lista.push(l);
    else porRotulo.set(rotulo, [l]);
  }

  const origens: LinhaDeOrigem[] = [...porRotulo.entries()]
    .map(([rotulo, grupo]) => {
      const primeiro = grupo[0]!;
      const canal = canalDoContato(primeiro);
      const gFechados = grupo.filter((l) => l.stage === "GANHO").length;
      const gPerdidos = grupo.filter((l) => l.stage === "PERDIDO").length;
      // "Chegou pelo menos a QUALIFICADO" — medido por POSIÇÃO na régua, não por
      // uma lista de etapas escrita à mão. A lista antiga citava três etapas; o
      // funil passou a ter nove, e ela teria continuado somando só as três
      // antigas, calada, subnotificando toda origem que fecha bem.
      const minimo = indiceEtapa("QUALIFICADO");
      const gQualificados = grupo.filter((l) => {
        const topo = maisAvancadaAlcancada(l.stage, l.historicoToStages);
        const i = indiceEtapa(topo);
        return i >= 0 && i >= minimo;
      }).length;

      // MESMA trava do funil: sem amostra, sem taxa. Uma origem com 2 contatos e
      // 1 fechamento não vale "50% de conversão" numa decisão de orçamento.
      const degrau = montaDegrau("NOVO", "GANHO", grupo.length, gFechados);

      return {
        rotulo,
        canal,
        canalRotulo: ROTULO_CANAL[canal] ?? canal,
        campanha: primeiro.utmCampaign,
        chegaram: grupo.length,
        qualificados: gQualificados,
        fechados: gFechados,
        perdidos: gPerdidos,
        taxaFechamento: degrau.taxa,
        explicacaoTaxa: degrau.explicacao,
      };
    })
    .sort((a, b) => b.chegaram - a.chegaram || a.rotulo.localeCompare(b.rotulo));

  const semOrigemIdentificada = leads.filter(
    (l) => !l.utmSource && !l.utmCampaign && !l.clickId && !l.referrer,
  ).length;

  return {
    periodo,
    resumo: {
      chegaram,
      chegaramAnterior,
      variacaoPercentual,
      naoAbordados,
      fechados,
      perdidos,
      emAndamento: chegaram - fechados - perdidos,
      baseTotal,
    },
    funil,
    origens,
    minimoParaTaxa: MIN_LEADS_PARA_TAXA,
    semOrigemIdentificada,
  };
}
