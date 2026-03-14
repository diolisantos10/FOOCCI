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
        "Use o ID exato do item listado no cardápio.",
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
        "Obtém detalhes de um item complementar para sugerir ao cliente. " +
        "Use IDs fornecidos pelo UpsellEngine ou do cardápio. " +
        "Retorna nome e preço para você formular a sugestão.",
      parameters: {
        type: "object",
        properties: {
          menuItemId: {
            type: "string",
            description: "ID do item do cardápio a sugerir.",
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
    message: `Removido: ${item.menuItem.name}`,
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
    message: `Atualizado: ${item.menuItem.name} → ${quantity}x`,
  };
}

async function execConfirmOrder(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolResult> {
  const fulfillmentType = (args.fulfillmentType as string) ?? "PICKUP";

  if (!ctx.draftId) {
    return { success: false, message: "Nenhum pedido para confirmar." };
  }

  const draft = await prisma.orderDraft.findUnique({
    where: { id: ctx.draftId },
    include: { items: true },
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

  const order = await prisma.$transaction(async (tx) => {
    const newOrder = await tx.order.create({
      data: {
        restaurantId: ctx.restaurantId,
        customerId: ctx.customerId,
        orderDraftId: ctx.draftId!,
        status: "PENDING",
        type:
          fulfillmentType === "DELIVERY" ? "DELIVERY"
          : fulfillmentType === "PICKUP"  ? "PICKUP"
          : "DINE_IN",
        subtotal: totalAmount,
        total: totalAmount,
        items: {
          create: draft.items.map((di) => ({
            menuItemId: di.menuItemId,
            name: "Item", // populated below via update — snapshot will be enriched
            price: di.unitPrice,
            quantity: di.quantity,
            notes: di.notes,
            total: Number(di.unitPrice) * di.quantity,
          })),
        },
      },
    });

    // Enrich order items with menu item names (snapshot)
    const menuItems = await tx.menuItem.findMany({
      where: { id: { in: draft.items.map((i) => i.menuItemId) } },
      select: { id: true, name: true },
    });
    const nameMap = Object.fromEntries(menuItems.map((m) => [m.id, m.name]));

    for (const oi of await tx.orderItem.findMany({ where: { orderId: newOrder.id } })) {
      const draftItem = draft.items.find((di) => di.menuItemId === oi.menuItemId);
      if (draftItem) {
        await tx.orderItem.update({
          where: { id: oi.id },
          data: { name: nameMap[draftItem.menuItemId] ?? "Item" },
        });
      }
    }

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
