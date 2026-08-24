/**
 * A porta do diário — fail-closed, com segredo próprio.
 *
 * Contra o código antigo a rota nem existia. O que se prova aqui é o que a torna
 * segura: esquecer de configurar o segredo NUNCA abre a porta, e o segredo do
 * admin (que abre o painel inteiro) não serve de chave para este diário.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GET } from "@/app/api/sdr/diario/route";
import { registrarTurno, limparDiario } from "../DiarioDoSdr";

const SEGREDO = "segredo-do-diario-do-sdr-de-teste";
const original = { diario: process.env.SDR_DIARIO_SECRET, admin: process.env.ADMIN_SECRET };

function req(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(new Request("https://foocci.com.br/api/sdr/diario", { headers }));
}

beforeEach(() => {
  limparDiario();
  process.env.SDR_DIARIO_SECRET = SEGREDO;
  process.env.ADMIN_SECRET = "outro-segredo-completamente-diferente";
});
afterEach(() => {
  if (original.diario === undefined) delete process.env.SDR_DIARIO_SECRET;
  else process.env.SDR_DIARIO_SECRET = original.diario;
  if (original.admin === undefined) delete process.env.ADMIN_SECRET;
  else process.env.ADMIN_SECRET = original.admin;
});

describe("fail-closed", () => {
  it("sem segredo configurado a rota NÃO abre — esquecer não libera", async () => {
    delete process.env.SDR_DIARIO_SECRET;
    expect((await GET(req({ "x-sdr-diario-secret": SEGREDO }))).status).toBe(401);
  });

  it("segredo curto demais é tratado como não configurado", async () => {
    process.env.SDR_DIARIO_SECRET = "curto";
    expect((await GET(req({ "x-sdr-diario-secret": "curto" }))).status).toBe(401);
  });

  it("sem cabeçalho, 401", async () => {
    expect((await GET(req())).status).toBe(401);
  });

  it("segredo errado, 401", async () => {
    expect((await GET(req({ "x-sdr-diario-secret": "chute" }))).status).toBe(401);
  });

  it("o segredo do admin não abre o diário", async () => {
    expect((await GET(req({ "x-admin-secret": "outro-segredo-completamente-diferente" }))).status).toBe(401);
  });
});

describe("com o segredo certo", () => {
  it("devolve contagens, cegueiras e os turnos", async () => {
    registrarTurno({
      chave: "foocci-vendas::lead-a7k2m", iaRespondeu: false, motivoSemIA: "timeout",
      entendido: [{ chave: "objetivo", origem: "motor" }],
      perguntasNoAr: 1, seguemSemResposta: 0, travou: false, cobertura: 0.2, podePropor: false,
    });
    const res = await GET(req({ "x-sdr-diario-secret": SEGREDO }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.contagens.turnos).toBe(1);
    expect(body.data.contagens.porMotivo.timeout).toBe(1);
    expect(body.data.cegueiras.length).toBeGreaterThan(3);
  });

  it("a rota é somente leitura — não existe verbo de escrita", async () => {
    const modulo = await import("@/app/api/sdr/diario/route");
    expect(Object.keys(modulo).sort()).toEqual(["GET", "dynamic"]);
  });
});

/**
 * A outra metade da porta: o middleware.
 *
 * Reprova contra o código anterior — `/api/sdr/diario` não estava na lista de
 * caminhos públicos, e o NextAuth devolvia 401 antes de a guarda da rota sequer
 * rodar. Um instrumento de auditoria que só funciona de dentro de um login de
 * lojista não é auditoria.
 */
describe("middleware — a porta de fora", () => {
  const src = readFileSync(join(process.cwd(), "src/middleware.ts"), "utf8");
  const bloco = src.slice(src.indexOf("PUBLIC_PATHS"), src.indexOf("function isPublicPath"));

  it("deixa /api/sdr/diario passar sem sessão — a guarda é a da própria rota", () => {
    expect(bloco).toContain("/^\\/api\\/sdr\\/diario$/");
  });

  it("e NÃO abre o resto do /api/sdr — entrevista e plano seguem exigindo tenant ou admin", () => {
    expect(bloco).not.toContain("/^\\/api\\/sdr(\\/.*)?$/");
    expect(bloco).not.toContain("/^\\/api\\/sdr\\/entrevista$/");
  });
});
