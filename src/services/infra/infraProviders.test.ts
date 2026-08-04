/**
 * O teste "quem sou eu" do Railway.
 *
 * A distinção que este arquivo protege é a que decide se um token entra no cofre:
 *   • Railway RESPONDEU recusando  → "invalid" → não guarda.
 *   • `fetch` estourou (rede/DNS)  → "unknown" → guarda, mas a tela diz que não testou.
 *
 * Tratar as duas como a mesma coisa quebraria de um dos dois lados: ou o CEO fica sem
 * salvar porque o wifi caiu, ou lixo entra no cofre em silêncio. Guardrail 1: o silêncio
 * da rede não é informação.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { INFRA_SERVICES, findService, sanitize, SLUG_RE } from "./infraProviders";

const railway = INFRA_SERVICES.find((s) => s.slug === "railway")!;
const TOKEN = "railway-token-super-secreto-9999";

const originalFetch = globalThis.fetch;

function jsonResponse(body: unknown, okStatus = true) {
  return {
    ok: okStatus,
    status: okStatus ? 200 : 401,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

beforeEach(() => vi.restoreAllMocks());
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("validação do Railway", () => {
  it("token de conta reconhecido → valid, com quem é a conta", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      jsonResponse({ data: { me: { id: "u1", email: "dioli@x.com" } } }),
    ) as unknown as typeof fetch;

    const r = await railway.validate!(TOKEN);

    expect(r.status).toBe("valid");
    expect(r.detail).toContain("dioli@x.com");
    expect(r.detail).not.toContain(TOKEN);
  });

  it("token de projeto reconhecido → valid (a segunda tentativa)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ errors: [{ message: "Not Authorized" }] }))
      .mockResolvedValueOnce(jsonResponse({ data: { projectToken: { projectId: "p-42" } } }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const r = await railway.validate!(TOKEN);

    expect(r.status).toBe("valid");
    expect(r.detail).toContain("p-42");
  });

  it("Railway respondeu e não reconheceu nas duas formas → invalid", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ errors: [{ message: "Not Authorized" }] }, false)) as unknown as typeof fetch;

    const r = await railway.validate!(TOKEN);

    expect(r.status).toBe("invalid");
    expect(r.detail).not.toContain(TOKEN);
  });

  it("rede caiu → unknown, NUNCA invalid — e a mensagem não vaza o token", async () => {
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new Error(`getaddrinfo ENOTFOUND (tentando ${TOKEN})`)) as unknown as typeof fetch;

    const r = await railway.validate!(TOKEN);

    expect(r.status).toBe("unknown");
    expect(r.detail).not.toContain(TOKEN);
    expect(r.detail).toContain("[token omitido]");
  });
});

describe("higiene", () => {
  it("sanitize remove o token e prefixos longos dele", () => {
    expect(sanitize(`erro com ${TOKEN} no meio`, TOKEN)).not.toContain(TOKEN);
    expect(sanitize(`eco parcial: ${TOKEN.slice(0, 12)}…`, TOKEN)).toContain("[token omitido]");
  });

  it("o slug de serviço avulso não aceita espaço, maiúscula nem caminho", () => {
    expect(SLUG_RE.test("cloudflare")).toBe(true);
    expect(SLUG_RE.test("meu-servico2")).toBe(true);
    expect(SLUG_RE.test("Rail Way")).toBe(false);
    expect(SLUG_RE.test("../etc")).toBe(false);
    expect(SLUG_RE.test("a")).toBe(false);
  });

  it("o catálogo explica cada serviço em linguagem de gente", () => {
    for (const s of INFRA_SERVICES) {
      expect(s.whatItIs.length).toBeGreaterThan(20);
      expect(s.whereToGet.length).toBeGreaterThan(20);
      expect(s.blastRadius.length).toBeGreaterThan(20);
    }
    expect(findService("railway")).toBeDefined();
    expect(findService("inexistente")).toBeUndefined();
  });
});
