/**
 * GET /api/admin/diagnostics/crm-etiqueta-resposta
 *
 * Mede, sem tocar em nada, os dois números que a Central de Conversas e a tela
 * de Regras de Segurança não sabiam responder:
 *
 *   1. quantas conversas carregam "Resposta CRM" pela REGRA ANTIGA (qualquer
 *      mensagem de entrada + `contextType` de CRM, que nunca expira) contra a
 *      REGRA NOVA (última mensagem do cliente veio DEPOIS de um envio de CRM
 *      real, dentro da janela de resposta). A diferença é a etiqueta errada;
 *   2. o teto pré-pago de contatos contra quantas pessoas o CRM já abordou —
 *      e quantas passaram do teto enquanto ele não travava nada.
 *
 * Auth: header x-admin-secret OU cookie foocci-admin-token.
 *
 * Query: restaurantId (ou slug) · limit (conversas varridas, padrão 500, máx 2000)
 *
 * SOMENTE LEITURA: nenhuma escrita, nenhum envio, nenhum segredo na resposta.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAdminRequest } from "@/lib/admin-auth";
import { CRM_CONTEXT_TYPES } from "@/services/conversation/conversationListFilter";
import { getCrmSentCustomerIds, getLastCrmSentAtByCustomer } from "@/services/conversation/crmSentRecipients";
import { crmReplyAt, CRM_REPLY_WINDOW_DAYS } from "@/services/conversation/crmReplyBadge";
import { getSafetyConfig, getConsumedContactCount } from "@/lib/crm-safety";

const CRM_CONTEXT_SET = new Set<string>(CRM_CONTEXT_TYPES);

export async function GET(req: NextRequest) {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Endpoint disabled — ADMIN_SECRET not configured." }, { status: 403 });
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp    = req.nextUrl.searchParams;
  const slug  = sp.get("slug") ?? undefined;
  const limit = Math.min(2000, Math.max(1, parseInt(sp.get("limit") ?? "500", 10)));

  try {
    let restaurantId = sp.get("restaurantId") ?? undefined;
    if (!restaurantId && slug) {
      const r = await prisma.restaurant.findUnique({ where: { slug }, select: { id: true } });
      restaurantId = r?.id;
    }
    if (!restaurantId) {
      return NextResponse.json({ error: "Provide restaurantId or slug." }, { status: 400 });
    }

    const conversas = await prisma.conversation.findMany({
      where:   { restaurantId },
      orderBy: [{ lastMessageAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      take:    limit,
      select:  { id: true, contextType: true, customerId: true, customerName: true },
    });

    const customerIds = [...new Set(conversas.map((c) => c.customerId).filter((v): v is string => Boolean(v)))];
    const [crmSentIds, lastCrmSentByCustomer, entradas, safety, contatosUsados] = await Promise.all([
      getCrmSentCustomerIds(restaurantId),
      getLastCrmSentAtByCustomer(restaurantId, customerIds),
      prisma.message.groupBy({
        by:     ["conversationId"],
        where:  { conversationId: { in: conversas.map((c) => c.id) }, direction: "INBOUND" },
        _max:   { sentAt: true },
        _count: { _all: true },
      }),
      getSafetyConfig(restaurantId),
      getConsumedContactCount(restaurantId),
    ]);

    const crmSentSet     = new Set(crmSentIds);
    const entradaPorConv = new Map(entradas.map((e) => [e.conversationId, e]));

    let etiquetaAntiga = 0;
    let etiquetaNova   = 0;
    const exemplosErrados: {
      conversationId: string; cliente: string | null; contextType: string | null;
      ultimoEnvioCrm: string | null; ultimaEntrada: string | null;
    }[] = [];

    for (const c of conversas) {
      const entrada       = entradaPorConv.get(c.id);
      const temEntrada    = (entrada?._count._all ?? 0) > 0;
      const ultimaEntrada = entrada?._max.sentAt ?? null;
      // Regra ANTIGA: contextType de CRM (ou cliente na lista de "CRM enviado")
      // + existir QUALQUER mensagem de entrada, em qualquer data.
      const antiga = temEntrada && (
        (c.contextType != null && CRM_CONTEXT_SET.has(c.contextType)) ||
        (c.customerId != null && crmSentSet.has(c.customerId))
      );
      const ultimoEnvio = c.customerId ? lastCrmSentByCustomer.get(c.customerId) ?? null : null;
      const nova = crmReplyAt({ lastCrmSentAt: ultimoEnvio, lastInboundAt: ultimaEntrada }) !== null;

      if (antiga) etiquetaAntiga++;
      if (nova)   etiquetaNova++;
      if (antiga && !nova && exemplosErrados.length < 10) {
        exemplosErrados.push({
          conversationId: c.id,
          cliente:        c.customerName,
          contextType:    c.contextType,
          ultimoEnvioCrm: ultimoEnvio?.toISOString() ?? null,
          ultimaEntrada:  ultimaEntrada?.toISOString() ?? null,
        });
      }
    }

    const teto = Math.max(0, Math.floor(safety.contactBudgetTotal || 0));

    return NextResponse.json({
      restaurantId,
      conversasVarridas:    conversas.length,
      janelaDeRespostaDias: CRM_REPLY_WINDOW_DAYS,
      etiqueta: {
        regraAntiga: etiquetaAntiga,
        regraNova:   etiquetaNova,
        // Quantas conversas deixam de dizer "Resposta CRM" — as que estavam erradas.
        corrigidas:  Math.max(0, etiquetaAntiga - etiquetaNova),
        exemplosErrados,
      },
      tetoDeContatos: {
        teto,
        pessoasJaAbordadas: contatosUsados,
        // Quantas passaram do teto enquanto ele não travava nada.
        excedente: teto > 0 ? Math.max(0, contatosUsados - teto) : 0,
        ligado:    teto > 0,
      },
    });
  } catch (err) {
    console.error("[GET /api/admin/diagnostics/crm-etiqueta-resposta]", err);
    return NextResponse.json({ error: "Diagnostic failed" }, { status: 500 });
  }
}
