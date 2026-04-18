/**
 * PromptBuilderService
 *
 * Assembles the full OpenAI messages array for a conversation turn.
 *
 * System prompt structure:
 *   1. Identity & brand voice (from RestaurantBrandConfig)
 *   2. Restaurant information
 *   3. Full menu catalog with exact IDs, names, prices
 *      — AI must only use these IDs; it can never invent items or prices
 *   4. Current OrderDraft state (items, totals, fulfillment type)
 *   5. Customer profile (name, history)
 *   6. Hard safety rules
 *
 * Conversation history: the last N messages (configurable via brandConfig).
 */

import { prisma } from "@/lib/prisma";
import type { RestaurantBrandConfig } from "@prisma/client";
import type OpenAI from "openai";
import { buildSalesProfile } from "./SalesProfile";
import { buildBehaviorBlock } from "./BehaviorEngine";

// ─── types ────────────────────────────────────────────────────

export interface PromptContext {
  conversationId: string;
  restaurantId: string;
  customerId: string;
  brandConfig: RestaurantBrandConfig;
}

// ─── service ─────────────────────────────────────────────────

export class PromptBuilderService {
  /**
   * Build the full messages array to send to OpenAI.
   * Returns [systemMessage, ...conversationHistory].
   */
  static async build(
    ctx: PromptContext
  ): Promise<OpenAI.Chat.ChatCompletionMessageParam[]> {
    const [restaurant, customer, menuCategories, draftData, recentMessages] =
      await Promise.all([
        prisma.restaurant.findUnique({
          where: { id: ctx.restaurantId },
          select: { name: true, phone: true, address: true, timezone: true },
        }),
        prisma.customer.findUnique({
          where: { id: ctx.customerId },
          select: {
            name: true,
            totalOrders: true,
            totalSpend: true,
            lastOrderAt: true,
            preferences: { select: { dietary: true, allergies: true, notes: true } },
          },
        }),
        prisma.menuCategory.findMany({
          where: { restaurantId: ctx.restaurantId, isActive: true },
          orderBy: { sortOrder: "asc" },
          include: {
            items: {
              where: { isActive: true },
              orderBy: { sortOrder: "asc" },
              select: {
                id: true,
                name: true,
                description: true,
                price: true,
              },
            },
          },
        }),
        // Most recent OPEN draft for this customer + conversation
        prisma.orderDraft.findFirst({
          where: {
            restaurantId: ctx.restaurantId,
            customerId: ctx.customerId,
            status: "OPEN",
          },
          orderBy: { createdAt: "desc" },
          include: {
            items: {
              include: {
                menuItem: { select: { name: true, price: true } },
              },
            },
          },
        }),
        // Recent conversation messages for history
        prisma.message.findMany({
          where: { conversationId: ctx.conversationId },
          orderBy: { sentAt: "desc" },
          take: ctx.brandConfig.maxHistoryMessages,
          select: {
            direction: true,
            content: true,
            type: true,
          },
        }),
      ]);

    if (!restaurant || !customer) {
      throw new Error(
        `PromptBuilder: could not load restaurant ${ctx.restaurantId} or customer ${ctx.customerId}`
      );
    }

    const systemPrompt = buildSystemPrompt({
      restaurant,
      customer,
      menuCategories,
      draft: draftData,
      brandConfig: ctx.brandConfig,
    });

    // Conversation history — oldest first, newest last
    const historyMessages = recentMessages
      .reverse()
      .map((msg): OpenAI.Chat.ChatCompletionMessageParam => ({
        role: msg.direction === "INBOUND" ? "user" : "assistant",
        content: msg.content,
      }));

    return [{ role: "system", content: systemPrompt }, ...historyMessages];
  }
}

// ─── system prompt builder ────────────────────────────────────

