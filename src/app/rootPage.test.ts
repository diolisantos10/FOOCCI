/**
 * A raiz é o SITE COMERCIAL — inclusive para quem está logado.
 *
 * Este teste reproduz o defeito relatado pelo CEO em 23/08/2026: com sessão de
 * administrador aberta no navegador, digitar `foocci.com.br` levava ao painel em
 * vez da vitrine. Rodando contra o código antigo (`redirect(authed ? "/dashboard"
 * : "/site")`) o primeiro caso REPROVA, porque o destino era `/dashboard`.
 *
 * O que ele trava: o destino da raiz não pode depender de haver sessão.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const redirect = vi.fn((destino: string) => {
  // `redirect()` lança por construção no App Router; imitamos isso para que o
  // teste também prove que nada roda depois dele.
  const erro = new Error(`NEXT_REDIRECT:${destino}`);
  throw erro;
});

vi.mock("next/navigation", () => ({ redirect }));

// A sessão é mockável para provarmos que ela NÃO muda o destino. Se um dia
// alguém reintroduzir a leitura de sessão na raiz, este mock é o que permite o
// caso "administrador logado" continuar significando alguma coisa.
const getServerSession = vi.fn();
vi.mock("next-auth", () => ({ getServerSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

async function destinoDaRaiz(): Promise<string> {
  const { default: RootPage } = await import("./page");
  try {
    await RootPage();
  } catch (e) {
    const m = /^NEXT_REDIRECT:(.*)$/.exec((e as Error).message);
    if (m) return m[1];
    throw e;
  }
  throw new Error("A raiz não redirecionou para lugar nenhum.");
}

describe("raiz do domínio (foocci.com.br)", () => {
  beforeEach(() => {
    redirect.mockClear();
    getServerSession.mockReset();
  });

  it("com sessão de administrador aberta, mostra o site comercial — não o painel", async () => {
    getServerSession.mockResolvedValue({ user: { id: "u1", role: "ADMIN" } });
    expect(await destinoDaRaiz()).toBe("/site");
  });

  it("para o visitante anônimo, também mostra o site comercial", async () => {
    getServerSession.mockResolvedValue(null);
    expect(await destinoDaRaiz()).toBe("/site");
  });

  it("nunca manda ninguém para o painel a partir da raiz", async () => {
    getServerSession.mockResolvedValue({ user: { id: "u1", role: "OWNER" } });
    await destinoDaRaiz();
    expect(redirect).not.toHaveBeenCalledWith("/dashboard");
  });
});
