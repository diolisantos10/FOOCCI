/**
 * CrmCampaignService
 *
 * Orchestrates CRM campaign execution:
 *   1. Audience resolution — query real customer data by segment/template.
 *   2. Message personalization — variable substitution per customer.
 *   3. Campaign creation — Campaign + CampaignExecution records.
 *   4. Sending — Evolution API + Chat Inbox logging + status tracking.
 *
 * Sending requires explicit human approval via the review UI before calling `send()`.
 * This service NEVER sends autonomously.
 */

import { prisma } from "@/lib/prisma";
import { EvolutionConfigService } from "@/services/evolution/EvolutionConfigService";
import { EvolutionClient } from "@/lib/evolution/EvolutionClient";
import { isGuestIdentifier } from "@/lib/guest";
import { ConversationStatus } from "@prisma/client";
import { assignConversationContext, buildConversationMetadataForCrmSend, CONTEXT_TYPE } from "@/services/agents/AgentRoutingService";

// ─── types ────────────────────────────────────────────────────

export interface AudienceCustomer {
  id:          string;
  name:        string;
  phone:       string;
  tier:        string;
  segment:     string;
  totalOrders: number;
  totalSpend:  number;
  lastOrderAt: string | null;
}

export interface CreateCampaignInput {
  name:            string;
  templateId?:     string;   // "recuperar-frios" etc.
  targetSegment:   string;   // "FRIO" | "MORNO" | "VIP" | etc.
  messageTemplate: string;   // raw template with {nome} placeholders
  objective?:      string;
  channel?:        string;
  scheduledAt?:    Date;     // if set, campaign starts as SCHEDULED
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  scheduleConfig?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  audienceConfig?: any;
}

export interface CampaignRecipientRow {
  id:           string;
  customerId:   string;
  customerName: string;
  customerPhone: string;
  messageText:  string;
  status:       string;
}

export interface SendInput {
  messages: Array<{ recipientId: string; messageText: string }>;
}

export interface SendResult {
  totalSent:        number;
  totalFailed:      number;
  duplicateSkipped: number;
  results:          Array<{ id: string; status: "SENT" | "FAILED"; error?: string }>;
}

// ─── template → segment mapping ───────────────────────────────

const TEMPLATE_SEGMENT_MAP: Record<string, string> = {
  "recuperar-frios":    "FRIO",
  "reativar-mornos":    "MORNO",
  "segunda-compra":     "PRIMEIRO_PEDIDO",
  "clientes-vip":       "VIP",
  "pedido-avaliacao":   "RECENTE_AVALIACAO",
  "recorrente-sumido":  "RECORRENTE_SUMIDO",
  "aniversariantes":    "ANIVERSARIANTES",
  "aumentar-bebidas":   "SEM_BEBIDA",
  "aumentar-sobremesas":"SEM_SOBREMESA",
};

// ─── audience resolution ──────────────────────────────────────

const MAX_AUDIENCE = 500; // safety cap