type RestaurantInfo = { name: string; phone: string | null; address: string | null; timezone: string };
type CustomerInfo = {
  name: string;
  totalOrders: number;
  totalSpend: { toString(): string };
  lastOrderAt: Date | null;
  preferences: { dietary: string[]; allergies: string[]; notes: string | null } | null;
};
type CategoryWithItems = {
  name: string;
  items: { id: string; name: string; description: string | null; price: { toString(): string } }[];
};
type DraftData = {
  id: string;
  fulfillmentType: string;
  subtotal: { toString(): string };
  totalAmount: { toString(): string };
  items: {
    id: string;
    quantity: number;
    unitPrice: { toString(): string };
    notes: string | null;
    menuItem: { name: string; price: { toString(): string } };
  }[];
} | null;

function buildSystemPrompt(params: {
  restaurant: RestaurantInfo;
  customer: CustomerInfo;
  menuCategories: CategoryWithItems[];
  draft: DraftData;
  brandConfig: RestaurantBrandConfig;
}): string {
  const { restaurant, customer, menuCategories, draft, brandConfig } = params;

  // If the owner supplied a full override, use it with context injection
  if (brandConfig.systemPromptOverride) {
    const contextBlock = buildContextBlock(params);
    return brandConfig.systemPromptOverride.replace("{CONTEXT}", contextBlock);
  }

  const profile = buildSalesProfile(brandConfig, restaurant.name);
  const behaviorBlock = buildBehaviorBlock(profile);
  const menuBlock = buildMenuBlock(menuCategories);
  const draftBlock = buildDraftBlock(draft);
  const customerBlock = buildCustomerBlock(customer);

  return `Você é o assistente virtual de pedidos do restaurante "${restaurant.name}" no WhatsApp.
Sua função é ajudar clientes a fazerem pedidos de forma rápida e agradável.

══════════════════════════════════════
IDENTIDADE & COMPORTAMENTO
══════════════════════════════════════
${behaviorBlock}

══════════════════════════════════════
INFORMAÇÕES DO RESTAURANTE
══════════════════════════════════════
Nome: ${restaurant.name}
${restaurant.address ? `Endereço: ${restaurant.address}` : ""}
${restaurant.phone ? `Telefone: ${restaurant.phone}` : ""}

══════════════════════════════════════
CARDÁPIO COMPLETO (use os IDs exatos)
══════════════════════════════════════
${menuBlock}

══════════════════════════════════════
PEDIDO ATUAL DO CLIENTE
══════════════════════════════════════
${draftBlock}

══════════════════════════════════════
PERFIL DO CLIENTE
══════════════════════════════════════
${customerBlock}

══════════════════════════════════════
REGRAS OBRIGATÓRIAS (nunca viole)
══════════════════════════════════════
1. NUNCA invente itens de cardápio, preços ou promoções.
   Somente use itens listados acima com seus IDs e preços exatos.
2. Sempre use chamadas de ferramenta (tool calls) para executar ações.
   Nunca descreva uma ação sem executá-la via ferramenta.
3. Antes de confirmar o pedido, sempre apresente o resumo completo
   (itens, quantidades, total) e peça confirmação explícita do cliente.
4. Se o cliente estiver confuso, insatisfeito ou pedir algo fora do cardápio,
   chame handoff_to_human com o motivo.
5. Nunca confirme um pedido vazio.
6. Se não tiver certeza sobre a intenção do cliente, pergunte antes de agir.
`.trim();
}

