/**
 * AgentRoutingService
 *
 * Manages multi-agent context on WhatsApp conversations.
 * Foocci has four logical agents; all may share the same WhatsApp channel:
 *
 *   WHATSAPP_AGENT   — inbound receptionist, triage, simple Q&A, handoff
 *   CRM_AGENT        — outbound relationship: campaigns, automations, win-back
 *   WAITER_AGENT     — sales / ordering inside /pedido/[slug]
 *   ANALYTICS_AGENT  — internal commercial insights, talks to restaurant owner
 *
 * This service handles context tagging (what originated this conversation?),
 * CRM reply detection (did a customer reply to a CRM message?), and
 * responsible-agent inference from stored context.
 *
 * Design rules:
 *   - Only append metadata; never destructively alter conversation state.
 *   - Never block the webhook hot path — mark CRM replies fire-and-forget.
 *   - No AI logic here; routing is based on stored metadata only.
 */

import { prisma } from "@/lib/prisma";
import { ACTIVE_ORDER_STATUSES } from "@/services/crm/activeOrderGuard";

// ── Constants ─────────────────────────────────────────────────────────────────

export const CONTEXT_TYPE = {
  INBOUND:        "INBOUND",        // organic customer-initiated conversation
  CRM_CAMPAIGN:   "CRM_CAMPAIGN",   // originated from a manual CRM campaign
  CRM_AUTOMATION: "CRM_AUTOMATION", // originated from an automated CRM trigger
  ORDER_SUPPORT:  "ORDER_SUPPORT",  // customer asking about an order
  HUMAN_SUPPORT:  "HUMAN_SUPPORT",  // human-handoff context
} as const;

export type ConversationContextType = keyof typeof CONTEXT_TYPE;

export const ASSIGNED_AGENT = {
  WHATSAPP_AGENT: "WHATSAPP_AGENT",
  CRM_AGENT:      "CRM_AGENT",
  WAITER_AGENT:   "WAITER_AGENT",
  ANALYTICS_AGENT:"ANALYTICS_AGENT",
  HUMAN:          "HUMAN",
} as const;

export type AssignedAgentType = keyof typeof ASSIGNED_AGENT;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Tag a conversation with its originating context.
 * Safe to call multiple times — only updates if the context is not already set
 * (first-write-wins keeps the original attribution).
 */
export async function assignConversationContext(
  conversationId: string,
  contextType: ConversationContextType,
  opts?: { relatedCampaignId?: string }
): Promise<void> {
  await prisma.conversation.updateMany({
    where: { id: conversationId, contextType: null },
    data: {
      contextType,
      ...(opts?.relatedCampaignId ? { relatedCampaignId: opts.relatedCampaignId } : {}),
    },
  });
}

/**
 * Force-tag a (re)used conversation with a CRM context on every CRM outbound send.
 *
 * Unlike `assignConversationContext` (first-write-wins), this REFRESHES the
 * contextType so that when a CRM campaign reuses an existing conversation whose
 * contextType is null or a stale non-order value, the AI greeting guard
 * (`shouldAiRespond` → CRM_CONTEXT) still fires on the customer's reply, and the
 * Central de Conversas "Campanha/Automação enviada" badge shows correctly.
 *
 * Safety: it does not touch aiEnabled/aiLocked/status, so human-takeover and the
 * persistent Staff/Supplier lock are unaffected.
 *
 * ⚠️ E AQUI MORAVA O TERCEIRO DEFEITO DE 29/08/2026 — o mais grave dos três.
 *
 * Esta função dizia proteger a conversa de um pedido em andamento: "it never
 * overwrites an ORDER_SUPPORT context, so an active Waiter order conversation is
 * left untouched". A guarda era real, o estado não: **nada no repositório
 * escreve ORDER_SUPPORT.** A constante existe, o crachá aparece na Central de
 * Conversas, esta cláusula o protege — e nenhum caminho o define. A guarda
 * defendia um estado que nunca acontece.
 *
 * O resultado, em campo: o cliente pediu pelo WhatsApp às 18:51 e a conversa
 * ficou com `contextType` nulo. Às 18:52 a campanha reusou essa mesma conversa
 * (é o que `findOrCreateCrmConversation` faz: pega a conversa OPEN mais recente)
 * e a carimbou CRM_CAMPAIGN — o `not: ORDER_SUPPORT` deixou passar, porque
 * `not` inclui nulo. Às 18:57 ele escreveu "Boa noite fiz um pedido" e
 * "Mas é entrega", e `shouldAiRespond` devolveu CRM_CONTEXT: a IA está proibida
 * de responder em conversa de campanha. Ninguém respondeu, com o pedido em
 * preparo.
 *
 * A guarda passou a olhar o FATO em vez do rótulo: se o cliente tem pedido em
 * voo, a conversa dele não vira conversa de campanha, tenha ela o contextType
 * que tiver. O rótulo continua valendo — quem já está marcado ORDER_SUPPORT
 * segue protegido —, mas não é mais a única defesa.
 *
 * Guardrail 4 aplicado a si mesmo: o comentário prometia a trava; agora existe a
 * trava.
 */
