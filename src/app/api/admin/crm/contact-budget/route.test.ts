/**
 * /api/admin/crm/contact-budget — a porta do administrador para o teto de gasto.
 *
 * O CEO autorizou a porta porque não opera o produto por tela. Uma porta
 * administrativa que escreve na configuração de um cliente é exatamente o tipo
 * de coisa que precisa de mais teste na RECUSA do que no caminho feliz — o
 * caminho feliz falha barulhento, a recusa que não acontece falha calada.
 *
 * O que estes testes seguram:
 *   (a) sem segredo / com segredo errado → 401, e o banco nem é consultado;
 *   (b) sem restaurante válido → recusa. Não existe restaurante padrão;
 *   (c) campo fora da lista branca → 400 NOMEANDO o campo. Nunca ignorado em
 *       silêncio: quem tentou desligar o horário de silêncio precisa ouvir "não",
 *       não um 200 que parece "sim";
 *   (d) valor inválido (negativo, quebrado, texto, acima do máximo) → 422, e
 *       nada é gravado;
 *   (e) sucesso: grava SÓ a chave do teto, preservando o resto do JSON byte a
 *       byte, e deixa trilha de auditoria com valor antes e depois.
 *
 * Nenhuma mensagem é enviada por este caminho. Nenhum banco real é tocado.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const checkAdminRequest = vi.fn();
vi.mock("@/lib/admin-auth", () => ({
  checkAdminRequest: (...a: unknown[]) => checkAdminRequest(...a),
}));

const db = vi.hoisted(() => ({
  restaurant:           { findUnique: vi.fn() },
  restaurantCRMProfile: { findUnique: vi.fn(), upsert: vi.fn() },
  campaignExecution:    { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

const auditLog = vi.fn();
vi.mock("@/lib/audit", () => ({ auditLog: (...a: unknown[]) => auditLog(...a) }));

import { GET, PATCH } from "./route";

const REST = { id: "rest-1", slug: "sushi-cazza" };

/** Configuração guardada com regras anti-banimento personalizadas — elas NÃO podem se mexer. */
const GUARDADO = {
  contactBudgetTotal:    200,
  manualOverride:        true,
  dailyGlobalCap:        777,
  quietHoursStart:       "22:30",
  customerCooldownHours: 12,
  campoDesconhecidoDoFuturo: "preservar",
};

function req(body?: unknown, url = "https://foocci.com.br/api/admin/crm/contact-budget") {
  return {
    json:    async () => { if (body === undefined) throw new Error("no body"); return body; },
    nextUrl: new URL(url),
    headers: { get: () => null },
    cookies: { get: () => undefined },
  } as unknown as Parameters<typeof PATCH>[0];
}

/** O que foi efetivamente gravado no JSON de configuração. */
function gravado(): Record<string, unknown> | undefined {
  const call = db.restaurantCRMProfile.upsert.mock.calls[0]?.[0] as
    | { update?: { whatsAppSafetyConfig?: Record<string, unknown> } }
    | undefined;
  return call?.update?.whatsAppSafetyConfig;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ADMIN_SECRET = "irrelevante-para-o-teste";
  checkAdminRequest.mockReturnValue(true);
  db.restaurant.findUnique.mockResolvedValue(REST);
  db.restaurantCRMProfile.findUnique.mockResolvedValue({ whatsAppSafetyConfig: { ...GUARDADO } });
  db.restaurantCRMProfile.upsert.mockResolvedValue({});
  db.campaignExecution.findMany.mockResolvedValue(
    Array.from({ length: 2115 }, (_, i) => ({ customerId: `c${i}` })),
  );
  vi.spyOn(console, "error").mockImplementation(() => {});
});

// ── (a) Autenticação ────────────────────────────────────────────────────────

