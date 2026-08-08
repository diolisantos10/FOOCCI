/**
 * PORTÃO — a outra metade do "o pedido já foi aceito mas o som continua".
 *
 * O seletor (order-alert.ts) já cala quando o carimbo existe. Esta bateria prova
 * a metade que faltava: que o SERVIDOR de fato grava o carimbo quando o lojista
 * age. Sem ela, alguém podia parar de gravar `alarmAckAt` e o portão do seletor
 * continuaria verde com o defeito de volta em produção — o campo nunca chegaria
 * na resposta e o alarme voltaria a tocar em pedido já aceito.
 *
 * E a metade oposta, que é a que protege o lojista: pedido que entra CONFIRMADO
 * sozinho (checkout de pagar na entrega, webhook de pagamento, WhatsApp) NÃO
 * passa por aqui e portanto NÃO é carimbado — ninguém o viu ainda, e ele tem
 * que tocar.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  order:   { findUnique: vi.fn(), update: vi.fn() },
  payment: { findUnique: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/services/integrations/SaiposIntegrationService", () => ({
  SaiposIntegrationService: { maybeSendOrder: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("@/services/order/OrderNotificationService", () => ({
  OrderNotificationService: { notifyCustomerOnStatusChange: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("@/services/print/PrintQueueService", () => ({
  PrintQueueService: { maybeEnqueueOrder: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("@/services/fiscal/FiscalEmissionService", () => ({
  FiscalEmissionService: { maybeEmitForOrder: vi.fn().mockResolvedValue(undefined) },
}));

import { OrderService } from "../OrderService";

const REST  = "rest-1";
const ORDER = "order-1";

/** Os dados que o serviço mandou para o UPDATE do banco. */
const dadosGravados = () => db.order.update.mock.calls[0][0].data as Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  db.order.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: ORDER, restaurantId: REST, ...data }),
  );
  db.payment.findUnique.mockResolvedValue({ status: "PAID" });
});

describe("o servidor carimba quem agiu no pedido (alarmAckAt)", () => {
  it("aceitar (PENDING→CONFIRMED) grava o carimbo COM o usuário que agiu", async () => {
    db.order.findUnique.mockResolvedValue({ id: ORDER, restaurantId: REST, status: "PENDING", alarmAckAt: null });

    const r = await OrderService.updateStatus(REST, ORDER, { status: "CONFIRMED" }, "user-42");

    expect(r.ok).toBe(true);
    const data = dadosGravados();
    expect(data.alarmAckAt).toBeInstanceOf(Date);
    expect(data.alarmAckByUserId).toBe("user-42");
  });

  it("recusar (PENDING→CANCELLED) também é agir: carimba", async () => {
    db.order.findUnique.mockResolvedValue({ id: ORDER, restaurantId: REST, status: "PENDING", alarmAckAt: null });

    await OrderService.updateStatus(REST, ORDER, { status: "CANCELLED" }, "user-42");

    expect(dadosGravados().alarmAckAt).toBeInstanceOf(Date);
  });

  it("avançar um CONFIRMED que chegou sozinho (→PREPARING) carimba: alguém o viu agora", async () => {
    db.order.findUnique.mockResolvedValue({ id: ORDER, restaurantId: REST, status: "CONFIRMED", alarmAckAt: null });

    await OrderService.updateStatus(REST, ORDER, { status: "PREPARING" }, "user-9");

    expect(dadosGravados().alarmAckAt).toBeInstanceOf(Date);
    expect(dadosGravados().alarmAckByUserId).toBe("user-9");
  });

  it("só o PRIMEIRO carimbo vale — quem tratou de verdade não é reescrito pelo próximo passo", async () => {
    const antes = new Date("2026-08-08T12:00:00.000Z");
    db.order.findUnique.mockResolvedValue({ id: ORDER, restaurantId: REST, status: "CONFIRMED", alarmAckAt: antes });

    await OrderService.updateStatus(REST, ORDER, { status: "PREPARING" }, "user-outro");

    const data = dadosGravados();
    expect(data).not.toHaveProperty("alarmAckAt");
    expect(data).not.toHaveProperty("alarmAckByUserId");
  });

  it("transição ilegal não carimba nada (não houve ação válida sobre o pedido)", async () => {
    db.order.findUnique.mockResolvedValue({ id: ORDER, restaurantId: REST, status: "DELIVERED", alarmAckAt: null });

    const r = await OrderService.updateStatus(REST, ORDER, { status: "CONFIRMED" }, "user-42");

    expect(r.ok).toBe(false);
    expect(db.order.update).not.toHaveBeenCalled();
  });

  it("o status continua sendo gravado — o carimbo é acréscimo, não substituição", async () => {
    db.order.findUnique.mockResolvedValue({ id: ORDER, restaurantId: REST, status: "PENDING", alarmAckAt: null });

    await OrderService.updateStatus(REST, ORDER, { status: "CONFIRMED" }, "user-42");

    expect(dadosGravados().status).toBe("CONFIRMED");
  });
});

describe("pedido que ninguém viu NÃO é carimbado", () => {
  it("os caminhos automáticos não passam por updateStatus — o carimbo só nasce de ação da loja", () => {
    // Guarda de fonte: se um checkout/webhook começar a chamar updateStatus, ele
    // passaria a calar o alarme de um pedido que ninguém abriu. Aqui se prova que
    // o ÚNICO chamador é a rota do painel (PATCH /api/orders/[id]), autenticada.
    const { execSync } = require("node:child_process") as typeof import("node:child_process");
    const out = execSync(
      "grep -rln 'OrderService.updateStatus' src --include=*.ts --include=*.tsx || true",
      { encoding: "utf8", cwd: process.cwd() },
    ).trim().split("\n").filter(Boolean).filter((f) => !f.includes(".test."));
    expect(out).toEqual(["src/app/api/orders/[id]/route.ts"]);
  });
});
