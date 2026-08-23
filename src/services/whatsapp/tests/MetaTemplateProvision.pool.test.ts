import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  campaign:              { findMany: vi.fn(), update: vi.fn(async () => ({})) },
  restaurant:            { findUnique: vi.fn(async () => ({ name: "Foocci Sushi", slug: "foocci" })) },
  restaurantBrandConfig: { findUnique: vi.fn(async () => null) },
  whatsAppAgentConfig:   { findUnique: vi.fn(async () => null) },
  metaMessageTemplate:   {
    findMany:  vi.fn(async () => [] as { templateName: string }[]),
    count:     vi.fn(async () => 0),
    findFirst: vi.fn(async () => null as { updatedAt: Date } | null),
  },
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
  db.metaMessageTemplate.findMany.mockResolvedValue([]);
  db.metaMessageTemplate.count.mockResolvedValue(0);
  db.metaMessageTemplate.findFirst.mockResolvedValue(null);
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

/**
 * O CONGELAMENTO — três camadas do MESMO erro, cada uma sozinha capaz de deixar a
 * loja presa para sempre. Caso Sushi Cazza, 23/08/2026: a resubmissão automática
 * roda a cada 10 minutos e mesmo assim NADA era resubmetido, porque cada camada
 * tratava estado local como prova do estado da Meta.
 */
describe("descongelar a resubmissão automática", () => {
  const nomes = allKeys.map((k) => `cliente_frio_${k.replace(/^mf_/, "v")}`);

  it("CAMADA 1 — mapa completo NÃO é prova de vida: modelo MISSING volta para a fila", async () => {
    db.campaign.findMany.mockResolvedValue([{
      id: "c1", templateId: "recuperar-frios", message: variants[0],
      scheduleConfig: { mode: "RECURRING", messagePool: { selected: [k0] } },
      // O mapa está COMPLETO — era isto que fazia a função desistir antes de
      // qualquer chamada à Meta.
      audienceConfig: { metaTemplates: fullMap },
    }]);
    // …mas o banco já sabe que esses modelos não existem mais na conta de hoje.
    db.metaMessageTemplate.findMany.mockResolvedValue(nomes.map((n) => ({ templateName: n })));

    const res = await provisionPoolTemplates(R, "c1");

    expect(res.created).toBeGreaterThan(0);
    expect(meta.createOnMeta).toHaveBeenCalled();
  });

  it("CAMADA 1 — mapa completo e NENHUM ausente continua pulando (sem tráfego à toa)", async () => {
    db.campaign.findMany.mockResolvedValue([{
      id: "c1", templateId: "recuperar-frios", message: variants[0],
      scheduleConfig: { mode: "RECURRING", messagePool: { selected: [k0] } },
      audienceConfig: { metaTemplates: fullMap },
    }]);

    const res = await provisionPoolTemplates(R, "c1");

    expect(res.created + res.existed + res.failed).toBe(0);
    expect(meta.createOnMeta).not.toHaveBeenCalled();
  });

  it("CAMADA 2 — espelho VELHO é relido mesmo sem nada PENDING", async () => {
    db.campaign.findMany.mockResolvedValue([{
      id: "c1", templateId: "recuperar-frios", message: variants[0],
      scheduleConfig: { mode: "RECURRING", messagePool: { selected: [k0] } },
      audienceConfig: { metaTemplates: fullMap },
    }]);
    db.metaMessageTemplate.count.mockResolvedValue(0);                       // nada PENDING
    const velho = new Date(Date.now() - 24 * 60 * 60 * 1000);                // lido há 24h
    db.metaMessageTemplate.findFirst.mockResolvedValue({ updatedAt: velho });

    await provisionPoolTemplates(R, "c1");

    expect(meta.syncFromMeta).toHaveBeenCalled();
  });

  it("CAMADA 2 — espelho RECÉM-LIDO não é relido (o custo continua baixo)", async () => {
    db.campaign.findMany.mockResolvedValue([{
      id: "c1", templateId: "recuperar-frios", message: variants[0],
      scheduleConfig: { mode: "RECURRING", messagePool: { selected: [k0] } },
      audienceConfig: { metaTemplates: fullMap },
    }]);
    db.metaMessageTemplate.count.mockResolvedValue(0);
    db.metaMessageTemplate.findFirst.mockResolvedValue({ updatedAt: new Date() });

    await provisionPoolTemplates(R, "c1");

    expect(meta.syncFromMeta).not.toHaveBeenCalled();
  });

  it("CAMADA 2 — modelo PENDING continua forçando a releitura", async () => {
    db.campaign.findMany.mockResolvedValue([{
      id: "c1", templateId: "recuperar-frios", message: variants[0],
      scheduleConfig: { mode: "RECURRING", messagePool: { selected: [k0] } },
      audienceConfig: { metaTemplates: fullMap },
    }]);
    db.metaMessageTemplate.count.mockResolvedValue(2);
    db.metaMessageTemplate.findFirst.mockResolvedValue({ updatedAt: new Date() });

    await provisionPoolTemplates(R, "c1");

    expect(meta.syncFromMeta).toHaveBeenCalled();
  });

  it("O TEXTO SUBMETIDO É O DA CAMPANHA, sem uma vírgula mudada", async () => {
    db.campaign.findMany.mockResolvedValue([{
      id: "c1", templateId: "recuperar-frios", message: variants[0],
      scheduleConfig: { mode: "RECURRING", messagePool: { selected: [k0] } },
      audienceConfig: { metaTemplates: fullMap },
    }]);
    db.metaMessageTemplate.findMany.mockResolvedValue(nomes.map((n) => ({ templateName: n })));

    await provisionPoolTemplates(R, "c1");

    // O que vai para o mapa é exatamente a frase do catálogo — o corpo enviado à
    // Meta é construído a partir dela, com os {tokens} virando {{n}}.
    const upd = db.campaign.update.mock.calls[0][0] as {
      data: { audienceConfig: { metaTemplates: Record<string, { submittedMessage: string }> } };
    };
    const map = upd.data.audienceConfig.metaTemplates;
    for (const v of variants) {
      expect(map[phraseKey(v)].submittedMessage).toBe(v);
    }
  });
});

