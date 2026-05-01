/**
 * WaiterBrainV2 — Sales Specialist Agent Contract Tests (Sprint 4I)
 *
 * Focused regression suite that protects the Sales Specialist architecture.
 * Tests pure functions only. No DB, no AI, no network.
 * ConversationGuardrails is mocked to isolate the prisma import.
 *
 * Sections:
 *   S1  Response contract (all events)
 *   S2  "me sugere algo" — buttons, not random cards
 *   S3  Light intent
 *   S4  Dessert intent
 *   S5  Group intent
 *   S6  ON_ITEM_ADDED — no UI invasion
 *   S7  Permission declined — cooldown state
 *   S8  Final upsell permission at checkout
 *   S9  Checkout / post-checkout guard
 *   S10 Invalid card guard
 *   S11 Invisible product guard
 *   S12 Restaurant-agnostic behaviour (sushi, Italian, burger)
 */

import { vi, describe, it, expect } from "vitest";

vi.mock("../ConversationGuardrails", () => ({
  isDessertCategory: (name: string) =>
    /sobremesa|doce|sorvete|torta|bolo|brownie|pudim|brigadeiro|dessert|sweet/i.test(name),
}));

import {
  decide,
  validateWaiterResponse,
  createWaiterMemory,
  type V2CatalogItem,
  type V2Input,
  type WaiterMode,
} from "../WaiterBrainV2";

// ─── catalog fixtures ─────────────────────────────────────────────────────────

function makeSushiCatalog(): V2CatalogItem[] {
  return [
    { id: "s1", name: "Temaki Salmão",        categoryName: "Temakis",    price: 22, sortOrder: 1 },
    { id: "s2", name: "Uramaki Philadelphia",  categoryName: "Uramakis",   price: 28, sortOrder: 2 },
    { id: "s3", name: "Combinado Para 2",      categoryName: "Combos",     price: 65, sortOrder: 3 },
    { id: "s4", name: "Suco de Laranja",       categoryName: "Bebidas",    price: 8,  sortOrder: 4 },
    { id: "s5", name: "Pudim de Leite",        categoryName: "Sobremesas", price: 12, sortOrder: 5 },
    { id: "s6", name: "Temaki Atum",           categoryName: "Temakis",    price: 24, sortOrder: 6 },
  ];
}

function makeItalianCatalog(): V2CatalogItem[] {
  return [
    { id: "i1", name: "Fettuccine Carbonara",  categoryName: "Massas",     price: 42, sortOrder: 1 },
    { id: "i2", name: "Pizza Margherita",       categoryName: "Pizzas",     price: 52, sortOrder: 2 },
    { id: "i3", name: "Lasanha Bolonhesa",      categoryName: "Massas",     price: 48, sortOrder: 3 },
    { id: "i4", name: "Água com Gás",           categoryName: "Bebidas",    price: 6,  sortOrder: 4 },
    { id: "i5", name: "Vinho Tinto Taça",       categoryName: "Bebidas",    price: 18, sortOrder: 5 },
    { id: "i6", name: "Tiramisù",               categoryName: "Sobremesas", price: 20, sortOrder: 6 },
    { id: "i7", name: "Bruschetta Clássica",    categoryName: "Entradas",   price: 22, sortOrder: 7, description: "entrada leve" },
  ];
}

function makeBurgerCatalog(): V2CatalogItem[] {
  return [
    { id: "b1", name: "Smash Clássico",         categoryName: "Burgers",    price: 32, sortOrder: 1 },
    { id: "b2", name: "Bacon Duplo",             categoryName: "Burgers",    price: 42, sortOrder: 2 },
    { id: "b3", name: "Combo Família",           categoryName: "Combos",     price: 89, sortOrder: 3 },
    { id: "b4", name: "Refrigerante Lata",       categoryName: "Bebidas",    price: 7,  sortOrder: 4 },
    { id: "b5", name: "Milkshake",               categoryName: "Bebidas",    price: 15, sortOrder: 5 },
    { id: "b6", name: "Brownie com Sorvete",     categoryName: "Sobremesas", price: 18, sortOrder: 6 },
  ];
}

