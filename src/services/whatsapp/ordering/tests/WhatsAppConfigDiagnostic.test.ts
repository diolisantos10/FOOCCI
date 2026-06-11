/**
 * Teste controlado — config diagnostic (Parte 4).
 * Prova que o diagnóstico de configuração é SOMENTE LEITURA (nenhum
 * update/create/upsert/delete), que a prontidão (assessReadiness) bloqueia
 * corretamente cada pré-condição, que REPLY_ONLY nunca cria pedido/Pix
 * (modePermissions), que o rollback está documentado e que o checklist
 * operacional existe.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";

const db = vi.hoisted(() => {
  const writes = {
    update: vi.fn(), create: vi.fn(), upsert: vi.fn(),
    delete: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn(),
  };
  return {
    writes,
    restaurant: { findFirst: vi.fn(), findUnique: vi.fn(), ...writes },
    whatsAppTextOrderingConfig: { findUnique: vi.fn(), ...writes },
    paymentSettings: { findUnique: vi.fn(), ...writes },
    menuItem: { count: vi.fn(), ...writes },
    customer: { findFirst: vi.fn(), ...writes },
    order: { findFirst: vi.fn(), ...writes },
  };
});
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { runConfigDiagnostic, assessReadiness, ROLLBACK_STEPS } from "../configDiagnostic";
import { modePermissions } from "../WhatsAppTextOrderingRuntimeService";

const BASE_READY = {
  globalKillSwitch: false, globalPause: false, enabled: true, paused: false,
  mode: "ALLOWLIST_REPLY_ONLY", scope: "PHONE_ALLOWLIST", allowlistCount: 1,
  paymentOptionsEnabled: true, sampleProductsAvailable: 10,
};

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.WHATSAPP_TEXT_ORDERING_ENABLED;
  delete process.env.WHATSAPP_TEXT_ORDERING_PAUSED;
  db.restaurant.findFirst.mockResolvedValue({ id: "r1", name: "Sushi Cazza" });
  db.restaurant.findUnique.mockResolvedValue({ name: "Sushi Cazza" });
  db.whatsAppTextOrderingConfig.findUnique.mockResolvedValue({
    restaurantId: "r1", enabled: true, mode: "ALLOWLIST_REPLY_ONLY", scope: "PHONE_ALLOWLIST",
    allowlistedPhones: ["+5511999990000"], paused: false, notes: null, updatedAt: new Date(),
  });
  db.paymentSettings.findUnique.mockResolvedValue({ acceptPix: true, acceptCash: true, acceptCard: false });
  db.menuItem.count.mockResolvedValue(42);
  db.customer.findFirst.mockResolvedValue({ id: "cust-1" });
  db.order.findFirst.mockResolvedValue({ id: "o1" });
});

describe("(1) Config diagnostic é SOMENTE LEITURA — não altera runtime", () => {
  it("retorna o estado real e NUNCA chama update/create/upsert/delete", async () => {
    const r = await runConfigDiagnostic({ restaurantSlug: "sushi-cazza", phone: "+5511999990000" });
    expect(r.ok).toBe(true);
    expect(r.restaurantId).toBe("r1");
    expect(r.featureEnabled).toBe(true);
    expect(r.mode).toBe("ALLOWLIST_REPLY_ONLY");
    expect(r.allowlistCount).toBe(1);
    expect(r.phoneInAllowlist).toBe(true);
    expect(r.pixEnabled).toBe(true);
    expect(r.cardEnabled).toBe(false);
    expect(r.sampleProductsAvailable).toBe(42);
    expect(r.savedAddressAvailableForTestCustomer).toBe(true);
    expect(r.runtimeTouched).toBe(false);
    // Nenhuma escrita, em NENHUM modelo:
    for (const fn of Object.values(db.writes)) expect(fn).not.toHaveBeenCalled();
  });

  it("sem phone → não consulta customer/order (mínimo de leitura, zero PII)", async () => {
    const r = await runConfigDiagnostic({ restaurantSlug: "sushi-cazza" });
    expect(r.phoneInAllowlist).toBeNull();
    expect(r.savedAddressAvailableForTestCustomer).toBeNull();
    expect(db.customer.findFirst).not.toHaveBeenCalled();
    expect(db.order.findFirst).not.toHaveBeenCalled();
  });

  it("restaurante inexistente → ok=false com missing explícito, sem lançar", async () => {
    db.restaurant.findFirst.mockResolvedValue(null);
    const r = await runConfigDiagnostic({ restaurantSlug: "nao-existe" });
    expect(r.ok).toBe(false);
    expect(r.canRunReplyOnly).toBe(false);
    expect(r.missingForReplyOnly).toContain("restaurante não encontrado");
  });

  it("falha de DB não derruba o diagnóstico (catch interno por consulta)", async () => {
    db.paymentSettings.findUnique.mockRejectedValue(new Error("down"));
    db.menuItem.count.mockRejectedValue(new Error("down"));
    const r = await runConfigDiagnostic({ restaurantSlug: "sushi-cazza" });
    expect(r.ok).toBe(true);
    expect(r.sampleProductsAvailable).toBe(0);
  });
});

describe("assessReadiness — cada pré-condição bloqueia explicitamente", () => {
  it("tudo pronto → canRunReplyOnly=true; FULL_TEST ainda exige a troca de modo", () => {
    const r = assessReadiness(BASE_READY);
    expect(r.canRunReplyOnly).toBe(true);
    expect(r.missingForReplyOnly).toEqual([]);
    expect(r.canRunFullTest).toBe(false);
    expect(r.missingForFullTest.join(" ")).toContain("ALLOWLIST_FULL_TEST");
    expect(r.missingForFullTest.join(" ")).toContain("só após REPLY_ONLY aprovado");
    expect(r.riskLevel).toBe("LOW");
  });

  it("(5) feature pausada bloqueia o fluxo", () => {
    const r = assessReadiness({ ...BASE_READY, paused: true });
    expect(r.canRunReplyOnly).toBe(false);
    expect(r.missingForReplyOnly.join(" ")).toContain("despausar");
  });

  it("kill switch / pause globais bloqueiam", () => {
    expect(assessReadiness({ ...BASE_READY, globalKillSwitch: true }).canRunReplyOnly).toBe(false);
    expect(assessReadiness({ ...BASE_READY, globalPause: true }).canRunReplyOnly).toBe(false);
  });

  it("(4) allowlist vazia bloqueia — FULL_TEST exige allowlist como REPLY_ONLY", () => {
    const r = assessReadiness({ ...BASE_READY, mode: "ALLOWLIST_FULL_TEST", allowlistCount: 0 });
    expect(r.canRunReplyOnly).toBe(false);
    expect(r.canRunFullTest).toBe(false);
    expect(r.missingForFullTest.join(" ")).toContain("allowlist");
  });

  it("enabled=false / sem pagamento / sem produtos bloqueiam", () => {
    expect(assessReadiness({ ...BASE_READY, enabled: false }).canRunReplyOnly).toBe(false);
    expect(assessReadiness({ ...BASE_READY, paymentOptionsEnabled: false }).canRunReplyOnly).toBe(false);
    expect(assessReadiness({ ...BASE_READY, sampleProductsAvailable: 0 }).canRunReplyOnly).toBe(false);
  });

  it("scope=RESTAURANT_WIDE com feature viva → riskLevel=HIGH e bloqueia o teste controlado", () => {
    const r = assessReadiness({ ...BASE_READY, scope: "RESTAURANT_WIDE" });
    expect(r.riskLevel).toBe("HIGH");
    expect(r.canRunReplyOnly).toBe(false);
    expect(r.missingForReplyOnly.join(" ")).toContain("PHONE_ALLOWLIST");
    // RESTAURANT_WIDE com feature desligada/pausada não é exposição imediata:
    expect(assessReadiness({ ...BASE_READY, scope: "RESTAURANT_WIDE", paused: true }).riskLevel).toBe("LOW");
    expect(assessReadiness({ ...BASE_READY, scope: "RESTAURANT_WIDE", mode: "DRY_RUN_ONLY" }).riskLevel).toBe("LOW");
  });

  it("DRY_RUN_ONLY pede a troca de modo; FULL_TEST pronto → riskLevel=MEDIUM", () => {
    const dry = assessReadiness({ ...BASE_READY, mode: "DRY_RUN_ONLY" });
    expect(dry.canRunReplyOnly).toBe(false);
    expect(dry.missingForReplyOnly.join(" ")).toContain("ALLOWLIST_REPLY_ONLY");
    const full = assessReadiness({ ...BASE_READY, mode: "ALLOWLIST_FULL_TEST" });
    expect(full.canRunFullTest).toBe(true);
    expect(full.riskLevel).toBe("MEDIUM");
  });
});

describe("(2/3) REPLY_ONLY bloqueia pedido E Pix — fonte única modePermissions", () => {
  it("REPLY_ONLY: responde mas canCreateOrder=false (sem CREATE_ORDER e sem GENERATE_PIX)", () => {
    const p = modePermissions("ALLOWLIST_REPLY_ONLY");
    expect(p.canReply).toBe(true);
    expect(p.canCreateOrder).toBe(false);
  });
  it("FULL_TEST é o único modo com pedido/Pix; desconhecido = seguro", () => {
    expect(modePermissions("ALLOWLIST_FULL_TEST")).toEqual({ canReply: true, canCreateOrder: true });
    expect(modePermissions("DRY_RUN_ONLY")).toEqual({ canReply: false, canCreateOrder: false });
    expect(modePermissions("???")).toEqual({ canReply: false, canCreateOrder: false });
  });
});

describe("(6/7) Rollback documentado + checklist operacional existe", () => {
  it("ROLLBACK_STEPS cobre paused/DRY_RUN/allowlist/env e o recepcionista", () => {
    expect(ROLLBACK_STEPS.length).toBeGreaterThanOrEqual(4);
    const all = ROLLBACK_STEPS.join(" ");
    expect(all).toContain("paused: true");
    expect(all).toContain("DRY_RUN_ONLY");
    expect(all).toContain("allowlistedPhones: []");
    expect(all).toContain("WHATSAPP_TEXT_ORDERING_PAUSED");
    expect(all).toContain("recepcionista");
  });

  it("docs/whatsapp-text-order-controlled-test.md existe", () => {
    expect(existsSync(join(process.cwd(), "docs", "whatsapp-text-order-controlled-test.md"))).toBe(true);
  });

  it("o diagnóstico expõe os mesmos rollbackSteps no resultado", async () => {
    const r = await runConfigDiagnostic({ restaurantSlug: "sushi-cazza" });
    expect(r.rollbackSteps).toEqual(ROLLBACK_STEPS);
  });
});
