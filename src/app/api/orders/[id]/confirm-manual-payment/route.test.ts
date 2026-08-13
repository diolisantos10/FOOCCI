/**
 * /api/orders/[id]/confirm-manual-payment — o socorro do lojista.
 *
 * O DEFEITO que estes testes travam (raio-x de 13/08/2026): esta rota escrevia
 * `status: "CONFIRMED"` direto no banco e, por isso, NÃO enfileirava a comanda
 * nem emitia a NFC-e. O cliente pagava, o lojista socorria o Pix cujo aviso não
 * chegou, o pedido sumia da fila de pendentes — e a cozinha nunca ficava
 * sabendo. Quem descobria era o cliente, com fome.
 *
 * Por isso a cadeia aqui é REAL: só o banco, o tenant e as duas pontas de
 * efeito (impressão e fiscal) são dublês. `OrderService.updateStatus` e
 * `runOrderConfirmedEffects` rodam de verdade — senão o teste provaria o meu
 * próprio mock, não a costura.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const maybeEnqueueOrder  = vi.fn().mockResolvedValue(undefined);
const maybeEmitForOrder  = vi.fn().mockResolvedValue(undefined);
const maybeSendOrder     = vi.fn().mockResolvedValue(undefined);
const notifyCustomer     = vi.fn().mockResolvedValue(undefined);
const getTenantContext   = vi.fn();

const orderUpdate     = vi.fn();
const paymentUpdate   = vi.fn();
const paymentCreate   = vi.fn();
const orderFindFirst  = vi.fn();
const orderFindUnique = vi.fn();

vi.mock("@/lib/tenant", () => ({
  getTenantContext: (...a: unknown[]) => getTenantContext(...a),
}));
vi.mock("@/services/print/PrintQueueService", () => ({
  PrintQueueService: { maybeEnqueueOrder: (...a: unknown[]) => maybeEnqueueOrder(...a) },
}));
vi.mock("@/services/fiscal/FiscalEmissionService", () => ({
  FiscalEmissionService: { maybeEmitForOrder: (...a: unknown[]) => maybeEmitForOrder(...a) },
}));
vi.mock("@/services/integrations/SaiposIntegrationService", () => ({
  SaiposIntegrationService: { maybeSendOrder: (...a: unknown[]) => maybeSendOrder(...a) },
}));
vi.mock("@/services/order/OrderNotificationService", () => ({
  OrderNotificationService: { notifyCustomerOnStatusChange: (...a: unknown[]) => notifyCustomer(...a) },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    order: {
      findFirst:  (...a: unknown[]) => orderFindFirst(...a),
      findUnique: (...a: unknown[]) => orderFindUnique(...a),
      update:     (...a: unknown[]) => orderUpdate(...a),
    },
    payment: {
      update:     (...a: unknown[]) => paymentUpdate(...a),
      create:     (...a: unknown[]) => paymentCreate(...a),
      findUnique: vi.fn().mockResolvedValue({ status: "PAID" }),
    },
    $transaction: async (arg: unknown) =>
      typeof arg === "function"
        ? (arg as (tx: unknown) => unknown)({
            order:   { update: (...a: unknown[]) => orderUpdate(...a) },
            payment: {
              update: (...a: unknown[]) => paymentUpdate(...a),
              create: (...a: unknown[]) => paymentCreate(...a),
            },
          })
        : Promise.all(arg as unknown[]),
  },
}));

import { POST } from "./route";

const RID = "rest_1";
const OID = "order_1";

function req(body: unknown = { reason: "cliente mostrou o comprovante" }) {
  return { json: async () => body } as unknown as Parameters<typeof POST>[0];
}
const params = { params: { id: OID } };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  getTenantContext.mockReturnValue({ restaurantId: RID, role: "OWNER" });
  orderUpdate.mockResolvedValue({ id: OID, status: "CONFIRMED" });
  paymentUpdate.mockResolvedValue({});
  paymentCreate.mockResolvedValue({});
});

/** O pedido como o banco o devolve nas duas leituras que a rota/serviço fazem. */
function comPedido(status: string, payment: unknown = { status: "LINK_SENT" }) {
  orderFindFirst.mockResolvedValue({
    id: OID, restaurantId: RID, status, total: 87.5, notes: null, payment,
  });
  orderFindUnique.mockResolvedValue({ id: OID, restaurantId: RID, status });
}