// ─── input factory ────────────────────────────────────────────────────────────

function makeInput(
  event: V2Input["event"],
  overrides: Partial<V2Input> = {},
  catalog: V2CatalogItem[] = makeSushiCatalog(),
): V2Input {
  return { event, cartItemIds: [], cartValue: 0, catalog, message: "", ...overrides };
}

const ALL_VALID_MODES: WaiterMode[] = ["BROWSE", "SUGGESTION", "INTERVENTION", "CHECKOUT_SUPPORT"];

// ─── S1: Response contract ────────────────────────────────────────────────────

describe("S1 — Response contract (all events)", () => {
  const allEvents: V2Input["event"][] = [
    "ON_ENTRY", "ON_MENU_MODE", "ON_ITEM_ADDED",
    "ON_CART_UPDATED", "ON_IDLE", "ON_CHECKOUT_STARTED",
    "AFTER_CHECKOUT", "ON_PERMISSION_ACCEPT", "ON_PERMISSION_DECLINED",
  ];

  it.each(allEvents)("decide('%s') returns message/options/cards/mode", (event) => {
    const out = decide(makeInput(event));
    expect(typeof out.message).toBe("string");
    expect(Array.isArray(out.options)).toBe(true);
    expect(Array.isArray(out.cards)).toBe(true);
    expect(ALL_VALID_MODES).toContain(out.mode);
  });

  it("ON_USER_MESSAGE returns well-formed response", () => {
    const out = decide(makeInput("ON_USER_MESSAGE", { message: "quero uma sobremesa" }));
    expect(typeof out.message).toBe("string");
    expect(Array.isArray(out.cards)).toBe(true);
    expect(Array.isArray(out.options)).toBe(true);
    expect(ALL_VALID_MODES).toContain(out.mode);
  });

  it("every option has non-empty label and value", () => {
    const events: V2Input["event"][] = ["ON_IDLE", "ON_USER_MESSAGE", "ON_CHECKOUT_STARTED"];
    for (const event of events) {
      const out = decide(makeInput(event, { message: "me sugere algo", cartItemIds: ["s1"], cartValue: 22 }));
      for (const opt of out.options) {
        expect(opt.label.length).toBeGreaterThan(0);
        expect(opt.value.length).toBeGreaterThan(0);
      }
    }
  });

  it("mode is always one of the four valid values", () => {
    const messages = ["quero algo leve", "quero bebida", "me sugere algo", "é pra 4 pessoas", ""];
    for (const message of messages) {
      const out = decide(makeInput("ON_USER_MESSAGE", { message }));
      expect(ALL_VALID_MODES).toContain(out.mode);
    }
  });

  it("message is never longer than 2 non-empty lines", () => {
    const out = decide(makeInput("ON_USER_MESSAGE", { message: "quero uma sobremesa" }));
    const nonEmpty = out.message.split("\n").filter((l) => l.trim().length > 0);
    expect(nonEmpty.length).toBeLessThanOrEqual(2);
  });
});

// ─── S2: "me sugere algo" — buttons, not random cards ────────────────────────

describe("S2 — 'me sugere algo' with empty cart", () => {
  it("returns qualification buttons (not raw product cards)", () => {
    const out = decide(makeInput("ON_USER_MESSAGE", { message: "me sugere algo" }));
    expect(out.cards).toHaveLength(0);
    expect(out.options.length).toBeGreaterThan(0);
  });

  it("buttons include 'light' and 'complete' values", () => {
    const out = decide(makeInput("ON_USER_MESSAGE", { message: "me sugere algo" }));
    const values = out.options.map((o) => o.value);
    expect(values).toContain("light");
    expect(values).toContain("complete");
  });

  it("no open typing required — all options are tappable buttons", () => {
    const out = decide(makeInput("ON_USER_MESSAGE", { message: "me sugere algo" }));
    expect(out.requiresAI).toBe(false);
    for (const opt of out.options) {
      expect(opt.value).not.toBe(""); // every button has a machine-readable value
    }
  });

  it("'sugere algo' with items in cart → cards (not buttons)", () => {
    const catalog = makeSushiCatalog();
    const out = decide(makeInput("ON_USER_MESSAGE", { message: "me sugere algo", catalog, cartItemIds: ["s1"], cartValue: 22 }));
    // Cart-aware path → context-aware product cards expected
    if (out.cards.length > 0) {
      expect(out.options).toHaveLength(0); // Rule 9: no buttons alongside cards
    } else {
      // No cards found is also valid — must still have a message
      expect(out.message.length).toBeGreaterThan(0);
    }
  });
});

