/**
 * AITools
 *
 * OpenAI tool definitions and their server-side executors.
 *
 * Safety guarantees enforced here (not trusted from AI output):
 *   - add_item:       menuItemId is validated against the restaurant's menu before use.
 *   - remove_item /
 *     update_quantity: located by menuItemId within the current draft (no ID spoofing).
 *   - confirm_order:  draft must have items; empty drafts are rejected.
 *   - suggest_upsell: menuItemId validated before returning item details to AI.
 *   - handoff_to_human: transitions conversation status to HUMAN.
 *
 * The AI never sets prices — all prices come from the DB.
 */

import { prisma } from "@/lib/prisma";
import { isDessertCategory, isMainCategory } from "./ConversationGuardrails";
import type OpenAI from "openai";

// ─── tool context ─────────────────────────────────────────────

export interface ToolContext {
  restaurantId: string;
  conversationId: string;
  customerId: string;
  /** Current OPEN draft ID, if one exists. */
  draftId: string | null;
  /** Callback to update draftId after creation. */
  setDraftId: (id: string) => void;
  /** Callback to request human handoff. */
  requestHandoff: (reason: string) => void;
  /**
   * Guardrail: set to true once suggest_upsell is successfully called this turn.
   * Prevents the AI from suggesting more than one product per response.
   */
  upsellSuggestedThisTurn: boolean;
  /**
   * Drink Priority Engine: number of drink suggest_upsell calls made in THIS turn.
   * Combined with drinkAttemptsPriorTurns to enforce the 2-attempt minimum gate.
   */
  drinkAttemptsThisTurn: number;
  /**
   * Drink attempts made in all previous turns of this conversation (loaded at turn start).
   */
  drinkAttemptsPriorTurns: number;
  /**
   * Number of confirm_order calls made this turn. Hard limit: 1. Prevents confirm_order loops.
   */
  confirmOrderAttempts: number;
  /**
   * True after the first confirm_order attempt this turn.
   * Blocks add_item and suggest_upsell once checkout is in progress.
   */
  checkoutIntent: boolean;
}

// ─── tool result ──────────────────────────────────────────────

export interface ToolResult {
  success: boolean;
  message: string;
  data?: unknown;
}

// ─── OpenAI tool definitions ──────────────────────────────────

