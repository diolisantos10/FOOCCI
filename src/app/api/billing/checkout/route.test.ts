/**
 * (a) O FLUXO COMPLETO CRIA ASSINATURA + ACEITE + PREAPPROVAL UMA ÚNICA VEZ,
 *     MESMO COM DUPLO CLIQUE.
 *
 * O incidente que este arquivo existe para impedir: a dona do restaurante clica
 * "Aceitar e pagar", a página demora, ela clica de novo — e sai com DUAS
 * recorrências no cartão. A segunda cobra todo mês e nada no nosso lado aponta
 * para ela.
 *
 * Também prova que o preço é decidido pelo SERVIDOR: mandar centavos no corpo do
 * request não muda o que é cobrado.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  planSubscription: { findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
  restaurant: { findUnique: vi.fn() },
  user: { findFirst: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

const mp = vi.hoisted(() => ({ createPreapproval: vi.fn(), cancelPreapproval: vi.fn(), updatePreapprovalAmount: vi.fn() }));
vi.mock("@/services/billing/MercadoPagoPlatformBilling", () => ({
  MercadoPagoPlatformBilling: mp,
  isPlatformBillingConfigured: () => true,
}));

// bcrypt real custa ~200ms por chamada e não é o que está sob teste.
vi.mock("bcryptjs", () => ({ hash: vi.fn().mockResolvedValue("$2a$12$hashfake") }));

import { POST } from "./route";

const FORM = {
  plano: "crescimento",
  ciclo: "MENSAL",
  nome: "Ana Souza",
  email: "ana@pizzaria.com",
  whatsapp: "(11) 99999-9999",
  restaurante: "Pizzaria do Zé",
  slug: "pizzaria-do-ze",
  senha: "segredo12345",
  aceiteTermos: true,
  idempotencyKey: "chave-do-formulario-1",
};

function req(body: Record<string, unknown> = {}) {
  return new Request("https://foocci.com.br/api/billing/checkout", {
    method: "POST",
    // IP distinto por chamada de teste seria o certo para não bater no rate
    // limit entre casos — este header é fixo de propósito em UM caso só.
    headers: { "content-type": "application/json", "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250) + 1}` },
    body: JSON.stringify({ ...FORM, ...body }),
  });
}

/** A assinatura como o banco a devolveria após o create. */
const SUB_NOVA = {
  id: "sub_1",
  acceptToken: "tok_1234567890abcdef",
  status: "AGUARDANDO_ACEITE",
  customerName: "Ana Souza",
  customerEmail: "ana@pizzaria.com",
  customerWhatsapp: "11999999999",
  plan: "GROWTH",
  cycle: "MENSAL",
  priceCents: 42900,
  firstChargeCents: 21450,
  termsAcceptedAt: null,
  mpPreapprovalId: null,
  mpInitPoint: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  db.restaurant.findUnique.mockResolvedValue(null); // slug livre
  db.user.findFirst.mockResolvedValue(null); // e-mail livre
  db.planSubscription.findUnique.mockResolvedValue(null);
  db.planSubscription.create.mockResolvedValue(SUB_NOVA);
  db.planSubscription.update.mockResolvedValue({ ...SUB_NOVA, termsAcceptedAt: new Date() });
  db.planSubscription.updateMany.mockResolvedValue({ count: 1 });
  mp.createPreapproval.mockResolvedValue({ id: "pre_1", initPoint: "https://mp/pay/1" });
});

