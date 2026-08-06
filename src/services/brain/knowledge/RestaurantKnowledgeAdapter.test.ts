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

// ─────────────────────────────────────────────────────────────────────────────
// v3 — a ficha cobre a verdade INTEIRA e diz a qual canal cada item pertence.
//
// Cada trava abaixo tem as duas metades: a que prova que o caso ruim é barrado
// e a que prova que o caso legítimo passa intacto. Sem a segunda, o rótulo de
// canal viraria carimbo e o agente pararia de vender o que ele PODE vender.
// ─────────────────────────────────────────────────────────────────────────────

/** Um item de cardápio como o Prisma devolve, com as duas flags de canal. */
function item(over: Record<string, unknown> = {}) {
  return {
    name: "Temaki Salmão", price: 25, priceDelivery: null, priceDineIn: null,
    isAvailable: true, showInDelivery: true, showInDineIn: true,
    category: { name: "Temakis", showInDelivery: true, showInDineIn: true },
    ...over,
  };
}

/** O RODIZIO PRESENCIAL do Sushi Cazza: existe, é ativo, e não vai para entrega. */
function rodizio(over: Record<string, unknown> = {}) {
  return item({
    name: "RODIZIO PRESENCIAL", price: 119, priceDineIn: 119,
    showInDelivery: false, showInDineIn: true,
    category: { name: "Rodízio", showInDelivery: true, showInDineIn: true },
    ...over,
  });
}

type Ficha = Awaited<ReturnType<typeof restaurantKnowledgeAdapter.getSnapshot>>;

function produtos(snap: Ficha): Array<Record<string, unknown>> {
  const [, ...itens] = snap.truthSources.products as Array<Record<string, unknown>>;
  return itens;
}
function cabecalho(snap: Ficha): Record<string, unknown> {
  return (snap.truthSources.products as Array<Record<string, unknown>>)[0]!;
}

describe("v3 — canal: o que se VENDE ali e o que só se CONTA", () => {
  it("o item só-salão ENTRA na ficha, com preço e etiqueta S", async () => {
    db.menuItem.count.mockResolvedValue(2);
    db.menuItem.findMany.mockResolvedValue([item(), rodizio()]);

    const snap = await restaurantKnowledgeAdapter.getSnapshot("r1", { agentId: "waiter" });
    const rodizioNaFicha = produtos(snap).find((p) => p.nome === "RODIZIO PRESENCIAL");

    expect(rodizioNaFicha).toBeTruthy();
    expect(rodizioNaFicha!.canais).toBe("S");
    expect(rodizioNaFicha!.precoSalao).toBe(119);
  });

  it("o item de entrega segue igual — etiqueta ES, nada some (a metade legítima)", async () => {
    db.menuItem.count.mockResolvedValue(2);
    db.menuItem.findMany.mockResolvedValue([item(), rodizio()]);

    const snap = await restaurantKnowledgeAdapter.getSnapshot("r1", { agentId: "waiter" });
    const temaki = produtos(snap).find((p) => p.nome === "Temaki Salmão");

    expect(temaki).toBeTruthy();
    expect(temaki!.canais).toBe("ES");
    expect(temaki!.preco).toBe(25);
    expect(produtos(snap)).toHaveLength(2);
  });

  it("a etiqueta vem com legenda — 'S' sozinho não informa nada a quem lê", async () => {
    db.menuItem.count.mockResolvedValue(1);
    db.menuItem.findMany.mockResolvedValue([rodizio()]);

    const snap = await restaurantKnowledgeAdapter.getSnapshot("r1", { agentId: "waiter" });
    const head = cabecalho(snap);

    expect(String(head.legendaCanais)).toMatch(/E=entrega/);
    expect(String(head.legendaCanais)).toMatch(/S=sal[ãa]o/);
    // E a regra do CEO, escrita na ficha: existe é diferente de vendível.
    expect(String(head.regraDeCanal)).toMatch(/EXISTE/);
    expect(String(head.regraDeCanal)).toMatch(/NUNCA entra em pedido de entrega/);
  });

  it("categoria escondida do delivery derruba o canal do item, mesmo com a flag do item ligada", async () => {
    db.menuItem.count.mockResolvedValue(1);
    db.menuItem.findMany.mockResolvedValue([
      item({
        name: "Chopp na torneira", showInDelivery: true,
        category: { name: "Chopeira", showInDelivery: false, showInDineIn: true },
      }),
    ]);

    const snap = await restaurantKnowledgeAdapter.getSnapshot("r1", { agentId: "waiter" });
    expect(produtos(snap)[0]!.canais).toBe("S");
  });

  it("item fora dos DOIS canais não é listado — e a ficha diz que ele não foi carregado, nunca que não existe", async () => {
    db.menuItem.count.mockResolvedValue(2);
    db.menuItem.findMany.mockResolvedValue([
      item(),
      item({ name: "Fora do ar", showInDelivery: false, showInDineIn: false }),
    ]);

    const snap = await restaurantKnowledgeAdapter.getSnapshot("r1", { agentId: "waiter" });
    expect(produtos(snap).map((p) => p.nome)).toEqual(["Temaki Salmão"]);
    expect(snap.missingContext.join(" ")).toMatch(/1 item\(ns\) ativo\(s\) fora dos dois canais/);
    expect(snap.missingContext.join(" ")).toMatch(/não afirmar que não existem/);
  });

  it("casa sem nada de salão: a ficha REGISTRA isso, para a ausência de 'S' não parecer recorte de canal", async () => {
    db.menuItem.count.mockResolvedValue(1);
    db.menuItem.findMany.mockResolvedValue([item()]);

    const snap = await restaurantKnowledgeAdapter.getSnapshot("r1", { agentId: "waiter" });
    expect(snap.safetyNotes.join(" ")).toMatch(/Nenhum item marcado como exclusivo de sal[ãa]o/);
  });
});