export async function markConversationCrmContext(
  conversationId: string,
  contextType: "CRM_CAMPAIGN" | "CRM_AUTOMATION",
  opts?: { relatedCampaignId?: string }
): Promise<void> {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { restaurantId: true, customerId: true },
  });
  if (!conv) return;

  if (conv.customerId) {
    const emVoo = await prisma.order.count({
      where: {
        restaurantId: conv.restaurantId,
        customerId: conv.customerId,
        status: { in: [...ACTIVE_ORDER_STATUSES] as never[] },
      },
    });
    if (emVoo > 0) {
      // O alerta carrega a própria evidência (guardrail 6): quem ler o log sabe
      // QUAL conversa e QUAL cliente, não só que "algo foi barrado".
      console.warn(
        "[AgentRouting] conversa NÃO carimbada como CRM — cliente tem pedido em andamento",
        { conversationId, customerId: conv.customerId, contextType, pedidosEmVoo: emVoo },
      );
      return;
    }
  }

  await prisma.conversation.updateMany({
    // Prisma `not` is null-inclusive, so this also matches contextType = null.
    where: { id: conversationId, contextType: { not: CONTEXT_TYPE.ORDER_SUPPORT } },
    data: {
      contextType,
      ...(opts?.relatedCampaignId ? { relatedCampaignId: opts.relatedCampaignId } : {}),
    },
  });
}

/**
 * Close the CRM cycle after a purchase: once a customer buys, their conversation
 * must no longer carry the CRM "campaign/automation" tag — otherwise the next time
 * they reach out organically, the chat would still look like a CRM conversation
 * (wrong AI-greeting behavior, stale "Campanha enviada" badge, wrong agent).
 *
 * Resets CRM_CAMPAIGN / CRM_AUTOMATION contexts back to INBOUND so the next contact
 * starts fresh. Leaves ORDER_SUPPORT / HUMAN_SUPPORT untouched. Best-effort.
 */
export async function clearCrmContextAfterPurchase(
  restaurantId: string,
  customerId: string,
): Promise<void> {
  await prisma.conversation.updateMany({
    where: {
      restaurantId,
      customerId,
      contextType: { in: [CONTEXT_TYPE.CRM_CAMPAIGN, CONTEXT_TYPE.CRM_AUTOMATION] },
    },
    data: { contextType: CONTEXT_TYPE.INBOUND, relatedCampaignId: null },
  });
}

/**
 * When an inbound message arrives, check if the conversation was created by a
 * CRM send and, if so:
 *   1. Mark the most recent PENDING CampaignExecution for this conversation's
 *      customer as responded (if not already).
 *   2. Leave contextType intact so the conversation retains CRM attribution.
 *
 * This is intentionally fire-and-forget — webhook latency must stay low.
 */
export async function markCrmReplyIfApplicable(
  conversationId: string
): Promise<void> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      contextType: true,
      relatedCampaignId: true,
      customerId: true,
      restaurantId: true,
    },
  });

  if (!conversation) return;
  if (
    conversation.contextType !== CONTEXT_TYPE.CRM_CAMPAIGN &&
    conversation.contextType !== CONTEXT_TYPE.CRM_AUTOMATION
  ) {
    return; // not a CRM conversation — nothing to attribute
  }
  if (!conversation.customerId) return;

  const { customerId, restaurantId, relatedCampaignId } = conversation;

  // Mark the most recent SENT CampaignExecution for this customer as responded.
  // We look within a 7-day window so old executions are not accidentally updated.
  const cutoff = new Date(Date.now() - 7 * 86_400_000);

  const where = relatedCampaignId
    ? { campaignId: relatedCampaignId, customerId, status: "SENT" as const, sentAt: { gte: cutoff } }
    : { restaurantId, customerId, status: "SENT" as const, sentAt: { gte: cutoff } };

  // Find the single most recent execution to attribute the reply to
  const execution = await prisma.campaignExecution.findFirst({
    where,
    orderBy: { sentAt: "desc" },
    select: { id: true },
  });

  if (!execution) return;

  // Mark execution as responded (idempotent — won't error if already updated)
  await prisma.campaignExecution.update({
    where: { id: execution.id },
    data: { status: "READ" },
  }).catch(() => {}); // ignore if status transition not allowed by schema

  // Update Campaign.totalResponded counter
  if (relatedCampaignId) {
    await prisma.campaign.update({
      where: { id: relatedCampaignId },
      data: { totalResponded: { increment: 1 } },
    }).catch(() => {});
  }
}

/**
 * Infer which logical agent is responsible for this conversation.
 * Does NOT query the DB — works from the snapshot already in memory.
 */
export function getResponsibleAgentForConversation(conversation: {
  contextType:  string | null;
  aiEnabled:    boolean;
  status:       string;
  assignedTo:   string | null;
}): AssignedAgentType {
  if (!conversation.aiEnabled || conversation.assignedTo) return ASSIGNED_AGENT.HUMAN;
  if (conversation.status === "HUMAN" || conversation.status === "HUMANO_ASSUMIU") return ASSIGNED_AGENT.HUMAN;

  switch (conversation.contextType) {
    case CONTEXT_TYPE.CRM_CAMPAIGN:
    case CONTEXT_TYPE.CRM_AUTOMATION:
      return ASSIGNED_AGENT.CRM_AGENT;
    case CONTEXT_TYPE.ORDER_SUPPORT:
      return ASSIGNED_AGENT.WAITER_AGENT;
    default:
      return ASSIGNED_AGENT.WHATSAPP_AGENT;
  }
}

/**
 * Build the metadata payload to attach to outbound CRM messages.
 * Stored in Message.metadata JSON so campaign attribution is always queryable
 * without a schema migration on the Message model.
 */
export function buildConversationMetadataForCrmSend(
  campaignId: string,
  campaignExecutionId: string,
  trigger?: string
): Record<string, string> {
  return {
    contextType:         trigger ? CONTEXT_TYPE.CRM_AUTOMATION : CONTEXT_TYPE.CRM_CAMPAIGN,
    campaignId,
    campaignExecutionId,
    ...(trigger ? { automationTrigger: trigger } : {}),
  };
}
