/**
 * ContactSafetyService — unit tests for the unified CRM contact-safety gate.
 *
 * Layers:
 *   1. Pure evaluator (evaluateContactSafety) — every block reason + the allow path.
 *   2. Inbound opt-out detection (detectOptOutIntent).
 *   3. Phone plausibility + sending-window helpers.
 *   4. DB-backed assertSendable + applyInboundOptOut (mocked prisma).
 *
 * NO WhatsApp is ever sent. NO real DB is touched.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

// ── Mock prisma + DB-touching deps BEFORE importing the service ──────────────
// vi.hoisted so the mock object exists before the hoisted vi.mock factory runs.
const prismaMock = vi.hoisted(() => ({
  campaignExecution: { findMany: vi.fn() },
  customer:          { findUnique: vi.fn(), update: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/business-hours", () => ({ isRestaurantOpenNow: vi.fn(async () => true) }));

// Canal único (Meta). Nenhum envio acontece — só o ESTADO da conexão é consultado.
const channel = vi.hoisted(() => ({ getConnectionStatus: vi.fn() }));
vi.mock("@/services/whatsapp/WhatsAppMessagingService", () => ({ WhatsAppMessagingService: channel }));

// buildGlobalContext lê config + contagem do dia; aqui elas são determinísticas.
vi.mock("@/lib/crm-safety", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/crm-safety")>();
  return {
    ...actual,
    getSafetyConfig:         vi.fn(async () => ({ ...actual.DEFAULT_SAFETY_CONFIG })),
    getTodayGlobalSendCount: vi.fn(async () => 0),
  };
});

import {
  evaluateContactSafety,
  detectOptOutIntent,
  isPlausiblePhone,
  isOutsideSendingWindow,
  ContactSafetyService,
  type ContactSafetyEvalInput,
} from "../ContactSafetyService";
import { DEFAULT_SAFETY_CONFIG } from "@/lib/crm-safety";

// ── Eval input factory ───────────────────────────────────────────────────────

function evalInput(overrides: Partial<ContactSafetyEvalInput> = {}): ContactSafetyEvalInput {
  return {
    hasOptedOut: false,
    crmContactable: true,
    phone: "+5511999990000",
    sendsWithinCooldown: 0,
    sendsWithinWeek: 0,
    otherCampaignSendsWithin24h: 0,
    sameCampaignSends: 0,
    safety: { ...DEFAULT_SAFETY_CONFIG },
    whatsappAvailable: true,
    globalSentToday: 0,
    restaurantOpen: true,
    isBirthday: false,
    enforceTimeWindows: false,
    enforceDailyCap: true,
    enforceRestaurantOpen: false,
    sendingWindow: null,
    // A weekday midday (Wed 2024-06-05 12:00 BRT ≈ 15:00 UTC) — outside default quiet hours.
    now: new Date("2024-06-05T15:00:00Z"),
    ...overrides,
  };
}

// ── 1. Pure evaluator ─────────────────────────────────────────────────────────

describe("evaluateContactSafety — block reasons", () => {
  it("allows a clean, contactable customer with no prior sends", () => {
    const d = evaluateContactSafety(evalInput());
    expect(d.sendable).toBe(true);
    expect(d.reason).toBeNull();
  });

  it("blocks an opted-out customer", () => {
    const d = evaluateContactSafety(evalInput({ hasOptedOut: true }));
    expect(d.sendable).toBe(false);
    expect(d.reason).toBe("CUSTOMER_OPTED_OUT");
  });

  it("blocks a non-contactable customer", () => {
    const d = evaluateContactSafety(evalInput({ crmContactable: false }));
    expect(d.reason).toBe("CUSTOMER_NOT_CONTACTABLE");
  });

  it("blocks a missing phone", () => {
    expect(evaluateContactSafety(evalInput({ phone: null })).reason).toBe("MISSING_PHONE");
    expect(evaluateContactSafety(evalInput({ phone: "   " })).reason).toBe("MISSING_PHONE");
  });

  it("blocks an invalid phone format", () => {
    expect(evaluateContactSafety(evalInput({ phone: "12345" })).reason).toBe("INVALID_PHONE_FORMAT");
    expect(evaluateContactSafety(evalInput({ phone: "abc" })).reason).toBe("INVALID_PHONE_FORMAT");
  });

  it("blocks when the official WhatsApp channel is not connected", () => {
    expect(evaluateContactSafety(evalInput({ whatsappAvailable: false })).reason).toBe("NO_WHATSAPP_CONFIG");
  });

  it("blocks when the daily global cap is reached", () => {
    const d = evaluateContactSafety(evalInput({ globalSentToday: 200, safety: { ...DEFAULT_SAFETY_CONFIG, dailyGlobalCap: 200 } }));
    expect(d.reason).toBe("DAILY_GLOBAL_CAP_REACHED");
  });

  it("does NOT block on daily cap when enforceDailyCap is false (manual override)", () => {
    const d = evaluateContactSafety(evalInput({ globalSentToday: 999, enforceDailyCap: false }));
    expect(d.sendable).toBe(true);
  });

  it("blocks during quiet hours when time windows are enforced", () => {
    // 02:00 BRT = 05:00 UTC, inside the default 21:00–08:00 quiet window.
    const d = evaluateContactSafety(evalInput({
      enforceTimeWindows: true,
      now: new Date("2024-06-05T05:00:00Z"),
    }));
    expect(d.reason).toBe("QUIET_HOURS");
  });

  it("blocks on weekends when weekend sends are disabled", () => {
    // Saturday 2024-06-08 12:00 BRT = 15:00 UTC.
    const d = evaluateContactSafety(evalInput({
      enforceTimeWindows: true,
      safety: { ...DEFAULT_SAFETY_CONFIG, sendOnWeekends: false },
      now: new Date("2024-06-08T15:00:00Z"),
    }));
    expect(d.reason).toBe("WEEKEND_BLOCKED");
  });

  it("blocks outside an explicit sending window", () => {
    // Window 09:00–18:00 BRT; now is 20:00 BRT (23:00 UTC).
    const d = evaluateContactSafety(evalInput({
      enforceTimeWindows: true,
      sendingWindow: { start: "09:00", end: "18:00", timezone: "America/Sao_Paulo" },
      now: new Date("2024-06-05T23:00:00Z"),
    }));
    expect(d.reason).toBe("OUTSIDE_SENDING_WINDOW");
  });

  it("blocks when the per-customer cooldown is active", () => {
    const d = evaluateContactSafety(evalInput({ sendsWithinCooldown: 1 }));
    expect(d.reason).toBe("CUSTOMER_COOLDOWN_ACTIVE");
  });

  it("blocks when the weekly cap is reached", () => {
    const d = evaluateContactSafety(evalInput({
      sendsWithinWeek: 5,
      safety: { ...DEFAULT_SAFETY_CONFIG, maxPerWeekPerCustomer: 5, customerCooldownHours: 0 },
    }));
    expect(d.reason).toBe("CUSTOMER_WEEKLY_CAP_REACHED");
  });

  it("blocks on cross-campaign 24h recent message", () => {
    const d = evaluateContactSafety(evalInput({ otherCampaignSendsWithin24h: 1 }));
    expect(d.reason).toBe("RECENT_CRM_MESSAGE_24H");
  });

  it("blocks a duplicate recipient within the same campaign", () => {
    const d = evaluateContactSafety(evalInput({ sameCampaignSends: 1 }));
    expect(d.reason).toBe("DUPLICATE_CAMPAIGN_RECIPIENT");
  });

  it("blocks when the restaurant is closed and enforcement is on", () => {
    const d = evaluateContactSafety(evalInput({ enforceRestaurantOpen: true, restaurantOpen: false }));
    expect(d.reason).toBe("RESTAURANT_CLOSED");
  });

  it("exempts birthday sends from frequency rules", () => {
    const d = evaluateContactSafety(evalInput({
      isBirthday: true,
      sendsWithinCooldown: 3,
      sendsWithinWeek: 9,
      otherCampaignSendsWithin24h: 2,
      safety: { ...DEFAULT_SAFETY_CONFIG, maxPerWeekPerCustomer: 5 },
    }));
    expect(d.sendable).toBe(true);
  });

  it("opt-out takes precedence over every other block", () => {
    const d = evaluateContactSafety(evalInput({
      hasOptedOut: true,
      phone: null,
      whatsappAvailable: false,
      sendsWithinCooldown: 5,
    }));
    expect(d.reason).toBe("CUSTOMER_OPTED_OUT");
  });
});

// ── 2. Inbound opt-out detection ───────────────────────────────────────────────

describe("detectOptOutIntent", () => {
  it.each([
    "STOP",
    "stop",
    "Sair",
    "PARAR",
    "cancelar",
    "Descadastrar",
    "remover",
    "não quero receber",
    "nao quero receber",
    "quero sair da lista",
    "podem remover meu número",
    "favor remover meu numero por favor", // 6 tokens but phrase matches
    "parar de enviar mensagens",
  ])("detects opt-out in %p", (msg) => {
    expect(detectOptOutIntent(msg)).toBe(true);
  });

  it.each([
    "quero fazer um pedido",
    "vou sair de casa amanhã para buscar",  // 'sair' but >3 tokens, no phrase
    "pode cancelar o item do meu pedido por favor", // 'cancelar' but >3 tokens, no opt-out phrase
    "obrigado!",
    "",
    null,
    undefined,
  ])("does NOT flag %p", (msg) => {
    expect(detectOptOutIntent(msg as string)).toBe(false);
  });
});

// ── 3. Helpers ──────────────────────────────────────────────────────────────────

describe("isPlausiblePhone", () => {
  it.each(["+5511999990000", "5511999990000", "11999990000", "1133334444"])("accepts %p", (p) => {
    expect(isPlausiblePhone(p)).toBe(true);
  });
  it.each(["123", "", null, undefined, "abc"])("rejects %p", (p) => {
    expect(isPlausiblePhone(p as string)).toBe(false);
  });
});

describe("isOutsideSendingWindow", () => {
  const win = { start: "09:00", end: "18:00" };
  it("inside the window → false", () => {
    expect(isOutsideSendingWindow(win, "America/Sao_Paulo", new Date("2024-06-05T15:00:00Z"))).toBe(false); // 12:00 BRT
  });
  it("outside the window → true", () => {
    expect(isOutsideSendingWindow(win, "America/Sao_Paulo", new Date("2024-06-05T23:00:00Z"))).toBe(true); // 20:00 BRT
  });
});

// ── 3b. buildGlobalContext — o canal não tem mais default otimista ─────────────

describe("ContactSafetyService.buildGlobalContext — canal falha fechado", () => {
  beforeEach(() => channel.getConnectionStatus.mockReset());

  it("usa o valor informado pelo chamador sem consultar o canal", async () => {
    const ctx = await ContactSafetyService.buildGlobalContext("r1", { whatsappAvailable: true });
    expect(ctx.whatsappAvailable).toBe(true);
    expect(channel.getConnectionStatus).not.toHaveBeenCalled();
  });

  it("sem informação do chamador, PERGUNTA ao canal e respeita a resposta", async () => {
    channel.getConnectionStatus.mockResolvedValue({ provider: "META_CLOUD_API", connected: true });
    expect((await ContactSafetyService.buildGlobalContext("r1")).whatsappAvailable).toBe(true);

    channel.getConnectionStatus.mockResolvedValue({ provider: "META_CLOUD_API", connected: false });
    expect((await ContactSafetyService.buildGlobalContext("r1")).whatsappAvailable).toBe(false);
  });

  // O caso "consulta falhou ⇒ false" é travado em CrmWhatsAppChannel.test.ts, onde
  // mora a regra (o helper é o único ponto que decide isso).

  it("o apelido legado evolutionAvailable ainda alimenta o MESMO portão de canal único", async () => {
    const ctx = await ContactSafetyService.buildGlobalContext("r1", { evolutionAvailable: false });
    expect(ctx.whatsappAvailable).toBe(false);
    expect(channel.getConnectionStatus).not.toHaveBeenCalled();
  });
});

// ── 4. DB-backed assertSendable + applyInboundOptOut ────────────────────────────

describe("ContactSafetyService.assertSendable (mocked prisma)", () => {
  beforeEach(() => {
    prismaMock.campaignExecution.findMany.mockReset();
    prismaMock.customer.findUnique.mockReset();
    prismaMock.customer.update.mockReset();
  });

  const ctx = {
    safety: { ...DEFAULT_SAFETY_CONFIG },
    whatsappAvailable: true,
    globalSentToday: 0,
    restaurantOpen: true,
  };

  it("allows a clean customer with no prior sends", async () => {
    prismaMock.campaignExecution.findMany.mockResolvedValue([]);
    const d = await ContactSafetyService.assertSendable({
      restaurantId: "r1",
      customerId: "c1",
      phone: "+5511999990000",
      hasOptedOut: false,
      crmContactable: true,
      enforceTimeWindows: false,
      context: ctx,
    });
    expect(d.sendable).toBe(true);
  });

  it("blocks when a recent send is inside the cooldown window", async () => {
    // One successful send 1h ago → inside the 24h default cooldown.
    prismaMock.campaignExecution.findMany.mockResolvedValue([
      { campaignId: "other", sentAt: new Date(Date.now() - 60 * 60 * 1000) },
    ]);
    const d = await ContactSafetyService.assertSendable({
      restaurantId: "r1",
      customerId: "c1",
      phone: "+5511999990000",
      hasOptedOut: false,
      crmContactable: true,
      campaignId: "current",
      enforceTimeWindows: false,
      context: ctx,
    });
    expect(d.sendable).toBe(false);
    // Recent other-campaign send within 24h is checked before cooldown.
    expect(["RECENT_CRM_MESSAGE_24H", "CUSTOMER_COOLDOWN_ACTIVE"]).toContain(d.reason);
  });

  it("blocks a duplicate within the same campaign", async () => {
    prismaMock.campaignExecution.findMany.mockResolvedValue([
      { campaignId: "current", sentAt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
    ]);
    const d = await ContactSafetyService.assertSendable({
      restaurantId: "r1",
      customerId: "c1",
      phone: "+5511999990000",
      hasOptedOut: false,
      crmContactable: true,
      campaignId: "current",
      enforceTimeWindows: false,
      context: ctx,
    });
    expect(d.reason).toBe("DUPLICATE_CAMPAIGN_RECIPIENT");
  });

  it("returns UNKNOWN_ERROR (never throws) when a query fails", async () => {
    prismaMock.campaignExecution.findMany.mockRejectedValue(new Error("db down"));
    const d = await ContactSafetyService.assertSendable({
      restaurantId: "r1",
      customerId: "c1",
      phone: "+5511999990000",
      hasOptedOut: false,
      crmContactable: true,
      enforceTimeWindows: false,
      context: ctx,
    });
    expect(d.sendable).toBe(false);
    expect(d.reason).toBe("UNKNOWN_ERROR");
  });
});

describe("ContactSafetyService.applyInboundOptOut (mocked prisma)", () => {
  beforeEach(() => {
    prismaMock.customer.update.mockReset();
  });

  it("updates customer opt-out fields when an opt-out phrase is detected", async () => {
    prismaMock.customer.update.mockResolvedValue({});
    const applied = await ContactSafetyService.applyInboundOptOut("r1", "c1", "PARAR");
    expect(applied).toBe(true);
    expect(prismaMock.customer.update).toHaveBeenCalledTimes(1);
    const arg = prismaMock.customer.update.mock.calls[0][0];
    expect(arg.where).toEqual({ id: "c1" });
    expect(arg.data.hasOptedOut).toBe(true);
    expect(arg.data.crmContactable).toBe(false);
    expect(arg.data.contactStatus).toBe("OPT_OUT");
    expect(arg.data.optOutAt).toBeInstanceOf(Date);
  });

  it("does nothing for a normal message", async () => {
    const applied = await ContactSafetyService.applyInboundOptOut("r1", "c1", "quero fazer um pedido");
    expect(applied).toBe(false);
    expect(prismaMock.customer.update).not.toHaveBeenCalled();
  });
});