describe("a varredura cobre o catálogo, não só o que está ligado", () => {
  it("NÃO filtra por ACTIVE — campanha pausada/concluída também ganha modelo", async () => {
    db.campaign.findMany.mockResolvedValue([{
      id: "c1", templateId: "recuperar-frios", message: variants[0],
      scheduleConfig: { mode: "RECURRING" }, audienceConfig: {},
    }]);

    await provisionPoolTemplates(R);

    const where = (db.campaign.findMany.mock.calls[0][0] as { where: Record<string, unknown> }).where;
    // O que importa é o que NÃO está lá: nada de `status: "ACTIVE"`.
    expect(where.status).not.toBe("ACTIVE");
    // …e que a morta de verdade continue fora.
    expect(JSON.stringify(where)).toContain("CANCELLED");
  });

  it("campanhas que compartilham a mesma predefinida NÃO duplicam o modelo", async () => {
    // Duas campanhas, mesmo templateId: os nomes derivam do TEXTO, então a segunda
    // encontra os modelos da primeira já criados e apenas confirma.
    db.campaign.findMany.mockResolvedValue([
      { id: "c1", templateId: "recuperar-frios", message: variants[0], scheduleConfig: { mode: "RECURRING" }, audienceConfig: {} },
      { id: "c2", templateId: "recuperar-frios", message: variants[0], scheduleConfig: { mode: "RECURRING" }, audienceConfig: {} },
    ]);

    await provisionPoolTemplates(R);

    const nomes = meta.createOnMeta.mock.calls.map((c) => (c[1] as { name: string }).name);
    // Nenhum nome criado duas vezes — é isto que este teste trava. A CONTAGEM
    // total não serve de âncora aqui: a mesma varredura também submete o catálogo
    // das predefinidas sem campanha, e prender o teste a um número absoluto o
    // tornaria frágil a cada frase nova no catálogo.
    expect(new Set(nomes).size).toBe(nomes.length);
    // E as 5 desta predefinida saíram uma única vez, apesar das DUAS campanhas.
    const daPredefinida = nomes.filter((n) => n.startsWith("cliente_frio_v"));
    expect(daPredefinida).toHaveLength(variants.length);
  });
});

/**
 * FRASE QUE FALHOU NÃO PODE VIRAR FRASE PRONTA.
 *
 * O mapa `audienceConfig.metaTemplates` é o que o `work` consulta para decidir
 * "esta campanha já está submetida". Gravar nele uma frase cujo envio à Meta
 * FALHOU é registrar intenção como realização — e a frase morre em silêncio,
 * porque nunca mais entra na fila. Vira problema de verdade agora, com o catálogo
 * inteiro indo de uma vez e o limite de criação da Meta virando rotina.
 */
