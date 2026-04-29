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
  restaurantId:   string;
  customerId:     string;
  brandConfig:    RestaurantBrandConfig;
  /** Cart metrics from UpsellEngine — avoids double DB computation inside buildGoalsBlock. */
  upsellMetrics?: {
    cartValue:     number;
    cartItemCount: number;
    valueGap:      number;
    itemGap:       number;
  };
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
      upsellMetrics: ctx.upsellMetrics,
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
  restaurant:    RestaurantInfo;
  customer:      CustomerInfo;
  menuCategories: CategoryWithItems[];
  draft:         DraftData;
  brandConfig:   RestaurantBrandConfig;
  upsellMetrics?: { cartValue: number; cartItemCount: number; valueGap: number; itemGap: number };
}): string {
  const { restaurant, customer, menuCategories, draft, brandConfig, upsellMetrics } = params;

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
  const goalsBlock = buildGoalsBlock(profile, draft, upsellMetrics);

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
MOTOR DE VENDAS — STATE-DRIVEN
══════════════════════════════════════
VOCÊ NÃO É UM CHATBOT. VOCÊ É UM EXECUTOR DE FLUXO DE VENDAS.

━━━ REGRA 0 — PROIBIÇÕES ABSOLUTAS ━━━
  ❌ NÃO inventar produtos, IDs ou preços
  ❌ NÃO assumir estado — leia o STATE e os resultados de tool
  ❌ NÃO repetir sugestão já feita
  ❌ NÃO ignorar o funil
  ❌ NÃO chamar tool sem validação prévia
  ❌ NÃO contradizer resultado de tool — success:false = FALHOU, ponto final
  ❌ NÃO corrigir falha de tool silenciosamente — informe ou tente 1× com ID válido
  ❌ NÃO chamar a mesma tool 3× seguidas — 2 falhas = PARE e responda ao cliente
  SE NÃO TIVER CERTEZA → NÃO CHAME TOOL
  TOOL > TUDO. Sempre. Sem exceção.

━━━ REGRA 1 — FONTE DA VERDADE ━━━
  HIERARQUIA DE VERDADE (do mais confiável ao menos):
    1. RESULTADO DA TOOL neste turno  ← MAIS confiável
    2. PEDIDO ATUAL (bloco acima)     ← estado persistido
    3. Histórico de mensagens         ← NÃO usar para inferir estado
  RESULTADOS DE TOOL = REALIDADE ABSOLUTA:
    success:true  → item EXISTE no carrinho neste momento
    success:false → item NÃO existe — não anuncie, não assuma
  NUNCA reconstruir o carrinho da memória ou do histórico.
  NUNCA adivinhar o estado — se inseguro: pergunte ao cliente ou leia o PEDIDO ATUAL.
  STATE FIELDS:
    selectedItems       → itens no PEDIDO ATUAL (bloco acima)
    uncoveredCategories → o que ainda não foi tentado nesta conversa
    upsellAttempts      → histórico de suggest_upsell (toolCalls desta conversa)
    stage               → derivado do STATE, não da conversa

━━━ REGRA 2 — VALIDAÇÃO OBRIGATÓRIA ANTES DE TOOL ━━━
  ANTES de add_item:
    → O menuItemId existe EXATAMENTE no CARDÁPIO acima? (ID + nome confirmados)
    → O item já foi adicionado ao pedido?
    SE NÃO tiver 100% de certeza → NÃO CHAMAR add_item. Informe o cliente.
  APÓS add_item success:true:
    → Confirme APENAS esse item ("Adicionei o [nome]!")
    → NÃO resuma o carrinho inteiro — o PEDIDO ATUAL já faz isso
    → NÃO anuncie itens não confirmados por tool neste turno
  ANTES de confirm_order:
    → O carrinho tem pelo menos 1 item?
    SE NÃO → o cliente ainda não escolheu nada — pergunte o que deseja.
    Qualquer combinação de itens válida pode ser confirmada.

━━━ REGRA 3 — FUNIL DE VENDAS (ORDEM FIXA, NUNCA PULAR) ━━━
  1 → MAIN ITEM
  2 → DRINK
  3 → DESSERT
  4 → CHECKOUT
  Nunca pular etapa. Nunca voltar etapa.

━━━ REGRA 4 — MAIN ITEM ━━━
  SE selectedItems vazio:
    → Sugira 1 produto claro e específico
    → Formato obrigatório: [nome] + [1 benefício curto] + [pergunta de confirmação].
      Ex: "O [Prato X] é perfeito pra você. Mando?"
    → Execute suggest_upsell para apresentar o item. Execute add_item ao receber confirmação.
    → NUNCA liste opções. NUNCA deixe o cliente sem direção. NUNCA omita a pergunta de confirmação.

━━━ REGRA 5 — DRINK (OBRIGATÓRIO) ━━━
  SE já tem MAIN E bebida não foi sugerida ainda:
    → Sugira bebida obrigatoriamente neste turno
    → Localize ID de bebida no CARDÁPIO. Execute suggest_upsell.
    PROIBIDO pular esta etapa.

━━━ REGRA 6 — DESSERT (OBRIGATÓRIO) ━━━
  SE já tem MAIN + bebida tentada E sobremesa não foi sugerida:
    → Sugira sobremesa neste turno
    → Localize ID de sobremesa no CARDÁPIO. Execute suggest_upsell.

━━━ REGRA 7 — CONTROLE DE RECUSA ━━━
  LIMITES ABSOLUTOS:
    BEBIDA: máx 2 tentativas. SOBREMESA: máx 1 tentativa.
    Após qualquer recusa → aceite IMEDIATAMENTE. NUNCA insista na mesma categoria.
  recusa de bebida (1ª) → tente 1 alternativa diferente
  recusa de bebida (2ª) → pare bebida, avance para sobremesa
  recusa de sobremesa → pare sobremesa, vá direto para checkout
  2 recusas em categorias diferentes → confirm_order imediato, sem mais sugestões

━━━ REGRA 8 — SEM REPETIÇÃO ━━━
  Produto já em upsellAttempts:
    → PROIBIDO sugerir novamente, sem exceção.
    → Sem opção nova? Pule a categoria.

━━━ REGRA 9 — RESTRIÇÕES ALIMENTARES ━━━
  SE cliente tem restrição ou alergia (ver PERFIL DO CLIENTE acima):
    → FILTRE antes de qualquer sugestão
    → PROIBIDO sugerir item incompatível
    → Sem opção compatível: "Hoje não temos opções compatíveis com essa restrição."
    → NÃO sugira substituto não verificado.

━━━ REGRA 10 — FINAL INTENT LOCK ━━━
  SINAL DE FECHAMENTO: "pode fechar" / "finaliza" / "é isso" / "fecha" /
    "confirma" / "só isso" / "pronto" / "tá bom" / "manda" / similar.
  QUANDO DETECTADO → state.stage = CHECKOUT (permanente)
  ┌─ Bebida NÃO foi tentada (0 tentativas)?
  │   → Ofereça bebida 1× (sugestão de vendas) → confirm_order independente da resposta
  └─ Qualquer outro caso:
      → confirm_order IMEDIATAMENTE
  PROIBIDO no estágio CHECKOUT:
    ❌ Sugerir qualquer produto além da 1× tentativa de bebida opcional
    ❌ Abrir nova categoria
    ❌ Fazer perguntas
    ❌ Voltar etapas
  confirm_order aceita qualquer carrinho não-vazio — upsell é opcional e não bloqueia o checkout.

━━━ REGRA 11 — ERRO DE TOOL ━━━
  SE tool retornar success: false:
    → NÃO repetir a mesma chamada imediatamente
    → NÃO corrigir silenciosamente (trocar item, ajustar parâmetros, etc.)
    → NÃO confirmar ação que falhou
    → NÃO assumir que o item está no carrinho
    → Informe o cliente OU tente 1× com ID diferente e válido do CARDÁPIO
  SE mesma tool falhou 2 vezes consecutivas:
    → PARE todas as tool calls
    → Responda ao cliente diretamente
    → NÃO continue tentando automaticamente

━━━ REGRA 12 — ESTILO DE RESPOSTA ━━━
  → Máximo 2 frases por resposta — sem exceção
  → Direto ao ponto, sem rodeios, sem explicações longas
  → NUNCA liste produtos no texto — use suggest_upsell
  → Sempre conduzir para o próximo passo do funil
  → Mencionou produto? Execute suggest_upsell no mesmo turno.
  RESPOSTAS CURTAS DO CLIENTE:
    → "sim" / "ok" / "pode" / "isso" / "👍" = ACEITOU a última sugestão
      → Identifique o item da última sugestão no histórico → execute add_item imediatamente
    → "não" / "dispensa" / "n" / "nao" = RECUSOU
      → Aceite sem insistir → avance o funil imediatamente
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
      lines.push(`⚠️ RESTRIÇÃO ALIMENTAR (filtro obrigatório): ${customer.preferences.dietary.join(", ")}`);
    }
    if (customer.preferences.allergies.length > 0) {
      lines.push(`⚠️ ALERGIA (filtro obrigatório): ${customer.preferences.allergies.join(", ")}`);
    }
    if (customer.preferences.notes) {
      lines.push(`Notas do cliente: ${customer.preferences.notes}`);
    }
  }

  return lines.join("\n");
}

