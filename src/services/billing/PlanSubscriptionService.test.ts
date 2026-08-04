/**
 * Trava terminal do CR A1 — nível serviço.
 *
 * `activate` NUNCA pode reativar uma assinatura CANCELADA. A trava é o
 * `updateMany` atômico com `status notIn TERMINAL_STATUSES`: não há janela entre
 * ler e gravar para um webhook ressuscitar uma sub recém-cancelada. É código
 * puro — nada aqui toca o Mercado Pago nem o MP_PLATFORM_ACCESS_TOKEN.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  planSubscription: { updateMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { PlanSubscriptionService, isTerminalStatus, TERMINAL_STATUSES } from "./PlanSubscriptionService";

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
