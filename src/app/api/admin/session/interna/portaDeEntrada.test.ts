/**
 * ⛔ O ADMIN ABRE NO ADMIN — o teste que impede a regressão de voltar.
 *
 * ── O DEFEITO QUE ESTE ARQUIVO EXISTE PARA MATAR ────────────────────────────
 *
 * Relato do CEO, 17/09/2026: *"eu não sei o que fizeram, mas quando a gente
 * acessa FOOCCI Admin, ele entra no Foocci comercial."*
 *
 * Causa: `/admin/login` e `/comercial/entrar` chamam a MESMA rota
 * (`POST /api/admin/session/interna`), e desde 10/09/2026 (#232, 5125e40) o
 * destino olhava só o PAPEL — MASTER_CEO e DIRETOR_FOOCCI passaram a receber
 * `/comercial/painel`. Quem abria o Admin era despejado no Comercial. Pela
 * senha da casa era ainda pior: o Comercial recusa `ADMIN_SECRET` por desenho,
 * então o dono entrava no Admin e terminava numa tela de login.
 *
 * ── POR QUE ELE BATE NA ROTA, E NÃO SÓ NA FUNÇÃO ────────────────────────────
 *
 * Porque é a ROTA que responde ao navegador. Uma régua verde sobre
 * `destinoDoAdmin` provaria que a função sabe o caminho, e não que a porta o
 * usa — foi justamente a ligação entre as duas que quebrou. Aqui a chamada é a
 * mesma que o formulário faz, com o mesmo corpo.
 *
 * ⚠️ E nada disto é autorização: `origem` escolhe a tela de abertura. O caso do
 * vendedor (abaixo) é a prova — ele pede "admin" e continua indo para o
 * Comercial.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { InternalRole } from "@prisma/client";

const autenticarInterno = vi.fn();

vi.mock("@/lib/internal-auth", () => ({
  autenticarInterno: (...a: unknown[]) => autenticarInterno(...a),
  criarCookieInterno: () => "foocci-internal-session=x; Path=/",
  cookieInternoDeSaida: () => "foocci-internal-session=; Path=/; Max-Age=0",
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    internalUser: { update: vi.fn().mockResolvedValue({}) },
    internalAuditEvent: { create: vi.fn().mockResolvedValue({}) },
  },
}));

import { POST } from "./route";

function sessaoDe(role: InternalRole) {
  return { userId: "u1", nome: "Fulano", role, departamentos: [], gerencia: [] };
}

async function entrar(role: InternalRole, origem: "admin" | "comercial") {
  autenticarInterno.mockResolvedValue(sessaoDe(role));
  const req = new Request("http://localhost/api/admin/session/interna", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "a@foocci.com", senha: "x", origem }),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await POST(req as any);
  const json = (await res.json()) as { data?: { destino?: string } };
  return json.data?.destino;
}

beforeEach(() => {
  autenticarInterno.mockReset();
});

describe("por onde se entra decide onde se abre", () => {
  it("o CEO entra pelo Admin e ABRE NO ADMIN — nunca no comercial", async () => {
    const destino = await entrar("MASTER_CEO", "admin");
    expect(destino, "o CEO foi despejado no comercial de novo").not.toMatch(/^\/comercial/);
    expect(destino).toBe("/admin/restaurants");
  });

  it("o Diretor entra pelo Admin e abre no Admin", async () => {
    const destino = await entrar("DIRETOR_FOOCCI", "admin");
    expect(destino).not.toMatch(/^\/comercial/);
    expect(destino).toBe("/admin/restaurants");
  });

  it("gerente e auditoria abrem na parte do Admin que alcançam", async () => {
    expect(await entrar("GERENTE_DEPARTAMENTO", "admin")).toBe("/admin/departamentos");
    expect(await entrar("AUDITOR_QA", "admin")).toBe("/admin/departamentos");
  });

  it("o vendedor pedindo o Admin continua indo para o comercial — a tela dele", async () => {
    // Ele não alcança o Admin (critério 6 do CEO). Mandá-lo para uma sala em
    // que nenhum menu abre ensina que o sistema está quebrado.
    expect(await entrar("AGENTE_HUMANO", "admin")).toBe("/comercial/conversas");
  });

  it("quem não alcança nem um nem outro vê a tela de entrar", async () => {
    // `AGENTE_IA` não faz login — `autenticarInterno` o recusa. Se um dia uma
    // sessão dessas existir, ela não ganha sala nenhuma por engano.
    expect(await entrar("AGENTE_IA", "admin")).toBe("/admin/login");
  });

  it("⚠️ A ÁREA COMERCIAL NÃO MUDOU — todos os destinos dela seguem iguais", async () => {
    expect(await entrar("MASTER_CEO", "comercial")).toBe("/comercial/painel");
    expect(await entrar("DIRETOR_FOOCCI", "comercial")).toBe("/comercial/painel");
    expect(await entrar("GERENTE_DEPARTAMENTO", "comercial")).toBe("/comercial/painel");
    expect(await entrar("AUDITOR_QA", "comercial")).toBe("/comercial/painel");
    expect(await entrar("AGENTE_HUMANO", "comercial")).toBe("/comercial/conversas");
  });

  it("sem origem declarada vale o comercial, como sempre valeu", async () => {
    autenticarInterno.mockResolvedValue(sessaoDe("MASTER_CEO"));
    const req = new Request("http://localhost/api/admin/session/interna", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "a@foocci.com", senha: "x" }),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(req as any);
    const json = (await res.json()) as { data?: { destino?: string } };
    expect(json.data?.destino).toBe("/comercial/painel");
  });
});

/**
 * As duas telas de login são clientes (`.tsx`) e não sobem em teste de rota.
 * O que se guarda aqui é a LIGAÇÃO — sem a palavra `origem` no corpo, o
 * servidor volta a mandar o admin para o comercial sem que nada acima falhe.
 */
describe("as portas dizem de onde falam", () => {
  const raiz = path.join(__dirname, "..", "..", "..", "..");
  const semComentarios = (f: string) =>
    readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("a tela de login do Admin se declara como Admin", () => {
    const fonte = semComentarios(path.join(raiz, "admin", "login", "page.tsx"));
    expect(fonte, "o /admin/login parou de dizer a origem — o destino volta a ser o comercial")
      .toMatch(/origem:\s*"admin"/);
  });

  it("a senha da casa abre o Admin, e não uma sala que ela não abre", () => {
    const fonte = semComentarios(path.join(raiz, "admin", "login", "page.tsx"));
    expect(fonte, "a entrada por ADMIN_SECRET voltou a apontar para /comercial")
      .not.toMatch(/router\.replace\(\s*ROTAS\./);
    expect(fonte).toMatch(/router\.replace\(ENTRADA_DO_ADMIN\)/);
  });

  it("a tela da área comercial se declara como comercial", () => {
    const fonte = semComentarios(path.join(raiz, "comercial", "entrar", "EntrarClient.tsx"));
    expect(fonte).toMatch(/origem:\s*"comercial"/);
  });
});