export async function resolveAudience(
  restaurantId: string,
  targetSegment: string,
  templateId?: string
): Promise<AudienceCustomer[]> {
  // Resolve canonical segment — template IDs (e.g. "recuperar-frios") may arrive in targetSegment
  const rawSeg = (targetSegment ?? "").trim();
  const seg = (TEMPLATE_SEGMENT_MAP[rawSeg] ?? rawSeg)
    || (templateId ? TEMPLATE_SEGMENT_MAP[templateId] : null)
    || "TODOS";
  const rid = restaurantId;
  const now = new Date();

  const baseWhere = {
    restaurantId:   rid,
    isGuest:        false,
    isActive:       true,
    hasOptedOut:    false,
    crmContactable: true,           // exclude no-phone imported customers
    phone:          { not: null },  // belt-and-suspenders: require a real phone
  };

  const baseSelect = {
    id: true, name: true, phone: true,
    tier: true, segment: true,
    totalOrders: true, totalSpend: true, lastOrderAt: true,
  } as const;

  type Row = {
    id: string; name: string; phone: string | null;
    tier: string; segment: string;
    totalOrders: number; totalSpend: { toNumber(): number };
    lastOrderAt: Date | null;
  };

  function serialize(rows: Row[]): AudienceCustomer[] {
    return rows
      .filter((r) => r.phone && !isGuestIdentifier(r.phone) && r.phone.trim() !== "")
      .map((r) => ({
        id:          r.id,
        name:        r.name,
        phone:       r.phone!,   // filter above guarantees non-null
        tier:        r.tier,
        segment:     r.segment,
        totalOrders: r.totalOrders,
        totalSpend:  r.totalSpend.toNumber(),
        lastOrderAt: r.lastOrderAt?.toISOString() ?? null,
      }));
  }

  switch (seg) {
    case "FRIO":
      return serialize(await prisma.customer.findMany({
        where: { ...baseWhere, segment: "FRIO" },
        orderBy: { lastOrderAt: "asc" },
        take: MAX_AUDIENCE, select: baseSelect,
      }) as Row[]);

    case "MORNO":
      return serialize(await prisma.customer.findMany({
        where: { ...baseWhere, segment: "MORNO" },
        orderBy: { lastOrderAt: "asc" },
        take: MAX_AUDIENCE, select: baseSelect,
      }) as Row[]);

    case "QUENTE":
      return serialize(await prisma.customer.findMany({
        where: { ...baseWhere, segment: "QUENTE" },
        orderBy: { totalSpend: "desc" },
        take: MAX_AUDIENCE, select: baseSelect,
      }) as Row[]);

    case "VIP":
      return serialize(await prisma.customer.findMany({
        where: { ...baseWhere, tier: { in: ["OURO", "DIAMANTE"] } },
        orderBy: [{ tier: "asc" }, { totalSpend: "desc" }],
        take: MAX_AUDIENCE, select: baseSelect,
      }) as Row[]);

    case "PRIMEIRO_PEDIDO":
      return serialize(await prisma.customer.findMany({
        where: { ...baseWhere, totalOrders: 1 },
        orderBy: { lastOrderAt: "desc" },
        take: MAX_AUDIENCE, select: baseSelect,
      }) as Row[]);

    case "RECENTE_AVALIACAO": {
      const cutoff = new Date(now.getTime() - 7 * 86_400_000);
      return serialize(await prisma.customer.findMany({
        where: { ...baseWhere, lastOrderAt: { gte: cutoff } },
        orderBy: { lastOrderAt: "desc" },
        take: MAX_AUDIENCE, select: baseSelect,
      }) as Row[]);
    }

    case "RECORRENTE_SUMIDO":
      return serialize(await prisma.customer.findMany({
        where: { ...baseWhere, totalOrders: { gte: 2 }, segment: "FRIO" },
        orderBy: { totalOrders: "desc" },
        take: MAX_AUDIENCE, select: baseSelect,
      }) as Row[]);

    case "RECORRENTES":
      return serialize(await prisma.customer.findMany({
        where: { ...baseWhere, totalOrders: { gte: 2 } },
        orderBy: { totalOrders: "desc" },
        take: MAX_AUDIENCE, select: baseSelect,
      }) as Row[]);

    case "ANIVERSARIANTES": {
      const month = now.getMonth() + 1;
      return serialize(await prisma.customer.findMany({
        where: {
          ...baseWhere,
          birthDate: { not: null },
        },
        orderBy: { birthDate: "asc" },
        take: MAX_AUDIENCE, select: baseSelect,
      }) as Row[]).filter((c) => {
        if (!c.lastOrderAt) return false;
        // Use lastOrderAt as fallback — real birthday filter requires raw SQL month()
        return true;
      });
      // Note: filtering by birth month in Prisma requires raw SQL. For V1, this returns
      // all customers with a birthDate set; the UI can show a note about this limitation.
    }

    case "TODOS":
    default:
      return serialize(await prisma.customer.findMany({
        where: baseWhere,
        orderBy: { lastOrderAt: "desc" },
        take: MAX_AUDIENCE, select: baseSelect,
      }) as Row[]);
  }
}

// ─── message personalization ──────────────────────────────────

