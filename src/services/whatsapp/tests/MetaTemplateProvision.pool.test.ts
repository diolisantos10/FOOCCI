import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  campaign:              { findMany: vi.fn(), update: vi.fn(async () => ({})) },
  restaurant:            { findUnique: vi.fn(async () => ({ name: "Foocci Sushi", slug: "foocci" })) },
  restaurantBrandConfig: { findUnique: vi.fn(async () => null) },
  whatsAppAgentConfig:   { findUnique: vi.fn(async () => null) },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

const meta = vi.hoisted(() => ({
  syncFromMeta: vi.fn(async () => ({ ok: true, synced: 0 })),
  list:         vi.fn(async () => [] as { templateName: string }[]),
  createOnMeta: vi.fn(async () => ({ ok: true, id: "tpl_1" })),
  upsert:       vi.fn(async () => ({})),
}));
vi.mock("../MetaTemplateService", () => ({ MetaTemplateService: meta }));

import { provisionPoolTemplates } from "../MetaTemplateProvisionService";
import { phraseKey } from "@/services/crm/crmMessagePool";
import { getReadyMadeMessageVariants } from "@/services/crm/readyMadeCampaigns";

const R = "rest_1";
const variants = getReadyMadeMessageVariants("recuperar-frios");
const k0 = phraseKey(variants[0]);
const k1 = phraseKey(variants[1]);

beforeEach(() => {
  vi.clearAllMocks();
  meta.list.mockResolvedValue([]);
  meta.createOnMeta.mockResolvedValue({ ok: true, id: "tpl_1" });
});

describe("provisionPoolTemplates — one Meta template per selected phrase", () => {
  it("creates a template for each selected phrase and wires audienceConfig.metaTemplates", async () => {
    db.campaign.findMany.mockResolvedValue([{
      id: "c1", templateId: "recuperar-frios", message: variants[0],
      scheduleConfig: { mode: "RECURRING", messagePool: { selected: [k0, k1] } },
      audienceConfig: {},
    }]);

    const res = await provisionPoolTemplates(R, "c1");

    expect(res.created).toBe(2);
    expect(res.failed).toBe(0);
    // Names derive from the ready-made base + the phrase fingerprint.
    const names = meta.createOnMeta.mock.calls.map((c) => (c[1] as { name: string }).name);
    expect(names.every((n) => n.startsWith("cliente_frio_v"))).toBe(true);
    expect(new Set(names).size).toBe(2);
    // Mapping written with per-phrase name + submittedMessage.
    const upd = db.campaign.update.mock.calls[0][0] as { data: { audienceConfig: { metaTemplates: Record<string, { name: string; submittedMessage: string }> } } };
    const map = upd.data.audienceConfig.metaTemplates;
    expect(Object.keys(map).sort()).toEqual([k0, k1].sort());
    expect(map[k0].submittedMessage).toBe(variants[0]);
  });

  it("skips entirely (no Graph calls) when every active phrase is already mapped", async () => {
    db.campaign.findMany.mockResolvedValue([{
      id: "c1", templateId: "recuperar-frios", message: variants[0],
      scheduleConfig: { mode: "RECURRING", messagePool: { selected: [k0] } },
      audienceConfig: { metaTemplates: { [k0]: { name: "cliente_frio_x", language: "pt_BR", params: [] } } },
    }]);

    const res = await provisionPoolTemplates(R, "c1");

    expect(res.created + res.existed + res.failed).toBe(0);
    expect(meta.syncFromMeta).not.toHaveBeenCalled();
    expect(meta.createOnMeta).not.toHaveBeenCalled();
  });

  it("does nothing for campaigns without a pool (fallback single-phrase flow)", async () => {
    db.campaign.findMany.mockResolvedValue([{
      id: "c1", templateId: "recuperar-frios", message: variants[0],
      scheduleConfig: { mode: "RECURRING" }, audienceConfig: {},
    }]);

    const res = await provisionPoolTemplates(R);
    expect(res.created + res.existed + res.failed).toBe(0);
    expect(meta.createOnMeta).not.toHaveBeenCalled();
  });

  it("reuses an existing Meta template by name instead of recreating", async () => {
    db.campaign.findMany.mockResolvedValue([{
      id: "c1", templateId: "recuperar-frios", message: variants[0],
      scheduleConfig: { mode: "RECURRING", messagePool: { selected: [k0] } },
      audienceConfig: {},
    }]);
    const expectedName = `cliente_frio_${k0.replace(/^mf_/, "v")}`;
    meta.list.mockResolvedValue([{ templateName: expectedName }]);

    const res = await provisionPoolTemplates(R, "c1");
    expect(res.existed).toBe(1);
    expect(res.created).toBe(0);
    expect(meta.createOnMeta).not.toHaveBeenCalled();
  });
});