function buildVoiceBlock(cfg: RestaurantBrandConfig): string {
  const toneMap: Record<string, string> = {
    friendly: "amigável e acolhedor",
    professional: "profissional e objetivo",
    casual: "descontraído e informal",
    warm: "caloroso e empático",
  };
  const formalityMap: Record<string, string> = {
    formal: "Use linguagem formal (você, senhor/a).",
    informal: "Use linguagem informal e próxima (você, tudo bem?).",
    mixed: "Adapte o nível de formalidade ao tom do cliente.",
  };
  const emojiMap: Record<string, string> = {
    none: "Não use emojis.",
    minimal: "Use emojis apenas em momentos-chave (confirmação, boas-vindas).",
    moderate: "Use emojis moderadamente para tornar a conversa mais agradável.",
    expressive: "Use emojis com frequência para criar uma experiência animada.",
  };
  const styleMap: Record<string, string> = {
    conversational: "Seja conversacional, faça perguntas naturais.",
    concise: "Seja direto e breve. Evite textos longos.",
    detailed: "Forneça detalhes sobre os itens quando relevante.",
  };
  const upsellMap: Record<string, string> = {
    none: "Não faça sugestões adicionais.",
    gentle: "Sugira complementos apenas uma vez, de forma natural.",
    moderate: "Sugira complementos quando apropriado ao contexto do pedido.",
    proactive: "Proativamente sugira itens complementares e promoções.",
  };

  const lines = [
    `- Tom: ${toneMap[cfg.tone] ?? cfg.tone}`,
    `- Formalidade: ${formalityMap[cfg.formality] ?? cfg.formality}`,
    `- Emojis: ${emojiMap[cfg.emojiUsage] ?? cfg.emojiUsage}`,
    `- Estilo: ${styleMap[cfg.communicationStyle] ?? cfg.communicationStyle}`,
    `- Upsell: ${upsellMap[cfg.upsellStyle] ?? cfg.upsellStyle}`,
  ];

  if (cfg.greetingTemplate) {
    lines.push(`- Saudação personalizada: "${cfg.greetingTemplate}"`);
  }

  return lines.join("\n");
}

function buildMenuBlock(categories: CategoryWithItems[]): string {
  if (categories.length === 0) return "Cardápio não disponível.";

  return categories
    .map((cat) => {
      if (cat.items.length === 0) return null;
      const itemLines = cat.items.map(
        (item) =>
          `  • [ID: ${item.id}] ${item.name} — R$ ${Number(item.price).toFixed(2)}` +
          (item.description ? `\n    ${item.description}` : "")
      );
      return `${cat.name}:\n${itemLines.join("\n")}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

function buildDraftBlock(draft: DraftData): string {
  if (!draft || draft.items.length === 0) {
    return "Nenhum item no pedido ainda.";
  }

  const itemLines = draft.items.map(
    (item) =>
      `  • ${item.quantity}x ${item.menuItem.name} — R$ ${Number(item.unitPrice).toFixed(2)} cada` +
      (item.notes ? ` (obs: ${item.notes})` : "")
  );

  return [
    `Tipo: ${draft.fulfillmentType}`,
    `Itens:\n${itemLines.join("\n")}`,
    `Subtotal: R$ ${Number(draft.subtotal).toFixed(2)}`,
    `Total: R$ ${Number(draft.totalAmount).toFixed(2)}`,
  ].join("\n");
}

function buildCustomerBlock(customer: CustomerInfo): string {
  const lines = [`Nome: ${customer.name}`];

  if (customer.totalOrders > 0) {
    lines.push(`Pedidos anteriores: ${customer.totalOrders}`);
    lines.push(`Gasto total: R$ ${Number(customer.totalSpend).toFixed(2)}`);
  } else {
    lines.push("Novo cliente — primeira visita.");
  }

  if (customer.preferences) {
    if (customer.preferences.dietary.length > 0) {
      lines.push(`Preferências alimentares: ${customer.preferences.dietary.join(", ")}`);
    }
    if (customer.preferences.allergies.length > 0) {
      lines.push(`Alergias: ${customer.preferences.allergies.join(", ")}`);
    }
    if (customer.preferences.notes) {
      lines.push(`Notas: ${customer.preferences.notes}`);
    }
  }

  return lines.join("\n");
}

function buildContextBlock(params: Parameters<typeof buildSystemPrompt>[0]): string {
  return [
    buildMenuBlock(params.menuCategories),
    buildDraftBlock(params.draft),
    buildCustomerBlock(params.customer),
  ].join("\n\n");
}