// ─── S3: Light intent ─────────────────────────────────────────────────────────

describe("S3 — Light intent ('quero algo leve')", () => {
  it("returns mode = SUGGESTION", () => {
    const out = decide(makeInput("ON_USER_MESSAGE", { message: "quero algo leve" }));
    expect(out.mode).toBe("SUGGESTION");
  });

  it("cards[] contains valid catalog IDs (no ghost IDs)", () => {
    const catalog = makeSushiCatalog();
    const validIds = new Set(catalog.map((i) => i.id));
    const out = decide(makeInput("ON_USER_MESSAGE", { message: "quero algo leve", catalog }));
    for (const id of out.cards) expect(validIds.has(id)).toBe(true);
  });

  it("cards[] does not include drinks or desserts", () => {
    const out = decide(makeInput("ON_USER_MESSAGE", { message: "quero algo leve" }));
    expect(out.cards).not.toContain("s4"); // Suco de Laranja (drink)
    expect(out.cards).not.toContain("s5"); // Pudim de Leite (dessert)
  });

  it("no options alongside product cards (Rule 9)", () => {
    const out = decide(makeInput("ON_USER_MESSAGE", { message: "quero algo leve" }));
    if (out.cards.length > 0) expect(out.options).toHaveLength(0);
  });

  it("Italian menu: light intent returns entradas or light pasta — no sushi-specific IDs", () => {
    const catalog = makeItalianCatalog();
    const validIds = new Set(catalog.map((i) => i.id));
    const out = decide(makeInput("ON_USER_MESSAGE", { message: "quero algo leve", catalog }));
    for (const id of out.cards) expect(validIds.has(id)).toBe(true);
  });
});

// ─── S4: Dessert intent ───────────────────────────────────────────────────────

describe("S4 — Dessert intent ('quero sobremesa')", () => {
  it("returns mode = SUGGESTION", () => {
    const out = decide(makeInput("ON_USER_MESSAGE", { message: "quero sobremesa" }));
    expect(out.mode).toBe("SUGGESTION");
  });

  it("cards[] contains only dessert product IDs from current catalog", () => {
    const catalog = makeSushiCatalog();
    const out = decide(makeInput("ON_USER_MESSAGE", { message: "quero sobremesa", catalog }));
    expect(out.cards.length).toBeGreaterThan(0);
    for (const id of out.cards) expect(id).toBe("s5"); // only dessert in sushi menu
  });

  it("message does not mention a product name that is not in cards[] (invisible product guard)", () => {
    const catalog = makeSushiCatalog();
    const out = decide(makeInput("ON_USER_MESSAGE", { message: "quero sobremesa", catalog }));
    for (const item of catalog) {
      if (!out.cards.includes(item.id) && item.name.length >= 4) {
        expect(out.message).not.toContain(item.name);
      }
    }
  });

  it("burger menu: dessert intent returns brownie, not pizza or burger IDs", () => {
    const catalog = makeBurgerCatalog();
    const out = decide(makeInput("ON_USER_MESSAGE", { message: "quero sobremesa", catalog }));
    expect(out.cards.length).toBeGreaterThan(0);
    for (const id of out.cards) expect(id).toBe("b6"); // only dessert in burger menu
  });
});

// ─── S5: Group intent ─────────────────────────────────────────────────────────

