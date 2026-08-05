/**
 * BrainShadowEvidenceService — a evidência que sustenta a escada do free-form.
 *
 * Cada raciocínio em sombra é persistido (nunca enviado) e agregado em
 * estatísticas que os gates de promoção usam: quantas amostras, taxa de
 * coerência PASS, confiança média, taxa de escalada. É o que transforma
 * "acho que o Brain está pronto" em número auditável. Best-effort: falha de
 * escrita nunca afeta o atendimento.
 */

import { prisma } from "@/lib/prisma";

/**
 * DE ONDE a amostra veio. Existe porque a evidência da escada passou a ter mais
 * de uma fonte e somar tudo num contador só faz "100 amostras" significar coisas
 * diferentes conforme a semana.
 *
 *  • PRODUCTION — houve atendimento/disparo REAL do outro lado. Alguém recebeu
 *    a mensagem que a sombra acompanhou.
 *  • REPLAY — conversa real, reprocessada depois. A pergunta é de gente de
 *    verdade; a resposta não chegou a ninguém.
 *  • TRAINING — caso de esteira. Perfil derivado de dado real, destinatário
 *    SINTÉTICO. Ninguém do lado de lá, por construção.
 */
export type ShadowSampleOrigin = "PRODUCTION" | "REPLAY" | "TRAINING";

/** Balde das linhas gravadas antes do campo existir: origem indeterminável. */
export const SHADOW_ORIGIN_UNKNOWN = "UNKNOWN" as const;
export type ShadowOriginBucket = ShadowSampleOrigin | typeof SHADOW_ORIGIN_UNKNOWN;

export interface ShadowOutcomeRecord {
  restaurantId: string;
  conversationId: string;
  /** Agente que raciocinou em sombra. Omitido = recepcionista (whatsapp). */
  agentId?: string;
  /**
   * OBRIGATÓRIO de propósito. Um default silencioso aqui carimbaria simulação
   * como vida real — que é exatamente o erro que este campo veio impedir. Quem
   * grava evidência declara de onde ela veio.
   */
  sampleOrigin: ShadowSampleOrigin;
  intent: string;
  reasoningMode: string;
  engine: string;
  confidence: number;
  coherence: string;
  wouldEscalate: boolean;
  wouldReply: string;
}

export interface ShadowOriginBreakdown {
  samples: number;
  llmSamples: number;
  coherencePass: number;
}

export interface ShadowStats {
  samples: number;
  llmSamples: number;
  coherencePassRate: number; // sobre amostras LLM
  avgConfidence: number; // sobre amostras LLM
  escalationRate: number;
  sinceDays: number;
  /** Origens que ESTA leitura contou. `null` = todas (nenhum filtro aplicado). */
  originsCounted: ShadowSampleOrigin[] | null;
  /** Composição da amostra, sempre — para o relatório poder dizer quanto é simulação. */
  byOrigin: Record<ShadowOriginBucket, ShadowOriginBreakdown>;
}

function emptyBreakdown(): Record<ShadowOriginBucket, ShadowOriginBreakdown> {
  return {
    PRODUCTION: { samples: 0, llmSamples: 0, coherencePass: 0 },
    REPLAY: { samples: 0, llmSamples: 0, coherencePass: 0 },
    TRAINING: { samples: 0, llmSamples: 0, coherencePass: 0 },
    UNKNOWN: { samples: 0, llmSamples: 0, coherencePass: 0 },
  };
}

const REPLY_SAMPLE_CHARS = 200;

export async function recordShadowOutcome(record: ShadowOutcomeRecord): Promise<void> {
  try {
    await prisma.brainShadowLog.create({
      data: {
        ...record,
        agentId: record.agentId ?? "whatsapp",
        wouldReply: record.wouldReply.slice(0, REPLY_SAMPLE_CHARS),
      },
    });
  } catch (err) {
    // Evidência é best-effort — nunca quebra o atendimento.
    console.error("[BrainShadow] persist failed:", err instanceof Error ? err.message : err);
  }
}

export async function getShadowStats(
  restaurantId: string,
  opts: { agentId?: string; sinceDays?: number; origins?: readonly ShadowSampleOrigin[] } = {},
): Promise<ShadowStats> {
  const sinceDays = opts.sinceDays ?? 7;
  const originsCounted = opts.origins && opts.origins.length ? [...opts.origins] : null;
  const empty: ShadowStats = {
    samples: 0, llmSamples: 0, coherencePassRate: 0, avgConfidence: 0, escalationRate: 0, sinceDays,
    originsCounted, byOrigin: emptyBreakdown(),
  };
  try {
    const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
    // Escada por-agente: cada agente lê SÓ a própria evidência. Para o
    // recepcionista ("whatsapp"), casa também as linhas antigas (agentId nulo).
    const agentFilter = opts.agentId
      ? opts.agentId === "whatsapp"
        ? { OR: [{ agentId: "whatsapp" }, { agentId: null }] }
        : { agentId: opts.agentId }
      : {};
    // Filtro de origem: `{ in: [...] }` NÃO casa NULL — e é exatamente o que se
    // quer. Linha de origem desconhecida nunca entra num degrau que pede uma
    // origem específica.
    const originFilter = originsCounted ? { sampleOrigin: { in: originsCounted } } : {};
    const rows = await prisma.brainShadowLog.findMany({
      where: { restaurantId, createdAt: { gte: since }, ...agentFilter, ...originFilter },
      select: { reasoningMode: true, coherence: true, confidence: true, wouldEscalate: true, sampleOrigin: true },
    });
    if (!rows.length) return empty;

    const byOrigin = emptyBreakdown();
    for (const r of rows) {
      const bucket: ShadowOriginBucket =
        r.sampleOrigin === "PRODUCTION" || r.sampleOrigin === "REPLAY" || r.sampleOrigin === "TRAINING"
          ? r.sampleOrigin
          : SHADOW_ORIGIN_UNKNOWN;
      byOrigin[bucket].samples += 1;
      if (r.reasoningMode === "LLM") {
        byOrigin[bucket].llmSamples += 1;
        if (r.coherence === "PASS") byOrigin[bucket].coherencePass += 1;
      }
    }

    const llm = rows.filter((r) => r.reasoningMode === "LLM");
    const pass = llm.filter((r) => r.coherence === "PASS").length;
    const escalations = rows.filter((r) => r.wouldEscalate).length;
    return {
      samples: rows.length,
      llmSamples: llm.length,
      coherencePassRate: llm.length ? pass / llm.length : 0,
      avgConfidence: llm.length ? llm.reduce((s, r) => s + r.confidence, 0) / llm.length : 0,
      escalationRate: rows.length ? escalations / rows.length : 0,
      sinceDays,
      originsCounted,
      byOrigin,
    };
  } catch {
    return empty;
  }
}

/** Últimas amostras para inspeção humana no painel (nunca contém PII crua). */
export async function listRecentShadowSamples(restaurantId: string, limit = 10) {
  try {
    return await prisma.brainShadowLog.findMany({
      where: { restaurantId },
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(1, limit), 50),
      select: {
        createdAt: true, intent: true, reasoningMode: true, engine: true,
        confidence: true, coherence: true, wouldEscalate: true, wouldReply: true,
      },
    });
  } catch {
    return [];
  }
}