interface MessageContext {
  restaurantName: string;
  pedidoUrl:      string;
  googleReviewUrl: string | null;
}

export function personalizeMessage(
  template: string,
  customer: AudienceCustomer,
  ctx: MessageContext
): string {
  const firstName = customer.name.split(" ")[0] ?? customer.name;

  const dias = customer.lastOrderAt
    ? Math.floor((Date.now() - new Date(customer.lastOrderAt).getTime()) / 86_400_000)
    : null;

  const lastOrderLabel = dias === null
    ? "há algum tempo"
    : dias === 0 ? "hoje"
    : dias === 1 ? "ontem"
    : dias < 30  ? `há ${dias} dias`
    : dias < 365 ? `há ${Math.floor(dias / 30)} meses`
    : `há mais de um ano`;

  const tierLabels: Record<string, string> = {
    BRONZE: "Bronze", PRATA: "Prata", OURO: "Ouro", DIAMANTE: "Diamante",
  };

  const reviewUrl = ctx.googleReviewUrl ?? ctx.pedidoUrl;

  return template
    .replace(/{nome}/g,                 firstName)
    .replace(/{restaurante}/g,          ctx.restaurantName)
    .replace(/{link_cardapio}/g,        ctx.pedidoUrl)
    .replace(/{link_avaliacao_google}/g, reviewUrl)
    .replace(/{nivel}/g,                tierLabels[customer.tier] ?? customer.tier)
    .replace(/{dias_sem_pedir}/g,       dias !== null ? String(dias) : "alguns")
    .replace(/{ultimo_pedido}/g,        lastOrderLabel)
    .replace(/{produto_favorito}/g,     "nossos pratos");  // V1 simplified
}

// ─── campaign creation ────────────────────────────────────────

