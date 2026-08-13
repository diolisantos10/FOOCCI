/**
 * Modelo fantasma — o que ficava "Aprovado" para sempre depois de trocar de conta.
 *
 * ── O defeito ───────────────────────────────────────────────────────────────────
 * `syncFromMeta` só fazia `upsert` e nunca invalidava. Depois de uma troca de número
 * (WABA nova), os modelos aprovados na conta ANTIGA continuavam marcados APPROVED no
 * registro local — para sempre, porque o sync seguinte nem os toca: eles não vêm na
 * lista da conta nova. `findApproved` resolvia o fantasma, o envio saía com um nome
 * que não existe na WABA de hoje, e a Meta rejeitava.
 *
 * ── As duas metades, e a segunda é a que protege o CRM ─────────────────────────
 * Marcar órfão é fácil. O que decide se a proteção presta é ela NÃO disparar quando a
 * leitura foi ruim: uma lista truncada ou uma falha de rede não podem tirar do ar
 * modelos que existem e estão aprovados. Ausência de resposta não é ausência de
 * modelo (guardrail 1), e a proteção não pode ser mais destrutiva que o problema
 * (guardrail 5).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  metaMessageTemplate: {
    upsert:     vi.fn(async () => ({})),
    findMany:   vi.fn(),
    updateMany: vi.fn(async () => ({ count: 0 })),
    findFirst:  vi.fn(),
    // Existem no mock DE PROPÓSITO, para que "não apaga" seja uma afirmação
    // verificável e não o efeito colateral de um método ausente.
    deleteMany: vi.fn(async () => ({ count: 0 })),
    delete:     vi.fn(async () => ({})),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

vi.mock("../MetaConfigService", () => ({
  MetaConfigService: {
    getResolved: vi.fn(async () => ({
      restaurantId: "r1", wabaId: "waba_NOVA", phoneNumberId: "p1",
      accessToken: "tok", displayPhoneNumber: null, businessId: null,
      webhookVerifyToken: "v", connectionStatus: "CONNECTED", coexistence: false,
    })),
  },
}));
vi.mock("../metaFlag", () => ({ metaGraphUrl: (p: string) => `https://graph.test/${p}` }));

import { MetaTemplateService } from "../MetaTemplateService";

/** Um modelo como a Graph API o devolve. */
function metaTpl(name: string) {
  return { id: `id_${name}`, name, language: "pt_BR", category: "MARKETING", status: "APPROVED", components: [] };
}

/** Uma linha local. */
function local(templateName: string, orphanedAt: Date | null = null) {
  return { id: `row_${templateName}`, templateName, languageCode: "pt_BR", orphanedAt };
}

function respostaGraph(body: unknown, ok = true) {
  return { ok, json: async () => body };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  db.metaMessageTemplate.updateMany.mockResolvedValue({ count: 0 });
});

describe("syncFromMeta — RECONCILIA depois de uma leitura completa", () => {
  it("marca como órfão o modelo que a conta ATUAL não tem mais", async () => {
    global.fetch = vi.fn(async () => respostaGraph({ data: [metaTpl("promo_nova")] })) as never;
    db.metaMessageTemplate.findMany.mockResolvedValue([
      local("promo_nova"),          // veio da Meta → fica
      local("promo_da_conta_velha"), // não veio → órfão
    ]);

    const res = await MetaTemplateService.syncFromMeta("r1");

    expect(res.ok).toBe(true);
    expect(res.orphaned).toBe(1);
    const call = db.metaMessageTemplate.updateMany.mock.calls[0][0];
    expect(call.where.id.in).toEqual(["row_promo_da_conta_velha"]);
    expect(call.data.orphanedAt).toBeInstanceOf(Date);
  });

  it("NÃO APAGA — marca. A perícia de 'isto já foi aprovado' sobrevive", async () => {
    global.fetch = vi.fn(async () => respostaGraph({ data: [] })) as never;
    db.metaMessageTemplate.findMany.mockResolvedValue([local("promo_da_conta_velha")]);

    await MetaTemplateService.syncFromMeta("r1");

    expect(db.metaMessageTemplate.deleteMany).not.toHaveBeenCalled();
    expect(db.metaMessageTemplate.delete).not.toHaveBeenCalled();
    // O que aconteceu foi marcação, com data — a linha continua existindo.
    expect(db.metaMessageTemplate.updateMany.mock.calls[0][0].data.orphanedAt).toBeInstanceOf(Date);
  });

  it("preserva a data do órfão já marcado — ela diz DESDE QUANDO sumiu", async () => {
    global.fetch = vi.fn(async () => respostaGraph({ data: [] })) as never;
    db.metaMessageTemplate.findMany.mockResolvedValue([
      local("sumiu_ontem", new Date("2026-08-12T10:00:00Z")),
    ]);

    const res = await MetaTemplateService.syncFromMeta("r1");

    expect(res.orphaned).toBe(0);
    expect(db.metaMessageTemplate.updateMany).not.toHaveBeenCalled();
  });

  it("REABILITA o modelo que voltou a existir na conta", async () => {
    // Sem saída automática, um órfão marcado por engano ficaria fora do envio para
    // sempre e só um humano com acesso ao banco desfaria.
    global.fetch = vi.fn(async () => respostaGraph({ data: [metaTpl("voltou")] })) as never;
    db.metaMessageTemplate.findMany.mockResolvedValue([
      local("voltou", new Date("2026-08-12T10:00:00Z")),
    ]);

    await MetaTemplateService.syncFromMeta("r1");

    const limpeza = db.metaMessageTemplate.updateMany.mock.calls
      .map((c) => c[0])
      .find((c) => c.data.orphanedAt === null);
    expect(limpeza).toBeDefined();
    expect(limpeza.where.id.in).toEqual(["row_voltou"]);
  });
});

