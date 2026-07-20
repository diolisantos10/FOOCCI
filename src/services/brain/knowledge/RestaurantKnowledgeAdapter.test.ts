import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  restaurant: { findUnique: vi.fn() },
  menuItem: { count: vi.fn(), findMany: vi.fn() },
  businessHours: { findMany: vi.fn() },
  promotion: { findMany: vi.fn() },
  restaurantKnowledgeItem: { findMany: vi.fn() },
  agentLibrarySource: { count: vi.fn() },
  waiterResultEvidence: { count: vi.fn() },
  deliveryZone: { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("./KnowledgeEmbeddingService", () => ({ rankByEmbedding: vi.fn().mockResolvedValue(null) }));

import { restaurantKnowledgeAdapter } from "./RestaurantKnowledgeAdapter";

function simpleConfig(over: Record<string, unknown> = {}) {
  return {
    enabled: true, pickupEnabled: true, mode: "simple",
    fee: 8.9, estimatedMinutes: 40, areaDescription: "Zona Sul de SP", minOrderValue: 30,
    freeDeliveryAbove: null, distanceBaseFee: null, distancePricePerKm: null,
    distanceMaxKm: null, distanceMinFee: null, distanceMaxFee: null, geoRadiusKm: 6,
    ...over,
  };
}

function baseRestaurant(over: Record<string, unknown> = {}) {
  return {
    name: "Sushi Cazza",
    address: "Rua das Flores, 100 — Vila Mariana, São Paulo",
    paymentSettings: { acceptPix: true, acceptCash: true, acceptCard: true, acceptLink: false },
    deliveryConfig: simpleConfig(),
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
  db.deliveryZone.findMany.mockResolvedValue([]);
});

describe("RestaurantKnowledgeAdapter — entrega e endereço aterram a verdade", () => {
  it("modo simple: surfacia taxa, área, raio e mínimo", async () => {
    const snap = await restaurantKnowledgeAdapter.getSnapshot("r1", { agentId: "whatsapp" });
    const entrega = snap.truthSources.entrega as Record<string, unknown>;
    expect(entrega).toBeTruthy();
    expect((entrega.taxa as Record<string, unknown>).valor).toBe(8.9);
    expect(entrega.area).toBe("Zona Sul de SP");
    expect(entrega.raioKm).toBe(6);
    expect(entrega.pedidoMinimo).toBe(30);
  });

  it("modo DISTANCE: taxa vira fórmula (base+km) e raio vem de distanceMaxKm", async () => {
    db.restaurant.findUnique.mockResolvedValue(
      baseRestaurant({
        deliveryConfig: simpleConfig({
          mode: "distance", fee: null, areaDescription: null, minOrderValue: null, geoRadiusKm: null,
          distanceBaseFee: 5, distancePricePerKm: 1.8, distanceMaxKm: 7, distanceMinFee: 10,
        }),
      }),
    );
    const snap = await restaurantKnowledgeAdapter.getSnapshot("r1", { agentId: "whatsapp" });
    const entrega = snap.truthSources.entrega as Record<string, unknown>;
    const taxa = entrega.taxa as Record<string, unknown>;
    expect(taxa.formula).toBe("por distância");
    expect(taxa.base).toBe(5);
    expect(taxa.porKm).toBe(1.8);
    expect(taxa.minima).toBe(10);
    expect(entrega.raioKm).toBe(7); // cobertura vem de distanceMaxKm
    // como TEM taxa e raio, NÃO deve marcar "não cadastrado"
    expect(snap.missingContext.join(" ")).not.toMatch(/taxa de entrega não cadastrada/i);
    expect(snap.missingContext.join(" ")).not.toMatch(/cobertura de entrega não cadastrada/i);
  });

  it("modo ADVANCED: taxa e raio vêm das zonas", async () => {
    db.restaurant.findUnique.mockResolvedValue(
      baseRestaurant({
        deliveryConfig: simpleConfig({ mode: "advanced", fee: null, areaDescription: null, geoRadiusKm: null }),
      }),
    );
    db.deliveryZone.findMany.mockResolvedValue([
      { name: "Zona 1 — Centro", maxDistanceKm: 3, fee: 6, estimatedMinutes: 30, minOrderValue: null },
      { name: "Zona 2", maxDistanceKm: 8, fee: 12, estimatedMinutes: 50, minOrderValue: 40 },
    ]);
    const snap = await restaurantKnowledgeAdapter.getSnapshot("r1", { agentId: "whatsapp" });
    const entrega = snap.truthSources.entrega as Record<string, unknown>;
    expect(entrega.raioKm).toBe(8); // maior maxDistanceKm das zonas
    expect(Array.isArray(entrega.zonas)).toBe(true);
    expect(snap.missingContext.join(" ")).not.toMatch(/taxa de entrega não cadastrada/i);
  });

  it("surfacia o endereço PRÓPRIO do restaurante (não é PII de cliente)", async () => {
    const snap = await restaurantKnowledgeAdapter.getSnapshot("r1", { agentId: "whatsapp" });
    const local = snap.truthSources.local as Record<string, unknown>;
    expect(local?.endereco).toContain("Vila Mariana");
  });

  it("sem taxa/área em NENHUM modo → missingContext manda confirmar por CEP (nunca afirmar)", async () => {
    db.restaurant.findUnique.mockResolvedValue(
      baseRestaurant({ deliveryConfig: simpleConfig({ fee: null, areaDescription: null, minOrderValue: null, geoRadiusKm: null }) }),
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
