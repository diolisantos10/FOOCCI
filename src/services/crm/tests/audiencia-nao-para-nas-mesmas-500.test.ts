/**
 * A PAREDE DAS 500 — a campanha que ficava muda com 20.500 pessoas por alcançar.
 *
 * ── O DEFEITO, diagnosticado em 28/08/2026 ──────────────────────────────────
 *
 * Pergunta do CEO: *"21 mil pessoas de audiência e só 10 mensagens enviadas?"*
 *
 * `resolveAudience` corta em `MAX_AUDIENCE` (500) **ordenando por
 * `lastOrderAt asc`** — os mais antigos primeiro, que são exatamente os frios e
 * os perdidos. A exclusão de quem já recebeu acontecia **depois**, em memória.
 *
 * Resultado: as mesmas 500 pessoas mais antigas ocupavam a lista **para
 * sempre**. Contatadas todas, o filtro zerava a fila, a campanha devolvia "sem
 * novos elegíveis" e ficava ACTIVE e MUDA — sem alerta em lugar nenhum.
 *
 * ⚠️ E o número 500 não era o defeito. Subir para 5.000 só moveria a parede.
 * O defeito era a ORDEM das duas operações, e é isso que estes testes travam.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const findMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    customer: { findMany: (...a: unknown[]) => findMany(...a) },
    restaurant: { findUnique: vi.fn().mockResolvedValue({ id: "r1" }) },
    // `getSegmentConfig` lê o perfil de CRM do restaurante; sem dublê ele
    // devolveria undefined e a resolução cairia antes de montar a consulta.
    restaurantCRMProfile: { findUnique: vi.fn().mockResolvedValue(null) },
  },
}));

beforeEach(() => {
  findMany.mockReset().mockResolvedValue([]);
});

describe("a exclusão entra na CONSULTA, não depois do corte", () => {
  it("⭐ quem já foi contatado é excluído no banco, antes do `take`", async () => {
    const { resolveAudience } = await import("../CrmCampaignService");

    await resolveAudience("r1", "FRIO", undefined, {
      excluirIds: ["cus_1", "cus_2"],
    });

    expect(findMany).toHaveBeenCalled();
    const where = findMany.mock.calls[0]![0].where;

    // A trava: os já contatados saem no WHERE. Se alguém mover isto de volta
    // para um `.filter()` depois do `take`, este teste reprova.
    expect(where.id).toEqual({ notIn: ["cus_1", "cus_2"] });
  });

  it("⭐ e o corte continua sendo por ordem de mais antigo — os frios primeiro", async () => {
    const { resolveAudience } = await import("../CrmCampaignService");

    await resolveAudience("r1", "FRIO", undefined, { excluirIds: ["cus_1"] });

    const chamada = findMany.mock.calls[0]![0];

    // As duas coisas juntas são o conserto: excluir ANTES, ordenado pelos mais
    // antigos. Uma sem a outra não resolve.
    expect(chamada.take).toBe(500);
    expect(chamada.orderBy[0]).toEqual({ lastOrderAt: "asc" });
    expect(chamada.where.id).toEqual({ notIn: ["cus_1"] });
  });

  it("sem exclusão nenhuma, a consulta não ganha filtro de id", async () => {
    // Metade que impede o teste de passar por acidente: sem lista, nada muda.
    const { resolveAudience } = await import("../CrmCampaignService");

    await resolveAudience("r1", "FRIO");

    expect(findMany.mock.calls[0]![0].where.id).toBeUndefined();
  });

  it("lista vazia é tratada como ausência, e não vira `notIn: []`", async () => {
    // `notIn: []` é uma cláusula que não filtra nada mas suja a consulta; pior,
    // em alguns bancos ela se comporta de forma surpreendente.
    const { resolveAudience } = await import("../CrmCampaignService");

    await resolveAudience("r1", "FRIO", undefined, { excluirIds: [] });

    expect(findMany.mock.calls[0]![0].where.id).toBeUndefined();
  });

  it("⭐ a segunda rodada alcança gente DIFERENTE da primeira", async () => {
    // É a prova de negócio, e a razão de tudo isto existir: o CEO precisa que a
    // campanha ande na base, não que releia as mesmas pessoas.
    const { resolveAudience } = await import("../CrmCampaignService");

    // Primeira rodada: ninguém contatado ainda.
    findMany.mockResolvedValueOnce([]);
    await resolveAudience("r1", "FRIO", undefined, { excluirIds: [] });

    // Segunda: os 500 da primeira entram como excluídos.
    const contatados = Array.from({ length: 500 }, (_, i) => `cus_${i}`);
    findMany.mockResolvedValueOnce([]);
    await resolveAudience("r1", "FRIO", undefined, { excluirIds: contatados });

    const primeira = findMany.mock.calls[0]![0].where;
    const segunda  = findMany.mock.calls[1]![0].where;

    expect(primeira.id).toBeUndefined();
    expect(segunda.id.notIn).toHaveLength(500);
  });
});