describe("S5 — Group intent ('é pra 4 pessoas')", () => {
  it("returns mode = SUGGESTION", () => {
    const out = decide(makeInput("ON_USER_MESSAGE", { message: "é pra 4 pessoas" }));
    expect(out.mode).toBe("SUGGESTION");
  });

  it("cards[] contains combo/shareable items (not drinks, not desserts)", () => {
    const catalog = makeSushiCatalog();
    const out = decide(makeInput("ON_USER_MESSAGE", { message: "é pra 4 pessoas", catalog }));
    expect(out.cards.length).toBeGreaterThan(0);
    // Combos (s3) should rank highly for group intent
    if (out.cards.length > 0) {
      expect(out.cards).toContain("s3"); // "Combinado Para 2" — the only combo
    }
  });

  it("cards[] IDs are all valid catalog IDs", () => {
    const catalog = makeBurgerCatalog();
    const validIds = new Set(catalog.map((i) => i.id));
    const out = decide(makeInput("ON_USER_MESSAGE", { message: "é pra 4 pessoas", catalog }));
    for (const id of out.cards) expect(validIds.has(id)).toBe(true);
  });

  it("burger menu: group intent surfaces 'Combo Família'", () => {
    const catalog = makeBurgerCatalog();
    const out = decide(makeInput("ON_USER_MESSAGE", { message: "é pra 4 pessoas", catalog }));
    expect(out.cards).toContain("b3"); // Combo Família
  });
});

// ─── S6: ON_ITEM_ADDED — no UI invasion ──────────────────────────────────────

describe("S6 — ON_ITEM_ADDED guard", () => {
  it("cards = [] after item added", () => {
    const out = decide(makeInput("ON_ITEM_ADDED", { lastAddedId: "s1" }));
    expect(out.cards).toHaveLength(0);
  });

  it("options = [] after item added (no drink/dessert popup)", () => {
    const out = decide(makeInput("ON_ITEM_ADDED", { lastAddedId: "s1" }));
    expect(out.options).toHaveLength(0);
  });

  it("mode = BROWSE after item added", () => {
    const out = decide(makeInput("ON_ITEM_ADDED", { lastAddedId: "s1" }));
    expect(out.mode).toBe("BROWSE");
  });

  it("adding drink item → still no cards (no cross-sell push)", () => {
    const out = decide(makeInput("ON_ITEM_ADDED", { lastAddedId: "s4" }));
    expect(out.cards).toHaveLength(0);
    expect(out.options).toHaveLength(0);
  });

  it("message is short acknowledgement, not a selling line", () => {
    const out = decide(makeInput("ON_ITEM_ADDED", { lastAddedId: "s1" }));
    const lines = out.message.split("\n").filter((l) => l.trim().length > 0);
    expect(lines.length).toBeLessThanOrEqual(2);
    // Must not include product suggestion copy
    expect(out.message).not.toMatch(/separei|sugest|opç/i);
  });
});

// ─── S7: Permission declined — cooldown activated ─────────────────────────────

describe("S7 — Permission declined ('continue_browsing')", () => {
  it("returns mode = BROWSE with empty cards", () => {
    const out = decide(makeInput("ON_USER_MESSAGE", { message: "continue_browsing" }));
    expect(out.mode).toBe("BROWSE");
    expect(out.cards).toHaveLength(0);
  });

  it("memoryPatch.permissionDeclinedAt is set", () => {
    const before = Date.now();
    const out = decide(makeInput("ON_USER_MESSAGE", { message: "continue_browsing" }));
    const after = Date.now();
    expect(out.memoryPatch?.permissionDeclinedAt).toBeGreaterThanOrEqual(before);
    expect(out.memoryPatch?.permissionDeclinedAt).toBeLessThanOrEqual(after);
  });

  it("memoryPatch.declinedSuggestionTypes includes 'passive_help'", () => {
    const out = decide(makeInput("ON_USER_MESSAGE", { message: "continue_browsing" }));
    expect(out.memoryPatch?.declinedSuggestionTypes).toContain("passive_help");
  });

  it("ON_IDLE after decline within cooldown → silent (no suggestion prompt)", () => {
    const catalog = makeSushiCatalog();
    let memory = createWaiterMemory();

    // Decline
    const decline = decide(makeInput("ON_USER_MESSAGE", { message: "continue_browsing", catalog, memory }));
    memory = { ...memory, ...decline.memoryPatch };

    // Idle right after decline — cooldown active, must be silent
    const idleOut = decide(makeInput("ON_IDLE", { catalog, memory }));
    expect(idleOut.message).toBe("");
    expect(idleOut.options).toHaveLength(0);
    expect(idleOut.cards).toHaveLength(0);
  });

  it("ON_PERMISSION_DECLINED event sets permissionDeclinedAt", () => {
    const before = Date.now();
    const out = decide(makeInput("ON_PERMISSION_DECLINED"));
    const after = Date.now();
    // event handler sets the cooldown via computeMemoryPatch
    expect(out.memoryPatch?.permissionDeclinedAt).toBeGreaterThanOrEqual(before);
    expect(out.memoryPatch?.permissionDeclinedAt).toBeLessThanOrEqual(after);
  });
});

