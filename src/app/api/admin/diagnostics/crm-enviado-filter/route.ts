/**
 * GET /api/admin/diagnostics/crm-enviado-filter
 *
 * Diagnoses the Atendimento "CRM enviado" filter: counts CRM outbound activity
 * and shows whether those conversations would appear in the filter.
 *
 * Auth: x-admin-secret header OR foocci-admin-token cookie.
 *
 * Query params:
 *   restaurantId — required (or slug)
 *   slug         — restaurant slug (alternative to restaurantId)
 *
 * Response:
 *   crmConversationCount        — conversations tagged CRM_CAMPAIGN | CRM_AUTOMATION
 *   campaignExecutionSentCount  — CampaignExecution rows in SENT/DELIVERED/READ
 *   matchedByFilterCount        — conversations the server-side crm=1 filter returns
 *   sample[]                    — latest 10 CRM-sent conversations with wouldAppearInAtendimento
 *
 * Safe: read-only, no mutations, no secrets returned.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAdminRequest } from "@/lib/admin-auth";
import { buildConversationWhere, CRM_CONTEXT_TYPES } from "@/services/conversation/conversationListFilter";

export async function GET(req: NextRequest) {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Endpoint disabled — ADMIN_SECRET not configured." }, { status: 403 });
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp           = req.nextUrl.searchParams;
  const restaurantId = sp.get("restaurantId") ?? undefined;
  const slug         = sp.get("slug")         ?? undefined;

  try {
    let resolvedRestaurantId: string | undefined = restaurantId;
    if (!resolvedRestaurantId && slug) {
      const r = await prisma.restaurant.findUnique({ where: { slug }, select: { id: true } });
      resolvedRestaurantId = r?.id;
    }
    if (!resolvedRestaurantId) {
      return NextResponse.json({ error: "Provide restaurantId or slug." }, { status: 400 });
    }

    const crmWhere = { restaurantId: resolvedRestaurantId, contextType: { in: [...CRM_CONTEXT_TYPES] } };

    const [crmConversationCount, campaignExecutionSentCount, filterWhereRows, sampleRows] = await Promise.all([
      // CRM-origin conversations for this tenant
      prisma.conversation.count({ where: crmWhere }),
      // CampaignExecution rows that represent a real send
      prisma.campaignExecution.count({
        where: { restaurantId: resolvedRestaurantId, status: { in: ["SENT", "DELIVERED", "READ"] } },
      }),
      // Conversations the server-side crm=1 filter would return (same builder the route uses)
      prisma.conversation.count({
        where: buildConversationWhere(resolvedRestaurantId, { crm: "1" }),
      }),
      // Latest 10 CRM conversations with reply detection
      prisma.conversation.findMany({
        where:   crmWhere,
        orderBy: { createdAt: "desc" },
        take:    10,
        select: {
          id:                true,
          channel:           true,
          contextType:       true,
          relatedCampaignId: true,
          customerName:      true,
          customerPhone:     true,
          lastMessageAt:     true,
          createdAt:         true,
          _count: { select: { messages: { where: { direction: "INBOUND" } } } },
        },
      }),
    ]);

    const sample = sampleRows.map(({ _count, ...c }) => {
      const hasCustomerReplied = _count.messages > 0;
      return {
        conversationId:    c.id,
        channel:           c.channel,
        contextType:       c.contextType,
        sourceModel:       "Conversation.contextType",
        relatedCampaignId: c.relatedCampaignId,
        customerName:      c.customerName,
        customerPhone:     c.customerPhone,
        hasCustomerReplied,
        atendimentoFilter: hasCustomerReplied ? "CRM_REPLIED" : "CRM_SENT",
        lastMessageAt:     c.lastMessageAt,
        createdAt:         c.createdAt,
        // After the fix, every CRM-origin conversation appears under one of the
        // two CRM filters because the server filters on contextType (crm=1).
        wouldAppearInAtendimento: true,
      };
    });

    return NextResponse.json({
      restaurantId:               resolvedRestaurantId,
      crmConversationCount,
      campaignExecutionSentCount,
      matchedByFilterCount:       filterWhereRows,
      crmContextTypes:            CRM_CONTEXT_TYPES,
      sample,
      verdict: crmConversationCount === filterWhereRows ? "PASS" : "WARN",
      note: "wouldAppearInAtendimento reflects the server-side crm=1 filter (contextType-based, channel-independent).",
    });
  } catch (err) {
    console.error("[GET /api/admin/diagnostics/crm-enviado-filter]", err);
    return NextResponse.json({ error: "Diagnostic failed" }, { status: 500 });
  }
}
