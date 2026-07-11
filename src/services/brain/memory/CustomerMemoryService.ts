/**
 * CustomerMemoryService — a memória durável de cliente do Brain (Cognição 8→9).
 *
 * Constrói, SOB DEMANDA e sem PII, um resumo comportamental do cliente a partir
 * do que o negócio já sabe (pedidos): frequência, favoritos, ticket, recência.
 * Nunca contém nome/telefone/endereço — só comportamento agregado, dentro do
 * BRAIN_SAFETY. Determinístico (sem LLM, custo zero de token para construir);
 * best-effort: qualquer erro = memória vazia, nunca quebra o atendimento.
 */

import { prisma } from "@/lib/prisma";

const RECENT_ORDERS = 10;
const TOP_ITEMS = 3;

export interface CustomerMemory {
  /** Resumo pronto para o prompt (PT-BR, sanitizado). Vazio = cliente sem histórico. */
  summary: string;
  orderCount: number;
}

export async function buildCustomerMemory(restaurantId: string, customerId: string): Promise<CustomerMemory> {
  const empty: CustomerMemory = { summary: "", orderCount: 0 };
  try {
    const orders = await prisma.order.findMany({
      where: { restaurantId, customerId, status: { notIn: ["CANCELLED"] } },
      orderBy: { createdAt: "desc" },
      take: RECENT_ORDERS,
      select: {
        createdAt: true,
        total: true,
        items: { select: { name: true, quantity: true } },
      },
    });
    if (!orders.length) return empty;

    // Favoritos por quantidade acumulada (nomes de item são dados do negócio, não PII).
    const counts = new Map<string, number>();
    for (const order of orders) {
      for (const item of order.items) {
        counts.set(item.name, (counts.get(item.name) ?? 0) + item.quantity);
      }
    }
    const favorites = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_ITEMS)
      .map(([name]) => name);

    const avgTicket = orders.reduce((s, o) => s + Number(o.total), 0) / orders.length;
    const lastOrder = orders[0]!.createdAt;
    const daysSince = Math.floor((Date.now() - lastOrder.getTime()) / (24 * 60 * 60 * 1000));

    const parts = [
      `cliente recorrente (${orders.length}${orders.length === RECENT_ORDERS ? "+" : ""} pedidos)`,
      favorites.length ? `costuma pedir: ${favorites.join(", ")}` : "",
      `ticket médio ~R$ ${avgTicket.toFixed(0)}`,
      daysSince === 0 ? "pediu hoje" : `último pedido há ${daysSince} dia(s)`,
    ].filter(Boolean);

    return { summary: parts.join("; "), orderCount: orders.length };
  } catch {
    return empty;
  }
}