describe("sem admin, a porta não abre", () => {
  it("segredo errado → 401 e o banco nem é consultado", async () => {
    checkAdminRequest.mockReturnValue(false);

    const res = await PATCH(req({ slug: "sushi-cazza", contactBudgetTotal: 3000 }));

    expect(res.status).toBe(401);
    expect(db.restaurant.findUnique).not.toHaveBeenCalled();
    expect(db.restaurantCRMProfile.upsert).not.toHaveBeenCalled();
  });

  it("sem ADMIN_SECRET configurado, a rota fica desabilitada (403)", async () => {
    delete process.env.ADMIN_SECRET;

    const res = await PATCH(req({ slug: "sushi-cazza", contactBudgetTotal: 3000 }));

    expect(res.status).toBe(403);
    expect(db.restaurantCRMProfile.upsert).not.toHaveBeenCalled();
  });

  it("a recusa por segredo deixa trilha — tentativa sem rastro é cegueira", async () => {
    checkAdminRequest.mockReturnValue(false);
    await PATCH(req({ slug: "sushi-cazza", contactBudgetTotal: 3000 }));
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "crm.contact_budget_update_rejected" }),
    );
  });
});

// ── (b) Restaurante sempre explícito ────────────────────────────────────────

describe("não existe restaurante padrão", () => {
  it("sem restaurantId nem slug → 400, nada gravado", async () => {
    const res = await PATCH(req({ contactBudgetTotal: 3000 }));

    expect(res.status).toBe(400);
    expect(db.restaurantCRMProfile.upsert).not.toHaveBeenCalled();
  });

  it("slug que não existe → 400, nada gravado", async () => {
    db.restaurant.findUnique.mockResolvedValue(null);

    const res = await PATCH(req({ slug: "loja-que-nao-existe", contactBudgetTotal: 3000 }));

    expect(res.status).toBe(400);
    expect(db.restaurantCRMProfile.upsert).not.toHaveBeenCalled();
  });
});

// ── (c) Lista branca ────────────────────────────────────────────────────────

