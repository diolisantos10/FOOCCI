/**
 * Webhook de assinatura da plataforma — trava terminal do CR A1.
 *
 * Prova que um pagamento aprovado chegando do Mercado Pago para uma assinatura
 * CANCELADA:
 *   (b) NÃO reativa a assinatura E NÃO gera fatura/NFS-e (cobrança-zumbi para aqui);
 *   (c) o mesmo pagamento para uma assinatura viva (AGUARDANDO_PAGAMENTO) segue
 *       faturando e ativando — a trava não estraga o caminho legítimo.
 *
 * PlanSubscriptionService roda de verdade sobre o prisma mockado — a trava
 * (updateMany atômico) é exercida, não simulada.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  planSubscription: { findUnique: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
  planInvoice: { findUnique: vi.fn(), create: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

const mp = vi.hoisted(() => ({
  fetchPayment: vi.fn(),
  fetchPreapproval: vi.fn(),
  updatePreapprovalAmount: vi.fn().mockResolvedValue({ ok: true }),
  cancelPreapproval: vi.fn(),
  createPreapproval: vi.fn(),
}));
vi.mock("@/services/billing/MercadoPagoPlatformBilling", () => ({
  MercadoPagoPlatformBilling: mp,
  isPlatformBillingConfigured: () => true,
}));

const nfse = vi.hoisted(() => ({ emit: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock("@/services/billing/PlanNfseService", () => ({ PlanNfseService: nfse }));

// A costura pagamento → conta. Mockada aqui porque o que este arquivo prova é
// QUANDO ela é chamada; a idempotência dela própria está em
// PlanProvisioningService.test.ts.
const prov = vi.hoisted(() => ({
  provision: vi.fn().mockResolvedValue({ status: "criado", restaurantId: "rest_1", slug: "loja" }),
}));
vi.mock("@/services/billing/PlanProvisioningService", () => ({ PlanProvisioningService: prov }));

import { POST } from "./route";

/** Assinatura viva e COM aceite — o caminho legítimo. */
const VIVA = {
  id: "sub_1",
  status: "AGUARDANDO_PAGAMENTO",
  priceCents: 42900,
  firstChargeCents: 21450,
  cycle: "MENSAL",
  plan: "GROWTH",
  customerName: "Ana",
  customerEmail: "ana@rest.com",
  customerWhatsapp: "11999999999",
  acceptToken: "tok_1234567890abcdef",
  termsAcceptedAt: new Date("2026-08-04T10:00:00Z"),
  mpPreapprovalId: "pre_1",
  mpInitPoint: "https://mp/pay/1",
  fullAmountSyncedAt: null,
};

const paymentReq = () =>
  new Request("https://foocci.com.br/api/billing/mp-webhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "payment", data: { id: "pay_1" } }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mp.fetchPayment.mockResolvedValue({
    status: "approved",
    amountCents: 42900,
    preapprovalId: "pre_1",
    externalReference: "sub_1",
    approvedAt: "2026-09-01T12:00:00.000Z",
  });
  db.planInvoice.findUnique.mockResolvedValue(null);
  db.planInvoice.create.mockResolvedValue({ id: "inv_1" });
  db.planSubscription.updateMany.mockResolvedValue({ count: 1 });
  db.planSubscription.update.mockResolvedValue({});
  prov.provision.mockResolvedValue({ status: "criado", restaurantId: "rest_1", slug: "loja" });
});