describe("v3 — o teto de itens não pode comer o salão (guardrail 5 sem perder verdade)", () => {
  /** 180 itens: o rodízio é o 175º, muito além do teto de 120 por sortOrder. */
  function cardapioGrande() {
    const itens = Array.from({ length: 180 }, (_, i) => item({ name: `Prato ${i + 1}` }));
    itens[174] = rodizio();
    return itens;
  }

  it("cardápio de 180 itens: o rodízio entra MESMO SEM pergunta", async () => {
    db.menuItem.count.mockResolvedValue(180);
    db.menuItem.findMany.mockResolvedValue(cardapioGrande());

    const snap = await restaurantKnowledgeAdapter.getSnapshot("r1", { agentId: "waiter" });
    expect(produtos(snap).some((p) => p.nome === "RODIZIO PRESENCIAL")).toBe(true);
    // O teto continua valendo — a garantia troca QUAIS itens, não quantos.
    expect(produtos(snap)).toHaveLength(120);
  });

  it("com queryHint, o item que a pergunta pede sobe para dentro da ficha", async () => {
    const itens = Array.from({ length: 180 }, (_, i) => item({ name: `Prato ${i + 1}` }));
    itens[179] = item({ name: "Yakisoba de Frango", category: { name: "Quentes", showInDelivery: true, showInDineIn: true } });
    db.menuItem.count.mockResolvedValue(180);
    db.menuItem.findMany.mockResolvedValue(itens);

    const semPergunta = await restaurantKnowledgeAdapter.getSnapshot("r1", { agentId: "waiter" });
    const comPergunta = await restaurantKnowledgeAdapter.getSnapshot("r1", { agentId: "waiter", queryHint: "tem yakisoba?" });

    expect(produtos(semPergunta).some((p) => p.nome === "Yakisoba de Frango")).toBe(false);
    expect(produtos(comPergunta).some((p) => p.nome === "Yakisoba de Frango")).toBe(true);
  });

  it("cardápio menor que o teto: a pergunta NÃO encolhe a ficha (a metade legítima)", async () => {
    const itens = Array.from({ length: 40 }, (_, i) => item({ name: `Prato ${i + 1}` }));
    db.menuItem.count.mockResolvedValue(40);
    db.menuItem.findMany.mockResolvedValue(itens);

    const semPergunta = await restaurantKnowledgeAdapter.getSnapshot("r1", { agentId: "waiter" });
    const comPergunta = await restaurantKnowledgeAdapter.getSnapshot("r1", { agentId: "waiter", queryHint: "tem prato 7?" });

    expect(produtos(semPergunta)).toHaveLength(40);
    expect(produtos(comPergunta)).toHaveLength(40);
    expect(semPergunta.missingContext.join(" ")).not.toMatch(/cardápio parcial/);
  });
});

