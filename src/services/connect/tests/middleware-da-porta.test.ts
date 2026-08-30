/**
 * ⚠️ A LINHA DO MIDDLEWARE — e a prova de que, sem ela, a porta não responde.
 *
 * Esta é a armadilha que mata a porta em silêncio. O `src/middleware.ts` do
 * Foocci derruba no NextAuth **toda** rota que não esteja em `PUBLIC_PATHS`.
 * A Control Room é máquina: não tem cookie de lojista, não vai ter, e nunca vai
 * conseguir um. Sem uma linha com o caminho EXATO, o handler da porta **nunca
 * executa**.
 *
 * E o jeito como ele não executa é o que faz esta armadilha ser cruel: para um
 * caminho `/api/`, o middleware responde o 401 genérico dele —
 * `{"success":false,"error":"Unauthorized"}`. É um 401 que PARECE a recusa da
 * porta. Quem estivesse depurando concluiria "o segredo está errado" e passaria
 * o dia trocando cabeçalho, quando o problema é que nenhuma linha da porta
 * chegou a rodar.
 *
 * As duas metades, então:
 *   • COM a linha: o middleware deixa passar, e não chega a consultar o token;
 *   • SEM a linha (medido num caminho vizinho que não tem uma): 401 genérico,
 *     token consultado, handler morto — e a resposta é OUTRA, completamente
 *     diferente da que a porta daria.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";

const getToken = vi.hoisted(() => vi.fn(async () => null));
vi.mock("next-auth/jwt", () => ({ getToken }));

// O banco de mentira só existe para a rota poder ser importada aqui.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    agentSimulationRun: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(async () => []) },
    agentSimulationScenario: { create: vi.fn() },
    agentSimulationOpportunity: { createMany: vi.fn() },
  },
}));

import { middleware } from "@/middleware";
import { POST } from "@/app/api/connect/despacho/route";
import { CABECALHO_DO_SEGREDO } from "@/services/connect/porta";

/** O caminho da porta, escrito por extenso — é ele que precisa bater. */
const CAMINHO_DA_PORTA = "/api/connect/despacho";
const CAMINHO_DO_CADASTRO = "/api/connect/cadastro";
/** ⭐ O caminho de VOLTA — por onde a resposta do gerente entra na conversa. */
const CAMINHO_DO_RETORNO = "/api/connect/retorno";

/**
 * ⭐ O caminho de controle: um vizinho do mesmo prefixo que NÃO tem linha no
 * middleware. Ele é a medição do "sem a linha" — não uma suposição sobre o que
 * aconteceria, mas o que acontece de verdade com um caminho sem a sua linha.
 */
const CAMINHO_SEM_LINHA = "/api/connect/despacho-sem-linha";

function chamar(caminho: string): NextRequest {
  return new NextRequest(`http://localhost:3000${caminho}`, {
    method: "POST",
    headers: { host: "localhost:3000", "content-type": "application/json" },
    body: "{}",
  });
}

beforeEach(() => {
  getToken.mockClear();
  vi.stubEnv("NEXTAUTH_SECRET", "qualquer-coisa-para-o-getToken");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("⚠️ a linha do middleware, sem a qual nada funciona", () => {
  it("a linha existe, com o caminho EXATO, dentro de PUBLIC_PATHS", () => {
    const src = readFileSync(join(process.cwd(), "src/middleware.ts"), "utf8");
    const bloco = src.slice(src.indexOf("PUBLIC_PATHS"), src.indexOf("function isPublicPath"));
    expect(bloco).toContain("/^\\/api\\/connect\\/despacho$/");
    expect(bloco).toContain("/^\\/api\\/connect\\/cadastro$/");
    // ⭐ Sem esta, a resposta do gerente NUNCA entra na conversa do cliente: o
    // núcleo recebe o 401 genérico do middleware, lê como "segredo errado", e o
    // lead espera para sempre — o defeito de quatro dias, de volta.
    expect(bloco).toContain("/^\\/api\\/connect\\/retorno$/");
  });

  it("⭐ COM a linha: o middleware deixa passar, e nem consulta o token", async () => {
    for (const caminho of [CAMINHO_DA_PORTA, CAMINHO_DO_CADASTRO, CAMINHO_DO_RETORNO]) {
      getToken.mockClear();
      const r = await middleware(chamar(caminho));
      expect(r.status, caminho).toBe(200);
      // A prova de que passou pela lista pública, e não por sorte: o NextAuth
      // nem chegou a ser consultado.
      expect(getToken, caminho).not.toHaveBeenCalled();
    }
  });

  it("⭐ SEM a linha: 401 genérico do NextAuth, e o handler da porta nunca roda", async () => {
    const r = await middleware(chamar(CAMINHO_SEM_LINHA));

    expect(r.status).toBe(401);
    expect(getToken).toHaveBeenCalled();

    const corpo = await r.json();
    // Repare no envelope: é o do middleware, não o desta porta. A porta nunca
    // responde `{success:false}` — ela responde `{estado:"recusado"|…}`.
    expect(corpo).toEqual({ success: false, error: "Unauthorized" });
    expect(corpo.estado).toBeUndefined();
  });

  it("⭐ e a resposta do middleware é OUTRA, não a da porta: eis o que se perde", async () => {
    // A porta, com o segredo NÃO configurado, responde 503 com um motivo que diz
    // ao operador exatamente o que falta.
    vi.stubEnv("DIOLI_CONNECT_SECRET", "");
    const daPorta = await POST(chamar(CAMINHO_DA_PORTA));
    const corpoDaPorta = await daPorta.json();

    expect(daPorta.status).toBe(503);
    expect(corpoDaPorta.estado).toBe("recusado");
    expect(corpoDaPorta.motivo).toMatch(/DIOLI_CONNECT_SECRET não está configurado/i);

    // Sem a linha, o chamador receberia isto aqui, no lugar daquilo:
    const doMiddleware = await middleware(chamar(CAMINHO_SEM_LINHA));
    expect(doMiddleware.status).toBe(401);
    expect(await doMiddleware.json()).toEqual({ success: false, error: "Unauthorized" });

    // 503 x 401, e motivos que não têm nada a ver um com o outro. Quem
    // depurasse a partir do 401 procuraria o cabeçalho errado a manhã inteira.
    expect(daPorta.status).not.toBe(doMiddleware.status);
  });

  it("o caminho é EXATO: irmão do mesmo prefixo continua exigindo sessão", async () => {
    for (const vizinho of ["/api/connect", "/api/connect/despacho/extra", "/api/connect/outra-coisa"]) {
      getToken.mockClear();
      const r = await middleware(chamar(vizinho));
      expect(r.status, vizinho).toBe(401);
      expect(getToken, vizinho).toHaveBeenCalled();
    }
  });
});
