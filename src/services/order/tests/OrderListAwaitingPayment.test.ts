/**
 * OrderService.list × AWAITING_PAYMENT — a outra metade do conserto do alerta.
 *
 * O alerta "N pagamentos pendentes" agora aponta para
 * `/orders?status=AWAITING_PAYMENT`. Isso só deixa de ser mentira se a listagem
 * DE FATO devolver esses pedidos quando eles são pedidos por nome.
 *
 * As duas metades, em cada teste:
 *   • sem pedido explícito → continuam FORA (não são fila de cozinha; se
 *     entrassem, poluiriam o preparo e fariam o alarme tocar por Pix não pago);
 *   • com pedido explícito → aparecem.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn().mockResolvedValue([]);
const count    = vi.fn().mockResolvedValue(0);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    order: {
      findMany: (...a: unknown[]) => findMany(...a),
      count:    (...a: unknown[]) => count(...a),
    },
  },
}));
vi.mock("@/services/integrations/SaiposIntegrationService", () => ({
  SaiposIntegrationService: { maybeSendOrder: vi.fn() },
}));
vi.mock("@/services/order/OrderNotificationService", () => ({
  OrderNotificationService: { notifyCustomerOnStatusChange: vi.fn() },
}));

import { OrderService } from "../OrderService";

const RID = "rest_1";
const baseQuery = { page: 1, limit: 50 } as Parameters<typeof OrderService.list>[1];

/** O `where` que foi de fato ao Postgres. */
function whereUsado(): Record<string, unknown> {
  return (findMany.mock.calls[0]![0] as { where: Record<string, unknown> }).where;
}

beforeEach(() => vi.clearAllMocks());

describe("a fila operacional esconde o Pix não pago", () => {
  it("sem status pedido, AWAITING_PAYMENT é excluído por NOT", async () => {
    await OrderService.list(RID, baseQuery);
    expect(whereUsado()).toMatchObject({ NOT: { status: "AWAITING_PAYMENT" } });
  });

  it("pedir outro status NÃO reabre a porta do AWAITING_PAYMENT", async () => {
    await OrderService.list(RID, { ...baseQuery, status: "PREPARING" } as typeof baseQuery);
    const where = whereUsado();
    expect(where).toMatchObject({ NOT: { status: "AWAITING_PAYMENT" }, status: "PREPARING" });
  });
});

describe("mas quem pergunta por eles, acha", () => {
  it("status=AWAITING_PAYMENT: some o NOT e o filtro pede exatamente esses", async () => {
    await OrderService.list(RID, { ...baseQuery, status: "AWAITING_PAYMENT" } as typeof baseQuery);
    const where = whereUsado();

    // A trava: com o NOT presente, `status` e `NOT.status` se anulariam e a
    // resposta seria SEMPRE vazia — que era exatamente o defeito de 13/08.
    expect(where.NOT).toBeUndefined();
    expect(where.status).toBe("AWAITING_PAYMENT");
    expect(where.restaurantId).toBe(RID);
  });

  it("a contagem usa o MESMO where da lista — número e lista não podem divergir", async () => {
    await OrderService.list(RID, { ...baseQuery, status: "AWAITING_PAYMENT" } as typeof baseQuery);
    const whereDaLista    = whereUsado();
    const whereDaContagem = (count.mock.calls[0]![0] as { where: Record<string, unknown> }).where;
    expect(whereDaContagem).toEqual(whereDaLista);
  });
});