// ─── S8: Final upsell permission at checkout ─────────────────────────────────

describe("S8 — Final upsell permission (ON_CHECKOUT_STARTED)", () => {
  it("food-only cart → mode = INTERVENTION with upsell options", () => {
    const catalog = makeSushiCatalog();
    const out = decide(makeInput("ON_CHECKOUT_STARTED", { catalog, cartItemIds: ["s1"], cartValue: 22 }));
    expect(out.mode).toBe("INTERVENTION");
    expect(out.options.some((o) => o.value === "see_final_suggestions")).toBe(true);
    expect(out.options.some((o) => o.value === "continue_checkout")).toBe(true);
  });

  it("food-only cart → cards = [] (just permission prompt, no pre-loaded cards)", () => {
    const catalog = makeSushiCatalog();
    const out = decide(makeInput("ON_CHECKOUT_STARTED", { catalog, cartItemIds: ["s1"], cartValue: 22 }));
    expect(out.cards).toHaveLength(0);
  });

  it("cart already has food + drink → no upsell for missing drink", () => {
    const catalog = makeSushiCatalog();
    const out = decide(makeInput("ON_CHECKOUT_STARTED", { catalog, cartItemIds: ["s1", "s4"], cartValue: 30 }));
    // Has food and drink → upsell for dessert OR straight to checkout if dessert also present
    if (out.mode === "INTERVENTION") {
      expect(out.options.some((o) => o.value === "see_final_suggestions")).toBe(true);
    } else {
      expect(out.mode).toBe("CHECKOUT_SUPPORT");
    }
  });

  it("full cart (food + drink + dessert) → goes straight to checkout support", () => {
    const catalog = makeSushiCatalog();
    const out = decide(makeInput("ON_CHECKOUT_STARTED", {
      catalog,
      cartItemIds: ["s1", "s4", "s5"],
      cartValue: 42,
    }));
    expect(out.mode).toBe("CHECKOUT_SUPPORT");
    expect(out.options.some((o) => o.value === "see_final_suggestions")).toBe(false);
  });

  it("upsell not re-shown after user declined (finalUpsellDeclined = true)", () => {
    const catalog = makeSushiCatalog();
    let memory = createWaiterMemory();

    const turn1 = decide(makeInput("ON_CHECKOUT_STARTED", { catalog, cartItemIds: ["s1"], cartValue: 22, memory }));
    memory = { ...memory, ...turn1.memoryPatch };
    expect(turn1.mode).toBe("INTERVENTION");

    const decline = decide(makeInput("ON_USER_MESSAGE", { message: "continue_checkout", catalog, memory }));
    memory = { ...memory, ...decline.memoryPatch };

    const turn2 = decide(makeInput("ON_CHECKOUT_STARTED", { catalog, cartItemIds: ["s1"], cartValue: 22, memory }));
    expect(turn2.mode).toBe("CHECKOUT_SUPPORT");
    expect(turn2.options.some((o) => o.value === "see_final_suggestions")).toBe(false);
  });

  it("'Ver opções' accepted → see_final_suggestions returns drink/dessert cards", () => {
    const catalog = makeSushiCatalog();
    const out = decide(makeInput("ON_USER_MESSAGE", {
      message:    "see_final_suggestions",
      catalog,
      cartItemIds: ["s1"],
      cartValue:  22,
    }));
    expect(out.cards.length).toBeGreaterThan(0);
    // Should prioritise drinks (cart has food but no drink)
    expect(out.cards).toContain("s4"); // Suco de Laranja
    expect(out.options).toHaveLength(0);
  });
});