describe("POST /api/billing/checkout — o caminho completo", () => {
  it("cria assinatura, registra o aceite ANTES do pagamento e devolve o link", async () => {
    // findUnique: (1) idempotência → nada; (2) dentro do finish → a sub; (3) dentro do ensurePreapproval → a sub.
    db.planSubscription.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValue(SUB_NOVA);

    const res = await POST(req());
    const body = await res.json();

    expect(body).toMatchObject({ ok: true, paymentUrl: "https://mp/pay/1" });

    // 1. UMA assinatura, com o preço decidido pelo servidor.
    expect(db.planSubscription.create).toHaveBeenCalledOnce();
    const data = db.planSubscription.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      plan: "GROWTH",
      cycle: "MENSAL",
      priceCents: 42900, // valor cheio da renovação
      firstChargeCents: 21450, // 50% do primeiro mês
      signupSlug: "pizzaria-do-ze",
      signupIdempotencyKey: "chave-do-formulario-1",
    });
    // A senha só existe como hash.
    expect(data.signupOwnerPasswordHash).toBe("$2a$12$hashfake");
    expect(JSON.stringify(data)).not.toContain("segredo12345");

    // 2. O ACEITE aconteceu, com trilha (versão + data + IP + nome).
    const aceite = db.planSubscription.update.mock.calls[0][0].data;
    expect(aceite).toMatchObject({ status: "ACEITO", termsAcceptedBy: "Ana Souza" });
    expect(aceite.termsAcceptedAt).toBeInstanceOf(Date);
    expect(aceite.termsAcceptedIp).toBeTruthy();

    // 3. UMA recorrência no Mercado Pago.
    expect(mp.createPreapproval).toHaveBeenCalledOnce();
  });

  it("DUPLO CLIQUE: a segunda chamada com a mesma chave não cria nada de novo", async () => {
    // A segunda chamada acha a assinatura pela chave de idempotência.
    db.planSubscription.findUnique.mockResolvedValue({
      ...SUB_NOVA,
      termsAcceptedAt: new Date(),
      mpPreapprovalId: "pre_1",
      mpInitPoint: "https://mp/pay/1",
    });

    const res = await POST(req());
    const body = await res.json();

    // Mesmo link de pagamento, marcado como reaproveitado.
    expect(body).toMatchObject({ ok: true, paymentUrl: "https://mp/pay/1", reusedPayment: true });
    // NADA foi criado de novo — nem assinatura, nem recorrência, nem outro aceite.
    expect(db.planSubscription.create).not.toHaveBeenCalled();
    expect(mp.createPreapproval).not.toHaveBeenCalled();
    expect(db.planSubscription.update).not.toHaveBeenCalled();
  });

  it("CORRIDA de dois POSTs simultâneos: o UNIQUE derruba um, que reaproveita o outro", async () => {
    db.planSubscription.findUnique
      .mockResolvedValueOnce(null) // idempotência: ainda não existe
      .mockResolvedValue({
        ...SUB_NOVA,
        termsAcceptedAt: new Date(),
        mpPreapprovalId: "pre_1",
        mpInitPoint: "https://mp/pay/1",
      });
    db.planSubscription.create.mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002" }));

    const res = await POST(req());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, paymentUrl: "https://mp/pay/1" });
    expect(mp.createPreapproval).not.toHaveBeenCalled();
  });

  it("o preço NÃO vem do cliente: centavos no corpo do request são ignorados", async () => {
    db.planSubscription.findUnique.mockResolvedValueOnce(null).mockResolvedValue(SUB_NOVA);

    await POST(req({ priceCents: 1, firstChargeCents: 1, valor: 1 }));

    const data = db.planSubscription.create.mock.calls[0][0].data;
    expect(data.priceCents).toBe(42900);
    expect(data.firstChargeCents).toBe(21450);
  });

  it("cada plano e ciclo é precificado pela fonte única", async () => {
    db.planSubscription.findUnique.mockResolvedValue(null);
    db.planSubscription.findUnique.mockResolvedValueOnce(null).mockResolvedValue(SUB_NOVA);

    await POST(req({ plano: "performance", ciclo: "ANUAL", idempotencyKey: "chave-do-formulario-2" }));

    const data = db.planSubscription.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ plan: "PRO", cycle: "ANUAL", priceCents: 899000, firstChargeCents: 861542 });
  });
});

describe("POST /api/billing/checkout — falha fechada", () => {
  it("sem aceite do Termo, nada é criado", async () => {
    const res = await POST(req({ aceiteTermos: false }));
    expect(res.status).toBe(400);
    expect(db.planSubscription.create).not.toHaveBeenCalled();
    expect(mp.createPreapproval).not.toHaveBeenCalled();
  });

  it("endereço de loja já usado devolve 409 e não cobra ninguém", async () => {
    db.restaurant.findUnique.mockResolvedValue({ id: "rest_existente" });

    const res = await POST(req());
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(String(body.error)).toContain("já está em uso");
    expect(db.planSubscription.create).not.toHaveBeenCalled();
    expect(mp.createPreapproval).not.toHaveBeenCalled();
  });

  it("e-mail que já tem conta devolve 409 apontando o login", async () => {
    // O login procura a conta só pelo e-mail: um segundo dono com o mesmo e-mail
    // nunca conseguiria entrar. Vender essa conta seria vender algo inacessível.
    db.user.findFirst.mockResolvedValue({ id: "user_existente" });

    const res = await POST(req());
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(String(body.error)).toContain("/login");
    expect(db.planSubscription.create).not.toHaveBeenCalled();
  });

  it("plano desconhecido não vira contratação", async () => {
    const res = await POST(req({ plano: "enterprise" }));
    expect(res.status).toBe(400);
    expect(db.planSubscription.create).not.toHaveBeenCalled();
  });

  it("senha curta é recusada antes de qualquer criação", async () => {
    const res = await POST(req({ senha: "1234" }));
    expect(res.status).toBe(400);
    expect(db.planSubscription.create).not.toHaveBeenCalled();
  });

  it("se o Mercado Pago recusar o link, a contratação NÃO se perde", async () => {
    db.planSubscription.findUnique.mockResolvedValueOnce(null).mockResolvedValue(SUB_NOVA);
    mp.createPreapproval.mockRejectedValue(new Error("MP fora do ar"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(req());
    const body = await res.json();

    // A assinatura existe, o aceite está registrado, e o cliente é levado a uma
    // tela que explica o estado — em vez de sumir com o cadastro dele.
    expect(body).toMatchObject({ ok: true, paymentUrl: null });
    expect(String(body.thankYouUrl)).toContain("/contratar/obrigado");
    expect(db.planSubscription.create).toHaveBeenCalledOnce();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});