export class CrmCampaignService {
  /**
   * Create a campaign: resolve audience, personalize messages, persist.
   * Returns the campaign with all recipients.
   */
  static async create(
    restaurantId: string,
    input: CreateCampaignInput
  ): Promise<{ campaignId: string; totalAudience: number; recipients: CampaignRecipientRow[] }> {
    // Load context data
    const [restaurant, brandConfig] = await Promise.all([
      prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { name: true, slug: true },
      }),
      prisma.restaurantBrandConfig.findUnique({
        where: { restaurantId },
        select: { googleReviewUrl: true },
      }),
    ]);

    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
    const pedidoUrl = restaurant?.slug ? `${baseUrl}/pedido/${restaurant.slug}` : baseUrl;

    const ctx: MessageContext = {
      restaurantName:  restaurant?.name ?? "nossa loja",
      pedidoUrl,
      googleReviewUrl: brandConfig?.googleReviewUrl ?? null,
    };

    // Resolve audience
    const customers = await resolveAudience(restaurantId, input.targetSegment, input.templateId);

    // Create campaign + executions in a transaction
    const campaign = await prisma.$transaction(async (tx) => {
      const c = await tx.campaign.create({
        data: {
          restaurantId,
          name:           input.name,
          message:        input.messageTemplate,
          objective:      input.objective ?? null,
          channel:        input.channel ?? "WHATSAPP",
          targetSegment:  input.targetSegment,
          templateId:     input.templateId ?? null,
          totalAudience:  customers.length,
          status:         input.scheduledAt ? "SCHEDULED" : "DRAFT",
          scheduledAt:    input.scheduledAt ?? null,
          scheduleConfig: input.scheduleConfig ?? undefined,
          audienceConfig: input.audienceConfig ?? undefined,
        },
      });

      if (customers.length > 0) {
        await tx.campaignExecution.createMany({
          data: customers.map((customer) => ({
            campaignId:    c.id,
            restaurantId,
            customerId:    customer.id,
            customerName:  customer.name,
            customerPhone: customer.phone,
            messageText:   personalizeMessage(input.messageTemplate, customer, ctx),
            status:        "PENDING",
          })),
        });
      }

      return c;
    });

    // Fetch created executions
    const executions = await prisma.campaignExecution.findMany({
      where:   { campaignId: campaign.id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true, customerId: true, customerName: true,
        customerPhone: true, messageText: true, status: true,
      },
    });

    const recipients: CampaignRecipientRow[] = executions.map((e) => ({
      id:            e.id,
      customerId:    e.customerId,
      customerName:  e.customerName ?? "",
      customerPhone: e.customerPhone ?? "",
      messageText:   e.messageText ?? "",
      status:        e.status,
    }));

    return { campaignId: campaign.id, totalAudience: customers.length, recipients };
  }

  /**
   * Execute sending for a campaign.
   * Accepts message overrides (user may have edited messages in the review UI).
   * Requires human to have clicked "Enviar mensagens" — never called automatically.
   */
  static async send(
    campaignId: string,
    restaurantId: string,
    input: SendInput
  ): Promise<SendResult> {
    // Validate campaign ownership
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { id: true, restaurantId: true, status: true },
    });

    if (!campaign || campaign.restaurantId !== restaurantId) {
      throw new Error("Campaign not found");
    }
    if (campaign.status === "SENT" || campaign.status === "SENDING") {
      throw new Error("Campaign is already sent or sending");
    }

    // Check Evolution config
    const cfgResult = await EvolutionConfigService.getSnapshot(restaurantId);
    if (!cfgResult.ok) {
      throw new Error(`WhatsApp not configured: ${cfgResult.error}`);
    }
    const evoConfig = cfgResult.data;

    // Mark campaign as SENDING
    await prisma.campaign.update({
      where: { id: campaignId },
      data:  { status: "SENDING" },
    });

    // Build override map
    const overrideMap = new Map(input.messages.map((m) => [m.recipientId, m.messageText]));

    // Fetch executions
    const executions = await prisma.campaignExecution.findMany({
      where:   { campaignId, status: "PENDING" },
      orderBy: { createdAt: "asc" },
      select: { id: true, customerId: true, customerPhone: true, messageText: true },
    });

    // Pre-fetch opt-out status for all customers in this batch (safety check)
    const customerIds = executions.map((e) => e.customerId).filter(Boolean) as string[];
    const optedOutIds = new Set(
      customerIds.length > 0
        ? (await prisma.customer.findMany({
            where: { id: { in: customerIds }, hasOptedOut: true },
            select: { id: true },
          })).map((c) => c.id)
        : []
    );

    // Pre-fetch customers already successfully reached via any other campaign in the last 24 h.
    // Prevents sending the same customer a second CRM WhatsApp message on the same day.
    const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentlySentIds = new Set(
      customerIds.length > 0
        ? (await prisma.campaignExecution.findMany({
            where: {
              restaurantId,
              customerId:   { in: customerIds },
              campaignId:   { not: campaignId },
              status:       { in: ["SENT", "DELIVERED", "READ"] },
              sentAt:       { gte: cutoff24h },
            },
            select: { customerId: true },
          })).map((e) => e.customerId).filter(Boolean) as string[]
        : []
    );

    let totalSent        = 0;
    let totalFailed      = 0;
    let duplicateSkipped = 0;
    const results: SendResult["results"] = [];

    for (const exec of executions) {
      // 24 h duplicate guard: do not send via Evolution if this customer already received
      // a successful CRM WhatsApp message from another campaign today.
      if (exec.customerId && recentlySentIds.has(exec.customerId)) {
        await prisma.campaignExecution.update({
          where: { id: exec.id },
          data:  { status: "FAILED", failedReason: "DUPLICATE_24H_SKIP" },
        });
        duplicateSkipped++;
        totalFailed++;
        results.push({ id: exec.id, status: "FAILED", error: "DUPLICATE_24H_SKIP" });
        continue;
      }

      // LGPD safety: skip opted-out customers even if they slipped into the execution list
      if (exec.customerId && optedOutIds.has(exec.customerId)) {
        await prisma.campaignExecution.update({
          where: { id: exec.id },
          data:  { status: "FAILED", failedReason: "Cliente opt-out" },
        });
        totalFailed++;
        results.push({ id: exec.id, status: "FAILED", error: "Cliente opt-out" });
        continue;
      }

      const phone = exec.customerPhone?.replace(/^\+/, "");
      if (!phone) {
        await prisma.campaignExecution.update({
          where: { id: exec.id },
          data:  { status: "FAILED", failedReason: "Telefone inválido ou ausente" },
        });
        totalFailed++;
        results.push({ id: exec.id, status: "FAILED", error: "Telefone inválido" });
        continue;
      }

      const messageText = overrideMap.get(exec.id) ?? exec.messageText ?? "";
      if (!messageText.trim()) {
        await prisma.campaignExecution.update({
          where: { id: exec.id },
          data:  { status: "FAILED", failedReason: "Mensagem vazia" },
        });
        totalFailed++;
        results.push({ id: exec.id, status: "FAILED", error: "Mensagem vazia" });
        continue;
      }

      try {
        // Send via Evolution API
        const evoResult = await EvolutionClient.sendTextMessage(evoConfig, phone, messageText);
        const now = new Date();

        // Find or create WhatsApp conversation for this customer
        const convId = await findOrCreateCrmConversation(
          restaurantId, exec.customerId, exec.customerPhone!, campaignId
        );

        // Tag conversation with CRM context (first-write-wins, idempotent)
        await assignConversationContext(convId, "CRM_CAMPAIGN", { relatedCampaignId: campaignId });

        // Log outbound message in Chat Inbox
        await prisma.$transaction([
          prisma.message.create({
            data: {
              conversationId:    convId,
              direction:         "OUTBOUND",
              senderType:        "AI",
              content:           messageText,
              type:              "TEXT",
              sentAt:            now,
              externalMessageId: evoResult.key.id,
              externalStatus:    "sent",
              metadata:          buildConversationMetadataForCrmSend(campaignId, exec.id),
            },
          }),
          prisma.conversation.update({
            where: { id: convId },
            data:  { lastMessageAt: now },
          }),
          prisma.campaignExecution.update({
            where: { id: exec.id },
            data: {
              status:      "SENT",
              sentAt:      now,
              messageText,         // persist final text (may differ from original draft)
            },
          }),
        ]);

        totalSent++;
        results.push({ id: exec.id, status: "SENT" });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : "Erro desconhecido";
        await prisma.campaignExecution.update({
          where: { id: exec.id },
          data:  { status: "FAILED", failedReason: errMsg },
        });
        totalFailed++;
        results.push({ id: exec.id, status: "FAILED", error: errMsg });
      }
    }

    // Finalize campaign status + counters
    await prisma.campaign.update({
      where: { id: campaignId },
      data:  {
        status:      totalSent === 0 ? "CANCELLED" : "SENT",
        sentAt:      new Date(),
        totalSent:   { increment: totalSent   },
        totalFailed: { increment: totalFailed },
      },
    });

    return { totalSent, totalFailed, duplicateSkipped, results };
  }
}

