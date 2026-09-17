/**
 * A rota do raio-x: fechada sem a variável, e nenhuma consulta antes da guarda.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const banco = vi.hoisted(() => ({
  prisma: {
    leadMensagem: { count: vi.fn(), findMany: vi.fn() },
    siteLead: { findMany: vi.fn() },
    empresa: { findMany: vi.fn() },
    contato: { findMany: vi.fn() },
    oportunidade: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/prisma", () => banco);

import { GET } from "./route";

const SEGREDO = "segredo-do-raio-x-comercial-2026";
const guardado = { ...process.env };

function bater(query = "", cabecalhos: Record<string, string> = {}) {
  return GET(
    new NextRequest(`https://foocci.com.br/api/cron/comercial/raio-x-conversas${query}`, {
      headers: cabecalhos,
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  process.env.RAIOX_COMERCIAL_SECRET = SEGREDO;
  banco.prisma.leadMensagem.count.mockResolvedValue(2);
  banco.prisma.leadMensagem.findMany.mockResolvedValue([
    { leadId: "a", direcao: "SAIDA", ocorreuEm: new Date("2026-09-01T10:00:00.000Z") },
    { leadId: "a", direcao: "ENTRADA", ocorreuEm: new Date("2026-09-01T10:10:00.000Z") },
  ]);
  banco.prisma.siteLead.findMany.mockResolvedValue([
    {
      id: "a",
      nome: "Seu Marcos",
      whatsapp: "5511987654321",
      restaurante: "Padaria Central",
      cidade: "São Paulo",
      stage: "PRIMEIRO_CONTATO",
      optOutAt: null,
      empresaId: null,
      ultimaMensagemEm: new Date("2026-09-01T10:10:00.000Z"),
    },
  ]);
  banco.prisma.empresa.findMany.mockResolvedValue([]);
  banco.prisma.contato.findMany.mockResolvedValue([]);
  banco.prisma.oportunidade.findMany.mockResolvedValue([]);
});
afterEach(() => {
  process.env = { ...guardado };
});

describe("a porta", () => {
  it("⛔ sem RAIOX_COMERCIAL_SECRET: 503 e NENHUMA consulta ao banco", async () => {
    delete process.env.RAIOX_COMERCIAL_SECRET;
    const res = await bater("", { "x-raiox-comercial-secret": SEGREDO });
    expect(res.status).toBe(503);
    expect(banco.prisma.leadMensagem.count).not.toHaveBeenCalled();
  });

  it("⛔ CRON_SECRET no ambiente NÃO abre esta rota", async () => {
    delete process.env.RAIOX_COMERCIAL_SECRET;
    process.env.CRON_SECRET = SEGREDO;
    const res = await bater("", { authorization: `Bearer ${SEGREDO}` });
    expect(res.status).toBe(503);
    expect(banco.prisma.leadMensagem.count).not.toHaveBeenCalled();
  });

  it("segredo errado: 401, e nada é lido", async () => {
    const res = await bater("", { "x-raiox-comercial-secret": "errado-mas-comprido-o-bastante" });
    expect(res.status).toBe(401);
    expect(banco.prisma.leadMensagem.count).not.toHaveBeenCalled();
  });

  it("segredo certo: 200, pelo cabeçalho próprio e pelo Bearer", async () => {
    expect((await bater("", { "x-raiox-comercial-secret": SEGREDO })).status).toBe(200);
    expect((await bater("", { authorization: `Bearer ${SEGREDO}` })).status).toBe(200);
  });
});

describe("os parâmetros", () => {
  it("data ilegível é recusada, não ignorada em silêncio", async () => {
    const res = await bater("?desde=ontem", { "x-raiox-comercial-secret": SEGREDO });
    expect(res.status).toBe(400);
    expect(banco.prisma.leadMensagem.count).not.toHaveBeenCalled();
  });

  it("por padrão o telefone sai mascarado, e nada é registrado como abertura", async () => {
    const res = await bater("", { "x-raiox-comercial-secret": SEGREDO });
    const json = (await res.json()) as { data: { telefoneCompleto: boolean; amostra: Array<{ telefone: string }> } };
    expect(json.data.telefoneCompleto).toBe(false);
    expect(json.data.amostra[0]!.telefone).toBe("+55 11 9****-**21");
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("?telefoneCompleto=1 abre o número E FICA NO LOG", async () => {
    const res = await bater("?telefoneCompleto=1", { "x-raiox-comercial-secret": SEGREDO });
    const json = (await res.json()) as { data: { amostra: Array<{ telefone: string }> } };
    expect(json.data.amostra[0]!.telefone).toBe("+5511987654321");
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("TELEFONE COMPLETO"),
      expect.any(Object),
    );
  });
});
