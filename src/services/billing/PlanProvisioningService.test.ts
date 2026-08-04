/**
 * (b) O WEBHOOK DUPLICADO NÃO CRIA DOIS RESTAURANTES.
 *
 * O Mercado Pago reenvia o mesmo evento — é contrato dele, não acidente. Este
 * arquivo prova os três caminhos por onde o segundo processamento pode chegar:
 *
 *  1. Sequencial: a assinatura já tem `restaurantId` → não cria nada.
 *  2. Concorrente perdendo dentro da transação: relê e desiste.
 *  3. Concorrente que chega até o INSERT: o UNIQUE de
 *     `restaurants.originSubscriptionId` derruba, e o serviço reconhece o
 *     P2002 como "já feito" em vez de tratar como erro.
 *
 * E prova o caso que este domínio mais teme: pagamento entrou, criação falhou —
 * o motivo é PERSISTIDO com o dado do cliente, nunca engolido.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  planSubscription: { findUnique: vi.fn(), update: vi.fn() },
  restaurant: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
  user: { create: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

const defaults = vi.hoisted(() => ({ createRestaurantDefaults: vi.fn().mockResolvedValue({}) }));
vi.mock("@/services/restaurant/RestaurantDefaultsService", () => ({ RestaurantDefaultsService: defaults }));

import { PlanProvisioningService, slugify } from "./PlanProvisioningService";

const SUB = {
  id: "sub_1",
  restaurantId: null,
  customerName: "Ana Souza",
  customerEmail: "ana@pizzaria.com",
  customerWhatsapp: "11999999999",
  plan: "GROWTH",
  cycle: "MENSAL",
  priceCents: 42900,
  signupRestaurantName: "Pizzaria do Zé",
  signupSlug: "pizzaria-do-ze",
  signupOwnerPasswordHash: "$2a$12$hashfake",
};

/** Executa o callback da transação sobre um cliente de transação mockado. */
function runTx(tx: Record<string, unknown>) {
  db.$transaction.mockImplementation(async (fn: (t: unknown) => unknown) => fn(tx));
}

beforeEach(() => {
  vi.clearAllMocks();
  db.planSubscription.update.mockResolvedValue({});
});

