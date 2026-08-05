/**
 * Production Closure v1 — governança do WhatsApp Text Order.
 * Prova que: promote FULL_TEST exige confirm + PHONE_ALLOWLIST + allowlist + gates
 * e só muda CONFIG (nada enviado/criado); rollback volta para paused+DRY_RUN;
 * request RESTAURANT_WIDE cria BrainChangeRequest PENDING_APPROVAL sem mudar o
 * scope; o Treinamento IA enxerga o WA Cockpit; e o FULL_TEST readiness é PASS.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  restaurant: { findFirst: vi.fn(), findUnique: vi.fn() },
  whatsAppTextOrderingConfig: { findUnique: vi.fn(), upsert: vi.fn() },
  paymentSettings: { findUnique: vi.fn() },
  menuItem: { count: vi.fn() },
  customer: { findFirst: vi.fn() },
  order: { findFirst: vi.fn() },
  message: { create: vi.fn() },
  brainChangeRequest: { create: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import {
  promoteToFullTest,
  rollbackTextOrder,
  requestRestaurantWide,
  openRestaurantWide,
  PROMOTE_CONFIRM,
  ROLLBACK_CONFIRM,
  REQUEST_WIDE_CONFIRM,
  OPEN_WIDE_CONFIRM,
} from "../productionGovernance";
import { runFullTestReadiness } from "../fullTestReadiness";
import { WHATSAPP_TEXT_ORDER_ARENA, EXTERNAL_ARENAS } from "@/services/agent-training/arenas";

function configRow(over: Partial<{ mode: string; scope: string; enabled: boolean; paused: boolean; allowlistedPhones: string[]; notes: string | null }> = {}) {
  return {
    restaurantId: "r1", enabled: true, mode: "ALLOWLIST_REPLY_ONLY", scope: "PHONE_ALLOWLIST",
    allowlistedPhones: ["+5511999990000"], paused: false, notes: null, updatedAt: new Date(), ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.WHATSAPP_TEXT_ORDERING_ENABLED;
  delete process.env.WHATSAPP_TEXT_ORDERING_PAUSED;
  db.restaurant.findFirst.mockResolvedValue({ id: "r1", name: "Sushi Cazza" });
  db.restaurant.findUnique.mockResolvedValue({ id: "r1", name: "Sushi Cazza" });
  db.whatsAppTextOrderingConfig.findUnique.mockResolvedValue(configRow());
  db.whatsAppTextOrderingConfig.upsert.mockImplementation(async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => ({ ...configRow(), ...create, ...update }));
  db.paymentSettings.findUnique.mockResolvedValue({ acceptPix: true, acceptCash: true, acceptCard: true });
  db.menuItem.count.mockResolvedValue(113);
  db.customer.findFirst.mockResolvedValue(null);
  db.order.findFirst.mockResolvedValue(null);
  db.brainChangeRequest.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "cr-1", ...data }));
});

describe("(1–6) promote FULL_TEST — gates e segurança", () => {
  it("sem confirm exato não promove", async () => {
    const r = await promoteToFullTest({ restaurantSlug: "sushi-cazza", confirm: "sim" });
    expect(r.success).toBe(false);
    expect(db.whatsAppTextOrderingConfig.upsert).not.toHaveBeenCalled();
  });

  it("(1) exige PHONE_ALLOWLIST — scope wide reprova", async () => {
    db.whatsAppTextOrderingConfig.findUnique.mockResolvedValue(configRow({ scope: "RESTAURANT_WIDE" }));
    const r = await promoteToFullTest({ restaurantSlug: "sushi-cazza", confirm: PROMOTE_CONFIRM });
    expect(r.success).toBe(false);
    expect(r.gates?.scopeIsPhoneAllowlist).toBe(false);
    expect(db.whatsAppTextOrderingConfig.upsert).not.toHaveBeenCalled();
  });

  it("(2) exige allowlist > 0", async () => {
    db.whatsAppTextOrderingConfig.findUnique.mockResolvedValue(configRow({ allowlistedPhones: [] }));
    const r = await promoteToFullTest({ restaurantSlug: "sushi-cazza", confirm: PROMOTE_CONFIRM });
    expect(r.success).toBe(false);
    expect(r.gates?.allowlistNotEmpty).toBe(false);
  });

  it("(3) exige feature viva — pausada reprova", async () => {
    db.whatsAppTextOrderingConfig.findUnique.mockResolvedValue(configRow({ paused: true }));
    const r = await promoteToFullTest({ restaurantSlug: "sushi-cazza", confirm: PROMOTE_CONFIRM });
    expect(r.success).toBe(false);
    expect(r.gates?.featureEnabledNotPaused).toBe(false);
  });

  it("(4/5/6) com gates PASS promove para FULL_TEST mantendo PHONE_ALLOWLIST — só config, nada real", async () => {
    const r = await promoteToFullTest({ restaurantSlug: "sushi-cazza", confirm: PROMOTE_CONFIRM });
    expect(r.success).toBe(true);
    expect(r.previousMode).toBe("ALLOWLIST_REPLY_ONLY");
    expect(r.newMode).toBe("ALLOWLIST_FULL_TEST");
    expect(r.scope).toBe("PHONE_ALLOWLIST");
    expect(r.runtimeTouched).toBe(false);
    const arg = JSON.stringify(db.whatsAppTextOrderingConfig.upsert.mock.calls[0][0]);
    expect(arg).toContain("ALLOWLIST_FULL_TEST");
    expect(arg).toContain("PHONE_ALLOWLIST");
    expect(arg).not.toContain("RESTAURANT_WIDE");
    // nenhum envio/pedido/Pix: nenhum message.create, nenhum order/payment write
    expect(db.message.create).not.toHaveBeenCalled();
  });
});

describe("(7) rollback", () => {
  it("seta paused + DRY_RUN_ONLY + PHONE_ALLOWLIST preservando allowlist/config", async () => {
    db.whatsAppTextOrderingConfig.findUnique.mockResolvedValue(configRow({ mode: "ALLOWLIST_FULL_TEST" }));
    const r = await rollbackTextOrder({ restaurantSlug: "sushi-cazza", confirm: ROLLBACK_CONFIRM });
    expect(r.success).toBe(true);
    const update = db.whatsAppTextOrderingConfig.upsert.mock.calls[0][0].update as Record<string, unknown>;
    expect(update.mode).toBe("DRY_RUN_ONLY");
    expect(update.paused).toBe(true);
    expect(update.scope).toBe("PHONE_ALLOWLIST");
    expect(update).not.toHaveProperty("allowlistedPhones"); // allowlist intacta
    expect(r.runtimeTouched).toBe(false);
  });

  it("sem confirm não faz nada", async () => {
    const r = await rollbackTextOrder({ restaurantSlug: "sushi-cazza", confirm: "" });
    expect(r.success).toBe(false);
    expect(db.whatsAppTextOrderingConfig.upsert).not.toHaveBeenCalled();
  });
});

describe("(8/9) request RESTAURANT_WIDE — governança via Brain Director", () => {
  it("(8) cria BrainChangeRequest PENDING_APPROVAL CRITICAL/PRODUCTION com gate", async () => {
    db.whatsAppTextOrderingConfig.findUnique.mockResolvedValue(configRow({ mode: "ALLOWLIST_FULL_TEST" }));
    const r = await requestRestaurantWide({ restaurantSlug: "sushi-cazza", confirm: REQUEST_WIDE_CONFIRM });
    expect(r.success).toBe(true);
    expect(r.changeRequestId).toBe("cr-1");
    expect(r.changeRequestStatus).toBe("PENDING_APPROVAL");
    const data = db.brainChangeRequest.create.mock.calls[0][0].data;
    expect(data.status).toBe("PENDING_APPROVAL");
    expect(data.riskLevel).toBe("CRITICAL");
    expect(data.runtimeImpact).toBe("PRODUCTION");
    expect(data.requiresQualityGate).toBe(true);
  });

  it("(9) NUNCA muda o scope — produção continua bloqueada até aprovação humana", async () => {
    db.whatsAppTextOrderingConfig.findUnique.mockResolvedValue(configRow({ mode: "ALLOWLIST_FULL_TEST" }));
    const r = await requestRestaurantWide({ restaurantSlug: "sushi-cazza", confirm: REQUEST_WIDE_CONFIRM });
    expect(r.scopeChanged).toBe(false);
    for (const call of db.whatsAppTextOrderingConfig.upsert.mock.calls) {
      expect(JSON.stringify(call[0])).not.toContain("RESTAURANT_WIDE");
    }
  });

  it("exige FULL_TEST validado antes — REPLY_ONLY reprova", async () => {
    db.whatsAppTextOrderingConfig.findUnique.mockResolvedValue(configRow({ mode: "ALLOWLIST_REPLY_ONLY" }));
    const r = await requestRestaurantWide({ restaurantSlug: "sushi-cazza", confirm: REQUEST_WIDE_CONFIRM });
    expect(r.success).toBe(false);
    expect(db.brainChangeRequest.create).not.toHaveBeenCalled();
  });
});

describe("open RESTAURANT_WIDE — abrir para clientes finais (gated)", () => {
  const ACK = { acknowledgeRealCustomers: true, acknowledgeRealOrders: true, acknowledgeRealPix: true };

  it("(1) sem confirm exato não abre", async () => {
    db.whatsAppTextOrderingConfig.findUnique.mockResolvedValue(configRow({ mode: "ALLOWLIST_FULL_TEST" }));
    const r = await openRestaurantWide({ restaurantSlug: "sushi-cazza", confirm: "abrir", ...ACK });
    expect(r.success).toBe(false);
    expect(db.whatsAppTextOrderingConfig.upsert).not.toHaveBeenCalled();
  });

  it("(2) sem os 3 acknowledgments não abre", async () => {
    db.whatsAppTextOrderingConfig.findUnique.mockResolvedValue(configRow({ mode: "ALLOWLIST_FULL_TEST" }));
    const r = await openRestaurantWide({ restaurantSlug: "sushi-cazza", confirm: OPEN_WIDE_CONFIRM, acknowledgeRealCustomers: true, acknowledgeRealOrders: true });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/reconhecimentos/i);
    expect(db.whatsAppTextOrderingConfig.upsert).not.toHaveBeenCalled();
  });

  it("(3) exige FULL_TEST validado antes — REPLY_ONLY reprova", async () => {
    db.whatsAppTextOrderingConfig.findUnique.mockResolvedValue(configRow({ mode: "ALLOWLIST_REPLY_ONLY" }));
    const r = await openRestaurantWide({ restaurantSlug: "sushi-cazza", confirm: OPEN_WIDE_CONFIRM, ...ACK });
    expect(r.success).toBe(false);
    expect(db.whatsAppTextOrderingConfig.upsert).not.toHaveBeenCalled();
  });

  it("(3b) gate reprovado (pausado) não abre", async () => {
    db.whatsAppTextOrderingConfig.findUnique.mockResolvedValue(configRow({ mode: "ALLOWLIST_FULL_TEST", paused: true }));
    const r = await openRestaurantWide({ restaurantSlug: "sushi-cazza", confirm: OPEN_WIDE_CONFIRM, ...ACK });
    expect(r.success).toBe(false);
    expect(r.gates?.featureEnabledNotPaused).toBe(false);
    expect(db.whatsAppTextOrderingConfig.upsert).not.toHaveBeenCalled();
  });

  it("(4/5/6) gates PASS → scope RESTAURANT_WIDE, FULL_TEST, sem envio/pedido/Pix", async () => {
    db.whatsAppTextOrderingConfig.findUnique.mockResolvedValue(configRow({ mode: "ALLOWLIST_FULL_TEST" }));
    const r = await openRestaurantWide({ restaurantSlug: "sushi-cazza", confirm: OPEN_WIDE_CONFIRM, ...ACK });
    expect(r.success).toBe(true);
    expect(r.newConfig?.scope).toBe("RESTAURANT_WIDE");
    expect(r.newConfig?.mode).toBe("ALLOWLIST_FULL_TEST");
    expect(r.runtimeTouched).toBe(false);
    const arg = JSON.stringify(db.whatsAppTextOrderingConfig.upsert.mock.calls[0][0]);
    expect(arg).toContain("RESTAURANT_WIDE");
    expect(db.message.create).not.toHaveBeenCalled(); // nada enviado
    expect(r.rollback.confirm).toBe(ROLLBACK_CONFIRM); // rollback sempre disponível
  });
});

describe("(10) Treinamento IA enxerga o WhatsApp como arena", () => {
  it("arena aponta para o WA Cockpit com texto operacional", () => {
    expect(EXTERNAL_ARENAS).toContainEqual(WHATSAPP_TEXT_ORDER_ARENA);
    expect(WHATSAPP_TEXT_ORDER_ARENA.href).toBe("/admin/agents/whatsapp");
    expect(WHATSAPP_TEXT_ORDER_ARENA.label).toBe("WhatsApp · Pedido por Texto");
    expect(WHATSAPP_TEXT_ORDER_ARENA.description).toContain("sem enviar WhatsApp");
    expect(WHATSAPP_TEXT_ORDER_ARENA.description).toContain("sem gerar Pix");
  });
});

describe("(11) full-test-readiness", () => {
  it("PASS com p0=0 e flags de segurança", async () => {
    const r = await runFullTestReadiness();
    expect(r.status).toBe("PASS");
    expect(r.p0).toBe(0);
    expect(r.noRealOrder).toBe(true);
    expect(r.noRealPix).toBe(true);
    expect(r.noWhatsAppSend).toBe(true);
    expect(r.runtimeTouched).toBe(false);
  });
});
