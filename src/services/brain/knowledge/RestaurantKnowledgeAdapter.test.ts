import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  restaurant: { findUnique: vi.fn() },
  menuItem: { count: vi.fn(), findMany: vi.fn() },
  businessHours: { findMany: vi.fn() },
  promotion: { findMany: vi.fn() },
  restaurantKnowledgeItem: { findMany: vi.fn() },
  agentLibrarySource: { count: vi.fn() },
  waiterResultEvidence: { count: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("./KnowledgeEmbeddingService", () => ({ rankByEmbedding: vi.fn().mockResolvedValue(null) }));

import { restaurantKnowledgeAdapter } from "./RestaurantKnowledgeAdapter";

function baseRestaurant(over: Record<string, unknown> = {}) {
  return {
    name: "Sushi Cazza",
    address: "Rua das Flores, 100 — Vila Mariana, São Paulo",
    paymentSettings: { acceptPix: true, acceptCash: true, acceptCard: true, acceptLink: false },
    deliveryConfig: { enabled: true, pickupEnabled: true, fee: 8.9, areaDescription: "Zona Sul de SP", minOrderValue: 30, geoRadiusKm: 6 },
    brandConfig: { tone: "friendly" },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.restaurant.findUnique.mockResolvedValue(baseRestaurant());
  db.menuItem.count.mockResolvedValue(1);
  db.menuItem.findMany.mockResolvedValue([
    { name: "Temaki Salmão", price: 25, priceDelivery: null, priceDineIn: null, isAvailable: true, category: { name: "Temakis" } },
  ]);
  db.businessHours.findMany.mockResolvedValue([]);
  db.promotion.findMany.mockResolvedValue([]);
  db.restaurantKnowledgeItem.findMany.mockResolvedValue([]);
  db.agentLibrarySource.count.mockResolvedValue(0);
  db.waiterResultEvidence.count.mockResolvedValue(0);
});

describe("RestaurantKnowledgeAdapter — entrega e endereço aterram a verdade", () => {
  it("surfacia taxa, área, raio e mínimo de entrega quando cadastrados", async () => {
    const snap = await restaurantKnowledgeAdapter.getSnapshot("r1", { agentId: "whatsapp" });
    const entrega = snap.truthSources.entrega as Record<string, unknown>;
    expect(entrega).toBeTruthy();
    expect(entrega.taxa).toBe(8.9);
    expect(entrega.area).toBe("Zona Sul de SP");
    expect(entrega.raioKm).toBe(6);
    expect(entrega.pedidoMinimo).toBe(30);
  });

  it("surfacia o endereço PRÓPRIO do restaurante (não é PII de cliente)", async () => {
    const snap = await restaurantKnowledgeAdapter.getSnapshot("r1", { agentId: "whatsapp" });
    const local = snap.truthSources.local as Record<string, unknown>;
    expect(local?.endereco).toContain("Vila Mariana");
  });

  it("sem área/raio cadastrados → missingContext manda confirmar por CEP (nunca afirmar)", async () => {
    db.restaurant.findUnique.mockResolvedValue(
      baseRestaurant({ deliveryConfig: { enabled: true, pickupEnabled: true, fee: null, areaDescription: null, minOrderValue: null, geoRadiusKm: null } }),
    );
    const snap = await restaurantKnowledgeAdapter.getSnapshot("r1", { agentId: "whatsapp" });
    expect(snap.missingContext.join(" ")).toMatch(/cobertura de entrega não cadastrada/i);
    expect(snap.missingContext.join(" ")).toMatch(/taxa de entrega não cadastrada/i);
  });

  it("sem endereço cadastrado → missingContext sinaliza (agente não inventa)", async () => {
    db.restaurant.findUnique.mockResolvedValue(baseRestaurant({ address: null }));
    const snap = await restaurantKnowledgeAdapter.getSnapshot("r1", { agentId: "whatsapp" });
    expect(snap.truthSources.local).toBeUndefined();
    expect(snap.missingContext.join(" ")).toMatch(/endereço do restaurante não cadastrado/i);
  });
});