export const AI_TOOL_DEFINITIONS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "add_item",
      description:
        "Adiciona um item do cardápio ao pedido atual do cliente. " +
        "OBRIGATÓRIO: confirme que menuItemId existe EXATAMENTE no cardápio listado no prompt. " +
        "ID inválido, inventado ou aproximado = PROIBIDO. " +
        "Se success:false: NÃO confirme, NÃO tente outro ID — informe o cliente. " +
        "Máximo 1 chamada add_item por item por turno.",
      parameters: {
        type: "object",
        properties: {
          menuItemId: {
            type: "string",
            description: "ID exato do item no cardápio (campo [ID: ...]).",
          },
          quantity: {
            type: "number",
            description: "Quantidade a adicionar (mínimo 1).",
          },
          notes: {
            type: "string",
            description: "Observações especiais opcionais (ex: sem cebola).",
          },
          isUpsell: {
            type: "boolean",
            description: "true se este item foi sugerido por suggest_upsell.",
          },
        },
        required: ["menuItemId", "quantity"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remove_item",
      description: "Remove um item do pedido atual pelo seu ID de cardápio.",
      parameters: {
        type: "object",
        properties: {
          menuItemId: {
            type: "string",
            description: "ID do item no cardápio a ser removido.",
          },
        },
        required: ["menuItemId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_quantity",
      description: "Atualiza a quantidade de um item já presente no pedido.",
      parameters: {
        type: "object",
        properties: {
          menuItemId: {
            type: "string",
            description: "ID do item no cardápio.",
          },
          quantity: {
            type: "number",
            description: "Nova quantidade (mínimo 1).",
          },
        },
        required: ["menuItemId", "quantity"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "confirm_order",
      description:
        "Confirma e finaliza o pedido atual. " +
        "Só chame após apresentar o resumo e o cliente confirmar explicitamente.",
      parameters: {
        type: "object",
        properties: {
          fulfillmentType: {
            type: "string",
            enum: ["DELIVERY", "PICKUP", "DINE_IN"],
            description: "Tipo de entrega escolhido pelo cliente.",
          },
        },
        required: ["fulfillmentType"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "suggest_upsell",
      description:
        "Exibe um card visual do produto para o cliente e registra a sugestão de upsell. " +
        "OBRIGATÓRIO: execute esta ferramenta toda vez que quiser sugerir um item adicional. " +
        "Sem esta chamada o produto NÃO aparece para o cliente — a sugestão não existe. " +
        "Fluxo correto: 1 frase de introdução natural → suggest_upsell com o ID exato. " +
        "NUNCA mencione um produto no texto sem chamar esta ferramenta no mesmo turno.",
      parameters: {
        type: "object",
        properties: {
          menuItemId: {
            type: "string",
            description: "ID exato do item do cardápio a sugerir (campo [ID: ...]).",
          },
        },
        required: ["menuItemId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "handoff_to_human",
      description:
        "Transfere a conversa para um atendente humano. " +
        "Use quando: cliente insatisfeito, pedido fora do cardápio, " +
        "reclamação, dúvida complexa, ou baixa confiança na resposta.",
      parameters: {
        type: "object",
        properties: {
          reason: {
            type: "string",
            description: "Motivo da transferência para o atendente.",
          },
        },
        required: ["reason"],
      },
    },
  },
];

// ─── tool executor ────────────────────────────────────────────

export async function executeTool(
  toolName: string,
  rawArgs: string,
  ctx: ToolContext
): Promise<ToolResult> {
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(rawArgs) as Record<string, unknown>;
  } catch {
    return { success: false, message: "Argumentos inválidos (JSON inválido)" };
  }

  switch (toolName) {
    case "add_item":       return execAddItem(args, ctx);
    case "remove_item":    return execRemoveItem(args, ctx);
    case "update_quantity":return execUpdateQuantity(args, ctx);
    case "confirm_order":  return execConfirmOrder(args, ctx);
    case "suggest_upsell": return execSuggestUpsell(args, ctx);
    case "handoff_to_human":
      ctx.requestHandoff((args.reason as string) ?? "Solicitado pelo assistente");
      return { success: true, message: "Conversa transferida para atendente humano." };
    default:
      return { success: false, message: `Ferramenta desconhecida: ${toolName}` };
  }
}

// ─── individual executors ─────────────────────────────────────

async function execAddItem(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolResult> {
  const menuItemId = args.menuItemId as string;
  const quantity   = Number(args.quantity);
  const notes      = (args.notes as string | undefined) ?? null;
  const isUpsell   = (args.isUpsell as boolean | undefined) ?? false;

  if (!menuItemId) return { success: false, message: "menuItemId é obrigatório." };
  if (!Number.isInteger(quantity) || quantity < 1) {
    return { success: false, message: "Quantidade deve ser um inteiro >= 1." };
  }

  // Checkout lock: no new items after confirm_order has been attempted this turn
  if (ctx.checkoutIntent) {
    return {
      success: false,
      message: "BLOQUEADO: pedido em fase de confirmação. Não é possível adicionar itens.",
    };
  }

  // Safety: validate item belongs to this restaurant
  const menuItem = await prisma.menuItem.findFirst({
    where: {
      id: menuItemId,
      isActive: true,
      category: { restaurantId: ctx.restaurantId },
    },
    select: { id: true, name: true, price: true },
  });

  if (!menuItem) {
    return {
      success: false,
      message: `Item "${menuItemId}" não encontrado no cardápio. Nunca invente itens.`,
    };
  }

  // Ensure draft exists
  let draftId = ctx.draftId;
  if (!draftId) {
    const draft = await prisma.orderDraft.create({
      data: {
        restaurantId: ctx.restaurantId,
        customerId: ctx.customerId,
        conversationId: ctx.conversationId,
        status: "OPEN",
        fulfillmentType: "PICKUP",
      },
    });
    draftId = draft.id;
    ctx.setDraftId(draftId);
  }

  // Check if item already in draft — update quantity instead
  const existing = await prisma.orderDraftItem.findFirst({
    where: { orderDraftId: draftId, menuItemId },
  });

  if (existing) {
    await prisma.orderDraftItem.update({
      where: { id: existing.id },
      data: { quantity: existing.quantity + quantity, notes },
    });
  } else {
    await prisma.orderDraftItem.create({
      data: {
        orderDraftId: draftId,
        menuItemId,
        quantity,
        unitPrice: menuItem.price,
        isUpsell,
        notes,
      },
    });
  }

  await recomputeTotals(draftId);

  return {
    success: true,
    message: `Adicionado: ${quantity}x ${menuItem.name} (R$ ${Number(menuItem.price).toFixed(2)} cada)`,
    data: { menuItemId, name: menuItem.name, price: Number(menuItem.price), quantity },
  };
}

async function execRemoveItem(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolResult> {
  const menuItemId = args.menuItemId as string;
  if (!menuItemId || !ctx.draftId) {
    return { success: false, message: "Sem pedido ativo ou menuItemId não informado." };
  }

  const item = await prisma.orderDraftItem.findFirst({
    where: { orderDraftId: ctx.draftId, menuItemId },
    include: { menuItem: { select: { name: true } } },
  });

  if (!item) {
    return { success: false, message: `Item "${menuItemId}" não está no pedido.` };
  }

  await prisma.orderDraftItem.delete({ where: { id: item.id } });
  await recomputeTotals(ctx.draftId);

  return {
    success: true,
    message: `Removido: ${item.menuItem?.name ?? menuItemId}`,
  };
}

async function execUpdateQuantity(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolResult> {
  const menuItemId = args.menuItemId as string;
  const quantity   = Number(args.quantity);

  if (!menuItemId || !ctx.draftId) {
    return { success: false, message: "Sem pedido ativo ou menuItemId não informado." };
  }
  if (!Number.isInteger(quantity) || quantity < 1) {
    return { success: false, message: "Quantidade deve ser um inteiro >= 1." };
  }

  const item = await prisma.orderDraftItem.findFirst({
    where: { orderDraftId: ctx.draftId, menuItemId },
    include: { menuItem: { select: { name: true } } },
  });

  if (!item) {
    return { success: false, message: `Item "${menuItemId}" não está no pedido.` };
  }

  await prisma.orderDraftItem.update({
    where: { id: item.id },
    data: { quantity },
  });
  await recomputeTotals(ctx.draftId);

  return {
    success: true,
    message: `Atualizado: ${item.menuItem?.name ?? menuItemId} → ${quantity}x`,
  };
}

async function execConfirmOrder(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolResult> {
  // Hard limit: max 1 confirm_order call per turn — prevents retry loops
  if (ctx.confirmOrderAttempts >= 1) {
    return {
      success: false,
      message: "PARAR: confirm_order já foi tentado neste turno. Não repetir.",
    };
  }
  ctx.confirmOrderAttempts += 1;
  ctx.checkoutIntent = true;

  const fulfillmentType = (args.fulfillmentType as string) ?? "PICKUP";

  if (!ctx.draftId) {
    return { success: false, message: "Nenhum pedido para confirmar." };
  }

  const draft = await prisma.orderDraft.findUnique({
    where: { id: ctx.draftId },
    include: {
      items: {
        include: { menuItem: { include: { category: { select: { name: true } } } } },
      },
    },
  });

  if (!draft || draft.status !== "OPEN") {
    return { success: false, message: "Pedido não está aberto para confirmação." };
  }
  if (draft.items.length === 0) {
    return { success: false, message: "Não é possível confirmar um pedido sem itens." };
  }

  // Update fulfillment type on draft
  await prisma.orderDraft.update({
    where: { id: ctx.draftId },
    data: { fulfillmentType: fulfillmentType as "DELIVERY" | "PICKUP" | "DINE_IN" },
  });

  // Confirm: create immutable Order snapshot
  const totalAmount = draft.items.reduce(
    (sum, item) => sum + Number(item.unitPrice) * item.quantity,
    0
  );

  // Pre-fetch menu item names so the order snapshot is accurate from creation
  const menuItemIds = draft.items
    .map((i) => i.menuItemId)
    .filter((id): id is string => id !== null);
  const menuItemRows = await prisma.menuItem.findMany({
    where: { id: { in: menuItemIds } },
    select: { id: true, name: true },
  });
  const nameMap = Object.fromEntries(menuItemRows.map((m) => [m.id, m.name]));

  const order = await prisma.$transaction(async (tx) => {
    const newOrder = await tx.order.create({
      data: {
        restaurantId: ctx.restaurantId,
        customerId: ctx.customerId,
        orderDraftId: ctx.draftId!,
        status: "PENDING",
        source: "whatsapp",
        type:
          fulfillmentType === "DELIVERY" ? "DELIVERY"
          : fulfillmentType === "PICKUP"  ? "PICKUP"
          : "DINE_IN",
        subtotal: totalAmount,
        total: totalAmount,
        items: {
          create: draft.items.map((di) => ({
            menuItemId: di.menuItemId,
            name: (di.menuItemId ? nameMap[di.menuItemId] : null) ?? "Item",
            price: di.unitPrice,
            quantity: di.quantity,
            notes: di.notes,
            total: Number(di.unitPrice) * di.quantity,
            isUpsell: di.isUpsell,
          })),
        },
      },
    });

    // Mark draft confirmed
    await tx.orderDraft.update({
      where: { id: ctx.draftId! },
      data: { status: "CONFIRMED", confirmedAt: new Date() },
    });

    // Update customer stats
    await tx.customer.update({
      where: { id: ctx.customerId },
      data: {
        totalOrders: { increment: 1 },
        totalSpend: { increment: totalAmount },
        lastOrderAt: new Date(),
      },
    });

    return newOrder;
  });

  return {
    success: true,
    message: `Pedido confirmado! Número: #${order.id.slice(-6).toUpperCase()} | Total: R$ ${totalAmount.toFixed(2)}`,
    data: { orderId: order.id, total: totalAmount, fulfillmentType },
  };
}

async function execSuggestUpsell(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolResult> {
  const menuItemId = args.menuItemId as string;
  if (!menuItemId) return { success: false, message: "menuItemId é obrigatório." };

  // Guardrail: enforce single-suggestion-per-response rule (PART 4)
  if (ctx.upsellSuggestedThisTurn) {
    return {
      success: false,
      message: "Você já sugeriu um produto nesta resposta. Aguarde o cliente responder antes de sugerir outro item.",
    };
  }

  // Checkout lock: once checkout is in progress, upsell is blocked
  if (ctx.checkoutIntent) {
    return {
      success: false,
      message: "BLOQUEADO: pedido em fase de confirmação. suggest_upsell não é permitido após sinal de fechamento.",
    };
  }

  // Validate item belongs to this restaurant
  const item = await prisma.menuItem.findFirst({
    where: {
      id: menuItemId,
      isActive: true,
      category: { restaurantId: ctx.restaurantId },
    },
    select: {
      id: true,
      name: true,
      price: true,
      description: true,
      category: { select: { name: true } },
    },
  });

  if (!item) {
    return { success: false, message: `Item "${menuItemId}" não encontrado no cardápio.` };
  }

  // Mark suggestion as used for this turn (single-suggestion guardrail)
  ctx.upsellSuggestedThisTurn = true;

  // Drink Priority Engine: track drink attempts so confirm_order gate can enforce minimum
  const isDrink = !isMainCategory(item.category.name) && !isDessertCategory(item.category.name);
  if (isDrink) ctx.drinkAttemptsThisTurn += 1;

  return {
    success: true,
    message: `Sugestão disponível: ${item.name} — R$ ${Number(item.price).toFixed(2)}`,
    data: {
      menuItemId: item.id,
      name: item.name,
      price: Number(item.price),
      description: item.description,
      category: item.category.name,
    },
  };
}

// ─── internal helpers ─────────────────────────────────────────

async function recomputeTotals(draftId: string): Promise<void> {
  const items = await prisma.orderDraftItem.findMany({
    where: { orderDraftId: draftId },
    select: { quantity: true, unitPrice: true },
  });

  const subtotal = items.reduce(
    (sum, item) => sum + Number(item.unitPrice) * item.quantity,
    0
  );

  await prisma.orderDraft.update({
    where: { id: draftId },
    data: { subtotal, totalAmount: subtotal },
  });
}
