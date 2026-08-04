/**
 * Duas travas do `activate`, ambas no MESMO update atômico:
 *
 *  1. CR A1 — trava terminal: uma assinatura CANCELADA nunca reativa por evento
 *     externo (`status notIn TERMINAL_STATUSES`).
 *  2. G4 — trava de contrato: não ativa sem `termsAcceptedAt`. Sem ela, quem
 *     pulasse a tela de aceite e pagasse ficava ATIVO sem contrato assinado.
 *
 * Estar no `where` do UPDATE (e não num `if` antes dele) é o que fecha a janela
 * entre ler e gravar. É código puro — nada aqui toca o Mercado Pago.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  planSubscription: { updateMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

const mp = vi.hoisted(() => ({ createPreapproval: vi.fn(), cancelPreapproval: vi.fn(), updatePreapprovalAmount: vi.fn() }));
vi.mock("./MercadoPagoPlatformBilling", () => ({
  MercadoPagoPlatformBilling: mp,
  isPlatformBillingConfigured: () => true,
}));

import { PlanSubscriptionService, isTerminalStatus, TERMINAL_STATUSES } from "./PlanSubscriptionService";

const ACEITA = {
  id: "sub_1",
  status: "AGUARDANDO_PAGAMENTO",
  customerName: "Ana",
  customerEmail: "ana@rest.com",
  customerWhatsapp: "11999999999",
  plan: "GROWTH",
  cycle: "MENSAL",
  priceCents: 42900,
  firstChargeCents: 21450,
  acceptToken: "tok_abcdefghijklmno",
  termsAcceptedAt: new Date("2026-08-04T10:00:00Z"),
  mpPreapprovalId: null,
  mpInitPoint: null,
  fullAmountSyncedAt: null,
};

beforeEach(() => vi.clearAllMocks());

describe("isTerminalStatus", () => {
  it("CANCELADA é terminal; os estados do fluxo vivo não são", () => {
    expect(isTerminalStatus("CANCELADA")).toBe(true);
    expect(TERMINAL_STATUSES).toContain("CANCELADA");
    for (const s of ["DRAFT", "AGUARDANDO_ACEITE", "ACEITO", "AGUARDANDO_PAGAMENTO", "ATIVA", "INADIMPLENTE"] as const) {
      expect(isTerminalStatus(s)).toBe(false);
    }
  });
});

describe("activate — trava terminal atômica", () => {
  it("filtra estados terminais no próprio UPDATE (nenhuma sub CANCELADA reativa)", async () => {
    db.planSubscription.updateMany.mockResolvedValue({ count: 0 }); // MP já cancelada → 0 linhas
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await PlanSubscriptionService.activate("sub_cancelada");

    const call = db.planSubscription.updateMany.mock.calls[0][0];
    // O filtro é o que TRAVA: só reativa quem NÃO está terminal.
    expect(call.where).toMatchObject({ id: "sub_cancelada", status: { notIn: ["CANCELADA"] } });
    expect(call.data.status).toBe("ATIVA");
    // count 0 → não deu sucesso silencioso: registrou.
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("assinatura viva reativa normalmente (não super-bloqueia o caminho legítimo)", async () => {
    db.planSubscription.updateMany.mockResolvedValue({ count: 1 });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await PlanSubscriptionService.activate("sub_viva");

    expect(db.planSubscription.updateMany).toHaveBeenCalledOnce();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