describe("v3 — o estado da loja entra na ficha (o print das 23:49)", () => {
  /** 06:00–20:00 todo dia — o horário real do caso. */
  const HORARIOS = Array.from({ length: 7 }, (_, d) => ({
    dayOfWeek: d, isOpen: true, openTime: "06:00", closeTime: "20:00", periodsJson: null,
  }));

  function emSaoPaulo(iso: string) { return new Date(`${iso}-03:00`); }

  beforeEach(() => {
    db.businessHours.findMany.mockResolvedValue(HORARIOS);
    db.restaurant.findUnique.mockResolvedValue(
      baseRestaurant({ timezone: "America/Sao_Paulo", isOrderingPaused: false, orderingPausedUntil: null, orderingPausedReason: null }),
    );
  });
  afterEach(() => { vi.useRealTimers(); });

  it("23:49 com a loja fechada: a ficha diz que NÃO aceita pedido e quando reabre", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(emSaoPaulo("2026-08-05T23:49:00"));

    const snap = await restaurantKnowledgeAdapter.getSnapshot("r1", { agentId: "waiter" });
    const loja = snap.truthSources.loja as Record<string, unknown>;

    expect(loja.aberta).toBe(false);
    expect(loja.aceitandoPedidos).toBe(false);
    expect(loja.horarioDeHoje).toBe("06:00–20:00");
    expect(loja.reabreEm).toBe("amanhã às 06:00");
    expect(String(loja.mensagem)).toContain("Estamos fechados no momento");
  });

  it("e a nota de segurança PROÍBE pedir o dado que a cliente entregou à toa", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(emSaoPaulo("2026-08-05T23:49:00"));

    const snap = await restaurantKnowledgeAdapter.getSnapshot("r1", { agentId: "waiter" });
    const notas = snap.safetyNotes.join(" ");

    expect(notas).toMatch(/PROIBIDO pedir telefone/);
    expect(notas).toMatch(/carrinho/i);
    expect(notas).toMatch(/amanhã às 06:00/);
  });

  it("12:00 com a loja aberta: nenhuma nota nova, nenhuma mensagem de fechada (a metade legítima)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(emSaoPaulo("2026-08-05T12:00:00"));

    const snap = await restaurantKnowledgeAdapter.getSnapshot("r1", { agentId: "waiter" });
    const loja = snap.truthSources.loja as Record<string, unknown>;

    expect(loja.aceitandoPedidos).toBe(true);
    expect(loja.mensagem).toBeNull();
    expect(snap.safetyNotes.join(" ")).not.toMatch(/PROIBIDO pedir telefone/);
  });

  it("aberta mas com pedidos pausados: aceitandoPedidos cai, e o motivo do lojista viaja junto", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(emSaoPaulo("2026-08-05T12:00:00"));
    db.restaurant.findUnique.mockResolvedValue(
      baseRestaurant({
        timezone: "America/Sao_Paulo", isOrderingPaused: true,
        orderingPausedUntil: emSaoPaulo("2026-08-05T15:00:00"), orderingPausedReason: "Cozinha em manutenção",
      }),
    );

    const snap = await restaurantKnowledgeAdapter.getSnapshot("r1", { agentId: "waiter" });
    const loja = snap.truthSources.loja as Record<string, unknown>;

    expect(loja.aberta).toBe(true);
    expect(loja.aceitandoPedidos).toBe(false);
    expect(loja.motivoDaPausa).toBe("Cozinha em manutenção");
    expect(snap.safetyNotes.join(" ")).toMatch(/PROIBIDO pedir telefone/);
  });

  it("sem horário cadastrado: o sistema trata como aberta, e a ficha diz que isso é suposição", async () => {
    db.businessHours.findMany.mockResolvedValue([]);

    const snap = await restaurantKnowledgeAdapter.getSnapshot("r1", { agentId: "waiter" });
    const loja = snap.truthSources.loja as Record<string, unknown>;

    expect(loja.aberta).toBe(true);
    expect(loja.horarioCadastrado).toBe(false);
    expect(snap.missingContext.join(" ")).toMatch(/não é fato do restaurante/);
  });
});

describe("v3 — o que NÃO podia mudar", () => {
  it("completenessScore continua saindo dos MESMOS 5 sinais — é portão de promoção, não métrica solta", async () => {
    // freeFormGovernance.ts:67 lê este número contra KNOWLEDGE_COMPLETENESS_FLOOR.
    // Mexer no denominador afrouxaria a escada de liberação em silêncio.
    db.menuItem.count.mockResolvedValue(1);
    db.menuItem.findMany.mockResolvedValue([item()]);
    db.businessHours.findMany.mockResolvedValue([
      { dayOfWeek: 0, isOpen: true, openTime: "06:00", closeTime: "20:00", periodsJson: null },
    ]);
    db.restaurantKnowledgeItem.findMany.mockResolvedValue([
      { id: "k1", category: "GENERAL", title: "t", answer: "a", questionPatterns: [], embedding: null, embeddingModel: null },
    ]);

    const cheio = await restaurantKnowledgeAdapter.getSnapshot("r1", { agentId: "waiter" });
    expect(cheio.completenessScore).toBe(1);

    // Tira 2 dos 5 sinais (pagamento e conhecimento) → 3/5 = 0.6, no piso.
    db.restaurant.findUnique.mockResolvedValue(baseRestaurant({ paymentSettings: null }));
    db.restaurantKnowledgeItem.findMany.mockResolvedValue([]);
    const magro = await restaurantKnowledgeAdapter.getSnapshot("r1", { agentId: "waiter" });
    expect(magro.completenessScore).toBeCloseTo(0.6, 5);
  });

  it("restaurante inexistente continua devolvendo ficha vazia com completude 0", async () => {
    db.restaurant.findUnique.mockResolvedValue(null);
    const snap = await restaurantKnowledgeAdapter.getSnapshot("r1", { agentId: "waiter" });
    expect(snap.completenessScore).toBe(0);
    expect(snap.truthSources).toEqual({});
  });
});
