/**
 * Ação "cancel" do admin de billing — CR A1.
 *
 * Prova que cancelar uma assinatura:
 *   (a) DISPARA o cancelamento do preapproval no Mercado Pago e marca o estado
 *       terminal (CANCELADA) no nosso banco;
 *   (a') se o MP FALHAR, não vira sucesso silencioso: responde 502, mas AINDA
 *        assim marca terminal localmente (a trava anti-reativação é armada de
 *        qualquer forma — é ela que independe do token);
 *   (a'') sem token de plataforma, o preapproval não é cancelado no MP e a
 *        resposta avisa o operador (dependência do MP_PLATFORM_ACCESS_TOKEN);
 *   (a''') assinatura sem preapproval (venda manual, nunca teve gateway) cancela
 *        localmente sem tocar o MP.
 *
 * PlanSubscriptionService.cancel roda de verdade sobre o prisma mockado.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  planSubscription: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/admin-auth", () => ({ checkAdminRequest: () => true }));

const mp = vi.hoisted(() => ({ cancelPreapproval: vi.fn(), createPreapproval: vi.fn(), updatePreapprovalAmount: vi.fn() }));
vi.mock("@/services/billing/MercadoPagoPlatformBilling", () => ({
  MercadoPagoPlatformBilling: mp,
  isPlatformBillingConfigured: () => true,
}));
vi.mock("@/services/billing/PlanNfseService", () => ({ PlanNfseService: {} }));

const prov = vi.hoisted(() => ({ provision: vi.fn().mockResolvedValue({ status: "sem_dados_de_cadastro" }) }));
vi.mock("@/services/billing/PlanProvisioningService", () => ({ PlanProvisioningService: prov }));

import { POST } from "./route";

const actionReq = (action: string) =>
  new NextRequest("https://foocci.com.br/api/admin/billing/subscriptions/sub_1/action", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action }),
  });
const cancelReq = () => actionReq("cancel");
const params = { params: { id: "sub_1" } };

beforeEach(() => {
  vi.clearAllMocks();
  db.planSubscription.update.mockResolvedValue({});
  db.planSubscription.updateMany.mockResolvedValue({ count: 1 });
  prov.provision.mockResolvedValue({ status: "sem_dados_de_cadastro" });
});

describe("POST action cancel", () => {
  it("(a) cancela no MP e deixa o estado terminal (CANCELADA)", async () => {
    db.planSubscription.findUnique.mockResolvedValue({ id: "sub_1", status: "ATIVA", mpPreapprovalId: "pre_1" });
    mp.cancelPreapproval.mockResolvedValue({ ok: true, status: "cancelled" });

    const res = await POST(cancelReq(), params);
    const body = await res.json();

    expect(mp.cancelPreapproval).toHaveBeenCalledWith("pre_1");
    // Estado terminal gravado.
    expect(db.planSubscription.update).toHaveBeenCalledOnce();
    const upd = db.planSubscription.update.mock.calls[0][0];
    expect(upd.where).toEqual({ id: "sub_1" });
    expect(upd.data.status).toBe("CANCELADA");
    expect(upd.data.canceledAt).toBeInstanceOf(Date);
    expect(body).toMatchObject({ ok: true });
  });

  it("(a') MP recusa: 502, sem sucesso silencioso, MAS trava local armada", async () => {
    db.planSubscription.findUnique.mockResolvedValue({ id: "sub_1", status: "ATIVA", mpPreapprovalId: "pre_1" });
    mp.cancelPreapproval.mockResolvedValue({ ok: false, reason: "mp_recusou", detail: "500: erro" });

    const res = await POST(cancelReq(), params);
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body).toMatchObject({ ok: false, canceledLocally: true });
    // A trava anti-reativação é armada mesmo com o MP falhando.
    expect(db.planSubscription.update.mock.calls[0][0].data.status).toBe("CANCELADA");
  });

  it("(a'') sem MP_PLATFORM_ACCESS_TOKEN: avisa o operador e ainda cancela local", async () => {
    db.planSubscription.findUnique.mockResolvedValue({ id: "sub_1", status: "ATIVA", mpPreapprovalId: "pre_1" });
    mp.cancelPreapproval.mockResolvedValue({ ok: false, reason: "gateway_nao_configurado" });

    const res = await POST(cancelReq(), params);
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.gatewayError).toContain("MP_PLATFORM_ACCESS_TOKEN");
    expect(db.planSubscription.update.mock.calls[0][0].data.status).toBe("CANCELADA");
  });

  it("(a''') assinatura sem preapproval (manual): cancela local sem tocar o MP", async () => {
    db.planSubscription.findUnique.mockResolvedValue({ id: "sub_1", status: "ATIVA", mpPreapprovalId: null });

    const res = await POST(cancelReq(), params);
    const body = await res.json();

    expect(mp.cancelPreapproval).not.toHaveBeenCalled();
    expect(db.planSubscription.update.mock.calls[0][0].data.status).toBe("CANCELADA");
    expect(body).toMatchObject({ ok: true });
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   G2 — o botão "gerar link MP" não pode criar uma segunda recorrência
   ══════════════════════════════════════════════════════════════════════════ */