describe("submissão que falha continua na fila", () => {
  it("NÃO grava no mapa a frase cujo createOnMeta falhou", async () => {
    db.campaign.findMany.mockResolvedValue([{
      id: "c1", templateId: "recuperar-frios", message: variants[0],
      scheduleConfig: { mode: "RECURRING" }, audienceConfig: {},
    }]);
    // A primeira passa; todas as outras batem no limite da Meta.
    let n = 0;
    meta.createOnMeta.mockImplementation(async () => {
      n += 1;
      return n === 1 ? { ok: true, id: "tpl_1" } : { ok: false, error: "rate limit" };
    });

    const res = await provisionPoolTemplates(R, "c1");

    expect(res.created).toBe(1);
    expect(res.failed).toBe(variants.length - 1);

    const upd = db.campaign.update.mock.calls[0][0] as {
      data: { audienceConfig: { metaTemplates: Record<string, unknown> } };
    };
    const map = upd.data.audienceConfig.metaTemplates;
    // Só a que chegou na Meta ficou anotada.
    expect(Object.keys(map)).toHaveLength(1);
  });

  it("com o mapa incompleto, a campanha VOLTA para a fila na passada seguinte", async () => {
    // Estado logo após a rodada acima: só uma frase mapeada.
    const parcial = { [k0]: { name: `cliente_frio_${k0.replace(/^mf_/, "v")}`, language: "pt_BR", params: [], submittedMessage: variants[0] } };
    db.campaign.findMany.mockResolvedValue([{
      id: "c1", templateId: "recuperar-frios", message: variants[0],
      scheduleConfig: { mode: "RECURRING" }, audienceConfig: { metaTemplates: parcial },
    }]);

    const res = await provisionPoolTemplates(R, "c1");

    expect(res.created).toBeGreaterThan(0);
    expect(meta.createOnMeta).toHaveBeenCalled();
  });
});

/**
 * O CRITÉRIO DO CEO É A TELA, NÃO A TABELA — 23/08/2026.
 *
 * *"Todas as campanhas que estão na tela de campanhas do Foocci estão todas
 * autorizadas. Ligadas ou não."* E a tela lista as 16 predefinidas SEMPRE:
 * `ReadyMadeCampaignService.getStates` faz `READY_MADE_CAMPAIGNS.map(...)` sem
 * filtro, e o card aparece com `campaignId: null` enquanto ninguém ligou —
 * conferido lendo a tela, não deduzido da tabela.
 *
 * Por isso o catálogo é submetido mesmo sem campanha criada, e SEM criar campanha:
 * campanha que não existe é a única que não dispara por engano.
 */
describe("catálogo sem campanha criada também é submetido", () => {
  it("submete as frases de predefinida que NÃO tem campanha nenhuma", async () => {
    db.campaign.findMany.mockResolvedValue([]); // loja sem campanha alguma

    const res = await provisionPoolTemplates(R);

    expect(res.created).toBe(16 * 5);                    // 16 predefinidas × 5 frases
    expect(db.campaign.update).not.toHaveBeenCalled();   // nada de mapear
  });

  it("NÃO cria campanha nenhuma para submeter", async () => {
    db.campaign.findMany.mockResolvedValue([]);

    await provisionPoolTemplates(R);

    // `create` nem existe no dublê do Prisma: se o código tentasse criar campanha,
    // isto estouraria em vez de passar silenciosamente.
    expect((db.campaign as Record<string, unknown>).create).toBeUndefined();
  });

  it("NÃO duplica: predefinida que já tem campanha sai pelo caminho normal", async () => {
    db.campaign.findMany.mockResolvedValue([{
      id: "c1", templateId: "recuperar-frios", message: variants[0],
      scheduleConfig: { mode: "RECURRING" }, audienceConfig: {},
    }]);

    await provisionPoolTemplates(R);

    const nomes = meta.createOnMeta.mock.calls.map((c) => (c[1] as { name: string }).name);
    expect(new Set(nomes).size).toBe(nomes.length);
    expect(db.campaign.update).toHaveBeenCalledTimes(1); // só a que tem campanha
  });

  it("chamada para UMA campanha não varre o catálogo inteiro", async () => {
    db.campaign.findMany.mockResolvedValue([{
      id: "c1", templateId: "recuperar-frios", message: variants[0],
      scheduleConfig: { mode: "RECURRING" }, audienceConfig: {},
    }]);

    const res = await provisionPoolTemplates(R, "c1");

    expect(res.created).toBe(variants.length); // só as 5 dela
  });
});
