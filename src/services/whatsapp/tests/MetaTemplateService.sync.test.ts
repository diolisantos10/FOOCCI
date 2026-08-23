/**
 * O SELO "✓ META APROVADA" PODIA MENTIR — e este arquivo trava a mentira.
 *
 * Caso real, Sushi Cazza, 23/08/2026: a tela de campanha mostrava cinco frases com
 * selo verde "✓ Meta aprovada" enquanto a Meta recusava TODO envio com
 * `META_132001 — template não existe`. Nenhum humano marcou nada errado no banco:
 * `APPROVED` só é escrito por `syncFromMeta`, que copia a resposta da Meta. O
 * defeito era o sync **só saber somar**. Quando a Meta parava de listar um modelo
 * — conta trocada, modelo apagado lá —, a linha local ficava `APPROVED` para
 * sempre, e tanto o selo da tela quanto `findApproved()` (que escolhe o modelo do
 * disparo) seguiam acreditando nela.
 *
 * Os testes abaixo cobrem as três coisas que precisam ser verdade ao mesmo tempo:
 * o órfão é rebaixado, a meia-leitura NUNCA rebaixa ninguém, e o rebaixamento não
 * inventa uma reprovação que a Meta não fez.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  metaMessageTemplate: {
    upsert:     vi.fn(async () => ({})),
    findMany:   vi.fn(async () => [] as Array<{ id: string; templateName: string; languageCode: string }>),
    updateMany: vi.fn(async () => ({ count: 0 })),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("../MetaConfigService", () => ({
  MetaConfigService: {
    getResolved: vi.fn(async () => ({ wabaId: "waba-nova", accessToken: "tok", phoneNumberId: "p1" })),
  },
}));
vi.mock("../metaFlag", () => ({ metaGraphUrl: (p: string) => `https://graph.test/${p}` }));

import { MetaTemplateService } from "../MetaTemplateService";

/** Uma resposta de listagem da Meta, sem paginação. */
const pagina = (nomes: Array<{ name: string; language?: string; status?: string }>) => ({
  ok:   true,
  json: async () => ({ data: nomes.map((n) => ({ id: `id_${n.name}`, name: n.name, language: n.language ?? "pt_BR", category: "MARKETING", status: n.status ?? "APPROVED", components: [] })) }),
});

beforeEach(() => {
  vi.clearAllMocks();
  db.metaMessageTemplate.findMany.mockResolvedValue([]);
});

describe("syncFromMeta — o espelho também precisa APAGAR", () => {
  it("rebaixa para MISSING o modelo APROVADO que a Meta não lista mais", async () => {
    // A conta de hoje tem só `campanha_nova`. `campanha_velha` ficou na conta antiga.
    global.fetch = vi.fn(async () => pagina([{ name: "campanha_nova" }])) as never;
    db.metaMessageTemplate.findMany.mockResolvedValue([
      { id: "row_velha", templateName: "campanha_velha", languageCode: "pt_BR" },
      { id: "row_nova",  templateName: "campanha_nova",  languageCode: "pt_BR" },
    ]);

    const r = await MetaTemplateService.syncFromMeta("r1");

    expect(r.ok).toBe(true);
    expect(r.missing).toBe(1);
    const arg = db.metaMessageTemplate.updateMany.mock.calls[0][0] as {
      where: { id: { in: string[] } }; data: { status: string };
    };
    // Só a órfã é rebaixada — a que a Meta confirmou continua intocada.
    expect(arg.where.id.in).toEqual(["row_velha"]);
    expect(arg.data.status).toBe("MISSING");
  });

  it("NÃO diz 'rejeitado': a Meta não reprovou nada, ela só não conhece o modelo", async () => {
    global.fetch = vi.fn(async () => pagina([])) as never;
    db.metaMessageTemplate.findMany.mockResolvedValue([
      { id: "row_velha", templateName: "campanha_velha", languageCode: "pt_BR" },
    ]);

    await MetaTemplateService.syncFromMeta("r1");

    const arg = db.metaMessageTemplate.updateMany.mock.calls[0][0] as { data: { status: string } };
    expect(arg.data.status).not.toBe("REJECTED");
    expect(arg.data.status).toBe("MISSING");
  });

  it("distingue idioma: mesmo nome em outro idioma NÃO salva a linha", async () => {
    global.fetch = vi.fn(async () => pagina([{ name: "campanha_x", language: "en_US" }])) as never;
    db.metaMessageTemplate.findMany.mockResolvedValue([
      { id: "row_pt", templateName: "campanha_x", languageCode: "pt_BR" },
    ]);

    const r = await MetaTemplateService.syncFromMeta("r1");

    expect(r.missing).toBe(1);
  });

  it("não mexe em nada quando a Meta confirma TODOS os modelos", async () => {
    global.fetch = vi.fn(async () => pagina([{ name: "campanha_nova" }])) as never;
    db.metaMessageTemplate.findMany.mockResolvedValue([
      { id: "row_nova", templateName: "campanha_nova", languageCode: "pt_BR" },
    ]);

    const r = await MetaTemplateService.syncFromMeta("r1");

    expect(r.missing).toBe(0);
    expect(db.metaMessageTemplate.updateMany).not.toHaveBeenCalled();
  });
});