describe("provision — cria a conta uma única vez", () => {
  it("primeira execução cria restaurante + dono e escreve o plano contratado", async () => {
    db.planSubscription.findUnique.mockResolvedValue(SUB);
    const tx = {
      planSubscription: { findUnique: vi.fn().mockResolvedValue({ restaurantId: null }), update: vi.fn() },
      restaurant: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "rest_1", slug: "pizzaria-do-ze" }),
      },
      user: { create: vi.fn() },
    };
    runTx(tx);

    const r = await PlanProvisioningService.provision("sub_1");

    expect(r).toMatchObject({ status: "criado", restaurantId: "rest_1", slug: "pizzaria-do-ze" });
    // O plano do restaurante é o plano contratado — era o campo que ninguém escrevia.
    expect(tx.restaurant.create.mock.calls[0][0].data).toMatchObject({
      slug: "pizzaria-do-ze",
      plan: "GROWTH",
      originSubscriptionId: "sub_1", // a chave de idempotência
    });
    // O dono nasce OWNER, com o hash definido no checkout (senha nunca em texto puro).
    expect(tx.user.create.mock.calls[0][0].data).toMatchObject({
      restaurantId: "rest_1",
      email: "ana@pizzaria.com",
      role: "OWNER",
      password: "$2a$12$hashfake",
    });
    // E o elo que faltava: a assinatura passa a apontar para o restaurante.
    expect(tx.planSubscription.update.mock.calls[0][0].data).toMatchObject({ restaurantId: "rest_1" });
  });

  it("(b1) reenvio sequencial do MESMO evento não cria nada", async () => {
    db.planSubscription.findUnique.mockResolvedValue({ ...SUB, restaurantId: "rest_1" });
    db.restaurant.findUnique.mockResolvedValue({ id: "rest_1", slug: "pizzaria-do-ze", plan: "GROWTH" });

    const r = await PlanProvisioningService.provision("sub_1");

    expect(r).toMatchObject({ status: "ja_provisionado", restaurantId: "rest_1" });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("(b2) concorrente que relê dentro da transação desiste sem criar", async () => {
    db.planSubscription.findUnique
      .mockResolvedValueOnce(SUB) // leitura de fora: ainda sem restaurante
      .mockResolvedValueOnce({ ...SUB, restaurantId: "rest_1", restaurant: { id: "rest_1", slug: "pizzaria-do-ze" } });
    const tx = {
      // Dentro da transação o vencedor já gravou.
      planSubscription: { findUnique: vi.fn().mockResolvedValue({ restaurantId: "rest_1" }), update: vi.fn() },
      restaurant: { findUnique: vi.fn(), create: vi.fn() },
      user: { create: vi.fn() },
    };
    runTx(tx);

    const r = await PlanProvisioningService.provision("sub_1");

    expect(tx.restaurant.create).not.toHaveBeenCalled();
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(r).toMatchObject({ status: "ja_provisionado", restaurantId: "rest_1" });
  });

  it("(b3) concorrente que chega ao INSERT é derrubado pelo UNIQUE — e isso NÃO é erro", async () => {
    db.planSubscription.findUnique.mockResolvedValue(SUB);
    // A transação estoura com P2002 (violação de originSubscriptionId).
    db.$transaction.mockRejectedValue(Object.assign(new Error("Unique constraint failed"), { code: "P2002" }));
    db.restaurant.findUnique.mockResolvedValue({ id: "rest_1", slug: "pizzaria-do-ze" });

    const r = await PlanProvisioningService.provision("sub_1");

    // Encontrou pelo próprio índice de idempotência.
    expect(db.restaurant.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { originSubscriptionId: "sub_1" } }),
    );
    expect(r).toMatchObject({ status: "ja_provisionado", restaurantId: "rest_1" });
    // O ponto: um reenvio do MP não vira "falhou" nem cria uma segunda conta.
    expect(r.status).not.toBe("falhou");
  });

  it("dez reenvios seguidos resultam em UM restaurante", async () => {
    let criado: { id: string; slug: string } | null = null;
    db.planSubscription.findUnique.mockImplementation(async () =>
      criado ? { ...SUB, restaurantId: criado.id } : SUB,
    );
    db.restaurant.findUnique.mockImplementation(async () => (criado ? { ...criado, plan: "GROWTH" } : null));
    const create = vi.fn().mockImplementation(async () => {
      if (criado) throw Object.assign(new Error("dup"), { code: "P2002" });
      criado = { id: "rest_1", slug: "pizzaria-do-ze" };
      return criado;
    });
    runTx({
      planSubscription: { findUnique: vi.fn().mockResolvedValue({ restaurantId: null }), update: vi.fn() },
      restaurant: { findUnique: vi.fn().mockResolvedValue(null), create },
      user: { create: vi.fn() },
    });

    for (let i = 0; i < 10; i++) await PlanProvisioningService.provision("sub_1");

    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe("provision — o endereço desejado ocupado não custa a conta do cliente", () => {
  it("sufixa o slug em vez de abandonar quem pagou", async () => {
    db.planSubscription.findUnique.mockResolvedValue(SUB);
    const tx = {
      planSubscription: { findUnique: vi.fn().mockResolvedValue({ restaurantId: null }), update: vi.fn() },
      restaurant: {
        // "pizzaria-do-ze" ocupado; "pizzaria-do-ze-2" livre.
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({ id: "outro" })
          .mockResolvedValueOnce(null),
        create: vi.fn().mockResolvedValue({ id: "rest_2", slug: "pizzaria-do-ze-2" }),
      },
      user: { create: vi.fn() },
    };
    runTx(tx);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const r = await PlanProvisioningService.provision("sub_1");

    expect(r).toMatchObject({ status: "criado", slug: "pizzaria-do-ze-2", slugChanged: true });
    // A troca é registrada — o cliente vê o endereço real na tela pós-pagamento.
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("provision — pagou e a conta não nasceu", () => {
  it("persiste o motivo COM os dados do cliente e não devolve sucesso", async () => {
    db.planSubscription.findUnique.mockResolvedValue(SUB);
    db.$transaction.mockRejectedValue(new Error("conexão com o banco caiu"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    const r = await PlanProvisioningService.provision("sub_1");

    expect(r.status).toBe("falhou");
    const gravado = String(db.planSubscription.update.mock.calls[0][0].data.provisionError);
    // Guardrail 6: o alerta carrega a própria evidência — dá para agir sem
    // caçar em log de gateway.
    expect(gravado).toContain("CLIENTE PAGOU E A CONTA NÃO FOI CRIADA");
    expect(gravado).toContain("Ana Souza");
    expect(gravado).toContain("ana@pizzaria.com");
    expect(gravado).toContain("11999999999");
    expect(gravado).toContain("conexão com o banco caiu");
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it("assinatura sem e-mail não vira conta muda — falha explícita", async () => {
    db.planSubscription.findUnique.mockResolvedValue({ ...SUB, customerEmail: null });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    const r = await PlanProvisioningService.provision("sub_1");

    expect(r.status).toBe("falhou");
    expect(db.$transaction).not.toHaveBeenCalled();
    err.mockRestore();
  });
});

describe("provision — venda 1:1 do admin", () => {
  it("assinatura sem dados de cadastro é no-op, não erro", async () => {
    db.planSubscription.findUnique.mockResolvedValue({
      ...SUB,
      signupSlug: null,
      signupRestaurantName: null,
      signupOwnerPasswordHash: null,
    });

    const r = await PlanProvisioningService.provision("sub_1");

    expect(r).toEqual({ status: "sem_dados_de_cadastro" });
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

describe("slugify", () => {
  it("tira acento, espaço e pontuação", () => {
    expect(slugify("Pizzaria do Zé — Açaí & Cia.")).toBe("pizzaria-do-ze-acai-cia");
  });
});