describe("campo fora da lista branca é RECUSADO, não ignorado", () => {
  it("tentar desligar o horário de silêncio → 400 nomeando o campo", async () => {
    const res  = await PATCH(req({
      slug: "sushi-cazza",
      contactBudgetTotal: 3000,
      quietHoursEnabled: false, // ← a tentativa perigosa
    }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.campos_recusados).toContain("quietHoursEnabled");
    // E, principalmente: NEM O TETO foi gravado. A requisição inteira é recusada,
    // senão o chamador levaria metade do que pediu sem saber qual metade.
    expect(db.restaurantCRMProfile.upsert).not.toHaveBeenCalled();
  });

  it.each([
    "dailyGlobalCap",
    "customerCooldownHours",
    "maxPerWeekPerCustomer",
    "randomDelayMinSec",
    "sendOnWeekends",
    "manualOverride",
  ])("regra anti-banimento '%s' não passa por esta porta", async (campo) => {
    const res  = await PATCH(req({ slug: "sushi-cazza", contactBudgetTotal: 3000, [campo]: 1 }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.campos_recusados).toContain(campo);
    expect(db.restaurantCRMProfile.upsert).not.toHaveBeenCalled();
  });
});

// ── (d) Valor ───────────────────────────────────────────────────────────────

describe("valor inválido é recusado, nunca 'consertado'", () => {
  it.each([
    ["negativo",       -5],
    ["quebrado",       3000.7],
    ["acima do máximo", 1_000_001],
    ["texto",          "3000"],
    ["nulo",           null],
    ["NaN",            Number.NaN],
  ])("%s → 422 e nada gravado", async (_nome, valor) => {
    const res = await PATCH(req({ slug: "sushi-cazza", contactBudgetTotal: valor }));

    expect(res.status).toBe(422);
    expect(db.restaurantCRMProfile.upsert).not.toHaveBeenCalled();
  });

  it("sem o campo → 400", async () => {
    const res = await PATCH(req({ slug: "sushi-cazza" }));
    expect(res.status).toBe(400);
    expect(db.restaurantCRMProfile.upsert).not.toHaveBeenCalled();
  });

  it("0 é VÁLIDO — 'sem limite' é escolha do dono, não erro de digitação", async () => {
    const res = await PATCH(req({ slug: "sushi-cazza", contactBudgetTotal: 0 }));

    expect(res.status).toBe(200);
    expect(gravado()?.contactBudgetTotal).toBe(0);
  });
});

// ── (e) Sucesso ─────────────────────────────────────────────────────────────

describe("caminho feliz — muda o teto e SÓ o teto", () => {
  it("grava o valor novo", async () => {
    const res  = await PATCH(req({ slug: "sushi-cazza", contactBudgetTotal: 3000 }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(gravado()?.contactBudgetTotal).toBe(3000);
    expect(body.alteracao).toEqual({ campo: "contactBudgetTotal", antes: 200, depois: 3000 });
  });

  it("⭐ o resto do JSON fica INTACTO — inclusive chave que este código não conhece", async () => {
    await PATCH(req({ slug: "sushi-cazza", contactBudgetTotal: 3000 }));

    const escrito = gravado()!;
    expect(escrito.manualOverride).toBe(true);
    expect(escrito.dailyGlobalCap).toBe(777);          // não virou o padrão 900
    expect(escrito.quietHoursStart).toBe("22:30");     // não virou "21:00"
    expect(escrito.customerCooldownHours).toBe(12);    // não virou 24
    expect(escrito.campoDesconhecidoDoFuturo).toBe("preservar");
    // Nada além do teto mudou: a diferença entre os dois objetos é UMA chave.
    const diferentes = Object.keys({ ...GUARDADO, ...escrito }).filter(
      (k) => (GUARDADO as Record<string, unknown>)[k] !== escrito[k],
    );
    expect(diferentes).toEqual(["contactBudgetTotal"]);
  });

  it("devolve o saldo real: teto, pessoas já abordadas e vagas", async () => {
    const body = await (await PATCH(req({ slug: "sushi-cazza", contactBudgetTotal: 3000 }))).json();

    expect(body.contactBudgetTotal).toBe(3000);
    expect(body.pessoasJaAbordadas).toBe(2115);
    expect(body.vagasRestantes).toBe(885);
    expect(body.ligado).toBe(true);
  });

  it("deixa trilha de auditoria com quem, onde, antes e depois", async () => {
    await PATCH(req({ slug: "sushi-cazza", contactBudgetTotal: 3000 }));

    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({
      action:       "crm.contact_budget_update",
      restaurantId: "rest-1",
      targetId:     "sushi-cazza",
      meta: expect.objectContaining({ campo: "contactBudgetTotal", antes: 200, depois: 3000 }),
    }));
  });

  it("restaurante sem perfil de CRM ainda não criado: cria com o teto pedido", async () => {
    db.restaurantCRMProfile.findUnique.mockResolvedValue(null);

    const res = await PATCH(req({ slug: "sushi-cazza", contactBudgetTotal: 3000 }));

    expect(res.status).toBe(200);
    const call = db.restaurantCRMProfile.upsert.mock.calls[0]?.[0] as
      { create?: { whatsAppSafetyConfig?: Record<string, unknown> } };
    expect(call.create?.whatsAppSafetyConfig?.contactBudgetTotal).toBe(3000);
  });
});

// ── GET: a releitura, que é como se confirma que gravou ─────────────────────

describe("GET — a leitura independente do que ficou gravado", () => {
  it("devolve teto, abordadas e vagas do restaurante pedido", async () => {
    const res  = await GET(req(undefined, "https://foocci.com.br/api/admin/crm/contact-budget?slug=sushi-cazza"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.contactBudgetTotal).toBe(200);
    expect(body.pessoasJaAbordadas).toBe(2115);
    expect(body.vagasRestantes).toBe(0);
  });

  it("sem restaurante → 400, e sem admin → 401", async () => {
    expect((await GET(req(undefined, "https://foocci.com.br/api/admin/crm/contact-budget"))).status).toBe(400);
    checkAdminRequest.mockReturnValue(false);
    expect((await GET(req(undefined, "https://foocci.com.br/api/admin/crm/contact-budget?slug=sushi-cazza"))).status).toBe(401);
  });
});
