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

const allKeys = variants.map(phraseKey);
const fullMap = Object.fromEntries(variants.map((v) => {
  const k = phraseKey(v);
  return [k, { name: `cliente_frio_${k.replace(/^mf_/, "v")}`, language: "pt_BR", params: [], submittedMessage: v }];
}));

describe("provisionPoolTemplates — one Meta template per catalog/custom phrase", () => {
  it("submits the WHOLE catalog (even without a pool) and wires audienceConfig.metaTemplates", async () => {
    db.campaign.findMany.mockResolvedValue([{
      id: "c1", templateId: "recuperar-frios", message: variants[0],
      scheduleConfig: { mode: "RECURRING" },
      audienceConfig: {},
    }]);

    const res = await provisionPoolTemplates(R, "c1");

    expect(res.created).toBe(variants.length);
    expect(res.failed).toBe(0);
    // Names derive from the ready-made base + the phrase fingerprint.
    const names = meta.createOnMeta.mock.calls.map((c) => (c[1] as { name: string }).name);
    expect(names.every((n) => n.startsWith("cliente_frio_v"))).toBe(true);
    expect(new Set(names).size).toBe(variants.length);
    // Mapping written with per-phrase name + submittedMessage.
    const upd = db.campaign.update.mock.calls[0][0] as { data: { audienceConfig: { metaTemplates: Record<string, { name: string; submittedMessage: string }> } } };
    const map = upd.data.audienceConfig.metaTemplates;
    expect(Object.keys(map).sort()).toEqual([...allKeys].sort());
    expect(map[k0].submittedMessage).toBe(variants[0]);
  });

  it("includes the owner's custom phrases in the sweep", async () => {
    db.campaign.findMany.mockResolvedValue([{
      id: "c1", templateId: "recuperar-frios", message: variants[0],
      scheduleConfig: { mode: "RECURRING", messagePool: { selected: [k0], custom: [{ id: "p1", text: "ola sentimos sua falta" }] } },
      audienceConfig: {},
    }]);

    const res = await provisionPoolTemplates(R, "c1");

    expect(res.created).toBe(variants.length + 1);
    const upd = db.campaign.update.mock.calls[0][0] as { data: { audienceConfig: { metaTemplates: Record<string, { submittedMessage: string }> } } };
    expect(upd.data.audienceConfig.metaTemplates[phraseKey("ola sentimos sua falta")].submittedMessage).toBe("ola sentimos sua falta");
  });

  it("skips entirely (no Graph calls) when every candidate phrase is already mapped", async () => {
    db.campaign.findMany.mockResolvedValue([{
      id: "c1", templateId: "recuperar-frios", message: variants[0],
      scheduleConfig: { mode: "RECURRING", messagePool: { selected: [k0] } },
      audienceConfig: { metaTemplates: fullMap },
    }]);

    const res = await provisionPoolTemplates(R, "c1");

    expect(res.created + res.existed + res.failed).toBe(0);
    expect(meta.syncFromMeta).not.toHaveBeenCalled();
    expect(meta.createOnMeta).not.toHaveBeenCalled();
  });

  it("reuses existing Meta templates by name instead of recreating", async () => {
    db.campaign.findMany.mockResolvedValue([{
      id: "c1", templateId: "recuperar-frios", message: variants[0],
      scheduleConfig: { mode: "RECURRING", messagePool: { selected: [k0] } },
      audienceConfig: {},
    }]);
    meta.list.mockResolvedValue(allKeys.map((k) => ({ templateName: `cliente_frio_${k.replace(/^mf_/, "v")}` })));

    const res = await provisionPoolTemplates(R, "c1");
    expect(res.existed).toBe(variants.length);
    expect(res.created).toBe(0);
    expect(meta.createOnMeta).not.toHaveBeenCalled();
  });

  /**
   * O beco sem saída que este teste tranca: `MISSING` quer dizer "a Meta NÃO tem
   * este modelo". Se o provisionamento contasse essa linha como "já existe", ele
   * pularia exatamente o modelo que precisa ser recriado, e o restaurante ficaria
   * preso — selo vermelho para sempre, sem nenhum caminho de volta.
   */
  it("RECRIA o modelo marcado MISSING em vez de tratá-lo como já existente", async () => {
    db.campaign.findMany.mockResolvedValue([{
      id: "c1", templateId: "recuperar-frios", message: variants[0],
      scheduleConfig: { mode: "RECURRING", messagePool: { selected: [k0] } },
      audienceConfig: {},
    }]);
    // A conta trocou: as linhas existem no banco, mas o sync já as rebaixou.
    meta.list.mockResolvedValue(
      allKeys.map((k) => ({ templateName: `cliente_frio_${k.replace(/^mf_/, "v")}`, status: "MISSING" })) as never,
    );

    const res = await provisionPoolTemplates(R, "c1");

    expect(res.created).toBe(variants.length);
    expect(res.existed).toBe(0);
    expect(meta.createOnMeta).toHaveBeenCalled();
  });

  it("um modelo APROVADO de verdade continua sendo reaproveitado, não recriado", async () => {
    db.campaign.findMany.mockResolvedValue([{
      id: "c1", templateId: "recuperar-frios", message: variants[0],
      scheduleConfig: { mode: "RECURRING", messagePool: { selected: [k0] } },
      audienceConfig: {},
    }]);
    meta.list.mockResolvedValue(
      allKeys.map((k) => ({ templateName: `cliente_frio_${k.replace(/^mf_/, "v")}`, status: "APPROVED" })) as never,
    );

    const res = await provisionPoolTemplates(R, "c1");

    expect(res.existed).toBe(variants.length);
    expect(meta.createOnMeta).not.toHaveBeenCalled();
  });
});