describe("POST mp-webhook — pagamento aprovado", () => {
  it("(b) assinatura CANCELADA: não reativa e não fatura", async () => {
    db.planSubscription.findUnique.mockResolvedValue({ ...VIVA, status: "CANCELADA" });

    const res = await POST(paymentReq());
    const body = await res.json();

    expect(body).toMatchObject({ ignored: true, reason: "subscription_terminal" });
    // Nenhuma fatura criada — não se emite NFS-e para cobrança-zumbi.
    expect(db.planInvoice.create).not.toHaveBeenCalled();
    // Nenhuma tentativa de reativar.
    expect(db.planSubscription.updateMany).not.toHaveBeenCalled();
    expect(nfse.emit).not.toHaveBeenCalled();
  });

  it("(c) assinatura viva (AGUARDANDO_PAGAMENTO): fatura, ativa e CRIA A CONTA", async () => {
    db.planSubscription.findUnique.mockResolvedValue(VIVA);

    const res = await POST(paymentReq());
    const body = await res.json();

    expect(body).toMatchObject({ ok: true });
    // Fatura registrada (fila da NFS-e).
    expect(db.planInvoice.create).toHaveBeenCalledOnce();
    // Ativou pela trava atômica, filtrando terminais E exigindo aceite.
    const upd = db.planSubscription.updateMany.mock.calls[0][0];
    expect(upd.where).toMatchObject({
      id: "sub_1",
      status: { notIn: ["CANCELADA"] },
      termsAcceptedAt: { not: null },
    });
    expect(upd.data.status).toBe("ATIVA");
    // A COSTURA: a conta do cliente nasce no mesmo evento que confirma o dinheiro.
    expect(prov.provision).toHaveBeenCalledWith("sub_1");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   (b) WEBHOOK DUPLICADO — o MP reenvia o MESMO evento
   ══════════════════════════════════════════════════════════════════════════ */

describe("POST mp-webhook — reenvio do mesmo pagamento", () => {
  it("não fatura duas vezes e não emite duas notas", async () => {
    db.planSubscription.findUnique.mockResolvedValue(VIVA);
    // Segunda passada: a fatura daquele mpPaymentId já existe.
    db.planInvoice.findUnique.mockResolvedValue({ id: "inv_1" });

    await POST(paymentReq());

    expect(db.planInvoice.create).not.toHaveBeenCalled();
    expect(nfse.emit).not.toHaveBeenCalled();
  });

  it("chama a costura de novo — e é ELA que garante um restaurante só", async () => {
    db.planSubscription.findUnique.mockResolvedValue({ ...VIVA, status: "ATIVA" });
    db.planInvoice.findUnique.mockResolvedValue({ id: "inv_1" });
    // Na segunda passada o provisionamento reconhece que já foi feito.
    prov.provision.mockResolvedValue({ status: "ja_provisionado", restaurantId: "rest_1", slug: "loja" });

    await POST(paymentReq());
    await POST(paymentReq());

    // O webhook não tenta ser esperto: chama sempre. A idempotência mora no
    // serviço (UNIQUE de originSubscriptionId), não numa condição aqui.
    expect(prov.provision).toHaveBeenCalledTimes(2);
    // E nenhuma cobrança nova saiu do reenvio.
    expect(db.planInvoice.create).not.toHaveBeenCalled();
  });

  it("o degrau para o valor cheio só é tentado na PRIMEIRA cobrança", async () => {
    db.planSubscription.findUnique.mockResolvedValue({ ...VIVA, status: "ATIVA" });
    db.planInvoice.findUnique.mockResolvedValue({ id: "inv_1" }); // reenvio: nada criado

    await POST(paymentReq());

    // Sem fatura nova, não há degrau — senão um reenvio velho tentaria mexer no
    // valor de uma assinatura que já está no preço cheio.
    expect(mp.updatePreapprovalAmount).not.toHaveBeenCalled();
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   (c) NÃO ATIVA — E NÃO CRIA CONTA — SEM ACEITE DO CONTRATO
   ══════════════════════════════════════════════════════════════════════════ */

describe("POST mp-webhook — pagamento sem aceite do Termo", () => {
  it("registra a cobrança (dinheiro entrou) mas NÃO ativa nem cria a conta", async () => {
    db.planSubscription.findUnique.mockResolvedValue({ ...VIVA, termsAcceptedAt: null });
    db.planSubscription.updateMany.mockResolvedValue({ count: 0 }); // o UPDATE não alcança quem não aceitou
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(paymentReq());
    const body = await res.json();

    expect(body).toMatchObject({ ok: true, invoiced: true, activated: false, reason: "sem_aceite" });
    // O dinheiro entrou: a nota é devida e a cobrança fica registrada.
    expect(db.planInvoice.create).toHaveBeenCalledOnce();
    // Mas o acesso fica retido — nenhuma conta é criada sem contrato.
    expect(prov.provision).not.toHaveBeenCalled();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   Evento de preapproval autorizado — o outro caminho de ativação
   ══════════════════════════════════════════════════════════════════════════ */

describe("POST mp-webhook — preapproval authorized", () => {
  const preReq = () =>
    new Request("https://foocci.com.br/api/billing/mp-webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "preapproval", data: { id: "pre_1" } }),
    });

  it("ativa e cria a conta quando há aceite", async () => {
    mp.fetchPreapproval.mockResolvedValue({ status: "authorized", externalReference: "sub_1" });
    db.planSubscription.findUnique.mockResolvedValue(VIVA);

    await POST(preReq());

    expect(prov.provision).toHaveBeenCalledWith("sub_1");
  });

  it("sem aceite, não ativa e não cria conta", async () => {
    mp.fetchPreapproval.mockResolvedValue({ status: "authorized", externalReference: "sub_1" });
    db.planSubscription.findUnique.mockResolvedValue({ ...VIVA, termsAcceptedAt: null });
    db.planSubscription.updateMany.mockResolvedValue({ count: 0 });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(preReq());
    const body = await res.json();

    expect(body).toMatchObject({ activated: false, reason: "sem_aceite" });
    expect(prov.provision).not.toHaveBeenCalled();
    err.mockRestore();
  });
});
