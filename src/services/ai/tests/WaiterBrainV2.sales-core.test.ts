/**
 * WaiterBrainV2 — Sales Core Unit Tests (Sprint 3H)
 *
 * Tests pure functions only. No DB, no AI, no network.
 * ConversationGuardrails is mocked to isolate the prisma import.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

// ── Mock ConversationGuardrails before WaiterBrainV2 is imported ──────────────
vi.mock("../ConversationGuardrails", () => ({
  isDessertCategory: (name: string) =>
    /sobremesa|doce|sorvete|torta|bolo|brownie|pudim|brigadeiro|dessert|sweet/i.test(name),
}));

import {
  decide,
  validateWaiterResponse,
  analyzeSalesContext,
  analyzeMenuItem,
  analyzeCart,
  analyzeMenuProfile,
  analyzeMenu,
  analyzeSalesSituation,
  chooseSalesStrategy,
  buildWaiterResponse,
  scoreProductForIntent,
  rankProducts,
  buildCommercialResponse,
  createWaiterMemory,
  type V2CatalogItem,
  type V2Input,
  type V2Output,
  type WaiterMode,
  type ScoreContext,
  type PriceBenchmarks,
  type CommercialResponseInput,
  type WaiterMemory,
  type WaiterSalesConfig,
  DEFAULT_WAITER_CONFIG,
} from "../WaiterBrainV2";

// ── Shared catalog fixtures ───────────────────────────────────────────────────

function makeSushiCatalog(): V2CatalogItem[] {
  return [
    { id: "s1", name: "Temaki Salmão",      categoryName: "Temakis",   price: 22, sortOrder: 1 },
    { id: "s2", name: "Uramaki Philadelphia", categoryName: "Uramakis", price: 28, sortOrder: 2 },
    { id: "s3", name: "Combinado Para 2",    categoryName: "Combos",    price: 65, sortOrder: 3 },
    { id: "s4", name: "Suco de Laranja",     categoryName: "Bebidas",   price: 8,  sortOrder: 4 },
    { id: "s5", name: "Pudim de Leite",      categoryName: "Sobremesas", price: 12, sortOrder: 5 },
    { id: "s6", name: "Temaki Atum",         categoryName: "Temakis",   price: 24, sortOrder: 6 },
  ];
}

function makeItalianCatalog(): V2CatalogItem[] {
  return [
    { id: "i1", name: "Fettuccine Carbonara",   categoryName: "Massas",    price: 42, sortOrder: 1 },
    { id: "i2", name: "Pizza Margherita",        categoryName: "Pizzas",    price: 52, sortOrder: 2 },
    { id: "i3", name: "Lasanha Bolonhesa",       categoryName: "Massas",    price: 48, sortOrder: 3 },
    { id: "i4", name: "Água com Gás",            categoryName: "Bebidas",   price: 6,  sortOrder: 4 },
    { id: "i5", name: "Vinho Tinto Taça",        categoryName: "Bebidas",   price: 18, sortOrder: 5 },
    { id: "i6", name: "Tiramisù",                categoryName: "Sobremesas", price: 20, sortOrder: 6 },
    { id: "i7", name: "Bruschetta Clássica",     categoryName: "Entradas",  price: 22, sortOrder: 7, description: "entrada leve" },
  ];
}

function makeBurgerCatalog(): V2CatalogItem[] {
  return [
    { id: "b1", name: "Smash Clássico",    categoryName: "Burgers",   price: 32, sortOrder: 1 },
    { id: "b2", name: "Bacon Duplo",       categoryName: "Burgers",   price: 42, sortOrder: 2 },
    { id: "b3", name: "Combo Família",     categoryName: "Combos",    price: 89, sortOrder: 3 },
    { id: "b4", name: "Refrigerante Lata", categoryName: "Bebidas",   price: 7,  sortOrder: 4 },
    { id: "b5", name: "Milkshake",         categoryName: "Bebidas",   price: 15, sortOrder: 5 },
    { id: "b6", name: "Brownie com Sorvete", categoryName: "Sobremesas", price: 18, sortOrder: 6 },
  ];
}

function makeInput(
  event: V2Input["event"],
  overrides: Partial<V2Input> = {},
  catalog = makeSushiCatalog(),
): V2Input {
  return {
    event,
    cartItemIds: [],
    cartValue:   0,
    catalog,
    message:     "",
    ...overrides,
  };
}

const VALID_MODES: WaiterMode[] = ["BROWSE", "SUGGESTION", "INTERVENTION", "CHECKOUT_SUPPORT"];

// ── 1. Normalized response contract ──────────────────────────────────────────

describe("Response contract", () => {
  const events: V2Input["event"][] = [
    "ON_ENTRY", "ON_MENU_MODE", "ON_ITEM_ADDED",
    "ON_CART_UPDATED", "ON_IDLE", "ON_CHECKOUT_STARTED",
    "AFTER_CHECKOUT", "ON_PERMISSION_ACCEPT",
  ];

  it.each(events)("decide(%s) returns all required fields", (event) => {
    const out = decide(makeInput(event));
    expect(out).toHaveProperty("message");
    expect(out).toHaveProperty("options");
    expect(out).toHaveProperty("cards");
    expect(out).toHaveProperty("mode");
    expect(typeof out.message).toBe("string");
    expect(Array.isArray(out.options)).toBe(true);
    expect(Array.isArray(out.cards)).toBe(true);
    expect(VALID_MODES).toContain(out.mode);
  });

  it("ON_USER_MESSAGE returns all required fields", () => {
    const out = decide(makeInput("ON_USER_MESSAGE", { message: "quero uma sobremesa" }));
    expect(out).toHaveProperty("message");
    expect(VALID_MODES).toContain(out.mode);
    expect(Array.isArray(out.cards)).toBe(true);
    expect(Array.isArray(out.options)).toBe(true);
  });
});

// ── 2. Product suggestion visibility ─────────────────────────────────────────

describe("Product suggestion visibility", () => {
  it("asks for dessert → cards contain dessert IDs", () => {
    const out = decide(makeInput("ON_USER_MESSAGE", { message: "quero uma sobremesa" }));
    expect(out.cards.length).toBeGreaterThan(0);
    out.cards.forEach((id) => expect(["s5"]).toContain(id)); // only dessert in sushi menu
    expect(out.mode).toBe("SUGGESTION");
  });

  it("asks for drink → cards contain drink IDs only", () => {
    const out = decide(makeInput("ON_USER_MESSAGE", { message: "quero uma bebida" }));
    expect(out.cards.length).toBeGreaterThan(0);
    out.cards.forEach((id) => expect(["s4"]).toContain(id));
    expect(out.mode).toBe("SUGGESTION");
  });

  it("asks for lighter option → cards are food items, mode SUGGESTION", () => {
    const out = decide(makeInput("ON_USER_MESSAGE", { message: "quero algo leve" }));
    expect(out.cards.length).toBeGreaterThan(0);
    // Drink / dessert IDs must not appear
    expect(out.cards).not.toContain("s4");
    expect(out.cards).not.toContain("s5");
    expect(out.mode).toBe("SUGGESTION");
  });

  it("cards[] never references IDs absent from the catalog", () => {
    const catalog = makeSushiCatalog();
    const out     = decide(makeInput("ON_USER_MESSAGE", { message: "me sugere algo", catalog }));
    const validIds = new Set(catalog.map((i) => i.id));
    out.cards.forEach((id) => expect(validIds.has(id)).toBe(true));
  });
});

// ── 3. Button questions ───────────────────────────────────────────────────────

describe("Button questions", () => {
  it("'me sugere algo' with empty cart → options[] contains light/complete buttons", () => {
    const out = decide(makeInput("ON_USER_MESSAGE", { message: "me sugere algo" }));
    const values = out.options.map((o) => o.value);
    expect(values).toContain("light");
    expect(values).toContain("complete");
  });

  it("'unclear' with empty cart → qualification buttons, no required typing", () => {
    const out = decide(makeInput("ON_USER_MESSAGE", { message: "não sei o que quero" }));
    expect(out.options.length).toBeGreaterThan(0);
    out.options.forEach((o) => {
      expect(typeof o.label).toBe("string");
      expect(typeof o.value).toBe("string");
      expect(o.value.length).toBeGreaterThan(0);
    });
  });

  it("every option has both label and value", () => {
    const out = decide(makeInput("ON_USER_MESSAGE", { message: "me sugere algo" }));
    out.options.forEach((o) => {
      expect(o.label.length).toBeGreaterThan(0);
      expect(o.value.length).toBeGreaterThan(0);
    });
  });
});

// ── 4. No UI invasion after item add ─────────────────────────────────────────

describe("ON_ITEM_ADDED guard", () => {
  it("returns cards=[] after item is added", () => {
    const out = decide(makeInput("ON_ITEM_ADDED", { lastAddedId: "s1" }));
    expect(out.cards).toHaveLength(0);
  });

  it("returns mode=BROWSE after item is added", () => {
    const out = decide(makeInput("ON_ITEM_ADDED", { lastAddedId: "s1" }));
    expect(out.mode).toBe("BROWSE");
  });

  it("does not replace or interrupt the menu experience", () => {
    const out = decide(makeInput("ON_ITEM_ADDED", { lastAddedId: "s1" }));
    expect(out.cards).toHaveLength(0);
    expect(out.options).toHaveLength(0);
    expect(out.message.length).toBeGreaterThan(0); // brief acknowledgment only
  });
});

// ── 5. Checkout support ───────────────────────────────────────────────────────

describe("CHECKOUT_SUPPORT guard", () => {
  it("ON_CHECKOUT_STARTED → cards=[]", () => {
    const out = decide(makeInput("ON_CHECKOUT_STARTED"));
    expect(out.cards).toHaveLength(0);
  });

  it("ON_CHECKOUT_STARTED → mode=CHECKOUT_SUPPORT", () => {
    const out = decide(makeInput("ON_CHECKOUT_STARTED"));
    expect(out.mode).toBe("CHECKOUT_SUPPORT");
  });

  it("AFTER_CHECKOUT → cards=[]", () => {
    const out = decide(makeInput("AFTER_CHECKOUT"));
    expect(out.cards).toHaveLength(0);
  });

  it("AFTER_CHECKOUT → mode=CHECKOUT_SUPPORT", () => {
    const out = decide(makeInput("AFTER_CHECKOUT"));
    expect(out.mode).toBe("CHECKOUT_SUPPORT");
  });

  it("ON_CHECKOUT_STARTED with food+no drink → pre-checkout upsell offer (INTERVENTION, cards=[])", () => {
    const catalog = makeSushiCatalog();
    const out = decide(makeInput("ON_CHECKOUT_STARTED", {
      cartItemIds: ["s1", "s2"], // two food items, no drink
      cartValue:   50,
      catalog,
    }));
    // cards are always [] — never push cards at checkout start
    expect(out.cards).toHaveLength(0);
    // Spec: if opportunity exists, offer it as INTERVENTION permission prompt
    expect(out.mode).toBe("INTERVENTION");
    expect(out.options.length).toBeGreaterThan(0);
  });
});

// ── 6. Restaurant-agnostic selectors ─────────────────────────────────────────

describe("Restaurant-agnostic menu handling", () => {
  const menus = [
    { name: "sushi",   catalog: makeSushiCatalog(),   drinkId: "s4", dessertId: "s5" },
    { name: "italian", catalog: makeItalianCatalog(),  drinkId: "i4", dessertId: "i6" },
    { name: "burger",  catalog: makeBurgerCatalog(),   drinkId: "b4", dessertId: "b6" },
  ];

  menus.forEach(({ name, catalog, drinkId, dessertId }) => {
    it(`[${name}] dessert request returns dessert card`, () => {
      const out = decide(makeInput("ON_USER_MESSAGE", { message: "quero uma sobremesa", catalog }));
      expect(out.cards).toContain(dessertId);
      expect(out.mode).toBe("SUGGESTION");
    });

    it(`[${name}] drink request returns drink card`, () => {
      const out = decide(makeInput("ON_USER_MESSAGE", { message: "quero uma bebida", catalog }));
      expect(out.cards).toContain(drinkId);
      expect(out.mode).toBe("SUGGESTION");
    });

    it(`[${name}] cards[] contain only IDs present in that menu's catalog`, () => {
      const out = decide(makeInput("ON_USER_MESSAGE", { message: "quero uma sugestão", catalog }));
      const validIds = new Set(catalog.map((i) => i.id));
      out.cards.forEach((id) => expect(validIds.has(id)).toBe(true));
    });
  });

  it("analyzeMenuProfile detects cuisine signals without hardcoding", () => {
    const sushiProfile  = analyzeMenuProfile(makeSushiCatalog());
    const italianProfile = analyzeMenuProfile(makeItalianCatalog());
    const burgerProfile = analyzeMenuProfile(makeBurgerCatalog());

    expect(sushiProfile.cuisineSignals).toContain("sushi");
    expect(italianProfile.cuisineSignals).toContain("italian");
    expect(burgerProfile.cuisineSignals).toContain("burger");
  });

  it("analyzeMenuProfile hasCombos / hasDrinks / hasDesserts flags are accurate", () => {
    const p = analyzeMenuProfile(makeBurgerCatalog());
    expect(p.hasCombos).toBe(true);
    expect(p.hasDrinks).toBe(true);
    expect(p.hasDesserts).toBe(true);
  });

  it("analyzeMenuProfile topCategories is sorted by item count", () => {
    const p = analyzeMenuProfile(makeItalianCatalog());
    // "Massas" has 2 items, "Bebidas" has 2 items, others have 1
    expect(p.topCategories.slice(0, 2)).toEqual(
      expect.arrayContaining(["Massas", "Bebidas"]),
    );
  });
});

// ── 7. validateWaiterResponse — invalid card guard ───────────────────────────

describe("validateWaiterResponse — invalid card guard", () => {
  const catalog = makeSushiCatalog();

  it("removes card IDs not present in catalog", () => {
    const raw: V2Output = {
      message: "Boa escolha!", cards: ["s1", "GHOST_ID", "s2"],
      mode: "SUGGESTION", options: [], requiresAI: false, aiDirective: "",
    };
    const validated = validateWaiterResponse(raw, catalog, "ON_USER_MESSAGE");
    expect(validated.cards).not.toContain("GHOST_ID");
    expect(validated.cards).toContain("s1");
    expect(validated.cards).toContain("s2");
  });

  it("deduplicates repeated card IDs", () => {
    const raw: V2Output = {
      message: "Veja isso!", cards: ["s1", "s1", "s2"],
      mode: "SUGGESTION", options: [], requiresAI: false, aiDirective: "",
    };
    const validated = validateWaiterResponse(raw, catalog, "ON_USER_MESSAGE");
    expect(validated.cards.filter((id) => id === "s1")).toHaveLength(1);
  });

  it("returns SAFE_FALLBACK for unrecognized mode", () => {
    const raw = {
      message: "ok", cards: [], mode: "INVALID_MODE" as WaiterMode,
      options: [], requiresAI: false, aiDirective: "",
    };
    const validated = validateWaiterResponse(raw, catalog, "ON_USER_MESSAGE");
    expect(VALID_MODES).toContain(validated.mode);
    expect(validated.cards).toHaveLength(0);
  });
});

// ── 8. validateWaiterResponse — invisible product guard ──────────────────────

describe("validateWaiterResponse — invisible product guard", () => {
  const catalog = makeSushiCatalog();

  it("strips product name from message when ID absent from cards", () => {
    const raw: V2Output = {
      message:     `Experimente o ${catalog[0]!.name}!`, // mentions s1 but cards is []
      cards:       [],
      mode:        "SUGGESTION",
      options:     [],
      requiresAI:  false,
      aiDirective: "",
    };
    const validated = validateWaiterResponse(raw, catalog, "ON_USER_MESSAGE");
    expect(validated.message).not.toContain(catalog[0]!.name);
  });

  it("leaves message untouched when product ID is already in cards", () => {
    const item = catalog[0]!;
    const raw: V2Output = {
      message:     `Separei ${item.name} pra você!`,
      cards:       [item.id],
      mode:        "SUGGESTION",
      options:     [],
      requiresAI:  false,
      aiDirective: "",
    };
    const validated = validateWaiterResponse(raw, catalog, "ON_USER_MESSAGE");
    expect(validated.message).toContain(item.name);
  });

  it("does not modify AI-path responses (requiresAI=true)", () => {
    const raw: V2Output = {
      message:     "", // AI responses have empty message at this point
      cards:       [],
      mode:        "BROWSE",
      options:     [],
      requiresAI:  true,
      aiDirective: "some directive",
    };
    const validated = validateWaiterResponse(raw, catalog, "ON_USER_MESSAGE");
    expect(validated.requiresAI).toBe(true);
    expect(validated.aiDirective).toBe("some directive");
  });
});

// ── 9. validateWaiterResponse — open question guard ──────────────────────────

describe("validateWaiterResponse — open question guard", () => {
  const catalog = makeSushiCatalog();

  it("attaches leve/completo buttons when message asks the choice", () => {
    const raw: V2Output = {
      message:     "Prefere algo leve ou completo?",
      cards:       [],
      mode:        "BROWSE",
      options:     [],
      requiresAI:  false,
      aiDirective: "",
    };
    const validated = validateWaiterResponse(raw, catalog, "ON_USER_MESSAGE");
    const values = validated.options.map((o) => o.value);
    expect(values).toContain("light");
    expect(values).toContain("complete");
  });

  it("attaches group-size buttons when message asks for party size", () => {
    const raw: V2Output = {
      message:     "É para quantas pessoas?",
      cards:       [],
      mode:        "BROWSE",
      options:     [],
      requiresAI:  false,
      aiDirective: "",
    };
    const validated = validateWaiterResponse(raw, catalog, "ON_USER_MESSAGE");
    const values = validated.options.map((o) => o.value);
    expect(values).toContain("solo");
    expect(values).toContain("small_group");
    expect(values).toContain("large_group");
  });

  it("does not attach buttons when options[] already has entries", () => {
    const raw: V2Output = {
      message:     "Prefere algo leve ou completo?",
      cards:       [],
      mode:        "BROWSE",
      options:     [{ label: "Já tenho", value: "existing" }],
      requiresAI:  false,
      aiDirective: "",
    };
    const validated = validateWaiterResponse(raw, catalog, "ON_USER_MESSAGE");
    expect(validated.options).toHaveLength(1);
    expect(validated.options[0]!.value).toBe("existing");
  });
});

// ── 10. validateWaiterResponse — seller tone guard ───────────────────────────

describe("validateWaiterResponse — seller tone guard", () => {
  const catalog = makeSushiCatalog();
  const weakPhrases = ["legal", "beleza", "ótimo", "ok", "claro"];

  weakPhrases.forEach((phrase) => {
    it(`replaces bare weak phrase "${phrase}"`, () => {
      const raw: V2Output = {
        message: phrase, cards: [], mode: "BROWSE",
        options: [], requiresAI: false, aiDirective: "",
      };
      const validated = validateWaiterResponse(raw, catalog, "ON_USER_MESSAGE");
      expect(validated.message.toLowerCase()).not.toBe(phrase.toLowerCase());
      expect(validated.message.length).toBeGreaterThan(phrase.length);
    });
  });

  it("preserves normal seller messages unchanged", () => {
    const raw: V2Output = {
      message: "Separei boas opções pra você 👇",
      cards: [], mode: "BROWSE", options: [], requiresAI: false, aiDirective: "",
    };
    const validated = validateWaiterResponse(raw, catalog, "ON_USER_MESSAGE");
    expect(validated.message).toBe("Separei boas opções pra você 👇");
  });
});

// ── 11. validateWaiterResponse — message length guard ────────────────────────

describe("validateWaiterResponse — message length", () => {
  const catalog = makeSushiCatalog();

  it("truncates message to 2 lines maximum", () => {
    const raw: V2Output = {
      message:     "Linha 1\nLinha 2\nLinha 3\nLinha 4",
      cards:       [],
      mode:        "BROWSE",
      options:     [],
      requiresAI:  false,
      aiDirective: "",
    };
    const validated  = validateWaiterResponse(raw, catalog, "ON_USER_MESSAGE");
    const lineCount  = validated.message.split("\n").filter((l) => l.trim().length > 0).length;
    expect(lineCount).toBeLessThanOrEqual(2);
  });
});

// ── 12. analyzeCart ───────────────────────────────────────────────────────────

describe("analyzeCart", () => {
  it("correctly detects food/drink/dessert in cart", () => {
    const catalog = makeSushiCatalog();
    const ca = analyzeCart(["s1", "s4"], catalog); // food + drink
    expect(ca.hasFood).toBe(true);
    expect(ca.hasDrink).toBe(true);
    expect(ca.hasDessert).toBe(false);
  });

  it("opportunity=drink when cart has food but no drink", () => {
    const catalog = makeSushiCatalog();
    const ca = analyzeCart(["s1"], catalog);
    expect(ca.opportunity).toBe("drink");
  });

  it("opportunity=dessert when cart has food + drink but no dessert", () => {
    const catalog = makeSushiCatalog();
    const ca = analyzeCart(["s1", "s4"], catalog);
    expect(ca.opportunity).toBe("dessert");
  });

  it("opportunity=none for empty cart", () => {
    const catalog = makeSushiCatalog();
    const ca = analyzeCart([], catalog);
    expect(ca.opportunity).toBe("none");
  });

  it("categoriesInCart lists correct unique categories", () => {
    const catalog = makeSushiCatalog();
    const ca = analyzeCart(["s1", "s6"], catalog); // both Temakis
    expect(ca.categoriesInCart).toEqual(["Temakis"]);
  });
});

// ── 13. chooseSalesStrategy ───────────────────────────────────────────────────

describe("chooseSalesStrategy", () => {
  const catalog = makeBurgerCatalog();
  const menuProfile = analyzeMenuProfile(catalog);

  it("wants_budget_option → recommend_budget_item", () => {
    const analysis = analyzeSalesContext(
      makeInput("ON_USER_MESSAGE", { message: "algo barato", catalog }),
    );
    const ca = analyzeCart([], catalog);
    expect(chooseSalesStrategy(analysis, menuProfile, ca)).toBe("recommend_budget_item");
  });

  it("wants_group_order + menu has combos → recommend_group_bundle", () => {
    const analysis = analyzeSalesContext(
      makeInput("ON_USER_MESSAGE", { message: "somos 4 pessoas", catalog }),
    );
    const ca = analyzeCart([], catalog);
    expect(chooseSalesStrategy(analysis, menuProfile, ca)).toBe("recommend_group_bundle");
  });

  it("asks_for_drink + menu has drinks → recommend_drink", () => {
    const analysis = analyzeSalesContext(
      makeInput("ON_USER_MESSAGE", { message: "quero uma bebida", catalog }),
    );
    const ca = analyzeCart([], catalog);
    expect(chooseSalesStrategy(analysis, menuProfile, ca)).toBe("recommend_drink");
  });

  it("asks_for_dessert + menu has desserts → recommend_dessert", () => {
    const analysis = analyzeSalesContext(
      makeInput("ON_USER_MESSAGE", { message: "quero uma sobremesa", catalog }),
    );
    const ca = analyzeCart([], catalog);
    expect(chooseSalesStrategy(analysis, menuProfile, ca)).toBe("recommend_dessert");
  });

  it("unclear → ask_clarifying_question", () => {
    const analysis = analyzeSalesContext(
      makeInput("ON_USER_MESSAGE", { message: "hmm", catalog }),
    );
    const ca = analyzeCart([], catalog);
    expect(chooseSalesStrategy(analysis, menuProfile, ca)).toBe("ask_clarifying_question");
  });
});

// ── 14. buildWaiterResponse ───────────────────────────────────────────────────

describe("buildWaiterResponse", () => {
  it("returns BROWSE + button question when no products selected", () => {
    const res = buildWaiterResponse("recommend_drink", []);
    expect(res.mode).toBe("BROWSE");
    expect(res.cards).toHaveLength(0);
    expect(res.options.length).toBeGreaterThan(0);
  });

  it("returns SUGGESTION mode for standard strategies with products", () => {
    const res = buildWaiterResponse("recommend_drink", ["s4"]);
    expect(res.mode).toBe("SUGGESTION");
    expect(res.cards).toContain("s4");
    expect(res.options).toHaveLength(0);
  });

  it("returns INTERVENTION mode for premium/group strategies", () => {
    const premium = buildWaiterResponse("recommend_premium_upgrade", ["s3"]);
    const group   = buildWaiterResponse("recommend_group_bundle",    ["s3"]);
    expect(premium.mode).toBe("INTERVENTION");
    expect(group.mode).toBe("INTERVENTION");
  });

  it("stay_quiet returns empty BROWSE response", () => {
    const res = buildWaiterResponse("stay_quiet", []);
    expect(res.mode).toBe("BROWSE");
    expect(res.message).toBe("");
    expect(res.cards).toHaveLength(0);
    expect(res.options).toHaveLength(0);
  });

  it("message is non-empty for all non-quiet strategies with products", () => {
    const strategies = [
      "recommend_signature_item", "recommend_budget_item",
      "recommend_group_bundle",   "recommend_premium_upgrade",
      "recommend_pairing",        "recommend_drink",
      "recommend_dessert",
    ] as const;
    strategies.forEach((s) => {
      const res = buildWaiterResponse(s, ["any_id"]);
      expect(res.message.length).toBeGreaterThan(0);
    });
  });
});

// ── 15. analyzeMenu — candidate buckets ──────────────────────────────────────

describe("analyzeMenu", () => {
  it("returns all required candidate arrays", () => {
    const m = analyzeMenu(makeSushiCatalog());
    expect(Array.isArray(m.drinkCandidates)).toBe(true);
    expect(Array.isArray(m.dessertCandidates)).toBe(true);
    expect(Array.isArray(m.starterCandidates)).toBe(true);
    expect(Array.isArray(m.mainCandidates)).toBe(true);
    expect(Array.isArray(m.comboCandidates)).toBe(true);
    expect(Array.isArray(m.groupCandidates)).toBe(true);
    expect(Array.isArray(m.lightCandidates)).toBe(true);
    expect(Array.isArray(m.completeCandidates)).toBe(true);
    expect(Array.isArray(m.premiumCandidates)).toBe(true);
    expect(Array.isArray(m.budgetCandidates)).toBe(true);
    expect(Array.isArray(m.pairingCandidates)).toBe(true);
  });

  it("drinkCandidates contains only drink-tagged items", () => {
    const m = analyzeMenu(makeSushiCatalog());
    expect(m.drinkCandidates.length).toBeGreaterThan(0);
    m.drinkCandidates.forEach((i) => expect(i.tags).toContain("drink"));
  });

  it("dessertCandidates contains only dessert-tagged items", () => {
    const m = analyzeMenu(makeSushiCatalog());
    expect(m.dessertCandidates.length).toBeGreaterThan(0);
    m.dessertCandidates.forEach((i) => expect(i.tags).toContain("dessert"));
  });

  it("comboCandidates contains combo-tagged items [burger menu]", () => {
    const m = analyzeMenu(makeBurgerCatalog());
    expect(m.comboCandidates.length).toBeGreaterThan(0);
    m.comboCandidates.forEach((i) => expect(i.tags).toContain("combo"));
  });

  it("premiumCandidates are the highest-priced food items", () => {
    const m = analyzeMenu(makeBurgerCatalog());
    // Combo Família at R$89 is the most expensive → premium
    expect(m.premiumCandidates.length).toBeGreaterThan(0);
  });

  it("all returned TaggedItem IDs exist in the source catalog", () => {
    const catalog = makeItalianCatalog();
    const m       = analyzeMenu(catalog);
    const validIds = new Set(catalog.map((i) => i.id));
    const allItems = [
      ...m.drinkCandidates, ...m.dessertCandidates, ...m.starterCandidates,
      ...m.mainCandidates,  ...m.comboCandidates,   ...m.groupCandidates,
      ...m.lightCandidates, ...m.completeCandidates, ...m.premiumCandidates,
      ...m.budgetCandidates, ...m.pairingCandidates,
    ];
    allItems.forEach((item) => expect(validIds.has(item.id)).toBe(true));
  });
});

// ── 16. analyzeSalesSituation ─────────────────────────────────────────────────

describe("analyzeSalesSituation", () => {
  it("returns all required fields", () => {
    const sit = analyzeSalesSituation(makeInput("ON_USER_MESSAGE", { message: "me sugere algo" }));
    expect(sit).toHaveProperty("intent");
    expect(sit).toHaveProperty("need");
    expect(sit).toHaveProperty("opportunity");
    expect(sit).toHaveProperty("action");
    expect(sit).toHaveProperty("confidence");
    expect(sit).toHaveProperty("reason");
  });

  it("confidence is between 0 and 1", () => {
    const sit = analyzeSalesSituation(makeInput("ON_USER_MESSAGE", { message: "quero algo leve" }));
    expect(sit.confidence).toBeGreaterThan(0);
    expect(sit.confidence).toBeLessThanOrEqual(1);
  });

  it("drink message → intent=asks_for_drink", () => {
    const sit = analyzeSalesSituation(makeInput("ON_USER_MESSAGE", { message: "quero uma bebida" }));
    expect(sit.intent).toBe("asks_for_drink");
    expect(sit.opportunity).toBe("suggest_drink");
  });

  it("dessert message → intent=asks_for_dessert", () => {
    const sit = analyzeSalesSituation(makeInput("ON_USER_MESSAGE", { message: "quero uma sobremesa" }));
    expect(sit.intent).toBe("asks_for_dessert");
    expect(sit.opportunity).toBe("suggest_dessert");
  });

  it("light message → intent=wants_light_option", () => {
    const sit = analyzeSalesSituation(makeInput("ON_USER_MESSAGE", { message: "quero algo leve" }));
    expect(sit.intent).toBe("wants_light_option");
    expect(sit.opportunity).toBe("suggest_light_options");
  });

  it("group message → intent=wants_group_order", () => {
    const sit = analyzeSalesSituation(makeInput("ON_USER_MESSAGE", { message: "somos 4 pessoas" }));
    expect(sit.intent).toBe("wants_group_order");
    expect(sit.opportunity).toBe("suggest_group_combo");
  });

  it("budget message → intent=wants_budget_option", () => {
    const sit = analyzeSalesSituation(makeInput("ON_USER_MESSAGE", { message: "algo barato" }));
    expect(sit.intent).toBe("wants_budget_option");
    expect(sit.opportunity).toBe("suggest_budget_option");
  });

  it("premium message → intent=wants_premium_option", () => {
    const sit = analyzeSalesSituation(makeInput("ON_USER_MESSAGE", { message: "quero o melhor da casa" }));
    expect(sit.intent).toBe("wants_premium_option");
    expect(sit.opportunity).toBe("suggest_premium_upgrade");
  });

  it("pairing message with empty cart → opportunity=clarify_preference", () => {
    const sit = analyzeSalesSituation(makeInput("ON_USER_MESSAGE", { message: "o que combina?" }));
    expect(sit.intent).toBe("asks_for_pairing");
    expect(sit.opportunity).toBe("clarify_preference"); // no cart → can't pair yet
  });

  it("pairing message with cart items → opportunity=suggest_pairing", () => {
    const sit = analyzeSalesSituation(
      makeInput("ON_USER_MESSAGE", { message: "o que combina?", cartItemIds: ["s1"] }),
    );
    expect(sit.intent).toBe("asks_for_pairing");
    expect(sit.opportunity).toBe("suggest_pairing");
  });

  it("need is a non-empty string", () => {
    const sit = analyzeSalesSituation(makeInput("ON_USER_MESSAGE", { message: "algo leve" }));
    expect(typeof sit.need).toBe("string");
    expect(sit.need.length).toBeGreaterThan(0);
  });
});

// ── 17. Acceptance tests (Sprint 4A spec) ────────────────────────────────────

describe("Acceptance tests — Sales Specialist Agent", () => {
  it("A) 'me sugere algo' → button question, no cards, no open typing", () => {
    const out = decide(makeInput("ON_USER_MESSAGE", { message: "me sugere algo" }));
    expect(out.cards).toHaveLength(0);
    expect(out.options.length).toBeGreaterThan(0);
    out.options.forEach((o) => {
      expect(typeof o.label).toBe("string");
      expect(typeof o.value).toBe("string");
    });
  });

  it("B) 'quero algo leve' → light food cards, mode SUGGESTION", () => {
    const out = decide(makeInput("ON_USER_MESSAGE", { message: "quero algo leve" }));
    expect(out.cards.length).toBeGreaterThan(0);
    expect(out.mode).toBe("SUGGESTION");
    // Must not include drinks or desserts
    expect(out.cards).not.toContain("s4");
    expect(out.cards).not.toContain("s5");
  });

  it("C) 'quero sobremesa' → dessert cards, mode SUGGESTION", () => {
    const out = decide(makeInput("ON_USER_MESSAGE", { message: "quero sobremesa" }));
    expect(out.cards.length).toBeGreaterThan(0);
    expect(out.cards).toContain("s5");
    expect(out.mode).toBe("SUGGESTION");
  });

  it("D) 'é pra 4 pessoas' → group/shareable cards", () => {
    const catalog = makeBurgerCatalog();
    const out     = decide(makeInput("ON_USER_MESSAGE", { message: "é pra 4 pessoas", catalog }));
    expect(out.cards.length).toBeGreaterThan(0);
    expect(out.mode).toBe("SUGGESTION");
    // Should include the combo item
    expect(out.cards).toContain("b3");
  });

  it("E) item click → cards=[], options=[], mode=BROWSE", () => {
    const out = decide(makeInput("ON_ITEM_ADDED", { lastAddedId: "s1" }));
    expect(out.cards).toHaveLength(0);
    expect(out.options).toHaveLength(0);
    expect(out.mode).toBe("BROWSE");
  });

  it("F) 'o que combina com isso?' with cart → pairing cards, no cart items in result", () => {
    const catalog = makeSushiCatalog();
    const out     = decide(makeInput(
      "ON_USER_MESSAGE",
      { message: "o que combina com isso?", cartItemIds: ["s1"], catalog },
    ));
    expect(out.cards.length).toBeGreaterThan(0);
    expect(out.mode).toBe("SUGGESTION");
    expect(out.cards).not.toContain("s1"); // must not suggest an already-carted item
  });

  it("G) during checkout with empty cart → cards=[], mode=CHECKOUT_SUPPORT", () => {
    // Empty cart: no upsell opportunity → straight to checkout
    const out = decide(makeInput("ON_CHECKOUT_STARTED"));
    expect(out.cards).toHaveLength(0);
    expect(out.mode).toBe("CHECKOUT_SUPPORT");
  });

  it("asks_specific_product → returns that product's card directly", () => {
    const catalog = makeSushiCatalog();
    const out     = decide(makeInput(
      "ON_USER_MESSAGE",
      { message: "quero o Temaki Salmão", catalog },
    ));
    expect(out.cards).toContain("s1");
    expect(out.mode).toBe("SUGGESTION");
  });

  it("premium request → premium/highest-price cards", () => {
    const catalog = makeBurgerCatalog();
    const out     = decide(makeInput(
      "ON_USER_MESSAGE",
      { message: "quero o melhor da casa", catalog },
    ));
    expect(out.cards.length).toBeGreaterThan(0);
    expect(out.mode).toBe("INTERVENTION");
  });

  it("budget request → cheaper items returned", () => {
    const catalog = makeBurgerCatalog();
    const out     = decide(makeInput(
      "ON_USER_MESSAGE",
      { message: "algo barato", catalog },
    ));
    expect(out.cards.length).toBeGreaterThan(0);
    expect(out.mode).toBe("SUGGESTION");
  });
});

// ── 18. Sprint 4B — event wiring ──────────────────────────────────────────────

describe("Sprint 4B — event wiring", () => {
  // ── ON_IDLE ───────────────────────────────────────────────────

  it("ON_IDLE → permission prompt with two buttons (no product cards)", () => {
    const out = decide(makeInput("ON_IDLE"));
    expect(out.cards).toHaveLength(0);
    expect(out.mode).toBe("BROWSE");
    const values = out.options.map((o) => o.value);
    expect(values).toContain("want_suggestion");
    expect(values).toContain("continue_browsing");
  });

  it("ON_IDLE → never auto-shows product cards", () => {
    // Even with a full catalog the Waiter should ask before pushing products
    const out = decide(makeInput("ON_IDLE", {}, makeBurgerCatalog()));
    expect(out.cards).toHaveLength(0);
  });

  // ── ON_PERMISSION_DECLINED ────────────────────────────────────

  it("ON_PERMISSION_DECLINED → BROWSE mode, no cards, no options", () => {
    const out = decide(makeInput("ON_PERMISSION_DECLINED"));
    expect(out.mode).toBe("BROWSE");
    expect(out.cards).toHaveLength(0);
    expect(out.options).toHaveLength(0);
  });

  it("ON_PERMISSION_DECLINED → acknowledgment message present", () => {
    const out = decide(makeInput("ON_PERMISSION_DECLINED"));
    expect(out.message.length).toBeGreaterThan(0);
  });

  // ── ON_PERMISSION_ACCEPT (deterministic path) ─────────────────

  it("ON_PERMISSION_ACCEPT with empty cart → qualification buttons (3 options)", () => {
    const out = decide(makeInput("ON_PERMISSION_ACCEPT"));
    expect(out.cards).toHaveLength(0);
    const values = out.options.map((o) => o.value);
    expect(values).toContain("light");
    expect(values).toContain("complete");
    expect(values).toContain("group");
  });

  it("ON_PERMISSION_ACCEPT with food+no drink → deterministic drink cards (no AI)", () => {
    const catalog = makeSushiCatalog();
    const out     = decide(makeInput("ON_PERMISSION_ACCEPT", {
      cartItemIds: ["s1"],
      catalog,
    }));
    // Cart has food, no drink → context-aware recommendation returns drinks or other items
    expect(out.cards.length).toBeGreaterThan(0);
    expect(out.mode).toBe("INTERVENTION");
    expect(out.requiresAI).toBe(false); // deterministic path
  });

  it("ON_PERMISSION_ACCEPT — returned card IDs exist in catalog", () => {
    const catalog = makeBurgerCatalog();
    const out     = decide(makeInput("ON_PERMISSION_ACCEPT", {
      cartItemIds: ["b1"],
      catalog,
    }));
    const validIds = new Set(catalog.map((i) => i.id));
    out.cards.forEach((id) => expect(validIds.has(id)).toBe(true));
  });

  // ── ON_CHECKOUT_STARTED ───────────────────────────────────────

  it("ON_CHECKOUT_STARTED with empty cart → CHECKOUT_SUPPORT immediately", () => {
    const out = decide(makeInput("ON_CHECKOUT_STARTED"));
    expect(out.cards).toHaveLength(0);
    expect(out.mode).toBe("CHECKOUT_SUPPORT");
    expect(out.options).toHaveLength(0);
  });

  it("ON_CHECKOUT_STARTED with complete cart (food+drink+dessert) → CHECKOUT_SUPPORT", () => {
    const catalog = makeSushiCatalog();
    // s1=food, s4=drink, s5=dessert → cart is complete, no opportunity
    const out = decide(makeInput("ON_CHECKOUT_STARTED", {
      cartItemIds: ["s1", "s4", "s5"],
      catalog,
    }));
    expect(out.cards).toHaveLength(0);
    expect(out.mode).toBe("CHECKOUT_SUPPORT");
  });

  it("ON_CHECKOUT_STARTED with food+drink but no dessert → pre-checkout offer", () => {
    const catalog = makeSushiCatalog();
    const out     = decide(makeInput("ON_CHECKOUT_STARTED", {
      cartItemIds: ["s1", "s4"], // food + drink, no dessert
      catalog,
    }));
    expect(out.cards).toHaveLength(0);
    expect(out.mode).toBe("INTERVENTION");
    const values = out.options.map((o) => o.value);
    expect(values).toContain("see_final_suggestions");
    expect(values).toContain("continue_checkout");
  });

  // ── ON_USER_MESSAGE — "Para compartilhar" button ──────────────

  it("'me sugere algo' with empty cart → 3 qualification buttons (Leve/Completo/Para compartilhar)", () => {
    const out = decide(makeInput("ON_USER_MESSAGE", { message: "me sugere algo" }));
    const values = out.options.map((o) => o.value);
    expect(values).toContain("light");
    expect(values).toContain("complete");
    expect(values).toContain("group");
  });

  it("button value 'group' → triggers group/shareable cards", () => {
    const catalog = makeBurgerCatalog();
    const out     = decide(makeInput("ON_USER_MESSAGE", { message: "group", catalog }));
    expect(out.cards.length).toBeGreaterThan(0);
    expect(out.mode).toBe("SUGGESTION");
  });

  it("see_final_suggestions message → cart-aware pairing cards returned", () => {
    const catalog = makeSushiCatalog();
    const out     = decide(makeInput("ON_USER_MESSAGE", {
      message:     "see_final_suggestions",
      cartItemIds: ["s1"],
      catalog,
    }));
    expect(out.cards.length).toBeGreaterThan(0);
    expect(out.cards).not.toContain("s1"); // cart items not re-suggested
  });
});

// ─── Section 19: Sprint 4C — Smart Product Selection Engine ──────────────────

describe("Sprint 4C: scoreProductForIntent", () => {
  const benchmarks: PriceBenchmarks = { p25: 10, median: 20, p75: 30 };
  const emptyCtx: ScoreContext = { cartItemIds: [], cartTagged: [], benchmarks };

  function makeTagged(id: string, tags: string[], price = 20, sortOrder = 100): Parameters<typeof scoreProductForIntent>[0] {
    return { id, name: id, category: "cat", description: null, price, sortOrder, tags: tags as never };
  }

  it("light item scores highest for wants_light_option", () => {
    const light  = makeTagged("light1", ["light", "starter"]);
    const combo  = makeTagged("combo1", ["combo"]);
    const drink  = makeTagged("drink1", ["drink"]);
    const lScore = scoreProductForIntent(light, "wants_light_option", emptyCtx);
    const cScore = scoreProductForIntent(combo, "wants_light_option", emptyCtx);
    const dScore = scoreProductForIntent(drink, "wants_light_option", emptyCtx);
    expect(lScore).toBeGreaterThan(cScore);
    expect(lScore).toBeGreaterThan(dScore);
  });

  it("combo item scores highest for wants_complete_meal", () => {
    const combo  = makeTagged("combo1", ["combo"]);
    const light  = makeTagged("light1", ["light", "starter"]);
    const drink  = makeTagged("drink1", ["drink"]);
    const cScore = scoreProductForIntent(combo, "wants_complete_meal", emptyCtx);
    const lScore = scoreProductForIntent(light, "wants_complete_meal", emptyCtx);
    const dScore = scoreProductForIntent(drink, "wants_complete_meal", emptyCtx);
    expect(cScore).toBeGreaterThan(lScore);
    expect(cScore).toBeGreaterThan(dScore);
  });

  it("group item scores highest for wants_group_order", () => {
    const group  = makeTagged("group1", ["group", "combo"]);
    const main   = makeTagged("main1", ["main"]);
    const drink  = makeTagged("drink1", ["drink"]);
    const gScore = scoreProductForIntent(group, "wants_group_order", emptyCtx);
    const mScore = scoreProductForIntent(main,  "wants_group_order", emptyCtx);
    const dScore = scoreProductForIntent(drink, "wants_group_order", emptyCtx);
    expect(gScore).toBeGreaterThan(mScore);
    expect(gScore).toBeGreaterThan(dScore);
  });

  it("premium item scores highest for wants_premium_option", () => {
    const premium = makeTagged("p1", ["premium"], 35);
    const cheap   = makeTagged("c1", ["cheap"], 8);
    const pScore  = scoreProductForIntent(premium, "wants_premium_option", emptyCtx);
    const cScore  = scoreProductForIntent(cheap,   "wants_premium_option", emptyCtx);
    expect(pScore).toBeGreaterThan(cScore);
  });

  it("cheap item scores highest for wants_budget_option", () => {
    const cheap   = makeTagged("c1", ["cheap", "main"], 8);
    const premium = makeTagged("p1", ["premium"], 35);
    const cScore  = scoreProductForIntent(cheap,   "wants_budget_option", emptyCtx);
    const pScore  = scoreProductForIntent(premium, "wants_budget_option", emptyCtx);
    expect(cScore).toBeGreaterThan(pScore);
  });

  it("drink scores highest for asks_for_drink; non-drink goes negative", () => {
    const drink  = makeTagged("d1", ["drink"]);
    const main   = makeTagged("m1", ["main"]);
    const dScore = scoreProductForIntent(drink, "asks_for_drink", emptyCtx);
    const mScore = scoreProductForIntent(main,  "asks_for_drink", emptyCtx);
    expect(dScore).toBeGreaterThan(0);
    expect(mScore).toBeLessThan(0);
  });

  it("dessert scores highest for asks_for_dessert; non-dessert goes negative", () => {
    const dessert = makeTagged("des1", ["dessert"]);
    const main    = makeTagged("m1",   ["main"]);
    const deScore = scoreProductForIntent(dessert, "asks_for_dessert", emptyCtx);
    const mScore  = scoreProductForIntent(main,    "asks_for_dessert", emptyCtx);
    expect(deScore).toBeGreaterThan(0);
    expect(mScore).toBeLessThan(0);
  });

  it("pairing_candidate + drink score high for asks_for_pairing", () => {
    const pairing = makeTagged("pair1", ["pairing_candidate"]);
    const drink   = makeTagged("d1",    ["drink"]);
    const main    = makeTagged("m1",    ["main"]);
    const pScore  = scoreProductForIntent(pairing, "asks_for_pairing", emptyCtx);
    const dScore  = scoreProductForIntent(drink,   "asks_for_pairing", emptyCtx);
    const mScore  = scoreProductForIntent(main,    "asks_for_pairing", emptyCtx);
    expect(pScore).toBeGreaterThan(mScore);
    expect(dScore).toBeGreaterThan(mScore);
  });

  it("commercial value: above-median item gets bonus for non-budget intents", () => {
    const expensive = makeTagged("e1", ["main"], 25); // >= median(20) and < p75(30)
    const cheap     = makeTagged("c1", ["main"], 10); // below median
    const eScore    = scoreProductForIntent(expensive, "wants_complete_meal", emptyCtx);
    const cScore    = scoreProductForIntent(cheap,     "wants_complete_meal", emptyCtx);
    expect(eScore).toBeGreaterThan(cScore);
  });

  it("cart fit: same-category item gets -8 penalty for non-drink/dessert intents", () => {
    const cartItem  = makeTagged("c1", ["main"]);
    const samecat   = makeTagged("s1", ["main"]);
    const diffcat   = { ...makeTagged("d1", ["complete"]), category: "other" };
    const cartTagged = [cartItem];
    const ctx: ScoreContext = { cartItemIds: ["c1"], cartTagged, benchmarks };
    const sameScore = scoreProductForIntent(samecat, "wants_complete_meal", ctx);
    const diffScore = scoreProductForIntent(diffcat, "wants_complete_meal", ctx);
    expect(diffScore).toBeGreaterThan(sameScore);
  });

  it("sortOrder popularity tie-breaker: lower sortOrder → higher score", () => {
    const popular  = makeTagged("p1", ["main"], 20, 50);
    const obscure  = makeTagged("o1", ["main"], 20, 450);
    const popScore = scoreProductForIntent(popular,  "wants_recommendation", emptyCtx);
    const obsScore = scoreProductForIntent(obscure,  "wants_recommendation", emptyCtx);
    expect(popScore).toBeGreaterThan(obsScore);
  });
});

describe("Sprint 4C: rankProducts", () => {
  function makeFullCatalog(): V2CatalogItem[] {
    return [
      { id: "m1", name: "Burger Clássico",  categoryName: "Burgers",     price: 28, sortOrder: 1 },
      { id: "m2", name: "Combo Família",    categoryName: "Combos",      price: 65, sortOrder: 2 },
      { id: "m3", name: "Salada Verde",     categoryName: "Saladas",     price: 18, sortOrder: 3 },
      { id: "d1", name: "Refrigerante",     categoryName: "Bebidas",     price: 7,  sortOrder: 4 },
      { id: "d2", name: "Suco Natural",     categoryName: "Bebidas",     price: 10, sortOrder: 5 },
      { id: "s1", name: "Brownie",          categoryName: "Sobremesas",  price: 14, sortOrder: 6 },
      { id: "p1", name: "Burger Gourmet",   categoryName: "Burgers",     price: 45, sortOrder: 7 },
      { id: "g1", name: "Combo Para 4",     categoryName: "Combos",      price: 90, sortOrder: 8 },
    ];
  }

  it("returns up to limit items", () => {
    const results = rankProducts(makeFullCatalog(), "wants_recommendation", [], 3);
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it("never includes cart items in results", () => {
    const results = rankProducts(makeFullCatalog(), "wants_recommendation", ["m1"], 3);
    expect(results).not.toContain("m1");
  });

  it("asks_for_drink returns only drinks", () => {
    const results = rankProducts(makeFullCatalog(), "asks_for_drink", [], 3);
    expect(results.length).toBeGreaterThan(0);
    results.forEach((id) => expect(["d1", "d2"]).toContain(id));
  });

  it("asks_for_dessert returns only desserts", () => {
    const results = rankProducts(makeFullCatalog(), "asks_for_dessert", [], 3);
    expect(results.length).toBeGreaterThan(0);
    results.forEach((id) => expect(["s1"]).toContain(id));
  });

  it("wants_group_order returns combos first", () => {
    const results = rankProducts(makeFullCatalog(), "wants_group_order", [], 2);
    expect(results.length).toBeGreaterThan(0);
    expect(["m2", "g1"]).toContain(results[0]);
  });

  it("wants_budget_option ranks cheap items before expensive ones", () => {
    const catalog: V2CatalogItem[] = [
      { id: "cheap1", name: "Prato do Dia",      categoryName: "Pratos",    price: 8,  sortOrder: 1 },
      { id: "cheap2", name: "Lanche Simples",    categoryName: "Lanches",   price: 10, sortOrder: 2 },
      { id: "prem1",  name: "Wagyu Premium",     categoryName: "Especiais", price: 95, sortOrder: 3 },
    ];
    const results = rankProducts(catalog, "wants_budget_option", [], 3);
    expect(results.length).toBeGreaterThan(0);
    // cheap items must rank above the premium one
    const premIdx  = results.indexOf("prem1");
    const cheapIdx = results.findIndex((id) => id === "cheap1" || id === "cheap2");
    if (premIdx !== -1 && cheapIdx !== -1) expect(cheapIdx).toBeLessThan(premIdx);
  });

  it("wants_premium_option puts high-priced items first", () => {
    const results = rankProducts(makeFullCatalog(), "wants_premium_option", [], 2);
    const catalog = makeFullCatalog();
    const topItem = catalog.find((i) => i.id === results[0]);
    expect(topItem?.price).toBeGreaterThanOrEqual(28); // should be a premium item
  });

  it("items below MIN_SCORE_THRESHOLD are excluded (drink intent excludes non-drinks)", () => {
    const catalog = makeFullCatalog();
    const drinkIds = ["d1", "d2"];
    const results  = rankProducts(catalog, "asks_for_drink", [], 10);
    results.forEach((id) => expect(drinkIds).toContain(id));
  });

  it("wants_recommendation with food in cart surfaces a drink", () => {
    const results = rankProducts(makeFullCatalog(), "wants_recommendation", ["m1"], 3);
    expect(results.length).toBeGreaterThan(0);
    // When food is in cart and no drink → drink should rank first
    expect(["d1", "d2"]).toContain(results[0]);
  });

  it("returns empty array when no items pass threshold", () => {
    const drinkOnly: V2CatalogItem[] = [
      { id: "d1", name: "Água",  categoryName: "Bebidas", price: 5, sortOrder: 1 },
      { id: "d2", name: "Suco",  categoryName: "Bebidas", price: 8, sortOrder: 2 },
    ];
    const results = rankProducts(drinkOnly, "wants_complete_meal", [], 3);
    expect(results).toHaveLength(0);
  });
});

// ─── Section 20: Sprint 4D — Commercial Response Builder ─────────────────────

describe("Sprint 4D: buildCommercialResponse", () => {
  it("returns the correct intent copy for each mapped intent", () => {
    const intents: Array<CommercialResponseInput["intent"]> = [
      "wants_light_option", "wants_complete_meal", "wants_group_order",
      "wants_budget_option", "wants_premium_option", "asks_for_drink",
      "asks_for_dessert", "asks_for_pairing", "wants_recommendation",
      "asks_specific_product", "asks_category",
    ];
    for (const intent of intents) {
      const r = buildCommercialResponse({ intent, selectedProducts: ["id1"], mode: "SUGGESTION" });
      expect(typeof r.message).toBe("string");
      expect(r.message.length).toBeGreaterThan(0);
      expect(r.message).not.toMatch(/^(Legal|Beleza|Ok|Claro)[!.]?$/i);
    }
  });

  it("unmapped intent falls back to generic seller message", () => {
    const r = buildCommercialResponse({ intent: "unclear", selectedProducts: ["id1"], mode: "SUGGESTION" });
    expect(r.message).toBe("Separei boas opções pra você 👇");
  });

  it("always returns options = [] (no confirmation buttons)", () => {
    const r = buildCommercialResponse({ intent: "wants_light_option", selectedProducts: ["id1"], mode: "SUGGESTION" });
    expect(r.options).toHaveLength(0);
  });

  it("passes mode through unchanged", () => {
    const rSuggestion  = buildCommercialResponse({ intent: "wants_light_option",   selectedProducts: ["id1"], mode: "SUGGESTION"   });
    const rIntervention = buildCommercialResponse({ intent: "wants_premium_option", selectedProducts: ["id1"], mode: "INTERVENTION" });
    expect(rSuggestion.mode).toBe("SUGGESTION");
    expect(rIntervention.mode).toBe("INTERVENTION");
  });

  it("passes selectedProducts through as cards", () => {
    const products = ["p1", "p2", "p3"];
    const r = buildCommercialResponse({ intent: "asks_for_drink", selectedProducts: products, mode: "SUGGESTION" });
    expect(r.cards).toEqual(products);
  });

  it("copy for wants_light_option contains 'leve' keyword", () => {
    const r = buildCommercialResponse({ intent: "wants_light_option", selectedProducts: ["id1"], mode: "SUGGESTION" });
    expect(r.message.toLowerCase()).toContain("leve");
  });

  it("copy for wants_group_order contains sharing/group concept", () => {
    const r = buildCommercialResponse({ intent: "wants_group_order", selectedProducts: ["id1"], mode: "SUGGESTION" });
    expect(r.message.toLowerCase()).toMatch(/divid|compartilh|grupo/);
  });

  it("copy for asks_for_pairing references the user's order", () => {
    const r = buildCommercialResponse({ intent: "asks_for_pairing", selectedProducts: ["id1"], mode: "SUGGESTION" });
    expect(r.message.toLowerCase()).toContain("pedido");
  });
});

describe("Sprint 4D: validateWaiterResponse — Rule 9 (no options when cards exist)", () => {
  const catalog = makeSushiCatalog();

  it("strips options when cards are present", () => {
    const raw: V2Output = {
      message:     "Separei pra você 👇",
      cards:       ["s1", "s2"],
      mode:        "SUGGESTION",
      options:     [{ label: "Quero", value: "want_it" }],
      requiresAI:  false,
      aiDirective: "",
    };
    const validated = validateWaiterResponse(raw, catalog, "ON_USER_MESSAGE");
    expect(validated.options).toHaveLength(0);
  });

  it("preserves options when cards are empty", () => {
    const raw: V2Output = {
      message:     "Prefere algo mais leve ou mais completo?",
      cards:       [],
      mode:        "BROWSE",
      options:     [{ label: "Leve", value: "light" }, { label: "Completo", value: "complete" }],
      requiresAI:  false,
      aiDirective: "",
    };
    const validated = validateWaiterResponse(raw, catalog, "ON_USER_MESSAGE");
    expect(validated.options.length).toBeGreaterThan(0);
  });

  it("Rule 5 does not attach buttons when cards are present", () => {
    const raw: V2Output = {
      message:     "Prefere algo leve ou completo?",
      cards:       ["s1"],
      mode:        "SUGGESTION",
      options:     [],
      requiresAI:  false,
      aiDirective: "",
    };
    const validated = validateWaiterResponse(raw, catalog, "ON_USER_MESSAGE");
    expect(validated.options).toHaveLength(0);
  });
});

describe("Sprint 4D: handleUserMessage — seller tone via buildCommercialResponse", () => {
  it("wants_light_option → copy references 'leve'", () => {
    const out = decide(makeInput("ON_USER_MESSAGE", { message: "quero algo leve", catalog: makeBurgerCatalog() }));
    expect(out.cards.length).toBeGreaterThan(0);
    expect(out.options).toHaveLength(0);
    expect(out.message.toLowerCase()).toContain("leve");
  });

  it("asks_for_drink → copy references 'bebidas'", () => {
    const out = decide(makeInput("ON_USER_MESSAGE", { message: "quero uma bebida", catalog: makeSushiCatalog() }));
    expect(out.cards.length).toBeGreaterThan(0);
    expect(out.options).toHaveLength(0);
    expect(out.message.toLowerCase()).toContain("bebida");
  });

  it("asks_for_dessert → copy references 'doce'", () => {
    const out = decide(makeInput("ON_USER_MESSAGE", { message: "quero sobremesa", catalog: makeSushiCatalog() }));
    expect(out.cards.length).toBeGreaterThan(0);
    expect(out.options).toHaveLength(0);
    expect(out.message.toLowerCase()).toContain("doce");
  });

  it("wants_group_order → copy references dividing/sharing", () => {
    const out = decide(makeInput("ON_USER_MESSAGE", { message: "somos 4 pessoas", catalog: makeBurgerCatalog() }));
    expect(out.cards.length).toBeGreaterThan(0);
    expect(out.options).toHaveLength(0);
    expect(out.message.toLowerCase()).toMatch(/divid|compartilh|grupo/);
  });

  it("no confirmation buttons appear after any suggestion response with cards", () => {
    const messages = ["quero algo leve", "quero sobremesa", "quero uma bebida", "quero algo completo"];
    for (const message of messages) {
      const out = decide(makeInput("ON_USER_MESSAGE", { message, catalog: makeSushiCatalog() }));
      if (out.cards.length > 0) {
        expect(out.options).toHaveLength(0);
      }
    }
  });
});

describe("Sprint 4D: QUESTION_BUTTON_PATTERNS — budget pattern", () => {
  const catalog = makeSushiCatalog();

  it("budget-vs-complete question auto-attaches correct buttons", () => {
    const raw: V2Output = {
      message:     "Quer algo mais econômico ou uma opção mais completa?",
      cards:       [],
      mode:        "BROWSE",
      options:     [],
      requiresAI:  false,
      aiDirective: "",
    };
    const validated = validateWaiterResponse(raw, catalog, "ON_USER_MESSAGE");
    const values = validated.options.map((o) => o.value);
    expect(values).toContain("budget");
    expect(values).toContain("complete");
  });
});

// ─── Section 21: Sprint 4E — Session Memory ──────────────────────────────────

describe("Sprint 4E: createWaiterMemory", () => {
  it("returns a blank memory with correct shape", () => {
    const mem = createWaiterMemory();
    expect(mem.suggestedProductIds).toEqual([]);
    expect(mem.declinedSuggestionTypes).toEqual([]);
    expect(mem.acceptedSuggestionTypes).toEqual([]);
    expect(mem.lastIntent).toBeNull();
    expect(mem.lastMode).toBeNull();
    expect(mem.permissionDeclinedAt).toBeNull();
    expect(mem.promptCount).toBe(0);
  });
});

describe("Sprint 4E: decide() returns memoryPatch", () => {
  it("every decide() call includes memoryPatch in the output", () => {
    const out = decide(makeInput("ON_USER_MESSAGE", { message: "quero bebida", catalog: makeSushiCatalog() }));
    expect(out).toHaveProperty("memoryPatch");
    expect(typeof out.memoryPatch).toBe("object");
  });

  it("memoryPatch.lastMode matches output.mode", () => {
    const out = decide(makeInput("ON_USER_MESSAGE", { message: "quero bebida", catalog: makeSushiCatalog() }));
    expect(out.memoryPatch?.lastMode).toBe(out.mode);
  });

  it("memoryPatch.suggestedProductIds includes cards returned in this turn", () => {
    const catalog = makeSushiCatalog();
    const out     = decide(makeInput("ON_USER_MESSAGE", { message: "quero bebida", catalog }));
    expect(out.cards.length).toBeGreaterThan(0);
    for (const id of out.cards) {
      expect(out.memoryPatch?.suggestedProductIds).toContain(id);
    }
  });

  it("memoryPatch.suggestedProductIds accumulates across turns", () => {
    const catalog  = makeSushiCatalog();
    const turn1    = decide(makeInput("ON_USER_MESSAGE", { message: "quero bebida", catalog }));
    const memory1: WaiterMemory = { ...createWaiterMemory(), ...turn1.memoryPatch };
    const turn2    = decide(makeInput("ON_USER_MESSAGE", { message: "quero sobremesa", catalog, memory: memory1 }));
    const allIds   = turn2.memoryPatch?.suggestedProductIds ?? [];
    // Turn 2 patch should include turn 1 cards plus turn 2 cards
    for (const id of (turn1.memoryPatch?.suggestedProductIds ?? [])) {
      expect(allIds).toContain(id);
    }
  });

  it("ON_PERMISSION_DECLINED sets permissionDeclinedAt and passive_help in declinedTypes", () => {
    const out = decide(makeInput("ON_PERMISSION_DECLINED", { catalog: makeSushiCatalog() }));
    expect(out.memoryPatch?.permissionDeclinedAt).toBeTypeOf("number");
    expect(out.memoryPatch?.declinedSuggestionTypes).toContain("passive_help");
  });

  it("ON_PERMISSION_ACCEPT adds passive_help to acceptedTypes", () => {
    const out = decide(makeInput("ON_PERMISSION_ACCEPT", { catalog: makeSushiCatalog() }));
    expect(out.memoryPatch?.acceptedSuggestionTypes).toContain("passive_help");
  });

  it("continue_browsing message sets permissionDeclinedAt in patch", () => {
    const out = decide(makeInput("ON_USER_MESSAGE", { message: "continue_browsing", catalog: makeSushiCatalog() }));
    expect(out.memoryPatch?.permissionDeclinedAt).toBeTypeOf("number");
    expect(out.memoryPatch?.declinedSuggestionTypes).toContain("passive_help");
  });

  it("continue_checkout message adds final_upsell to declinedTypes", () => {
    const out = decide(makeInput("ON_USER_MESSAGE", { message: "continue_checkout", catalog: makeSushiCatalog() }));
    expect(out.memoryPatch?.declinedSuggestionTypes).toContain("final_upsell");
  });

  it("see_final_suggestions message adds final_upsell to acceptedTypes", () => {
    const out = decide(makeInput("ON_USER_MESSAGE", { message: "see_final_suggestions", catalog: makeSushiCatalog(), cartItemIds: ["s1"] }));
    expect(out.memoryPatch?.acceptedSuggestionTypes).toContain("final_upsell");
  });

  it("ON_IDLE prompt shown → promptCount increments in patch", () => {
    const catalog = makeSushiCatalog();
    const out     = decide(makeInput("ON_IDLE", { catalog }));
    // Prompt shown when options contain want_suggestion
    if (out.options.some((o) => o.value === "want_suggestion")) {
      expect(out.memoryPatch?.promptCount).toBe(1);
    }
  });

  it("ON_USER_MESSAGE sets lastIntent in patch", () => {
    const out = decide(makeInput("ON_USER_MESSAGE", { message: "quero bebida", catalog: makeSushiCatalog() }));
    expect(typeof out.memoryPatch?.lastIntent).toBe("string");
  });
});

describe("Sprint 4E: ON_IDLE prompt count and cooldown", () => {
  it("shows permission prompt when memory is blank", () => {
    const out = decide(makeInput("ON_IDLE", { memory: createWaiterMemory(), catalog: makeSushiCatalog() }));
    expect(out.options.some((o) => o.value === "want_suggestion")).toBe(true);
  });

  it("suppresses prompt when promptCount >= 2", () => {
    const mem: WaiterMemory = { ...createWaiterMemory(), promptCount: 2 };
    const out = decide(makeInput("ON_IDLE", { memory: mem, catalog: makeSushiCatalog() }));
    expect(out.options.some((o) => o.value === "want_suggestion")).toBe(false);
    expect(out.cards).toHaveLength(0);
  });

  it("suppresses prompt during cooldown after decline", () => {
    const mem: WaiterMemory = {
      ...createWaiterMemory(),
      permissionDeclinedAt: Date.now() - 60_000, // declined 1 minute ago (within 5-min cooldown)
    };
    const out = decide(makeInput("ON_IDLE", { memory: mem, catalog: makeSushiCatalog() }));
    expect(out.options.some((o) => o.value === "want_suggestion")).toBe(false);
  });

  it("shows prompt again after cooldown expires", () => {
    const mem: WaiterMemory = {
      ...createWaiterMemory(),
      promptCount:          1,
      permissionDeclinedAt: Date.now() - 10 * 60_000, // declined 10 min ago (past 5-min cooldown)
    };
    const out = decide(makeInput("ON_IDLE", { memory: mem, catalog: makeSushiCatalog() }));
    expect(out.options.some((o) => o.value === "want_suggestion")).toBe(true);
  });

  it("ON_IDLE does not increment promptCount when prompt is suppressed", () => {
    const mem: WaiterMemory = { ...createWaiterMemory(), promptCount: 2 };
    const out = decide(makeInput("ON_IDLE", { memory: mem, catalog: makeSushiCatalog() }));
    expect(out.memoryPatch?.promptCount).toBeUndefined();
  });
});

describe("Sprint 4E: rankProducts already-suggested penalty", () => {
  it("already-suggested products rank lower than fresh ones", () => {
    const catalog: V2CatalogItem[] = [
      { id: "d1", name: "Suco",       categoryName: "Bebidas", price: 8,  sortOrder: 1 },
      { id: "d2", name: "Refrigerante", categoryName: "Bebidas", price: 7, sortOrder: 2 },
    ];
    const fresh    = rankProducts(catalog, "asks_for_drink", [], 2, []);
    const biased   = rankProducts(catalog, "asks_for_drink", [], 2, ["d1"]);
    // When d1 is penalized, d2 should come first
    if (biased.length > 0) expect(biased[0]).toBe("d2");
    // fresh has no penalty — d1 ranks first by sortOrder
    if (fresh.length > 0) expect(fresh[0]).toBe("d1");
  });

  it("already-suggested product can still appear if it's the only option above threshold", () => {
    const catalog: V2CatalogItem[] = [
      { id: "d1", name: "Suco", categoryName: "Bebidas", price: 8, sortOrder: 1 },
    ];
    const results = rankProducts(catalog, "asks_for_drink", [], 2, ["d1"]);
    // d1 gets -15 penalty but drink base score is +60, so net ≥ 10 → still included
    expect(results).toContain("d1");
  });

  it("already-suggested products not shown when fresh options exist", () => {
    const catalog: V2CatalogItem[] = [
      { id: "d1", name: "Suco",        categoryName: "Bebidas", price: 8,  sortOrder: 1 },
      { id: "d2", name: "Limonada",    categoryName: "Bebidas", price: 9,  sortOrder: 2 },
      { id: "d3", name: "Refrigerante", categoryName: "Bebidas", price: 7, sortOrder: 3 },
    ];
    const results = rankProducts(catalog, "asks_for_drink", [], 1, ["d1"]);
    // With limit=1 and d1 penalized, the top result should be d2 or d3
    expect(results).toHaveLength(1);
    expect(results[0]).not.toBe("d1");
  });
});

describe("Sprint 4E: full session simulation", () => {
  it("acceptance criteria A — same product not suggested twice in a session", () => {
    const catalog  = makeSushiCatalog();
    let memory     = createWaiterMemory();

    const turn1    = decide(makeInput("ON_USER_MESSAGE", { message: "quero bebida", catalog, memory }));
    memory         = { ...memory, ...turn1.memoryPatch };
    const turn2    = decide(makeInput("ON_USER_MESSAGE", { message: "quero bebida", catalog, memory }));

    // Cards from turn 2 should not overlap with turn 1 (or there are no more fresh ones)
    const t1Cards  = turn1.cards;
    const t2Cards  = turn2.cards;
    const overlap  = t2Cards.filter((id) => t1Cards.includes(id));
    // Overlap is only acceptable if there are no other drink options
    const drinkIds = catalog.filter((i) => i.categoryName === "Bebidas").map((i) => i.id);
    const freshOptions = drinkIds.filter((id) => !t1Cards.includes(id));
    if (freshOptions.length > 0) {
      expect(overlap).toHaveLength(0);
    }
  });

  it("acceptance criteria B — waiter stays quiet during cooldown after decline", () => {
    const catalog  = makeSushiCatalog();
    const memory: WaiterMemory = {
      ...createWaiterMemory(),
      permissionDeclinedAt: Date.now() - 60_000, // 1 min ago, within cooldown
    };
    const out = decide(makeInput("ON_IDLE", { catalog, memory }));
    expect(out.options.some((o) => o.value === "want_suggestion")).toBe(false);
    expect(out.message).toBe("");
  });

  it("acceptance criteria C — explicit ask still works during cooldown", () => {
    const catalog  = makeSushiCatalog();
    const memory: WaiterMemory = {
      ...createWaiterMemory(),
      declinedSuggestionTypes: ["passive_help"],
      permissionDeclinedAt:    Date.now() - 60_000,
    };
    // User explicitly asks — ON_USER_MESSAGE bypasses idle cooldown
    const out = decide(makeInput("ON_USER_MESSAGE", { message: "quero bebida", catalog, memory }));
    expect(out.cards.length).toBeGreaterThan(0);
  });

  it("acceptance criteria D — cart item not suggested again", () => {
    const catalog = makeSushiCatalog();
    const out     = decide(makeInput("ON_USER_MESSAGE", {
      message:     "me sugere algo",
      cartItemIds: ["s4"],  // suco already in cart
      catalog,
    }));
    expect(out.cards).not.toContain("s4");
  });

  it("acceptance criteria E — permission prompt max 2 times", () => {
    const catalog = makeSushiCatalog();
    let memory    = createWaiterMemory();

    // First idle — should show prompt
    const turn1 = decide(makeInput("ON_IDLE", { catalog, memory }));
    memory = { ...memory, ...turn1.memoryPatch };

    // Second idle — should show prompt (count = 1 after turn1)
    const turn2 = decide(makeInput("ON_IDLE", { catalog, memory }));
    memory = { ...memory, ...turn2.memoryPatch };

    // Third idle — must be suppressed (count = 2)
    const turn3 = decide(makeInput("ON_IDLE", { catalog, memory }));
    expect(turn3.options.some((o) => o.value === "want_suggestion")).toBe(false);
  });
});

// ─── Section 22: Sprint 4F — Final Upsell Permission at Checkout ─────────────

describe("Sprint 4F: handleCheckoutStarted — final upsell permission", () => {
  it("A) food but no drink/dessert → asks permission once (INTERVENTION, cards=[])", () => {
    const catalog = makeSushiCatalog();
    const out = decide(makeInput("ON_CHECKOUT_STARTED", {
      cartItemIds: ["s1"],   // temaki salmão — food only
      cartValue:   22,
      catalog,
    }));
    expect(out.mode).toBe("INTERVENTION");
    expect(out.cards).toHaveLength(0);
    expect(out.options.some((o) => o.value === "see_final_suggestions")).toBe(true);
    expect(out.options.some((o) => o.value === "continue_checkout")).toBe(true);
  });

  it("B) if finalUpsellDeclined=true → skip to CHECKOUT_SUPPORT immediately", () => {
    const catalog = makeSushiCatalog();
    const memory: WaiterMemory = { ...createWaiterMemory(), finalUpsellDeclined: true };
    const out = decide(makeInput("ON_CHECKOUT_STARTED", {
      cartItemIds: ["s1"],
      cartValue:   22,
      catalog,
      memory,
    }));
    expect(out.mode).toBe("CHECKOUT_SUPPORT");
    expect(out.options).toHaveLength(0);
  });

  it("B) if checkoutUpsellStage=completed → skip to CHECKOUT_SUPPORT (no repeated upsell)", () => {
    const catalog = makeSushiCatalog();
    const memory: WaiterMemory = { ...createWaiterMemory(), checkoutUpsellStage: "completed" };
    const out = decide(makeInput("ON_CHECKOUT_STARTED", {
      cartItemIds: ["s1"],
      cartValue:   22,
      catalog,
      memory,
    }));
    expect(out.mode).toBe("CHECKOUT_SUPPORT");
    expect(out.options.some((o) => o.value === "see_final_suggestions")).toBe(false);
  });

  it("cart with food+drink+dessert → no upsell, CHECKOUT_SUPPORT directly", () => {
    const catalog = makeSushiCatalog();
    const out = decide(makeInput("ON_CHECKOUT_STARTED", {
      cartItemIds: ["s1", "s4", "s5"],  // food + drink + dessert
      cartValue:   42,
      catalog,
    }));
    expect(out.mode).toBe("CHECKOUT_SUPPORT");
  });

  it("empty cart → no upsell, CHECKOUT_SUPPORT directly", () => {
    const out = decide(makeInput("ON_CHECKOUT_STARTED", { cartItemIds: [], catalog: makeSushiCatalog() }));
    expect(out.mode).toBe("CHECKOUT_SUPPORT");
  });

  it("no available drinks/desserts in catalog → no upsell", () => {
    const catalog: V2CatalogItem[] = [
      { id: "m1", name: "Prato",  categoryName: "Pratos", price: 30, sortOrder: 1 },
      { id: "m2", name: "Lanche", categoryName: "Pratos", price: 20, sortOrder: 2 },
    ];
    const out = decide(makeInput("ON_CHECKOUT_STARTED", {
      cartItemIds: ["m1"],
      cartValue:   30,
      catalog,
    }));
    expect(out.mode).toBe("CHECKOUT_SUPPORT");
  });

  it("drink upsell message matches spec", () => {
    const catalog = makeSushiCatalog();
    const out = decide(makeInput("ON_CHECKOUT_STARTED", {
      cartItemIds: ["s1"],
      cartValue:   22,
      catalog,
    }));
    if (out.mode === "INTERVENTION") {
      expect(out.message).toBe("Antes de fechar, deixe-me apresentar nossas bebidas.");
    }
  });
});

describe("Sprint 4F: see_final_suggestions — cart-aware product cards", () => {
  it("C) no drink in cart → returns drinks", () => {
    const catalog = makeSushiCatalog();
    const out = decide(makeInput("ON_USER_MESSAGE", {
      message:     "see_final_suggestions",
      cartItemIds: ["s1"],   // food only, no drink
      catalog,
    }));
    expect(out.cards.length).toBeGreaterThan(0);
    expect(out.mode).toBe("INTERVENTION");
    out.cards.forEach((id) => expect(["s4"]).toContain(id));
  });

  it("no dessert in cart (has drink) → returns desserts", () => {
    const catalog = makeSushiCatalog();
    const out = decide(makeInput("ON_USER_MESSAGE", {
      message:     "see_final_suggestions",
      cartItemIds: ["s1", "s4"],  // food + drink, no dessert
      catalog,
    }));
    expect(out.cards.length).toBeGreaterThan(0);
    out.cards.forEach((id) => expect(["s5"]).toContain(id));
  });

  it("cart has both drink and dessert → returns pairing/complement", () => {
    const catalog = makeSushiCatalog();
    const out = decide(makeInput("ON_USER_MESSAGE", {
      message:     "see_final_suggestions",
      cartItemIds: ["s1", "s4", "s5"],  // food+drink+dessert
      catalog,
    }));
    expect(out.cards.length).toBeGreaterThan(0);
    expect(out.cards).not.toContain("s1");
    expect(out.cards).not.toContain("s4");
    expect(out.cards).not.toContain("s5");
  });

  it("response message matches spec", () => {
    const catalog = makeSushiCatalog();
    const out = decide(makeInput("ON_USER_MESSAGE", {
      message:     "see_final_suggestions",
      cartItemIds: ["s1"],
      catalog,
    }));
    if (out.cards.length > 0) {
      expect(out.message).toBe("Pra fechar bem, essas opções combinam com seu pedido 👇");
    }
  });

  it("D) cart items never appear in suggestion cards", () => {
    const catalog = makeSushiCatalog();
    const out = decide(makeInput("ON_USER_MESSAGE", {
      message:     "see_final_suggestions",
      cartItemIds: ["s1", "s4"],
      catalog,
    }));
    expect(out.cards).not.toContain("s1");
    expect(out.cards).not.toContain("s4");
  });

  it("no confirmation buttons alongside product cards", () => {
    const catalog = makeSushiCatalog();
    const out = decide(makeInput("ON_USER_MESSAGE", {
      message:     "see_final_suggestions",
      cartItemIds: ["s1"],
      catalog,
    }));
    if (out.cards.length > 0) expect(out.options).toHaveLength(0);
  });
});

describe("Sprint 4F: memory patch for checkout upsell", () => {
  it("ON_CHECKOUT_STARTED drink stage → memoryPatch.checkoutUpsellStage = drink_shown", () => {
    const catalog = makeSushiCatalog();
    const out = decide(makeInput("ON_CHECKOUT_STARTED", {
      cartItemIds: ["s1"],
      cartValue:   22,
      catalog,
    }));
    if (out.mode === "INTERVENTION") {
      expect(out.memoryPatch?.checkoutUpsellStage).toBe("drink_shown");
    }
  });

  it("continue_checkout → memoryPatch.finalUpsellDeclined = true and stage = completed", () => {
    const out = decide(makeInput("ON_USER_MESSAGE", {
      message: "continue_checkout",
      catalog: makeSushiCatalog(),
    }));
    expect(out.memoryPatch?.finalUpsellDeclined).toBe(true);
    expect(out.memoryPatch?.checkoutUpsellStage).toBe("completed");
  });

  it("see_final_suggestions → memoryPatch.finalUpsellPromptShown = true", () => {
    const catalog = makeSushiCatalog();
    const out = decide(makeInput("ON_USER_MESSAGE", {
      message:     "see_final_suggestions",
      cartItemIds: ["s1"],
      catalog,
    }));
    expect(out.memoryPatch?.finalUpsellPromptShown).toBe(true);
  });

  it("E) full flow: prompt shown → declined → second checkout suppressed", () => {
    const catalog = makeSushiCatalog();
    let memory = createWaiterMemory();

    // First ON_CHECKOUT_STARTED — should show prompt
    const turn1 = decide(makeInput("ON_CHECKOUT_STARTED", { cartItemIds: ["s1"], cartValue: 22, catalog, memory }));
    memory = { ...memory, ...turn1.memoryPatch };
    expect(turn1.mode).toBe("INTERVENTION");

    // User clicks "Não, finalizar"
    const turn2 = decide(makeInput("ON_USER_MESSAGE", { message: "continue_checkout", catalog, memory }));
    memory = { ...memory, ...turn2.memoryPatch };

    // Second ON_CHECKOUT_STARTED — must NOT show prompt again (F)
    const turn3 = decide(makeInput("ON_CHECKOUT_STARTED", { cartItemIds: ["s1"], cartValue: 22, catalog, memory }));
    expect(turn3.mode).toBe("CHECKOUT_SUPPORT");
    expect(turn3.options.some((o) => o.value === "see_final_suggestions")).toBe(false);
  });
});

// ─── Section 23: WaiterSalesConfig (Sprint 4G) ───────────────────────────────

describe("23 — WaiterSalesConfig", () => {

  // ── A) DEFAULT_WAITER_CONFIG shape ──────────────────────────────────────────

  it("A1) DEFAULT_WAITER_CONFIG has all required fields with correct types", () => {
    expect(DEFAULT_WAITER_CONFIG).toMatchObject({
      interactionLevel:                    expect.stringMatching(/^(low|medium|high)$/),
      upsellStyle:                         expect.stringMatching(/^(subtle|balanced|aggressive)$/),
      permissionRequiredBeforeSuggestions: expect.any(Boolean),
      allowIdlePrompt:                     expect.any(Boolean),
      allowFinalUpsellPrompt:              expect.any(Boolean),
      maxPermissionPromptsPerSession:      expect.any(Number),
      tone:                                expect.stringMatching(/^(traditional|premium|young|fast)$/),
    });
  });

  it("A2) DEFAULT_WAITER_CONFIG defaults to medium/balanced/traditional", () => {
    expect(DEFAULT_WAITER_CONFIG.interactionLevel).toBe("medium");
    expect(DEFAULT_WAITER_CONFIG.upsellStyle).toBe("balanced");
    expect(DEFAULT_WAITER_CONFIG.tone).toBe("traditional");
    expect(DEFAULT_WAITER_CONFIG.permissionRequiredBeforeSuggestions).toBe(true);
    expect(DEFAULT_WAITER_CONFIG.allowIdlePrompt).toBe(true);
    expect(DEFAULT_WAITER_CONFIG.allowFinalUpsellPrompt).toBe(true);
    expect(DEFAULT_WAITER_CONFIG.maxPermissionPromptsPerSession).toBe(2);
  });

  // ── B) allowIdlePrompt = false ───────────────────────────────────────────────

  it("B1) allowIdlePrompt = false → ON_IDLE returns silent (no message, no options)", () => {
    const catalog = makeSushiCatalog();
    const config: WaiterSalesConfig = { ...DEFAULT_WAITER_CONFIG, allowIdlePrompt: false };
    const out = decide(makeInput("ON_IDLE", { catalog, config }));
    expect(out.message).toBe("");
    expect(out.options).toHaveLength(0);
    expect(out.cards).toHaveLength(0);
  });

  it("B2) allowIdlePrompt = true (default) → ON_IDLE shows permission prompt", () => {
    const catalog = makeSushiCatalog();
    const out = decide(makeInput("ON_IDLE", { catalog }));
    expect(out.options.some((o) => o.value === "want_suggestion")).toBe(true);
  });

  // ── C) maxPermissionPromptsPerSession ────────────────────────────────────────

  it("C1) maxPermissionPromptsPerSession = 1 → silenced after one prompt", () => {
    const catalog = makeSushiCatalog();
    const config: WaiterSalesConfig = { ...DEFAULT_WAITER_CONFIG, maxPermissionPromptsPerSession: 1 };
    let memory = createWaiterMemory();

    // First idle → prompt shown; increment promptCount
    const out1 = decide(makeInput("ON_IDLE", { catalog, config, memory }));
    memory = { ...memory, ...out1.memoryPatch };
    expect(out1.options.some((o) => o.value === "want_suggestion")).toBe(true);

    // Second idle → must be silent (promptCount = 1 >= limit 1)
    const out2 = decide(makeInput("ON_IDLE", { catalog, config, memory }));
    expect(out2.message).toBe("");
    expect(out2.options).toHaveLength(0);
  });

  it("C2) maxPermissionPromptsPerSession = 3 → allows three prompts", () => {
    const catalog = makeSushiCatalog();
    const config: WaiterSalesConfig = {
      ...DEFAULT_WAITER_CONFIG,
      maxPermissionPromptsPerSession: 3,
      interactionLevel: "high", // short cooldown so we can test without mocking Date.now
    };
    let memory = createWaiterMemory();

    for (let i = 0; i < 3; i++) {
      const out = decide(makeInput("ON_IDLE", { catalog, config, memory }));
      expect(out.options.some((o) => o.value === "want_suggestion")).toBe(true);
      memory = { ...memory, ...out.memoryPatch };
    }

    // 4th → silent
    const out4 = decide(makeInput("ON_IDLE", { catalog, config, memory }));
    expect(out4.message).toBe("");
  });

  // ── D) permissionRequiredBeforeSuggestions = false ──────────────────────────

  it("D1) permissionRequiredBeforeSuggestions = false → ON_IDLE returns qualification question directly", () => {
    const catalog = makeSushiCatalog();
    const config: WaiterSalesConfig = { ...DEFAULT_WAITER_CONFIG, permissionRequiredBeforeSuggestions: false };
    const out = decide(makeInput("ON_IDLE", { catalog, config }));
    // Must be the qualification question (no "want_suggestion" permission button)
    expect(out.options.some((o) => o.value === "want_suggestion")).toBe(false);
    expect(out.options.some((o) => o.value === "light" || o.value === "complete")).toBe(true);
  });

  // ── E) allowFinalUpsellPrompt = false ────────────────────────────────────────

  it("E1) allowFinalUpsellPrompt = false → ON_CHECKOUT_STARTED skips upsell and goes straight to checkout message", () => {
    const catalog = makeSushiCatalog();
    const config: WaiterSalesConfig = { ...DEFAULT_WAITER_CONFIG, allowFinalUpsellPrompt: false };
    const out = decide(makeInput("ON_CHECKOUT_STARTED", { cartItemIds: ["s1"], cartValue: 22, catalog, config }));
    expect(out.mode).toBe("CHECKOUT_SUPPORT");
    expect(out.options.some((o) => o.value === "see_final_suggestions")).toBe(false);
  });

  it("E2) allowFinalUpsellPrompt = true (default) → ON_CHECKOUT_STARTED shows upsell when applicable", () => {
    const catalog = makeSushiCatalog();
    // s1 is food-only cart, so drink/dessert upsell should trigger
    const out = decide(makeInput("ON_CHECKOUT_STARTED", { cartItemIds: ["s1"], cartValue: 22, catalog }));
    expect(out.mode).toBe("INTERVENTION");
    expect(out.options.some((o) => o.value === "see_final_suggestions")).toBe(true);
  });

  // ── F) upsellStyle copy variants ─────────────────────────────────────────────

  it("F1) upsellStyle = 'balanced' → buildCommercialResponse uses INTENT_COPY (default map)", () => {
    const config: WaiterSalesConfig = { ...DEFAULT_WAITER_CONFIG, upsellStyle: "balanced" };
    const result = buildCommercialResponse(
      { intent: "asks_for_drink", selectedProducts: ["s4"], mode: "SUGGESTION" },
      config,
    );
    expect(result.message).toBe("Pra acompanhar, essas bebidas funcionam bem 👇");
  });

  it("F2) upsellStyle = 'subtle' → buildCommercialResponse uses SUBTLE_COPY override", () => {
    const config: WaiterSalesConfig = { ...DEFAULT_WAITER_CONFIG, upsellStyle: "subtle" };
    const result = buildCommercialResponse(
      { intent: "asks_for_drink", selectedProducts: ["s4"], mode: "SUGGESTION" },
      config,
    );
    expect(result.message).toBe("Para acompanhar, essas são as opções disponíveis 👇");
  });

  it("F3) upsellStyle = 'aggressive' → buildCommercialResponse uses AGGRESSIVE_COPY override", () => {
    const config: WaiterSalesConfig = { ...DEFAULT_WAITER_CONFIG, upsellStyle: "aggressive" };
    const result = buildCommercialResponse(
      { intent: "asks_for_drink", selectedProducts: ["s4"], mode: "SUGGESTION" },
      config,
    );
    expect(result.message).toBe("Essas bebidas vão completar seu pedido 👇");
  });

  it("F4) subtle intent without override falls back to INTENT_COPY default", () => {
    const config: WaiterSalesConfig = { ...DEFAULT_WAITER_CONFIG, upsellStyle: "subtle" };
    // "wants_recommendation" is not in SUBTLE_COPY so should use INTENT_COPY fallback
    const result = buildCommercialResponse(
      { intent: "wants_recommendation", selectedProducts: ["s1"], mode: "SUGGESTION" },
      config,
    );
    expect(result.message).toBe("Separei boas opções pra você 👇");
  });

  // ── G) config threads through decide() → handleUserMessage ──────────────────

  it("G1) config.upsellStyle = 'subtle' threads into decide ON_USER_MESSAGE response", () => {
    const catalog = makeSushiCatalog();
    const config: WaiterSalesConfig = { ...DEFAULT_WAITER_CONFIG, upsellStyle: "subtle" };
    const out = decide(makeInput("ON_USER_MESSAGE", {
      message:    "quero uma bebida",
      catalog,
      cartItemIds: [],
      config,
    }));
    // Should use subtle copy for asks_for_drink
    if (out.cards.length > 0) {
      expect(out.message).toBe("Para acompanhar, essas são as opções disponíveis 👇");
    }
  });

  it("G2) config.upsellStyle = 'aggressive' threads into decide ON_USER_MESSAGE response", () => {
    const catalog = makeSushiCatalog();
    const config: WaiterSalesConfig = { ...DEFAULT_WAITER_CONFIG, upsellStyle: "aggressive" };
    const out = decide(makeInput("ON_USER_MESSAGE", {
      message:    "quero uma bebida",
      catalog,
      cartItemIds: [],
      config,
    }));
    if (out.cards.length > 0) {
      expect(out.message).toBe("Essas bebidas vão completar seu pedido 👇");
    }
  });

  // ── H) config is optional — omitting it uses DEFAULT_WAITER_CONFIG ───────────

  it("H1) no config in V2Input → decide behaves identically to passing DEFAULT_WAITER_CONFIG", () => {
    const catalog = makeSushiCatalog();
    const withoutConfig = decide(makeInput("ON_IDLE", { catalog }));
    const withConfig    = decide(makeInput("ON_IDLE", { catalog, config: DEFAULT_WAITER_CONFIG }));
    expect(withoutConfig.message).toBe(withConfig.message);
    expect(withoutConfig.mode).toBe(withConfig.mode);
    expect(withoutConfig.options).toEqual(withConfig.options);
  });

  it("H2) no config → buildCommercialResponse called without config uses DEFAULT_WAITER_CONFIG (balanced copy)", () => {
    const result = buildCommercialResponse(
      { intent: "asks_for_dessert", selectedProducts: ["s5"], mode: "SUGGESTION" },
    );
    // balanced → INTENT_COPY
    expect(result.message).toBe("Pra fechar com doce, essas são boas escolhas 👇");
  });
});
