/**
 * O pré-voo sozinho: fail-closed, e NÃO fala com ninguém.
 *
 * ⚠️ Esta rota existe porque descobrir que o pré-voo estava cego custou SEIS
 * contatos de uma lista de 4.000, em 08/09/2026 — a única forma de executá-lo
 * era disparando a rodada inteira. A peça que evita gasto não pode ser
 * testável só gastando.
 *
 * O caso que mais importa aqui é o último: **nada de envio é chamado.**
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const preVoo = vi.hoisted(() => ({ preVooDosModelosLiberados: vi.fn() }));
vi.mock("@/services/foocci-sdr/preVooModelosLiberados", () => preVoo);

const canal = vi.hoisted(() => ({ canalDeVendasPronto: vi.fn(() => true) }));
vi.mock("@/services/foocci-sdr/FoocciSalesChannel", () => canal);

const rodada = vi.hoisted(() => ({ abordarARodadaDoDia: vi.fn(), abordarItemDaFila: vi.fn() }));
vi.mock("@/services/salaDeVendas/prospeccao/abordarDaFila", () => rodada);

import { POST } from "./route";

const guardado = { ...process.env };

function bater(auth?: string) {
  return POST(
    new NextRequest("https://foocci.com.br/api/cron/prospeccao/pre-voo", {
      method: "POST",
      headers: { "content-type": "application/json", ...(auth ? { authorization: auth } : {}) },
      body: "{}",
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "segredo";
  canal.canalDeVendasPronto.mockReturnValue(true);
  preVoo.preVooDosModelosLiberados.mockResolvedValue({
    pronto: true,
    modelo: { nome: "foocci_abordagem_v1", idioma: "pt_BR", status: "APPROVED", variaveis: 1 },
    parametrosQueMandamos: 1,
  });
});
afterEach(() => { process.env = { ...guardado }; });

describe("a guarda", () => {
  it("⭐ sem CRON_SECRET: 503, e não confere nada", async () => {
    delete process.env.CRON_SECRET;
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await bater("Bearer qualquer");
    expect(res.status).toBe(503);
    expect(preVoo.preVooDosModelosLiberados).not.toHaveBeenCalled();
  });

  it("segredo errado: 401", async () => {
    const res = await bater("Bearer errado");
    expect(res.status).toBe(401);
    expect(preVoo.preVooDosModelosLiberados).not.toHaveBeenCalled();
  });
});

describe("o veredito", () => {
  it("devolve a conferência inteira dos modelos liberados", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const res = await bater("Bearer segredo");
    const json = (await res.json()) as { data: Record<string, unknown> };

    expect(res.status).toBe(200);
    expect(json.data).toMatchObject({
      canalPronto: true,
      conferencia: {
        pronto: true,
        modelo: { nome: "foocci_abordagem_v1", idioma: "pt_BR", status: "APPROVED", variaveis: 1 },
        parametrosQueMandamos: 1,
      },
    });
    expect(preVoo.preVooDosModelosLiberados).toHaveBeenCalledTimes(1);
  });

  it("reprovação sobe inteira — causa e detalhe, não só 'não pronto'", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    preVoo.preVooDosModelosLiberados.mockResolvedValue({
      pronto: false,
      causa: "variaveisNaoBatem",
      detalhe: "o modelo espera 3 variáveis e o envio manda 1",
    });

    const res = await bater("Bearer segredo");
    const json = (await res.json()) as { data: { conferencia: Record<string, unknown> } };

    expect(json.data.conferencia).toMatchObject({
      causa: "variaveisNaoBatem",
      detalhe: "o modelo espera 3 variáveis e o envio manda 1",
    });
  });

  it("não depende mais do nome legado de modelo no ambiente", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    delete process.env.FOOCCI_SDR_MODELO_ABORDAGEM;
    delete process.env.FOOCCI_SDR_MODELO_IDIOMA;

    const res = await bater("Bearer segredo");

    expect(res.status).toBe(200);
    expect(preVoo.preVooDosModelosLiberados).toHaveBeenCalledTimes(1);
  });
});

describe("⭐ e ela NÃO fala com ninguém", () => {
  it("não monta rodada, não aborda item — nenhum contato é gasto", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    await bater("Bearer segredo");

    expect(rodada.abordarARodadaDoDia, "a leitura virou envio").not.toHaveBeenCalled();
    expect(rodada.abordarItemDaFila, "a leitura virou envio").not.toHaveBeenCalled();
  });
});
