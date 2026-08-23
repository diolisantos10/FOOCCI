/**
 * Canonical "has CRM sent" recipient lookup for the Atendimento "CRM enviado" tab.
 *
 * A conversation belongs in "CRM enviado" if its customer received ANY CRM
 * outbound message. The authoritative record is the union of two send logs that
 * every CRM flow already writes to:
 *
 *   - CampaignExecution  → CRM campaigns, recurring campaigns, automations, birthday
 *     (status SENT/DELIVERED/READ = a real send).
 *   - CRMActionLog       → review requests + adaptive CRM (post-order, reactivation,
 *     win-back, VIP appreciation, premium/coupon/promo offer, loyalty, reminder,
 *     manual, …). ATENÇÃO: essa tabela guarda TENTATIVA, não só envio — as linhas
 *     `REVIEW_REQUEST_FAILED` e `REVIEW_REQUEST_SKIPPED` são registros de que NADA
 *     saiu (sem telefone, canal fora do ar, bloqueio). Elas ficavam contando como
 *     "CRM enviado" e enchiam a aba de gente que o CRM nunca abordou.
 *
 * Using these logs (not the single mutable `Conversation.contextType`) is what makes
 * the filter complete: review/adaptive/manual sends that reused an existing
 * conversation never reliably set contextType, so they were invisible before.
 *
 * Read-only. Bounded by a generous lookback to keep the customerId set reasonable.
 */

import { prisma } from "@/lib/prisma";
import {
  REVIEW_ACTION_TYPE_FAILED,
  REVIEW_ACTION_TYPE_SKIPPED,
} from "@/services/crm/ReviewRequestSendService";

export const CRM_SENT_LOOKBACK_DAYS = 365;

/**
 * Linhas de `CRMActionLog` que registram que a mensagem NÃO saiu. Ser abordado é
 * receber; tentativa frustrada não é abordagem.
 */
export const CRM_ACTION_TYPES_NAO_ENVIADOS = [
  REVIEW_ACTION_TYPE_FAILED,
  REVIEW_ACTION_TYPE_SKIPPED,
] as const;

/** Status de `CampaignExecution` que valem como envio de verdade. */
export const CRM_SENT_STATUSES = ["SENT", "DELIVERED", "READ"] as const;

export async function getCrmSentCustomerIds(restaurantId: string): Promise<string[]> {
  const since = new Date(Date.now() - CRM_SENT_LOOKBACK_DAYS * 86_400_000);

  try {
    const [execs, actions] = await Promise.all([
      prisma.campaignExecution.findMany({
        where: {
          campaign:  { restaurantId },
          status:    { in: ["SENT", "DELIVERED", "READ"] },
          createdAt: { gte: since },
        },
        select:   { customerId: true },
        distinct: ["customerId"],
      }),
      prisma.cRMActionLog.findMany({
        where: {
          restaurantId,
          customerId: { not: null },
          createdAt:  { gte: since },
          actionType: { notIn: [...CRM_ACTION_TYPES_NAO_ENVIADOS] },
        },
        select:   { customerId: true },
        distinct: ["customerId"],
      }),
    ]);

    const ids = new Set<string>();
    for (const e of execs)   if (e.customerId) ids.add(e.customerId);
    for (const a of actions) if (a.customerId) ids.add(a.customerId);
    return [...ids];
  } catch (err) {
    console.error("[getCrmSentCustomerIds] failed", { restaurantId, err });
    return [];
  }
}

/**
 * QUANDO cada cliente foi abordado pelo CRM pela última vez.
 *
 * É a prova que a etiqueta "Resposta CRM" precisa e nunca teve: sem a data do
 * envio não dá para dizer se o cliente escreveu DEPOIS de ser abordado. A
 * etiqueta antiga se contentava com o `contextType` da conversa — um campo que é
 * gravado no envio e não expira nunca.
 *
 * Só entra envio REAL: `CampaignExecution` com SENT/DELIVERED/READ (campanha,
 * automação, aniversário, recuperação de carrinho) e `CRMActionLog` que não seja
 * linha de falha/pulo. Sem recorte de data — quem chama já limita pela lista de
 * clientes da página.
 *
 * Falha fechada de propósito: se a consulta cair, o mapa volta VAZIO e ninguém
 * ganha a etiqueta. Etiqueta a menos é ruído; etiqueta a mais é mentira.
 */
export async function getLastCrmSentAtByCustomer(
  restaurantId: string,
  customerIds: string[],
): Promise<Map<string, Date>> {
  const out = new Map<string, Date>();
  if (customerIds.length === 0) return out;

  try {
    const [execs, actions] = await Promise.all([
      prisma.campaignExecution.groupBy({
        by:    ["customerId"],
        where: {
          restaurantId,
          customerId: { in: customerIds },
          status:     { in: [...CRM_SENT_STATUSES] },
          sentAt:     { not: null },
        },
        _max: { sentAt: true },
      }),
      prisma.cRMActionLog.groupBy({
        by:    ["customerId"],
        where: {
          restaurantId,
          customerId: { in: customerIds },
          actionType: { notIn: [...CRM_ACTION_TYPES_NAO_ENVIADOS] },
        },
        _max: { createdAt: true },
      }),
    ]);

    const consider = (customerId: string | null, at: Date | null | undefined) => {
      if (!customerId || !at) return;
      const cur = out.get(customerId);
      if (!cur || at.getTime() > cur.getTime()) out.set(customerId, at);
    };
    for (const e of execs)   consider(e.customerId, e._max.sentAt);
    for (const a of actions) consider(a.customerId, a._max.createdAt);
    return out;
  } catch (err) {
    console.error("[getLastCrmSentAtByCustomer] failed", { restaurantId, err });
    return new Map();
  }
}
