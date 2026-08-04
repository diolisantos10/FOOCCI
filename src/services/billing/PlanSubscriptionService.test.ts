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
    db.planSubscription.findUnique.mockResolvedValue({ ...ACEITA, id: "sub_cancelada", status: "CANCELADA" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const r = await PlanSubscriptionService.activate("sub_cancelada");

    const call = db.planSubscription.updateMany.mock.calls[0][0];
    // O filtro é o que TRAVA: só reativa quem NÃO está terminal.
    expect(call.where).toMatchObject({ id: "sub_cancelada", status: { notIn: ["CANCELADA"] } });
    expect(call.data.status).toBe("ATIVA");
    // count 0 → não deu sucesso silencioso: registrou COM o motivo.
    expect(r).toEqual({ ok: false, reason: "terminal" });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("assinatura viva reativa normalmente (não super-bloqueia o caminho legítimo)", async () => {
    db.planSubscription.updateMany.mockResolvedValue({ count: 1 });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const r = await PlanSubscriptionService.activate("sub_viva");

    expect(r.ok).toBe(true);
    expect(db.planSubscription.updateMany).toHaveBeenCalledOnce();
    // Caminho feliz não faz leitura extra: o UPDATE atômico já respondeu.
    expect(db.planSubscription.findUnique).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   (c) G4 — NÃO ATIVA SEM ACEITE DO CONTRATO
   ══════════════════════════════════════════════════════════════════════════ */

describe("activate — trava de contrato (G4)", () => {
  it("a exigência de aceite está DENTRO do UPDATE, não num if antes dele", async () => {
    db.planSubscription.updateMany.mockResolvedValue({ count: 1 });

    await PlanSubscriptionService.activate("sub_1");

    const call = db.planSubscription.updateMany.mock.calls[0][0];
    // É isto que fecha a janela entre ler e gravar: quem não tem aceite não é
    // alcançado pelo próprio UPDATE.
    expect(call.where).toMatchObject({ termsAcceptedAt: { not: null } });
  });

  it("assinatura SEM aceite não ativa — e o alerta carrega a evidência do cliente", async () => {
    db.planSubscription.updateMany.mockResolvedValue({ count: 0 });
    db.planSubscription.findUnique.mockResolvedValue({ ...ACEITA, termsAcceptedAt: null });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    const r = await PlanSubscriptionService.activate("sub_1");

    expect(r).toEqual({ ok: false, reason: "sem_aceite" });
    const logged = String(err.mock.calls[0]?.[0] ?? "");
    // Guardrail 6: quem ficou de fora, com que plano, e o link para resolver.
    expect(logged).toContain("SEM ACEITE");
    expect(logged).toContain("ana@rest.com");
    expect(logged).toContain("tok_abcdefghijklmno");
    err.mockRestore();
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   (a) G2 — UM ÚNICO PREAPPROVAL, MESMO COM DUPLO CLIQUE
   ══════════════════════════════════════════════════════════════════════════ */

describe("ensurePreapproval — nunca duas recorrências no mesmo cartão (G2)", () => {
  it("reenvio sequencial reaproveita o link e NÃO fala com o Mercado Pago", async () => {
    db.planSubscription.findUnique.mockResolvedValue({
      ...ACEITA,
      mpPreapprovalId: "pre_1",
      mpInitPoint: "https://mp/pay/1",
    });

    const r = await PlanSubscriptionService.ensurePreapproval("sub_1");

    expect(r).toMatchObject({ ok: true, preapprovalId: "pre_1", initPoint: "https://mp/pay/1", reused: true });
    expect(mp.createPreapproval).not.toHaveBeenCalled();
  });

  it("primeira vez cria UMA recorrência e grava com update condicional", async () => {
    db.planSubscription.findUnique.mockResolvedValue(ACEITA);
    mp.createPreapproval.mockResolvedValue({ id: "pre_novo", initPoint: "https://mp/pay/novo" });
    db.planSubscription.updateMany.mockResolvedValue({ count: 1 });

    const r = await PlanSubscriptionService.ensurePreapproval("sub_1");

    expect(r).toMatchObject({ ok: true, preapprovalId: "pre_novo", reused: false });
    expect(mp.createPreapproval).toHaveBeenCalledOnce();
    // A gravação só vale se ninguém tiver chegado antes.
    expect(db.planSubscription.updateMany.mock.calls[0][0].where).toMatchObject({
      id: "sub_1",
      mpPreapprovalId: null,
    });
  });

  it("na CORRIDA, o perdedor cancela no MP o preapproval órfão que criou", async () => {
    // Os dois requests leem "sem preapproval" ao mesmo tempo…
    db.planSubscription.findUnique
      .mockResolvedValueOnce(ACEITA)
      // …e depois de perder a gravação, relê e encontra o do vencedor.
      .mockResolvedValueOnce({ ...ACEITA, mpPreapprovalId: "pre_vencedor", mpInitPoint: "https://mp/pay/vencedor" });
    mp.createPreapproval.mockResolvedValue({ id: "pre_orfao", initPoint: "https://mp/pay/orfao" });
    db.planSubscription.updateMany.mockResolvedValue({ count: 0 }); // perdeu a corrida
    mp.cancelPreapproval.mockResolvedValue({ ok: true, status: "cancelled" });

    const r = await PlanSubscriptionService.ensurePreapproval("sub_1");

    // O órfão foi CANCELADO no MP — é isto que impede a segunda cobrança.
    expect(mp.cancelPreapproval).toHaveBeenCalledWith("pre_orfao");
    // E o cliente recebe o link da recorrência que de fato existe.
    expect(r).toMatchObject({ ok: true, preapprovalId: "pre_vencedor", reused: true });
  });

  it("assinatura cancelada não gera link de cobrança", async () => {
    db.planSubscription.findUnique.mockResolvedValue({ ...ACEITA, status: "CANCELADA" });
    const r = await PlanSubscriptionService.ensurePreapproval("sub_1");
    expect(r).toEqual({ ok: false, reason: "terminal" });
    expect(mp.createPreapproval).not.toHaveBeenCalled();
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   (d) O DEGRAU DO PREÇO: 1º mês com desconto → renovação cheia
   ══════════════════════════════════════════════════════════════════════════ */

describe("syncFullAmount — o segundo ciclo é cobrado cheio", () => {
  it("eleva o preapproval do valor da 1ª cobrança para o valor do ciclo", async () => {
    db.planSubscription.findUnique.mockResolvedValue({ ...ACEITA, mpPreapprovalId: "pre_1" });
    db.planSubscription.updateMany.mockResolvedValue({ count: 1 });
    mp.updatePreapprovalAmount.mockResolvedValue({ ok: true });

    const r = await PlanSubscriptionService.syncFullAmount("sub_1");

    expect(r.ok).toBe(true);
    expect(mp.updatePreapprovalAmount).toHaveBeenCalledWith("pre_1", 42900, "MENSAL");
  });

  it("webhook reenviado não repete o degrau (idempotente pelo carimbo)", async () => {
    db.planSubscription.findUnique.mockResolvedValue({
      ...ACEITA,
      mpPreapprovalId: "pre_1",
      fullAmountSyncedAt: new Date(),
    });

    const r = await PlanSubscriptionService.syncFullAmount("sub_1");

    expect(r).toMatchObject({ ok: true, reason: "ja_sincronizado" });
    expect(mp.updatePreapprovalAmount).not.toHaveBeenCalled();
  });

  it("se o MP recusar, desfaz o carimbo e grava o erro — receita não some em silêncio", async () => {
    db.planSubscription.findUnique.mockResolvedValue({ ...ACEITA, mpPreapprovalId: "pre_1" });
    db.planSubscription.updateMany.mockResolvedValue({ count: 1 });
    mp.updatePreapprovalAmount.mockResolvedValue({ ok: false, reason: "mp_recusou", detail: "500" });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    const r = await PlanSubscriptionService.syncFullAmount("sub_1");

    expect(r.ok).toBe(false);
    const written = db.planSubscription.update.mock.calls.at(-1)?.[0];
    // Carimbo desfeito: a próxima tentativa não acha que já foi feito.
    expect(written.data.fullAmountSyncedAt).toBeNull();
    expect(String(written.data.priceSyncError)).toContain("Ana");
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});