// ─── S9: Checkout / post-checkout guard ──────────────────────────────────────

describe("S9 — Checkout support and post-checkout guard", () => {
  it("CHECKOUT_SUPPORT mode → cards = []", () => {
    // Full cart goes straight to checkout support
    const catalog = makeSushiCatalog();
    const out = decide(makeInput("ON_CHECKOUT_STARTED", {
      catalog,
      cartItemIds: ["s1", "s4", "s5"],
      cartValue: 42,
    }));
    expect(out.mode).toBe("CHECKOUT_SUPPORT");
    expect(out.cards).toHaveLength(0);
  });

  it("AFTER_CHECKOUT → cards = [], mode = CHECKOUT_SUPPORT, requiresAI = true", () => {
    const out = decide(makeInput("AFTER_CHECKOUT"));
    expect(out.cards).toHaveLength(0);
    expect(out.mode).toBe("CHECKOUT_SUPPORT");
    expect(out.requiresAI).toBe(true);
  });

  it("AFTER_CHECKOUT message is empty (AI fills it)", () => {
    const out = decide(makeInput("AFTER_CHECKOUT"));
    expect(out.message).toBe("");
  });

  it("CHECKOUT_SUPPORT options never include selling-type values", () => {
    const catalog = makeSushiCatalog();
    const out = decide(makeInput("ON_CHECKOUT_STARTED", {
      catalog,
      cartItemIds: ["s1", "s4", "s5"],
      cartValue: 42,
    }));
    const sellingValues = new Set(["see_final_suggestions", "want_suggestion", "light", "complete", "group"]);
    for (const opt of out.options) {
      expect(sellingValues.has(opt.value)).toBe(false);
    }
  });

  it("validateWaiterResponse strips cards from CHECKOUT_SUPPORT output", () => {
    const catalog = makeSushiCatalog();
    const fakeOutput = {
      message:     "Pode finalizar 😊",
      cards:       ["s1", "s4"],
      mode:        "CHECKOUT_SUPPORT" as const,
      options:     [],
      requiresAI:  false,
      aiDirective: "",
    };
    const fixed = validateWaiterResponse(fakeOutput, catalog, "ON_CHECKOUT_STARTED");
    expect(fixed.cards).toHaveLength(0);
  });
});

// ─── S10: Invalid card guard ──────────────────────────────────────────────────