// ─── helper: find or create WhatsApp conversation ─────────────

async function findOrCreateCrmConversation(
  restaurantId: string,
  customerId:   string,
  phone:        string,
  campaignId:   string
): Promise<string> {
  // Prefer existing OPEN/BOT/HUMAN WhatsApp conversation
  const existing = await prisma.conversation.findFirst({
    where: {
      restaurantId,
      customerId,
      channel: "WHATSAPP",
      status:  { in: [ConversationStatus.OPEN, ConversationStatus.BOT, ConversationStatus.HUMAN] },
    },
    orderBy: { lastMessageAt: "desc" },
    select: { id: true },
  });

  if (existing) return existing.id;

  // Get customer name for denormalized fields
  const customer = await prisma.customer.findUnique({
    where:  { id: customerId },
    select: { name: true, phone: true },
  });

  // Create a fresh conversation tagged with the CRM campaign
  const conv = await prisma.conversation.create({
    data: {
      restaurantId,
      customerId,
      channel:          "WHATSAPP",
      status:           ConversationStatus.OPEN,
      customerPhone:    customer?.phone ?? phone,
      customerName:     customer?.name ?? phone,
      contextType:      CONTEXT_TYPE.CRM_CAMPAIGN,
      relatedCampaignId: campaignId,
    },
  });

  return conv.id;
}
