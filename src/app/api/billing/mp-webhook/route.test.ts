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
  planSubscription: { findUnique: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
  planInvoice: { findUnique: vi.fn(), create: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

const mp = vi.hoisted(() => ({ fetchPayment: vi.fn() }));
vi.mock("@/services/billing/MercadoPagoPlatformBilling", () => ({
  MercadoPagoPlatformBilling: mp,
  isPlatformBillingConfigured: () => true,
}));

const nfse = vi.hoisted(() => ({ emit: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock("@/services/billing/PlanNfseService", () => ({ PlanNfseService: nfse }));

import { POST } from "./route";

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
});

describe("POST mp-webhook — pagamento aprovado", () => {
  it("(b) assinatura CANCELADA: não reativa e não fatura", async () => {
    db.planSubscription.findUnique.mockResolvedValue({ id: "sub_1", status: "CANCELADA", priceCents: 42900 });

    const res = await POST(paymentReq());
    const body = await res.json();

    expect(body).toMatchObject({ ignored: true, reason: "subscription_terminal" });
    // Nenhuma fatura criada — não se emite NFS-e para cobrança-zumbi.
    expect(db.planInvoice.create).not.toHaveBeenCalled();
    // Nenhuma tentativa de reativar.
    expect(db.planSubscription.updateMany).not.toHaveBeenCalled();
    expect(nfse.emit).not.toHaveBeenCalled();
  });

  it("(c) assinatura viva (AGUARDANDO_PAGAMENTO): fatura e ativa normalmente", async () => {
    db.planSubscription.findUnique.mockResolvedValue({ id: "sub_1", status: "AGUARDANDO_PAGAMENTO", priceCents: 42900 });

    const res = await POST(paymentReq());
    const body = await res.json();

    expect(body).toMatchObject({ ok: true });
    // Fatura registrada (fila da NFS-e).
    expect(db.planInvoice.create).toHaveBeenCalledOnce();
    // Ativou pela trava atômica, filtrando terminais.
    const upd = db.planSubscription.updateMany.mock.calls[0][0];
    expect(upd.where).toMatchObject({ id: "sub_1", status: { notIn: ["CANCELADA"] } });
    expect(upd.data.status).toBe("ATIVA");
  });
});
