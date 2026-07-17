/**
 * ExperienceVaultService — o "Cofre de Experiências".
 *
 * Lê as conversas REAIS já armazenadas (todos os agentes) e grava, no cofre
 * (restaurant_experiences), uma versão SANITIZADA (sem PII) de cada interação:
 * a pergunta do cliente, o que o agente respondeu, a intenção e tags de padrão.
 * Por restaurante + por agente — cada restaurante acumula sua própria
 * experiência, e isso vira o insumo que otimiza TODAS as IAs.
 *
 * Disciplina:
 *  • SEM PII: tudo passa por sanitizeText (telefone/nome/endereço mascarados).
 *  • Idempotente: unique (restaurantId, agentId, conversationId, sourceAt) —
 *    re-ingerir o mesmo dia não duplica.
 *  • Best-effort: um erro isolado não derruba o lote.
 *  • Nunca envia nada, nunca toca runtime.
 */

import { prisma } from "@/lib/prisma";
import { sanitizeText } from "@/services/simulation/simulationSanitizer";

const MAX_TEXT = 400;

/** Deriva o agente a partir do contexto/canal da conversa + metadata da mensagem. */
function agentFor(channel: string, metaSource?: string, contextType?: string | null): string {
  if (contextType === "CRM_CAMPAIGN" || contextType === "CRM_AUTOMATION") return "crm";
  if (metaSource === "WHATSAPP_BRAIN") return "whatsapp";
  if (channel === "WEB_AGENT" || channel === "QR_AGENT") return "waiter"; // /pedido (web ou QR na mesa)
  if (channel === "INSTAGRAM_DIRECT" || channel === "INSTAGRAM_COMMENT") return "instagram";
  if (channel === "WHATSAPP") return "receptionist";
  return "unknown";
}

const STOPWORDS = new Set([
  "para", "você", "voce", "tem", "com", "que", "uma", "não", "nao", "dos", "das",
  "por", "pra", "meu", "minha", "como", "qual", "quais", "estou", "aqui", "isso",
  "the", "and", "vocês", "voces", "tá", "está", "esta", "são", "sao",
]);

/** Palavras-chave simples do texto (padrões) — minúsculas, sem stopwords, top 6. */
function tagsFrom(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^0-9a-zà-ú\s]/gi, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w));
  return [...new Set(words)].slice(0, 6);
}

export interface IngestResult {
  scanned: number;
  created: number;
  skipped: number;
  byAgent: Record<string, number>;
}

/**
 * Ingere as experiências da janela (default: últimas 24h) no cofre.
 * Uma experiência por resposta de agente (OUTBOUND AI) + a pergunta que a disparou.
 */
export async function ingestExperiences(
  opts: { since?: Date; until?: Date; maxRecords?: number } = {},
): Promise<IngestResult> {
  const until = opts.until ?? new Date();
  const since = opts.since ?? new Date(until.getTime() - 24 * 60 * 60 * 1000);
  const max = Math.max(1, Math.min(opts.maxRecords ?? 5000, 20000));

  const agentMsgs = await prisma.message.findMany({
    where: {
      direction: "OUTBOUND",
      senderType: "AI",
      type: "TEXT",
      sentAt: { gte: since, lt: until },
      content: { not: "" },
    },
    orderBy: { sentAt: "asc" },
    take: max,
    select: {
      conversationId: true,
      content: true,
      sentAt: true,
      metadata: true,
      conversation: { select: { restaurantId: true, channel: true, contextType: true } },
    },
  });

  const result: IngestResult = { scanned: agentMsgs.length, created: 0, skipped: 0, byAgent: {} };

  for (const m of agentMsgs) {
    const restaurantId = m.conversation?.restaurantId;
    if (!restaurantId || !m.conversationId) {
      result.skipped += 1;
      continue;
    }
    const meta = (m.metadata ?? {}) as Record<string, unknown>;
    const channel = String(m.conversation?.channel ?? "WHATSAPP");
    const agentId = agentFor(channel, typeof meta.source === "string" ? meta.source : undefined, m.conversation?.contextType ?? null);
    const intent = typeof meta.brainIntent === "string" ? meta.brainIntent : null;

    // A pergunta que disparou: o último INBOUND de texto antes desta resposta.
    const trigger = await prisma.message
      .findFirst({
        where: { conversationId: m.conversationId, direction: "INBOUND", type: "TEXT", sentAt: { lt: m.sentAt } },
        orderBy: { sentAt: "desc" },
        select: { content: true },
      })
      .catch(() => null);

    const customerText = sanitizeText(trigger?.content ?? "").slice(0, MAX_TEXT);
    if (!customerText.trim()) {
      result.skipped += 1;
      continue;
    }
    const agentText = sanitizeText(m.content).slice(0, MAX_TEXT);

    try {
      await prisma.restaurantExperience.create({
        data: {
          restaurantId,
          agentId,
          channel,
          conversationId: m.conversationId,
          intent,
          outcome: "REPLIED",
          customerText,
          agentText,
          tags: tagsFrom(customerText),
          sourceAt: m.sentAt,
        },
      });
      result.created += 1;
      result.byAgent[agentId] = (result.byAgent[agentId] ?? 0) + 1;
    } catch {
      // unique (dedup) ou erro isolado — não derruba o lote.
      result.skipped += 1;
    }
  }

  return result;
}