describe("syncFromMeta — guardrail 1: meia-leitura não vira veredito", () => {
  it("erro da Meta NO MEIO da varredura não rebaixa NINGUÉM", async () => {
    // A Meta responde erro logo de cara. Se isso rebaixasse, uma instabilidade de
    // rede apagaria o selo de todos os modelos aprovados do restaurante.
    global.fetch = vi.fn(async () => ({
      ok: false, json: async () => ({ error: { message: "temporariamente indisponível" } }),
    })) as never;
    db.metaMessageTemplate.findMany.mockResolvedValue([
      { id: "row_a", templateName: "a", languageCode: "pt_BR" },
    ]);

    const r = await MetaTemplateService.syncFromMeta("r1");

    expect(r.ok).toBe(false);
    expect(db.metaMessageTemplate.updateMany).not.toHaveBeenCalled();
  });

  it("sem conexão com a Meta não rebaixa NINGUÉM", async () => {
    const { MetaConfigService } = await import("../MetaConfigService");
    (MetaConfigService.getResolved as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const r = await MetaTemplateService.syncFromMeta("r1");

    expect(r.ok).toBe(false);
    expect(db.metaMessageTemplate.updateMany).not.toHaveBeenCalled();
  });

  it("paginação TRUNCADA (mais páginas que o teto) não rebaixa NINGUÉM", async () => {
    // Toda página aponta para a próxima: a varredura bate no teto de 10 páginas e
    // termina sem ter visto a conta inteira. Rebaixar aqui apagaria o selo de
    // quem só aparece na página 11.
    global.fetch = vi.fn(async () => ({
      ok:   true,
      json: async () => ({
        data:   [{ id: "i", name: "t", language: "pt_BR", category: "MARKETING", status: "APPROVED", components: [] }],
        paging: { next: "https://graph.test/proxima" },
      }),
    })) as never;
    db.metaMessageTemplate.findMany.mockResolvedValue([
      { id: "row_a", templateName: "invisivel", languageCode: "pt_BR" },
    ]);

    const r = await MetaTemplateService.syncFromMeta("r1");

    expect(r.ok).toBe(true);
    expect(r.missing).toBe(0);
    expect(db.metaMessageTemplate.updateMany).not.toHaveBeenCalled();
  });
});

describe("o efeito que interessa: o disparo para de escolher modelo fantasma", () => {
  it("findApproved exige APPROVED — uma linha MISSING deixa de ser escolhível", async () => {
    // `findApproved` filtra por `status: "APPROVED"`; depois do rebaixamento a
    // consulta não casa mais, e o disparo cai no bloqueio honesto
    // (META_TEMPLATE_REQUIRED) em vez de morrer com META_132001 na Meta.
    const findFirst = vi.fn(async () => null);
    (db.metaMessageTemplate as unknown as { findFirst: typeof findFirst }).findFirst = findFirst;

    const achado = await MetaTemplateService.findApproved("r1", { templateName: "campanha_velha" });

    expect(achado).toBeNull();
    const where = findFirst.mock.calls[0][0] as unknown as { where: { status: string } };
    expect(where.where.status).toBe("APPROVED");
  });
});