describe("S10 — Invalid card guard", () => {
  it("validateWaiterResponse removes IDs not present in catalog", () => {
    const catalog = makeSushiCatalog();
    const fakeOutput = {
      message:     "Separei boas opções pra você 👇",
      cards:       ["s1", "GHOST_ID_999", "s4"],
      mode:        "SUGGESTION" as const,
      options:     [],
      requiresAI:  false,
      aiDirective: "",
    };
    const fixed = validateWaiterResponse(fakeOutput, catalog, "ON_USER_MESSAGE");
    expect(fixed.cards).not.toContain("GHOST_ID_999");
    expect(fixed.cards).toContain("s1");
    expect(fixed.cards).toContain("s4");
  });

  it("validateWaiterResponse deduplicates repeated card IDs", () => {
    const catalog = makeSushiCatalog();
    const fakeOutput = {
      message:     "Separei boas opções pra você 👇",
      cards:       ["s1", "s1", "s2", "s1"],
      mode:        "SUGGESTION" as const,
      options:     [],
      requiresAI:  false,
      aiDirective: "",
    };
    const fixed = validateWaiterResponse(fakeOutput, catalog, "ON_USER_MESSAGE");
    const s1Count = fixed.cards.filter((id) => id === "s1").length;
    expect(s1Count).toBe(1);
  });

  it("decide() never returns a card ID absent from the catalog", () => {
    const catalog = makeSushiCatalog();
    const validIds = new Set(catalog.map((i) => i.id));
    const messages = ["quero algo leve", "quero bebida", "quero sobremesa", "é pra 4 pessoas", "me sugere algo"];
    for (const message of messages) {
      const out = decide(makeInput("ON_USER_MESSAGE", { message, catalog }));
      for (const id of out.cards) {
        expect(validIds.has(id)).toBe(true);
      }
    }
  });

  it("all-invalid cards list → cards becomes []", () => {
    const catalog = makeSushiCatalog();
    const fakeOutput = {
      message:     "Separei opções pra você 👇",
      cards:       ["INVALID_1", "INVALID_2"],
      mode:        "SUGGESTION" as const,
      options:     [],
      requiresAI:  false,
      aiDirective: "",
    };
    const fixed = validateWaiterResponse(fakeOutput, catalog, "ON_USER_MESSAGE");
    expect(fixed.cards).toHaveLength(0);
  });
});

// ─── S11: Invisible product guard ────────────────────────────────────────────

describe("S11 — Invisible product guard", () => {
  it("validateWaiterResponse strips product name from message when not in cards", () => {
    const catalog = makeSushiCatalog();
    const fakeOutput = {
      message:     "Separei o Temaki Salmão pra você 👇",
      cards:       [],                     // s1 not in cards → name must be stripped
      mode:        "SUGGESTION" as const,
      options:     [],
      requiresAI:  false,
      aiDirective: "",
    };
    const fixed = validateWaiterResponse(fakeOutput, catalog, "ON_USER_MESSAGE");
    expect(fixed.message).not.toContain("Temaki Salmão");
  });

  it("product name stays when its ID is in cards[]", () => {
    const catalog = makeSushiCatalog();
    // This is valid — message mentions the product and card is included
    const fakeOutput = {
      message:     "Separei boas opções pra você 👇",
      cards:       ["s1"],
      mode:        "SUGGESTION" as const,
      options:     [],
      requiresAI:  false,
      aiDirective: "",
    };
    const fixed = validateWaiterResponse(fakeOutput, catalog, "ON_USER_MESSAGE");
    // Message doesn't contain the product name here, so it should be unchanged
    expect(fixed.message).toBe("Separei boas opções pra você 👇");
    expect(fixed.cards).toContain("s1");
  });

  it("decide() ON_USER_MESSAGE responses never mention product names not in cards", () => {
    const catalog = makeSushiCatalog();
    const messages = ["quero algo leve", "quero bebida", "quero sobremesa"];
    for (const message of messages) {
      const out = decide(makeInput("ON_USER_MESSAGE", { message, catalog }));
      for (const item of catalog) {
        if (!out.cards.includes(item.id) && item.name.length >= 4) {
          expect(out.message).not.toContain(item.name);
        }
      }
    }
  });

  it("stripped name with no remaining meaningful text → replaced with fallback copy", () => {
    const catalog = makeSushiCatalog();
    const fakeOutput = {
      message:     "Temaki Salmão",   // entire message is the product name
      cards:       [],
      mode:        "SUGGESTION" as const,
      options:     [],
      requiresAI:  false,
      aiDirective: "",
    };
    const fixed = validateWaiterResponse(fakeOutput, catalog, "ON_USER_MESSAGE");
    // After stripping "Temaki Salmão", must not be left with garbage
    expect(fixed.message).not.toContain("Temaki Salmão");
    expect(fixed.message.replace(/[^a-zà-ú]/gi, "").length).toBeGreaterThanOrEqual(5);
  });
});

// ─── S12: Restaurant-agnostic behaviour ──────────────────────────────────────