describe("POST confirm-manual-payment — o socorro tem que mandar a comanda", () => {
  it("(a) Pix socorrido: registra o pagamento E ENFILEIRA A COMANDA e a NFC-e", async () => {
    comPedido("AWAITING_PAYMENT");

    const res = await POST(req(), params);
    expect(res.status).toBe(200);

    // O dinheiro foi registrado
    expect(paymentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "PAID" }) }),
    );

    // ── A trava desta correção: a cozinha ficou sabendo ────────────────────
    expect(maybeEnqueueOrder).toHaveBeenCalledWith(RID, OID);
    expect(maybeEmitForOrder).toHaveBeenCalledWith(RID, OID);
  });

  it("(a') o pedido de fato foi para CONFIRMED, e por UMA escrita de status só", async () => {
    comPedido("AWAITING_PAYMENT");
    await POST(req(), params);

    const escritasDeStatus = orderUpdate.mock.calls.filter(
      (c) => (c[0] as { data?: Record<string, unknown> })?.data?.status !== undefined,
    );
    expect(escritasDeStatus).toHaveLength(1);
    expect((escritasDeStatus[0]![0] as { data: { status: string } }).data.status).toBe("CONFIRMED");
  });

  it("(b) PENDING também é socorrido e imprime", async () => {
    comPedido("PENDING");
    const res = await POST(req(), params);
    expect(res.status).toBe(200);
    expect(maybeEnqueueOrder).toHaveBeenCalledWith(RID, OID);
  });

  it("(c) PREPARING: reconcilia o dinheiro e NÃO reimprime — a comanda já saiu", async () => {
    comPedido("PREPARING");

    const res = await POST(req(), params);
    expect(res.status).toBe(200);
    expect(paymentUpdate).toHaveBeenCalled();
    // Nada de status novo, nada de segunda comanda.
    expect(maybeEnqueueOrder).not.toHaveBeenCalled();
    const escritasDeStatus = orderUpdate.mock.calls.filter(
      (c) => (c[0] as { data?: Record<string, unknown> })?.data?.status !== undefined,
    );
    expect(escritasDeStatus).toHaveLength(0);
  });

  it("(d) pedido já pago: idempotente, não gera segunda comanda", async () => {
    comPedido("AWAITING_PAYMENT", { status: "PAID" });

    const res = await POST(req(), params);
    const json = await res.json() as { alreadyPaid?: boolean };
    expect(json.alreadyPaid).toBe(true);
    expect(maybeEnqueueOrder).not.toHaveBeenCalled();
  });

  it("(e) o pedido não avançar NÃO vira sucesso silencioso — 502 dizendo que o dinheiro entrou", async () => {
    // O banco devolve o pedido para a rota, mas o serviço não o encontra
    // (corrida, pedido apagado): a transição falha.
    orderFindFirst.mockResolvedValue({
      id: OID, restaurantId: RID, status: "AWAITING_PAYMENT", total: 10, notes: null,
      payment: { status: "LINK_SENT" },
    });
    orderFindUnique.mockResolvedValue(null);

    const res = await POST(req(), params);
    expect(res.status).toBe(502);
    const json = await res.json() as { paymentRecorded?: boolean; error?: string };
    expect(json.paymentRecorded).toBe(true);
    expect(json.error).toMatch(/não avançou/i);
    expect(maybeEnqueueOrder).not.toHaveBeenCalled();
  });

  it("(f) sem motivo escrito → 400, e nada é tocado", async () => {
    comPedido("AWAITING_PAYMENT");
    const res = await POST(req({}), params);
    expect(res.status).toBe(400);
    expect(paymentUpdate).not.toHaveBeenCalled();
    expect(maybeEnqueueOrder).not.toHaveBeenCalled();
  });

  it("(g) quem não é OWNER/MANAGER não socorre pagamento", async () => {
    getTenantContext.mockReturnValue({ restaurantId: RID, role: "STAFF" });
    const res = await POST(req(), params);
    expect(res.status).toBe(403);
    expect(paymentUpdate).not.toHaveBeenCalled();
  });
});
