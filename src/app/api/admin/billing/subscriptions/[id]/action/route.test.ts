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
  planSubscription: { findUnique: vi.fn(), update: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/admin-auth", () => ({ checkAdminRequest: () => true }));

const mp = vi.hoisted(() => ({ cancelPreapproval: vi.fn() }));
vi.mock("@/services/billing/MercadoPagoPlatformBilling", () => ({ MercadoPagoPlatformBilling: mp }));
vi.mock("@/services/billing/PlanNfseService", () => ({ PlanNfseService: {} }));

import { POST } from "./route";

const cancelReq = () =>
  new NextRequest("https://foocci.com.br/api/admin/billing/subscriptions/sub_1/action", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "cancel" }),
  });
const params = { params: { id: "sub_1" } };

beforeEach(() => {
  vi.clearAllMocks();
  db.planSubscription.update.mockResolvedValue({});
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
