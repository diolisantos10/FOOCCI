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
import type { SalesProfile } from "./SalesProfile";
import { buildBehaviorBlock } from "./BehaviorEngine";

// ─── types ────────────────────────────────────────────────────

export interface PromptContext {
  conversationId: string;
  restaurantId: string;
  customerId: string;
  brandConfig: RestaurantBrandConfig;
}

export interface WebPromptContext {
  restaurantId: string;
  customerId?: string;
  customerName?: string | null;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  cart: Array<{ name: string; price: number; qty: number }>;
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
                ingredients: true,
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

  /**
   * Build the messages array for the stateless web ordering widget.
   * Uses history and cart from the HTTP request instead of loading them from DB.
   */
  static async buildForWeb(
    ctx: WebPromptContext
  ): Promise<OpenAI.Chat.ChatCompletionMessageParam[]> {
    const [restaurant, customer, menuCategories] = await Promise.all([
      prisma.restaurant.findUnique({
        where: { id: ctx.restaurantId },
        select: { name: true, phone: true, address: true, timezone: true },
      }),
      ctx.customerId
        ? prisma.customer.findUnique({
            where: { id: ctx.customerId },
            select: {
              name: true,
              totalOrders: true,
              totalSpend: true,
              lastOrderAt: true,
              preferences: { select: { dietary: true, allergies: true, notes: true } },
            },
          })
        : Promise.resolve(null),
      prisma.menuCategory.findMany({
        where: { restaurantId: ctx.restaurantId, isActive: true },
        orderBy: { sortOrder: "asc" },
        include: {
          items: {
            where: { isActive: true },
            orderBy: { sortOrder: "asc" },
            select: { id: true, name: true, description: true, ingredients: true, price: true },
          },
        },
      }),
    ]);

    if (!restaurant) {
      throw new Error(`PromptBuilder: could not load restaurant ${ctx.restaurantId}`);
    }

    const resolvedCustomer: CustomerInfo | null = customer
      ? customer
      : ctx.customerName
        ? {
            name: ctx.customerName,
            totalOrders: 0,
            totalSpend: { toString: () => "0" },
            lastOrderAt: null,
            preferences: null,
          }
        : null;

    const systemPrompt = buildSystemPrompt({
      restaurant,
      customer: resolvedCustomer ?? {
        name: "Cliente",
        totalOrders: 0,
        totalSpend: { toString: () => "0" },
        lastOrderAt: null,
        preferences: null,
      },
      menuCategories,
      draft: buildWebDraft(ctx.cart),
      brandConfig: ctx.brandConfig,
    });

    const capped = ctx.history.slice(-ctx.brandConfig.maxHistoryMessages);
    const historyMessages = capped
      .filter((m) => m.content.trim().length > 0)
      .map((m): OpenAI.Chat.ChatCompletionMessageParam => ({
        role: m.role,
        content: m.content,
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
  items: { id: string; name: string; description: string | null; ingredients: string | null; price: { toString(): string } }[];
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
    menuItem: { name: string; price: { toString(): string } } | null;
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
  const goalsBlock = buildGoalsBlock(profile, draft);

  const personaBlock = buildPersonaBlock(brandConfig.brandPersona);

  return `Você é o assistente virtual de pedidos do restaurante "${restaurant.name}" no WhatsApp.
Sua função é ajudar clientes a fazerem pedidos de forma rápida e agradável — e maximizar o valor de cada pedido.

══════════════════════════════════════
IDENTIDADE & COMPORTAMENTO
══════════════════════════════════════
${behaviorBlock}
${personaBlock ? `\n══════════════════════════════════════\nPERFIL DA MARCA\n══════════════════════════════════════\n${personaBlock}` : ""}

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
CONTEXTO DE METAS
══════════════════════════════════════
${goalsBlock}

══════════════════════════════════════
PERFIL DO CLIENTE
══════════════════════════════════════
${customerBlock}

══════════════════════════════════════
MOTOR DE VENDAS (execute mentalmente antes de cada resposta)
══════════════════════════════════════
Seu objetivo é aumentar o valor total do pedido adicionando itens e cobrindo categorias.

PASSO 1 — DIAGNÓSTICO (leia CONTEXTO DE METAS acima, depois decida):
  a) Gap de valor aberto?  → Priorize itens de maior preço dentro das categorias ausentes.
  b) Gap de itens aberto?  → Priorize complementos acessíveis que aumentem a contagem.
  c) Ambos os gaps abertos? → Escolha item que cubra categoria ausente E tenha preço elevado.
  d) Metas atingidas?      → Encaminhe para confirmação; não force mais sugestões.

  Dentro de cada gap, siga a ordem de categorias:
  • Tem PRATO PRINCIPAL?   → Se não, prioridade máxima: sugira um prato.
  • Tem BEBIDA?            → Se não (e já tem prato), prioridade alta: sugira uma bebida.
  • Tem SOBREMESA?         → Se não (e já tem prato + bebida), prioridade média: sugira uma sobremesa.

PASSO 2 — DECISÃO POR TURNO:
  1. Leia a AÇÃO RECOMENDADA no bloco CONTEXTO DE METAS — ela já resolve (a)/(b)/(c)/(d).
  2. Escolha o item de maior valor disponível na categoria recomendada.
  3. Formule 1 frase curta, contextual e natural para introduzir a sugestão.
  4. Execute suggest_upsell imediatamente — nunca mencione o item sem a ferramenta.

PASSO 3 — APÓS RECUSA:
  • O cliente recusou? NÃO DESISTA — mude de estratégia:
    → Se havia gap de valor: tente item de categoria diferente ainda ausente.
    → Se havia gap de itens: tente complemento mais barato ou adicional.
    → Somente após 2 recusas em categorias diferentes, avance para confirmação.
  • Nunca repita um item que já foi recusado.
  • Nunca force — seja natural e respeitoso.

EXEMPLOS DE ABORDAGEM CONTEXTUAL:
  ✅ "Pra acompanhar o [prato], uma bebida gelada cai muito bem 👇"
  ✅ "Que tal fechar com uma sobremesa? Combina perfeitamente com o que você pediu 👇"
  ✅ "Aproveita e adiciona uma [bebida] — vai bem com o sabor do [prato] 👇"
  ❌ "Posso sugerir algo mais?" (genérico, sem contexto)
  ❌ "Temos ótimas opções de bebidas" (sem suggest_upsell)

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
7. Sugira apenas 1 produto por mensagem — execute suggest_upsell no máximo
   uma vez por resposta. Aguarde o cliente reagir antes de sugerir outro item.
8. Nunca inicie sugestões com sobremesas. Comece sempre por pratos principais
   ou itens populares; sobremesas somente após o cliente já ter um prato principal.
9. Nunca sugira um produto que o cliente já recusou, ou que conflite com suas
   restrições alimentares ou alergias declaradas no perfil acima.
10. Se nenhum item disponível for adequado para as preferências do cliente,
    faça uma pergunta de esclarecimento ao invés de adivinhar ou omitir.
11. Quando o bloco AÇÃO RECOMENDADA estiver presente no contexto, siga-o para
    escolher qual produto sugerir naquele turno. Jamais cite metas, gaps ou
    números de ticket ao cliente — formule sempre em termos naturais
    (ex: "combina com o que você pediu", "vai completar bem o pedido").
12. FALA + VISUAL OBRIGATÓRIO: toda vez que mencionar um produto para recomendar,
    execute suggest_upsell no mesmo turno — imediatamente após a frase de introdução.
    O card do produto (imagem, preço, botão) é a vitrine real; o texto é apenas a
    abertura. NUNCA cite um produto sem chamar a ferramenta.
    ❌ Proibido: "Recomendo o Combo X!" (sem tool call)
    ✅ Correto: frase natural de introdução → suggest_upsell executado no mesmo turno
13. AUTO-VERIFICAÇÃO (execute mentalmente antes de cada resposta):
    → Meu texto menciona algum produto pelo nome como recomendação?
      SIM → devo chamar suggest_upsell agora. Se não chamei, CORRIJA antes de enviar.
      NÃO → resposta válida.
    Resposta com produto mencionado e sem tool call = resposta inválida.
    Esta regra não tem exceções.
14. QUANDO SUGESTÕES DE UPSELL ESTIVEREM DISPONÍVEIS NO CONTEXTO:
    → Você DEVE chamar suggest_upsell nesta resposta — exceto se o cliente acabou de
      recusar uma sugestão explicitamente (palavras como "não", "não quero", "pode ser não").
    → Ignorar sugestões disponíveis = falha de vendas = resposta inválida.
    → Escolha o item mais adequado para o momento e o contexto do cliente.
15. NUNCA invente IDs de itens. Todo menuItemId passado para qualquer ferramenta
    DEVE estar listado no CARDÁPIO COMPLETO acima. ID não listado = item inexistente.
    Se add_item falhar, leia o erro, corrija o ID e tente novamente com o ID correto.
`.trim();
}

/**
 * Converts the brandPersona JSON field into a concise brand context block
 * injected into the AI system prompt. Returns null when no persona is set.
 */
function buildPersonaBlock(persona: unknown): string | null {
  if (!persona || typeof persona !== "object") return null;
  const p = persona as Record<string, unknown>;
  const lines: string[] = [];

  // Identity
  if (p.brandName)        lines.push(`Marca: ${p.brandName}`);
  if (p.shortDescription) lines.push(`Identidade: ${p.shortDescription}`);
  if (p.targetAudience)   lines.push(`Público-alvo: ${p.targetAudience}`);
  if (p.brandStory)       lines.push(`História: ${p.brandStory}`);

  // Positioning
  if (p.restaurantType)   lines.push(`Tipo: ${p.restaurantType}`);
  if (p.cuisineType)      lines.push(`Culinária: ${p.cuisineType}`);
  if (p.pricePositioning) {
    const map: Record<string, string> = {
      budget: "econômico/popular", "mid-range": "médio", premium: "premium", luxury: "luxo/sofisticado",
    };
    lines.push(`Posicionamento: ${map[p.pricePositioning as string] ?? p.pricePositioning}`);
  }
  if (p.businessObjective) {
    const map: Record<string, string> = {
      velocidade: "velocidade de atendimento", "experiência": "experiência memorável",
      ticket_alto: "ticket médio alto", volume: "alto volume de pedidos",
    };
    lines.push(`Objetivo: ${map[p.businessObjective as string] ?? p.businessObjective}`);
  }

  // Personality traits
  if (Array.isArray(p.personalityTraits) && p.personalityTraits.length > 0) {
    lines.push(`Personalidade: ${(p.personalityTraits as string[]).join(", ")}`);
  }

  // Menu context
  if (p.mainDishes)             lines.push(`Pratos principais: ${p.mainDishes}`);
  if (p.differentials)          lines.push(`Diferenciais: ${p.differentials}`);
  if (p.mostProfitableProducts) lines.push(`Produtos prioritários: ${p.mostProfitableProducts}`);

  // Behavioral rules derived from persona
  const rules: string[] = [];
  if (p.comboFocus)           rules.push("Priorize sugestões de combos e promoções.");
  if (p.avgTicketFocus)       rules.push("Trabalhe ativamente para aumentar o valor de cada pedido.");
  if (p.canInsistAfterRefusal === false)
    rules.push("Se o cliente recusar uma sugestão, aceite imediatamente — nunca insista.");
  if (p.useClientName === false)
    rules.push("Não use o nome do cliente nas mensagens.");
  if (p.voiceTonePreset) {
    const toneMap: Record<string, string> = {
      formal:    "Mantenha linguagem formal e profissional em todo momento.",
      casual:    "Use linguagem casual, próxima e descontraída.",
      divertido: "Seja animado, use humor leve e emojis para criar energia positiva.",
      premium:   "Transmita exclusividade e sofisticação em cada palavra.",
      direto:    "Seja direto e objetivo — respostas curtas, sem rodeios.",
    };
    if (toneMap[p.voiceTonePreset as string]) rules.push(toneMap[p.voiceTonePreset as string]!);
  }

  if (rules.length > 0) {
    lines.push(`\nREGRAS ESPECÍFICAS DA MARCA:\n${rules.map((r) => `- ${r}`).join("\n")}`);
  }

  return lines.length > 0 ? lines.join("\n") : null;
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
          (item.description ? `\n    ${item.description}` : "") +
          (item.ingredients ? `\n    Ingredientes: ${item.ingredients}` : "")
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
      `  • ${item.quantity}x ${item.menuItem?.name ?? "Item"} — R$ ${Number(item.unitPrice).toFixed(2)} cada` +
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

function buildGoalsBlock(profile: SalesProfile, draft: DraftData): string {
  const fmt = (n: number) => `R$ ${n.toFixed(2)}`;

  if (!draft || draft.items.length === 0) {
    return [
      `Meta de ticket : ${fmt(profile.targetTicket)}   Meta de itens: ${profile.targetItems}`,
      `Pedido atual   : ${fmt(0)} | 0 itens`,
      ``,
      `AÇÃO RECOMENDADA: Pedido vazio — ajude o cliente a escolher um prato principal antes de qualquer sugestão.`,
    ].join("\n");
  }

  const cartValue = draft.items.reduce((s, i) => s + Number(i.unitPrice) * i.quantity, 0);
  const cartCount = draft.items.reduce((s, i) => s + i.quantity, 0);
  const valueGap  = Math.max(0, profile.targetTicket - cartValue);
  const itemGap   = Math.max(0, profile.targetItems  - cartCount);

  const valueStatus = valueGap > 0 ? `${fmt(valueGap)} abaixo da meta` : "Meta atingida ✓";
  const itemStatus  = itemGap  > 0 ? `${itemGap} ${itemGap === 1 ? "item" : "itens"} abaixo da meta` : "Meta atingida ✓";

  const lines = [
    `Meta de ticket : ${fmt(profile.targetTicket)}   Meta de itens: ${profile.targetItems}`,
    `Pedido atual   : ${fmt(cartValue)} | ${cartCount} ${cartCount === 1 ? "item" : "itens"}`,
    `Gap de valor   : ${valueStatus}`,
    `Gap de itens   : ${itemStatus}`,
    ``,
  ];

  if (valueGap > 0 && itemGap > 0) {
    lines.push(`AÇÃO RECOMENDADA: Gaps de valor (${fmt(valueGap)}) e itens (${itemGap}) abertos.`);
    lines.push(`→ Escolha item de categoria ausente com o maior preço disponível — cobre os dois gaps ao mesmo tempo.`);
  } else if (valueGap > 0) {
    lines.push(`AÇÃO RECOMENDADA: Gap de valor ativo (${fmt(valueGap)} até a meta).`);
    lines.push(`→ Prefira o item de maior preço dentro da próxima categoria ausente.`);
    lines.push(`→ Se todas as categorias já estiverem cobertas, sugira upgrade ou adicional premium.`);
  } else if (itemGap > 0) {
    lines.push(`AÇÃO RECOMENDADA: Gap de itens ativo (${itemGap} ${itemGap === 1 ? "item" : "itens"} até a meta).`);
    lines.push(`→ Prefira complementos acessíveis que aumentem a contagem sem resistência (bebida, adicional).`);
  } else {
    lines.push(`AÇÃO RECOMENDADA: Metas atingidas (valor ✓ e itens ✓).`);
    lines.push(`→ Encaminhe para confirmação do pedido. Não force mais sugestões.`);
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

function buildWebDraft(
  cart: Array<{ name: string; price: number; qty: number }>
): DraftData {
  if (cart.length === 0) return null;

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  return {
    id: "web-cart",
    fulfillmentType: "WEB",
    subtotal: { toString: () => subtotal.toFixed(2) },
    totalAmount: { toString: () => subtotal.toFixed(2) },
    items: cart.map((item) => ({
      id: item.name,
      quantity: item.qty,
      unitPrice: { toString: () => item.price.toFixed(2) },
      notes: null,
      menuItem: { name: item.name, price: { toString: () => item.price.toFixed(2) } },
    })),
  };
}
