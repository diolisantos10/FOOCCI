/**
 * LGPD, em forma de teste.
 *
 * Cada linha desta base é um dono de restaurante identificável: nome, WhatsApp,
 * cidade, negócio. A base legal existe (ele pediu contato) — mas ela autoriza a
 * FOOCCI a falar com ele, não autoriza a internet a ler a lista.
 *
 * O gate estrutural `src/security/routeGuards.test.ts` já garante que toda rota
 * sob /api/admin/** MENCIONA uma guarda. Este teste vai além e prova que a
 * guarda REALMENTE BARRA: chama os handlers de verdade sem credencial e exige
 * 401/403 — e, o mais importante, exige que o serviço nem tenha sido consultado.
 * Mencionar guarda e chamar o banco antes dela seria passar no gate e vazar
 * mesmo assim.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";

const servico = vi.hoisted(() => ({
  listarContatos: vi.fn(),
  getDossie: vi.fn(),
  moverEtapa: vi.fn(),
  registrarInteracao: vi.fn(),
  excluirContato: vi.fn(),
}));
const performance = vi.hoisted(() => ({ getPerformance: vi.fn() }));

vi.mock("@/services/foocci-crm/FoocciCrmService", () => servico);
vi.mock("@/services/foocci-crm/FoocciCrmPerformanceService", () => performance);

import { GET as getPerformanceRoute } from "@/app/api/admin/foocci-crm/performance/route";
import { GET as getContatos } from "@/app/api/admin/foocci-crm/contatos/route";
import { GET as getContato, DELETE as deleteContato } from "@/app/api/admin/foocci-crm/contatos/[id]/route";
import { PATCH as patchEtapa } from "@/app/api/admin/foocci-crm/contatos/[id]/etapa/route";
import { POST as postInteracao } from "@/app/api/admin/foocci-crm/contatos/[id]/interacao/route";

const SEGREDO = "segredo-de-admin-para-teste";
const params = { params: { id: "l1" } };

function req(url: string, init?: RequestInit & { admin?: boolean }): NextRequest {
  const headers = new Headers(init?.headers);
  if (init?.admin) headers.set("x-admin-secret", SEGREDO);
  if (init?.body) headers.set("content-type", "application/json");
  return new NextRequest(new Request(`https://foocci.com.br${url}`, { ...init, headers }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ADMIN_SECRET", SEGREDO);
  servico.listarContatos.mockResolvedValue([]);
  servico.getDossie.mockResolvedValue({ id: "l1", nome: "Ana" });
  servico.moverEtapa.mockResolvedValue({ ok: true, de: "NOVO", para: "CONTATADO", em: new Date() });
  servico.registrarInteracao.mockResolvedValue({ ok: true, em: new Date() });
  servico.excluirContato.mockResolvedValue({ ok: true });
  performance.getPerformance.mockResolvedValue({ resumo: { chegaram: 0 } });
});

afterEach(() => { vi.unstubAllEnvs(); });

/** Toda rota do CRM da Foocci, com o jeito de chamá-la sem credencial. */
const ROTAS: Array<{
  nome: string;
  chamar: (admin: boolean) => Promise<Response>;
  espiao: () => ReturnType<typeof vi.fn>;
}> = [
  {
    nome: "GET /performance",
    chamar: (admin) => getPerformanceRoute(req("/api/admin/foocci-crm/performance?period=30d", { admin })),
    espiao: () => performance.getPerformance,
  },
  {
    nome: "GET /contatos",
    chamar: (admin) => getContatos(req("/api/admin/foocci-crm/contatos", { admin })),
    espiao: () => servico.listarContatos,
  },
  {
    nome: "GET /contatos/[id]",
    chamar: (admin) => getContato(req("/api/admin/foocci-crm/contatos/l1", { admin }), params),
    espiao: () => servico.getDossie,
  },
  {
    nome: "DELETE /contatos/[id]",
    chamar: (admin) => deleteContato(req("/api/admin/foocci-crm/contatos/l1", { method: "DELETE", admin }), params),
    espiao: () => servico.excluirContato,
  },
  {
    nome: "PATCH /contatos/[id]/etapa",
    chamar: (admin) => patchEtapa(
      req("/api/admin/foocci-crm/contatos/l1/etapa", {
        method: "PATCH", body: JSON.stringify({ para: "CONTATADO" }), admin,
      }),
      params,
    ),
    espiao: () => servico.moverEtapa,
  },
  {
    nome: "POST /contatos/[id]/interacao",
    chamar: (admin) => postInteracao(
      req("/api/admin/foocci-crm/contatos/l1/interacao", {
        method: "POST", body: JSON.stringify({ tipo: "MENSAGEM_ENVIADA" }), admin,
      }),
      params,
    ),
    espiao: () => servico.registrarInteracao,
  },
];

describe("nenhuma rota do CRM da Foocci abre sem admin", () => {
  for (const rota of ROTAS) {
    it(`${rota.nome} devolve 401 sem credencial`, async () => {
      const res = await rota.chamar(false);
      expect(res.status).toBe(401);
      // Barrado ANTES do serviço: guarda que só carimba depois de ler o banco
      // passaria no gate estrutural e vazaria mesmo assim.
      expect(rota.espiao()).not.toHaveBeenCalled();
    });

    it(`${rota.nome} devolve 403 quando o ADMIN_SECRET nem existe`, async () => {
      vi.stubEnv("ADMIN_SECRET", "");
      const res = await rota.chamar(true);
      expect(res.status).toBe(403);
      expect(rota.espiao()).not.toHaveBeenCalled();
    });

    it(`${rota.nome} passa com credencial de admin`, async () => {
      const res = await rota.chamar(true);
      expect(res.status).toBeLessThan(400);
      expect(rota.espiao()).toHaveBeenCalled();
    });
  }

  it("credencial errada não passa", async () => {
    const headers = new Headers({ "x-admin-secret": "chute" });
    const res = await getContatos(
      new NextRequest(new Request("https://foocci.com.br/api/admin/foocci-crm/contatos", { headers })),
    );
    expect(res.status).toBe(401);
    expect(servico.listarContatos).not.toHaveBeenCalled();
  });
});

describe("a etapa é DADO, não texto livre", () => {
  it("recusa etapa inventada com 400 e não chama o serviço", async () => {
    const res = await patchEtapa(
      req("/api/admin/foocci-crm/contatos/l1/etapa", {
        method: "PATCH", body: JSON.stringify({ para: "quase fechando" }), admin: true,
      }),
      params,
    );
    expect(res.status).toBe(400);
    expect(servico.moverEtapa).not.toHaveBeenCalled();
  });

  it("o autor vem do canal, nunca do corpo do pedido", async () => {
    // Deixar o cliente escolher o autor seria entregar o registro de
    // responsabilidade para quem age.
    await patchEtapa(
      req("/api/admin/foocci-crm/contatos/l1/etapa", {
        method: "PATCH",
        body: JSON.stringify({ para: "FECHADO", actor: "outra-pessoa" }),
        admin: true,
      }),
      params,
    );
    expect(servico.moverEtapa).toHaveBeenCalledWith(
      expect.objectContaining({ actor: "admin", para: "FECHADO" }),
    );
  });

  it("MUDANCA_ETAPA não entra pela rota de interação — ela tem rota própria", async () => {
    const res = await postInteracao(
      req("/api/admin/foocci-crm/contatos/l1/interacao", {
        method: "POST", body: JSON.stringify({ tipo: "MUDANCA_ETAPA" }), admin: true,
      }),
      params,
    );
    expect(res.status).toBe(400);
    expect(servico.registrarInteracao).not.toHaveBeenCalled();
  });
});