describe("POST action mp-link", () => {
  const SUB = {
    id: "sub_1",
    status: "ACEITO",
    customerName: "Ana",
    customerEmail: "ana@rest.com",
    plan: "GROWTH",
    cycle: "MENSAL",
    priceCents: 42900,
    firstChargeCents: 21450,
    acceptToken: "tok_1234567890abcdef",
    termsAcceptedAt: new Date(),
    mpPreapprovalId: null,
    mpInitPoint: null,
  };

  it("clicar duas vezes NÃO cria duas assinaturas no Mercado Pago", async () => {
    // 1º clique: não há preapproval → cria.
    db.planSubscription.findUnique.mockResolvedValue(SUB);
    mp.createPreapproval.mockResolvedValue({ id: "pre_1", initPoint: "https://mp/pay/1" });
    const r1 = await POST(actionReq("mp-link"), params);
    expect((await r1.json()).initPoint).toBe("https://mp/pay/1");
    expect(mp.createPreapproval).toHaveBeenCalledOnce();

    // 2º clique: agora a assinatura já tem preapproval → reaproveita.
    mp.createPreapproval.mockClear();
    db.planSubscription.findUnique.mockResolvedValue({
      ...SUB,
      mpPreapprovalId: "pre_1",
      mpInitPoint: "https://mp/pay/1",
    });
    const r2 = await POST(actionReq("mp-link"), params);
    const b2 = await r2.json();

    expect(b2).toMatchObject({ ok: true, initPoint: "https://mp/pay/1", reused: true });
    // Era ISTO que faltava: nenhuma chamada nova ao MP.
    expect(mp.createPreapproval).not.toHaveBeenCalled();
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   G4 — ativar manualmente sem aceite é recusado, com o motivo na tela
   ══════════════════════════════════════════════════════════════════════════ */

describe("POST action activate", () => {
  it("sem aceite: 409 com o link de aceite, e nenhuma conta é criada", async () => {
    db.planSubscription.findUnique.mockResolvedValue({
      id: "sub_1",
      status: "AGUARDANDO_PAGAMENTO",
      customerName: "Ana",
      customerEmail: "ana@rest.com",
      customerWhatsapp: "11999999999",
      plan: "GROWTH",
      cycle: "MENSAL",
      acceptToken: "tok_1234567890abcdef",
      termsAcceptedAt: null,
    });
    db.planSubscription.updateMany.mockResolvedValue({ count: 0 });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(actionReq("activate"), params);
    const body = await res.json();

    expect(res.status).toBe(409);
    // O operador precisa saber o que fazer — não só que "não deu".
    expect(String(body.error)).toContain("Sem aceite");
    expect(String(body.error)).toContain("tok_1234567890abcdef");
    expect(prov.provision).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it("com aceite: ativa e roda a costura (que é no-op na venda 1:1)", async () => {
    db.planSubscription.findUnique.mockResolvedValue({
      id: "sub_1",
      status: "AGUARDANDO_PAGAMENTO",
      acceptToken: "tok_1234567890abcdef",
      termsAcceptedAt: new Date(),
    });

    const res = await POST(actionReq("activate"), params);

    expect(res.status).toBe(200);
    expect(prov.provision).toHaveBeenCalledWith("sub_1");
  });
});
