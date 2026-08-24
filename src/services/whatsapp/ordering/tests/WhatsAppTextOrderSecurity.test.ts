/**
 * Part 0/7/10.3 — exposure correction, RESTAURANT_WIDE approval gate, and the
 * readiness checklist. Proves the safety-only remediation can ONLY reduce
 * exposure (never opens RESTAURANT_WIDE / FULL_TEST), that an unapproved live
 * RESTAURANT_WIDE is HIGH while an approved one is not, and that the readiness
 * diagnostic composes config + flow without any write/send.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  // Portão de qualidade VERDE (LiveStageGuard): sem isto a trava da escada
  // derruba o degrau alto por falha fechada e estes casos nunca chegariam a
  // exercitar o que querem exercitar. O teste da TRAVA em si vive em
  // src/services/brain/runtime/escadaDeIa.class.test.ts.
  qualityAuditRun: {
    findFirst: async () => ({ id: "run_verde", finishedAt: new Date(), findings: [{ severity: "P2", status: "PASS" }] }),
  },
  restaurant: { findFirst: vi.fn(), findUnique: vi.fn() },
  whatsAppTextOrderingConfig: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn(), create: vi.fn() },
  paymentSettings: { findUnique: vi.fn() },
  menuItem: { count: vi.fn() },
  customer: { findFirst: vi.fn() },
  order: { findFirst: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { assessReadiness, isRestaurantWideApproved, RESTAURANT_WIDE_APPROVAL_MARKER } from "../configDiagnostic";
import { secureScope } from "../configRemediation";
import { runReadinessDiagnostic } from "../readinessDiagnostic";

function configRow(over: Partial<{ enabled: boolean; mode: string; scope: string; allowlistedPhones: string[]; paused: boolean; notes: string | null }> = {}) {
  return {
    restaurantId: "r1", enabled: true, mode: "ALLOWLIST_REPLY_ONLY", scope: "RESTAURANT_WIDE",
    allowlistedPhones: ["+5511999990000"], paused: false, notes: null, updatedAt: new Date(), ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.WHATSAPP_TEXT_ORDERING_ENABLED;
  delete process.env.WHATSAPP_TEXT_ORDERING_PAUSED;
  db.restaurant.findFirst.mockResolvedValue({ id: "r1", name: "Sushi Cazza" });
  db.restaurant.findUnique.mockResolvedValue({ name: "Sushi Cazza" });
  db.whatsAppTextOrderingConfig.findUnique.mockResolvedValue(configRow());
  db.whatsAppTextOrderingConfig.upsert.mockImplementation(async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => ({ ...configRow(), ...create, ...update }));
  db.paymentSettings.findUnique.mockResolvedValue({ acceptPix: true, acceptCash: true, acceptCard: true });
  db.menuItem.count.mockResolvedValue(113);
  db.customer.findFirst.mockResolvedValue(null);
  db.order.findFirst.mockResolvedValue(null);
});

const READY = {
  globalKillSwitch: false, globalPause: false, enabled: true, paused: false,
  mode: "ALLOWLIST_REPLY_ONLY", scope: "RESTAURANT_WIDE", allowlistCount: 1,
  paymentOptionsEnabled: true, sampleProductsAvailable: 113,
};

describe("(21) RESTAURANT_WIDE sem aprovação → HIGH; com marcador → não HIGH", () => {
  it("RESTAURANT_WIDE vivo e sem marcador = HIGH e bloqueia", () => {
    const r = assessReadiness({ ...READY, scopeApproved: false });
    expect(r.riskLevel).toBe("HIGH");
    expect(r.canRunReplyOnly).toBe(false);
  });
  it("RESTAURANT_WIDE vivo COM marcador = MEDIUM (exposição intencional)", () => {
    const r = assessReadiness({ ...READY, scopeApproved: true });
    expect(r.riskLevel).toBe("MEDIUM");
  });
  it("marcador de aprovação é detectado no notes", () => {
    expect(isRestaurantWideApproved(`liberado ${RESTAURANT_WIDE_APPROVAL_MARKER} por Diego`)).toBe(true);
    expect(isRestaurantWideApproved("sem marcador")).toBe(false);
    expect(isRestaurantWideApproved(null)).toBe(false);
  });
});

describe("(Parte 0) secureScope — clamp SOMENTE para segurança", () => {
  it("RESTAURANT_WIDE → PHONE_ALLOWLIST, preserva allowlist, nunca abre exposição", async () => {
    const r = await secureScope({ restaurantSlug: "sushi-cazza" });
    expect(r.ok).toBe(true);
    expect(r.changed).toBe(true);
    expect(db.whatsAppTextOrderingConfig.upsert).toHaveBeenCalledTimes(1);
    const arg = db.whatsAppTextOrderingConfig.upsert.mock.calls[0][0];
    // O alvo NUNCA pode ser RESTAURANT_WIDE nem FULL_TEST:
    expect(JSON.stringify(arg)).not.toContain("RESTAURANT_WIDE");
    expect(JSON.stringify(arg)).not.toContain("ALLOWLIST_FULL_TEST");
    expect(JSON.stringify(arg)).toContain("PHONE_ALLOWLIST");
    expect(JSON.stringify(arg)).toContain("ALLOWLIST_REPLY_ONLY");
    expect(r.runtimeTouched).toBe(false);
  });

  it("FULL_TEST é rebaixado para REPLY_ONLY", async () => {
    db.whatsAppTextOrderingConfig.findUnique.mockResolvedValue(configRow({ scope: "PHONE_ALLOWLIST", mode: "ALLOWLIST_FULL_TEST" }));
    const r = await secureScope({ restaurantSlug: "sushi-cazza" });
    expect(r.changed).toBe(true);
    const arg = db.whatsAppTextOrderingConfig.upsert.mock.calls[0][0];
    expect(JSON.stringify(arg)).not.toContain("ALLOWLIST_FULL_TEST");
    expect(JSON.stringify(arg)).toContain("ALLOWLIST_REPLY_ONLY");
  });

  it("idempotente — já seguro não escreve", async () => {
    db.whatsAppTextOrderingConfig.findUnique.mockResolvedValue(configRow({ scope: "PHONE_ALLOWLIST", mode: "ALLOWLIST_REPLY_ONLY" }));
    const r = await secureScope({ restaurantSlug: "sushi-cazza" });
    expect(r.changed).toBe(false);
    expect(db.whatsAppTextOrderingConfig.upsert).not.toHaveBeenCalled();
  });

  it("addPhone é anexado preservando os existentes", async () => {
    db.whatsAppTextOrderingConfig.findUnique.mockResolvedValue(configRow({ scope: "PHONE_ALLOWLIST", mode: "ALLOWLIST_REPLY_ONLY", allowlistedPhones: ["+5511999990000"] }));
    const r = await secureScope({ restaurantSlug: "sushi-cazza", addPhone: "+5511888887777" });
    expect(r.changed).toBe(true);
    const arg = db.whatsAppTextOrderingConfig.upsert.mock.calls[0][0];
    expect(JSON.stringify(arg)).toContain("+5511888887777");
    expect(JSON.stringify(arg)).toContain("+5511999990000");
  });
});

describe("(10.3) readiness diagnostic — compõe config + flow, somente leitura", () => {
  it("RESTAURANT_WIDE vivo sem aprovação → HIGH vira blocker e nada fica ready", async () => {
    const r = await runReadinessDiagnostic({ restaurantSlug: "sushi-cazza" });
    expect(r.replyOnlyReady).toBe(false);
    expect(r.fullTestReady).toBe(false);
    expect(r.restaurantWideReady).toBe(false);
    expect(r.blockers.join(" ")).toContain("HIGH");
    expect(r.flowDiagnostic.status).toBe("PASS");
    expect(r.runtimeTouched).toBe(false);
    // somente leitura: nenhuma escrita de config
    expect(db.whatsAppTextOrderingConfig.upsert).not.toHaveBeenCalled();
  });

  it("config segura (PHONE_ALLOWLIST + REPLY_ONLY) → replyOnlyReady=true", async () => {
    db.whatsAppTextOrderingConfig.findUnique.mockResolvedValue(configRow({ scope: "PHONE_ALLOWLIST" }));
    const r = await runReadinessDiagnostic({ restaurantSlug: "sushi-cazza", phone: "+5511999990000" });
    expect(r.replyOnlyReady).toBe(true);
    expect(r.fullTestReady).toBe(false); // ainda exige subir o modo
  });
});