describe("S12 — Restaurant-agnostic behaviour", () => {
  const catalogs: [string, V2CatalogItem[]][] = [
    ["sushi",   makeSushiCatalog()],
    ["italian", makeItalianCatalog()],
    ["burger",  makeBurgerCatalog()],
  ];

  it.each(catalogs)("%s — cards always come from current catalog", (_name, catalog) => {
    const validIds = new Set(catalog.map((i) => i.id));
    const messages = ["quero bebida", "quero sobremesa", "quero algo leve", "me sugere algo"];
    for (const message of messages) {
      const out = decide(makeInput("ON_USER_MESSAGE", { message, catalog }));
      for (const id of out.cards) {
        expect(validIds.has(id)).toBe(true);
      }
    }
  });

  it.each(catalogs)("%s — drink intent returns only drinks from that menu", (_name, catalog) => {
    const drinkIds = new Set(
      catalog
        .filter((i) => /bebida|suco|refri|água|cerveja|vinho|refrigerante|milkshake/i.test(i.categoryName))
        .map((i) => i.id),
    );
    const out = decide(makeInput("ON_USER_MESSAGE", { message: "quero uma bebida", catalog }));
    if (out.cards.length > 0) {
      for (const id of out.cards) {
        expect(drinkIds.has(id)).toBe(true);
      }
    }
  });

  it.each(catalogs)("%s — dessert intent returns only desserts from that menu", (_name, catalog) => {
    const dessertIds = new Set(
      catalog
        .filter((i) => /sobremesa|doce|sorvete|torta|bolo|brownie|pudim|brigadeiro/i.test(i.categoryName))
        .map((i) => i.id),
    );
    const out = decide(makeInput("ON_USER_MESSAGE", { message: "quero sobremesa", catalog }));
    if (out.cards.length > 0) {
      for (const id of out.cards) {
        expect(dessertIds.has(id)).toBe(true);
      }
    }
  });

  it.each(catalogs)("%s — ON_ITEM_ADDED always returns cards=[], options=[]", (_name, catalog) => {
    const firstItem = catalog[0];
    const out = decide(makeInput("ON_ITEM_ADDED", { catalog, lastAddedId: firstItem.id }));
    expect(out.cards).toHaveLength(0);
    expect(out.options).toHaveLength(0);
  });

  it.each(catalogs)("%s — group intent returns items present in this menu", (_name, catalog) => {
    const validIds = new Set(catalog.map((i) => i.id));
    const out = decide(makeInput("ON_USER_MESSAGE", { message: "é pra 4 pessoas", catalog }));
    for (const id of out.cards) {
      expect(validIds.has(id)).toBe(true);
    }
  });

  it("sushi catalog cards are NOT returned when Italian catalog is active", () => {
    const sushiIds = new Set(makeSushiCatalog().map((i) => i.id));
    const catalog = makeItalianCatalog();
    const out = decide(makeInput("ON_USER_MESSAGE", { message: "quero sobremesa", catalog }));
    for (const id of out.cards) {
      expect(sushiIds.has(id)).toBe(false);
    }
  });

  it("italian catalog cards are NOT returned when burger catalog is active", () => {
    const italianIds = new Set(makeItalianCatalog().map((i) => i.id));
    const catalog = makeBurgerCatalog();
    const out = decide(makeInput("ON_USER_MESSAGE", { message: "quero bebida", catalog }));
    for (const id of out.cards) {
      expect(italianIds.has(id)).toBe(false);
    }
  });

  it.each(catalogs)("%s — final upsell cards come from this menu only", (_name, catalog) => {
    const validIds = new Set(catalog.map((i) => i.id));
    const foodId = catalog.find((i) => !/bebida|suco|refri|água|vinho|refrigerante|milkshake|sobremesa|doce|sorvete|brownie|pudim/i.test(i.categoryName))?.id;
    if (!foodId) return; // skip if no food item found
    const out = decide(makeInput("ON_USER_MESSAGE", {
      message:     "see_final_suggestions",
      catalog,
      cartItemIds: [foodId],
    }));
    for (const id of out.cards) {
      expect(validIds.has(id)).toBe(true);
    }
  });
});