describe("syncFromMeta — leitura RUIM não invalida nada", () => {
  it("erro da Graph NÃO marca órfão nenhum", async () => {
    global.fetch = vi.fn(async () => respostaGraph({ error: { message: "token expirado" } }, false)) as never;
    db.metaMessageTemplate.findMany.mockResolvedValue([local("promo")]);

    const res = await MetaTemplateService.syncFromMeta("r1");

    expect(res.ok).toBe(false);
    expect(db.metaMessageTemplate.updateMany).not.toHaveBeenCalled();
  });

  it("falha de REDE NÃO marca órfão nenhum", async () => {
    global.fetch = vi.fn(async () => { throw new Error("ECONNRESET"); }) as never;
    db.metaMessageTemplate.findMany.mockResolvedValue([local("promo")]);

    const res = await MetaTemplateService.syncFromMeta("r1");

    expect(res.ok).toBe(false);
    expect(db.metaMessageTemplate.updateMany).not.toHaveBeenCalled();
  });

  it("lista TRUNCADA no teto de páginas NÃO marca órfão — meia lista apagaria o válido", async () => {
    // Sempre devolve "próxima página": a paginação bate no teto e nunca termina.
    global.fetch = vi.fn(async () =>
      respostaGraph({ data: [metaTpl("qualquer")], paging: { next: "https://graph.test/proxima" } }),
    ) as never;
    db.metaMessageTemplate.findMany.mockResolvedValue([local("nao_veio_ainda")]);

    const res = await MetaTemplateService.syncFromMeta("r1");

    expect(res.ok).toBe(true);
    expect(res.orphaned).toBe(0);
    expect(db.metaMessageTemplate.updateMany).not.toHaveBeenCalled();
  });

  it("config ausente NÃO marca órfão nenhum", async () => {
    const { MetaConfigService } = await import("../MetaConfigService");
    vi.mocked(MetaConfigService.getResolved).mockResolvedValueOnce(null);

    const res = await MetaTemplateService.syncFromMeta("r1");

    expect(res.ok).toBe(false);
    expect(db.metaMessageTemplate.updateMany).not.toHaveBeenCalled();
  });
});

describe("findApproved — o órfão sai do caminho de envio", () => {
  it("exige orphanedAt: null junto com APPROVED", async () => {
    db.metaMessageTemplate.findFirst.mockResolvedValue(null);

    await MetaTemplateService.findApproved("r1", { templateName: "promo" });

    const where = db.metaMessageTemplate.findFirst.mock.calls[0][0].where;
    expect(where.status).toBe("APPROVED");
    expect(where.orphanedAt).toBeNull();
  });

  it("também na busca por tipo de campanha — o outro caminho de resolução", async () => {
    db.metaMessageTemplate.findFirst.mockResolvedValue(null);

    await MetaTemplateService.findApproved("r1", { mappedCampaignType: "RECUPERACAO" });

    const where = db.metaMessageTemplate.findFirst.mock.calls[0][0].where;
    expect(where.orphanedAt).toBeNull();
  });
});
