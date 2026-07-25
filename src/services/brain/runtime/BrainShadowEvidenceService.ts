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

export interface ShadowOutcomeRecord {
  restaurantId: string;
  conversationId: string;
  /** Agente que raciocinou em sombra. Omitido = recepcionista (whatsapp). */
  agentId?: string;
  intent: string;
  reasoningMode: string;
  engine: string;
  confidence: number;
  coherence: string;
  wouldEscalate: boolean;
  wouldReply: string;
}

export interface ShadowStats {
  samples: number;
  llmSamples: number;
  coherencePassRate: number; // sobre amostras LLM
  avgConfidence: number; // sobre amostras LLM
  escalationRate: number;
  sinceDays: number;
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
  opts: { agentId?: string; sinceDays?: number } = {},
): Promise<ShadowStats> {
  const sinceDays = opts.sinceDays ?? 7;
  const empty: ShadowStats = { samples: 0, llmSamples: 0, coherencePassRate: 0, avgConfidence: 0, escalationRate: 0, sinceDays };
  try {
    const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
    // Escada por-agente: cada agente lê SÓ a própria evidência. Para o
    // recepcionista ("whatsapp"), casa também as linhas antigas (agentId nulo).
    const agentFilter = opts.agentId
      ? opts.agentId === "whatsapp"
        ? { OR: [{ agentId: "whatsapp" }, { agentId: null }] }
        : { agentId: opts.agentId }
      : {};
    const rows = await prisma.brainShadowLog.findMany({
      where: { restaurantId, createdAt: { gte: since }, ...agentFilter },
      select: { reasoningMode: true, coherence: true, confidence: true, wouldEscalate: true },
    });
    if (!rows.length) return empty;

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
