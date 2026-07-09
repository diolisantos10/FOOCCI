import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  campaign: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  restaurantCRMProfile: { findUnique: vi.fn(), upsert: vi.fn() },
}));
const create = vi.hoisted(() => vi.fn(async () => ({ campaignId: "new-camp", totalAudience: 0, recipients: [] })));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("../CrmCampaignService", () => ({ CrmCampaignService: { create } }));

import { ReadyMadeCampaignService, parseReadyMadeConfig } from "../ReadyMadeCampaignService";

beforeEach(() => {
  vi.clearAllMocks();
  db.campaign.findMany.mockResolvedValue([]);
  db.restaurantCRMProfile.findUnique.mockResolvedValue({ readyMadeConfig: null });
  db.campaign.findFirst.mockResolvedValue(null);
  db.campaign.update.mockResolvedValue({});
  db.restaurantCRMProfile.upsert.mockResolvedValue({});
});

describe("parseReadyMadeConfig", () => {
  it("defaults cart recovery to ON", () => {
    expect(parseReadyMadeConfig(null).cartRecoveryEnabled).toBe(true);
    expect(parseReadyMadeConfig({}).cartRecoveryEnabled).toBe(true);
  });
  it("honors an explicit false", () => {
    expect(parseReadyMadeConfig({ cartRecoveryEnabled: false }).cartRecoveryEnabled).toBe(false);
  });
});

describe("getStates", () => {
  it("returns all 8 catalog entries, inactive by default", async () => {
    const states = await ReadyMadeCampaignService.getStates("r1");
    expect(states).toHaveLength(8);
    // Recurring ones inactive (no campaign rows); cart ON by default.
    const bday = states.find((s) => s.id === "aniversariantes")!;
    expect(bday.active).toBe(false);
    expect(bday.message).toContain("Feliz aniversário");
    const cart = states.find((s) => s.id === "carrinho-abandonado")!;
    expect(cart.active).toBe(true); // default ON
  });

  it("reflects an active recurring campaign and its edited content", async () => {
    db.campaign.findMany.mockResolvedValue([
      { id: "c1", templateId: "recuperar-frios", status: "ACTIVE", message: "Texto editado {nome}",
        couponCode: "VOLTA20", scheduleConfig: { mode: "RECURRING", dailyLimit: 8, weekdays: [1,2], timeWindow: { start: "18:00", end: "21:00" } } },
    ]);
    const states = await ReadyMadeCampaignService.getStates("r1");
    const frio = states.find((s) => s.id === "recuperar-frios")!;
    expect(frio.active).toBe(true);
    expect(frio.status).toBe("ACTIVE");
    expect(frio.campaignId).toBe("c1");
    expect(frio.message).toBe("Texto editado {nome}");
    expect(frio.couponCode).toBe("VOLTA20");
    expect(frio.dailyLimit).toBe(8);
  });

  it("a PAUSED campaign reads as inactive", async () => {
    db.campaign.findMany.mockResolvedValue([
      { id: "c2", templateId: "clientes-vip", status: "PAUSED", message: "x", couponCode: null, scheduleConfig: null },
    ]);
    const states = await ReadyMadeCampaignService.getStates("r1");
    expect(states.find((s) => s.id === "clientes-vip")!.active).toBe(false);
  });
});

describe("activate", () => {
  it("creates a new recurring campaign when none exists", async () => {
    const r = await ReadyMadeCampaignService.activate("r1", "recuperar-frios");
    expect(r.ok).toBe(true);
    expect(create).toHaveBeenCalledOnce();
    const payload = create.mock.calls[0]![1];
    expect(payload.templateId).toBe("recuperar-frios");
    expect(payload.scheduleConfig.mode).toBe("RECURRING");
  });

  it("resumes + updates an existing paused campaign instead of duplicating", async () => {
    db.campaign.findFirst.mockResolvedValue({ id: "c9", status: "PAUSED" });
    const r = await ReadyMadeCampaignService.activate("r1", "recuperar-frios", { message: "novo {nome}" });
    expect(r.ok).toBe(true);
    expect(create).not.toHaveBeenCalled();
    expect(db.campaign.update).toHaveBeenCalledOnce();
    const data = db.campaign.update.mock.calls[0]![0].data;
    expect(data.status).toBe("ACTIVE");
    expect(data.message).toBe("novo {nome}");
  });

  it("cart recovery activation flips the config flag, no campaign created", async () => {
    const r = await ReadyMadeCampaignService.activate("r1", "carrinho-abandonado");
    expect(r.ok).toBe(true);
    expect(create).not.toHaveBeenCalled();
    expect(db.restaurantCRMProfile.upsert).toHaveBeenCalledOnce();
  });

  it("rejects an unknown id", async () => {
    const r = await ReadyMadeCampaignService.activate("r1", "inexistente");
    expect(r.ok).toBe(false);
  });
});

describe("deactivate", () => {
  it("pauses an active recurring campaign", async () => {
    db.campaign.findFirst.mockResolvedValue({ id: "c3" });
    const r = await ReadyMadeCampaignService.deactivate("r1", "reativar-mornos");
    expect(r.ok).toBe(true);
    expect(db.campaign.update.mock.calls[0]![0].data.status).toBe("PAUSED");
  });

  it("cart recovery deactivation sets the flag off", async () => {
    const r = await ReadyMadeCampaignService.deactivate("r1", "carrinho-abandonado");
    expect(r.ok).toBe(true);
    const written = db.restaurantCRMProfile.upsert.mock.calls[0]![0].update.readyMadeConfig;
    expect(written.cartRecoveryEnabled).toBe(false);
  });
});

describe("update", () => {
  it("requires the campaign to be activated first", async () => {
    db.campaign.findFirst.mockResolvedValue(null);
    const r = await ReadyMadeCampaignService.update("r1", "clientes-vip", { message: "x" });
    expect(r.ok).toBe(false);
  });

  it("rejects editing the cart-recovery engine", async () => {
    const r = await ReadyMadeCampaignService.update("r1", "carrinho-abandonado", { message: "x" });
    expect(r.ok).toBe(false);
  });
});
