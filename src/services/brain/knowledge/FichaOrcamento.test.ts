/**
 * Orçamento da ficha — guardrail 5 virado trava.
 *
 * Ficha maior é prompt maior, e prompt maior é mais lento e mais caro em TODA
 * conversa, não só na que precisava do dado. O custo é invisível: ninguém abre
 * um PR chamado "encareci o agente em 8%". Este teste torna o custo visível no
 * único lugar que trava, que é o CI.
 *
 * O par que importa: o teto vem JUNTO com a exigência de conteúdo. Um teto
 * sozinho convida a economia errada — cortar o rótulo de canal e o estado da
 * loja deixaria a ficha menor e o agente de volta aos dois incidentes de 05/08.
 * Aqui as duas coisas são exigidas ao mesmo tempo: cabe no orçamento E carrega
 * a verdade que custou caro.
 *
 * O cenário é o PIOR caso realista: 180 itens no cardápio (acima do teto de
 * 120), 40 perguntas no Q&A do lojista, entrega configurada, semana inteira de
 * horários. Restaurante médio fica muito abaixo.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

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

/**
 * Teto em caracteres do JSON da ficha no pior caso.
 *
 * Medido em 06/08/2026: 20.831 caracteres (~5.200 tokens) para este cenário,
 * contra 18.374 (~4.594) antes do rótulo de canal e do estado da loja. O teto
 * tem folga de ~15% para mexida honesta; passar disso é decisão, não descuido,
 * e decisão se toma no PR — não no silêncio.
 */
const TETO_DE_CARACTERES = 24_000;

const CATEGORIAS = ["Temakis", "Hot Rolls", "Uramakis", "Combinados", "Quentes", "Bebidas", "Sobremesas", "Rodízio"];

function cardapio(n: number) {
  const itens = Array.from({ length: n }, (_, i) => ({
    name: `Prato ${i + 1} do cardápio`,
    price: 20 + (i % 40),
    priceDelivery: i % 3 === 0 ? 22 + (i % 40) : null,
    priceDineIn: i % 5 === 0 ? 19 + (i % 40) : null,
    isAvailable: i % 17 !== 0,
    showInDelivery: true,
    showInDineIn: true,
    category: { name: CATEGORIAS[i % CATEGORIAS.length], showInDelivery: true, showInDineIn: true },
  }));
  // O item só-salão fica lá no fim, como no cadastro real do Sushi Cazza.
  itens[n - 6] = {
    ...itens[n - 6]!,
    name: "RODIZIO PRESENCIAL", price: 119, priceDineIn: 119, showInDelivery: false,
  };
  return itens;
}

function conhecimento(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `k${i}`,
    category: i % 4 === 0 ? "PAYMENT_INFO" : "GENERAL",
    title: `Pergunta frequente número ${i + 1} sobre o restaurante`,
    answer:
      "Resposta oficial do lojista, com detalhe suficiente para o agente repetir sem inventar nada — " +
      "cerca de 160 caracteres de texto real, para o orçamento não ser medido com resposta de brinquedo.",
    questionPatterns: ["como funciona", "vocês tem", "qual o preço"],
    embedding: null,
    embeddingModel: null,
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-05T23:49:00-03:00")); // loja fechada: o pior caso também em texto
  db.restaurant.findUnique.mockResolvedValue({
    name: "Sushi Cazza",
    address: "Rua das Flores, 100 — Vila Mariana, São Paulo",
    timezone: "America/Sao_Paulo",
    isOrderingPaused: false,
    orderingPausedUntil: null,
    orderingPausedReason: null,
    paymentSettings: { acceptPix: true, acceptCash: true, acceptCard: true, acceptLink: false },
    deliveryConfig: {
      enabled: true, pickupEnabled: true, mode: "simple", fee: 8.9, estimatedMinutes: 40,
      areaDescription: "Zona Sul de São Paulo", minOrderValue: 30, freeDeliveryAbove: 120,
      distanceBaseFee: null, distancePricePerKm: null, distanceMaxKm: null,
      distanceMinFee: null, distanceMaxFee: null, geoRadiusKm: 6,
    },
    brandConfig: { tone: "friendly" },
  });
  db.menuItem.count.mockResolvedValue(180);
  db.menuItem.findMany.mockResolvedValue(cardapio(180));
  db.businessHours.findMany.mockResolvedValue(
    Array.from({ length: 7 }, (_, d) => ({
      dayOfWeek: d, isOpen: true, openTime: "06:00", closeTime: "20:00", periodsJson: null,
    })),
  );
  db.promotion.findMany.mockResolvedValue([]);
  db.restaurantKnowledgeItem.findMany.mockResolvedValue(conhecimento(40));
  db.agentLibrarySource.count.mockResolvedValue(3);
  db.waiterResultEvidence.count.mockResolvedValue(12);
  db.deliveryZone.findMany.mockResolvedValue([]);
});

afterEach(() => { vi.useRealTimers(); });

describe("Orçamento da ficha — cabe no teto", () => {
  it("pior caso realista fica abaixo do teto, com e sem pergunta", async () => {
    const sem = await restaurantKnowledgeAdapter.getSnapshot("r1", { agentId: "waiter" });
    const com = await restaurantKnowledgeAdapter.getSnapshot("r1", { agentId: "waiter", queryHint: "vocês tem rodízio?" });

    expect(JSON.stringify(sem).length).toBeLessThan(TETO_DE_CARACTERES);
    expect(JSON.stringify(com).length).toBeLessThan(TETO_DE_CARACTERES);
  });

  it("a pergunta não infla a ficha — o queryHint troca QUAIS itens, não quantos", async () => {
    const sem = await restaurantKnowledgeAdapter.getSnapshot("r1", { agentId: "waiter" });
    const com = await restaurantKnowledgeAdapter.getSnapshot("r1", { agentId: "waiter", queryHint: "vocês tem rodízio?" });

    const itensSem = (sem.truthSources.products as unknown[]).length;
    const itensCom = (com.truthSources.products as unknown[]).length;
    expect(itensCom).toBe(itensSem);

    // Tolerância de 5%: nomes diferentes têm tamanhos diferentes, mas a ficha
    // não pode crescer de patamar só porque o cliente perguntou algo.
    const sembytes = JSON.stringify(sem).length;
    expect(JSON.stringify(com).length).toBeLessThan(sembytes * 1.05);
  });
});

describe("Orçamento da ficha — o teto não pode ser pago com verdade", () => {
  it("a ficha continua carregando o CANAL de cada item", async () => {
    const snap = await restaurantKnowledgeAdapter.getSnapshot("r1", { agentId: "waiter" });
    const [head, ...itens] = snap.truthSources.products as Array<Record<string, unknown>>;

    expect(String(head!.legendaCanais)).toMatch(/E=entrega/);
    expect(itens.every((i) => typeof i.canais === "string" && i.canais !== "")).toBe(true);
    expect(itens.some((i) => i.canais === "S")).toBe(true); // o rodízio sobreviveu ao teto
  });

  it("a ficha continua carregando o ESTADO DA LOJA e o aviso de loja fechada", async () => {
    const snap = await restaurantKnowledgeAdapter.getSnapshot("r1", { agentId: "waiter" });
    const loja = snap.truthSources.loja as Record<string, unknown>;

    expect(loja).toBeTruthy();
    expect(loja.aceitandoPedidos).toBe(false);
    expect(loja.reabreEm).toBe("amanhã às 06:00");
    expect(snap.safetyNotes.join(" ")).toMatch(/PROIBIDO pedir telefone/);
  });
});
