/**
 * A vitrine não vira cliente.
 *
 * A Foocci Bakery é um tenant completo e funcional — é o que faz a degustação
 * valer. O preço disso é que, numa consulta descuidada, ela é indistinguível de
 * um restaurante pagante. Estes testes travam os dois lados: o filtro canônico
 * existe e é usado, e a criação de assinatura recusa restaurante de vitrine.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  restaurant: { findUnique: vi.fn() },
  planSubscription: { create: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import {
  REAL_RESTAURANTS_ONLY,
  DEMO_RESTAURANTS_ONLY,
  DEMO_BAKERY_SLUG,
  DemoRestaurantBillingError,
  assertNotDemoRestaurant,
} from "./demo-restaurant";
import { PlanSubscriptionService } from "@/services/billing/PlanSubscriptionService";

beforeEach(() => vi.clearAllMocks());

describe("filtros canônicos", () => {
  it("REAL_RESTAURANTS_ONLY exclui a vitrine; DEMO_RESTAURANTS_ONLY é o inverso", () => {
    expect(REAL_RESTAURANTS_ONLY).toEqual({ isDemo: false });
    expect(DEMO_RESTAURANTS_ONLY).toEqual({ isDemo: true });
  });

  it("o slug da padaria é o endereço público, não a fonte da verdade", () => {
    expect(DEMO_BAKERY_SLUG).toBe("foocci-bakery");
  });
});

describe("assertNotDemoRestaurant", () => {
  it("deixa passar restaurante de verdade", async () => {
    db.restaurant.findUnique.mockResolvedValue({ isDemo: false });
    await expect(assertNotDemoRestaurant("rest_real")).resolves.toBeUndefined();
  });

  it("recusa restaurante de demonstração, com o motivo na evidência", async () => {
    db.restaurant.findUnique.mockResolvedValue({ isDemo: true });
    await expect(assertNotDemoRestaurant("rest_demo")).rejects.toMatchObject({
      name: "DemoRestaurantBillingError",
      reason: "DEMO",
      restaurantId: "rest_demo",
    });
  });

  it("falha FECHADA quando o restaurante não existe — ausência não é prova", async () => {
    db.restaurant.findUnique.mockResolvedValue(null);
    await expect(assertNotDemoRestaurant("rest_fantasma")).rejects.toMatchObject({
      reason: "NOT_FOUND",
    });
  });
});

describe("PlanSubscriptionService.create — cobrança nunca alcança a vitrine", () => {
  const base = {
    customerName: "Padaria de Teste",
    customerWhatsapp: "+5511999990000",
    plan: "GROWTH" as const,
    cycle: "MENSAL" as const,
  };

  it("recusa criar assinatura vinculada a restaurante de demonstração", async () => {
    db.restaurant.findUnique.mockResolvedValue({ isDemo: true });

    await expect(
      PlanSubscriptionService.create({ ...base, restaurantId: "rest_demo" }),
    ).rejects.toBeInstanceOf(DemoRestaurantBillingError);

    // A trava é ANTES da escrita: nenhuma assinatura chega a ser criada.
    expect(db.planSubscription.create).not.toHaveBeenCalled();
  });

  it("não super-bloqueia: restaurante real segue criando normalmente", async () => {
    db.restaurant.findUnique.mockResolvedValue({ isDemo: false });
    db.planSubscription.create.mockResolvedValue({ id: "sub_1" });

    await PlanSubscriptionService.create({ ...base, restaurantId: "rest_real" });

    expect(db.planSubscription.create).toHaveBeenCalledOnce();
  });

  it("assinatura sem restaurante vinculado não consulta nada e passa", async () => {
    db.planSubscription.create.mockResolvedValue({ id: "sub_2" });

    await PlanSubscriptionService.create(base);

    expect(db.restaurant.findUnique).not.toHaveBeenCalled();
    expect(db.planSubscription.create).toHaveBeenCalledOnce();
  });
});