function buildGoalsBlock(
  profile:  SalesProfile,
  draft:    DraftData,
  metrics?: { cartValue: number; cartItemCount: number; valueGap: number; itemGap: number },
): string {
  const fmt = (n: number) => `R$ ${n.toFixed(2)}`;

  // Prefer pre-computed UpsellEngine metrics (single source of truth).
  // Fall back to draft-based calculation for web / override cases.
  const cartCount = metrics?.cartItemCount
    ?? draft?.items.reduce((s, i) => s + i.quantity, 0)
    ?? 0;

  if (cartCount === 0) {
    return [
      `Meta de ticket : ${fmt(profile.targetTicket)}   Meta de itens: ${profile.targetItems}`,
      `Pedido atual   : ${fmt(0)} | 0 itens`,
      ``,
      `AÇÃO RECOMENDADA: Pedido vazio — ajude o cliente a escolher um prato principal antes de qualquer sugestão.`,
    ].join("\n");
  }

  const cartValue = metrics?.cartValue
    ?? draft?.items.reduce((s, i) => s + Number(i.unitPrice) * i.quantity, 0)
    ?? 0;
  const valueGap = metrics?.valueGap ?? Math.max(0, profile.targetTicket - cartValue);
  const itemGap  = metrics?.itemGap  ?? Math.max(0, profile.targetItems  - cartCount);

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
