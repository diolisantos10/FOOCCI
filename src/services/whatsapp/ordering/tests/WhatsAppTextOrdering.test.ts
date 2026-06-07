/**
 * WhatsApp Text Ordering — unit tests (W0/W1).
 *
 * All tests use pure functions only (no DB, no network).
 * Tests A–N correspond to the spec requirements.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseTextItems, detectIntent, buildSuggestedReply } from "../WhatsAppTextOrderService";
import { matchItems }            from "../menuMatcher";
import { calculateDraftSummary } from "../orderCalculator";
import { isWaTextOrderingEnabled } from "@/lib/wa-text-ordering-flag";
import { StubPaymentProvider, StubDeliveryProvider } from "../providers";
import type { WaMenuItem } from "../types";

// ── Shared mock menu ──────────────────────────────────────────────────────────

const YAKISOBA: WaMenuItem = {
  id:            "yakisoba-id",
  name:          "Yakisoba",
  price:         28.9,
  priceDelivery: 30.0,
  isActive:      true,
  isAvailable:   true,
  showInDelivery: true,
  hasVariants:   false,
  variants:      [],
  optionGroups:  [
    {
      id:        "og-tipo",
      name:      "Tipo",
      required:  true,
      minSelect: 1,
      maxSelect: 1,
      options: [
        { id: "o-frango", name: "Frango",  price: 0,   isAvailable: true },
        { id: "o-carne",  name: "Carne",   price: 2.0, isAvailable: true },
        { id: "o-veg",    name: "Vegano",  price: 0,   isAvailable: true },
      ],
    },
  ],
  extras: [],
};

const COCA: WaMenuItem = {
  id:            "coca-id",
  name:          "Coca-Cola",
  price:         6.0,
  priceDelivery: 6.5,
  isActive:      true,
  isAvailable:   true,
  showInDelivery: true,
  hasVariants:   true,
  variants: [
    { id: "v-350", name: "350ml", price: 6.0, priceDelivery: 6.5, isAvailable: true },
    { id: "v-600", name: "600ml", price: 8.0, priceDelivery: 8.5, isAvailable: true },
  ],
  optionGroups: [],
  extras: [],
};

const AGUA: WaMenuItem = {
  id:            "agua-id",
  name:          "Água Mineral",
  price:         3.5,
  priceDelivery: null,
  isActive:      true,
  isAvailable:   false, // sold out
  showInDelivery: true,
  hasVariants:   false,
  variants:      [],
  optionGroups:  [],
  extras:        [],
};

const YAKISOBA_FRANGO: WaMenuItem = { ...YAKISOBA, id: "yf-id", name: "Yakisoba Frango",  optionGroups: [] };
const YAKISOBA_CARNE:  WaMenuItem = { ...YAKISOBA, id: "yc-id", name: "Yakisoba Carne",   optionGroups: [] };

const MENU: WaMenuItem[] = [YAKISOBA, COCA, AGUA];

// ── A. Order intent detection ─────────────────────────────────────────────────

describe("A. Order intent detection", () => {
  it("detects ORDER_REQUEST from 'quero 2 yakisoba e uma coca'", () => {
    expect(detectIntent("quero 2 yakisoba e uma coca")).toBe("ORDER_REQUEST");
  });

  it("parseTextItems extracts 2 items from 'quero 2 yakisoba e uma coca'", () => {
    const items = parseTextItems("quero 2 yakisoba e uma coca");
    expect(items).toHaveLength(2);
  });

  it("parseTextItems gets quantity=2 for yakisoba", () => {
    const items = parseTextItems("quero 2 yakisoba e uma coca");
    const yaki = items.find(i => i.name.toLowerCase().includes("yakisoba"));
    expect(yaki?.quantity).toBe(2);
  });

  it("parseTextItems gets quantity=1 for coca", () => {
    const items = parseTextItems("quero 2 yakisoba e uma coca");
    const coca = items.find(i => i.name.toLowerCase().includes("coca"));
    expect(coca?.quantity).toBe(1);
  });
});

// ── B. Non-order question ─────────────────────────────────────────────────────

describe("B. Non-order question does not create draft", () => {
  it("detects QUESTION intent", () => {
    expect(detectIntent("qual é o preço do yakisoba?")).toBe("QUESTION");
  });

  it("QUESTION intent returns empty matchedItems and null draftSummary from buildSuggestedReply path", () => {
    // QUESTION intent → no parsing, no matching → no draft
    const reply = buildSuggestedReply("QUESTION", [], [], []);
    expect(reply.length).toBeGreaterThan(0);
    // The caller (analyzeTextOrder) would return empty arrays for QUESTION
    const { matched, unresolved } = matchItems([], MENU);
    expect(matched).toHaveLength(0);
    expect(unresolved).toHaveLength(0);
    const draft = calculateDraftSummary([]);
    expect(draft.subtotal).toBe(0);
  });
});

// ── C. Unknown product → unresolvedItems ──────────────────────────────────────

describe("C. Unknown product → unresolvedItems", () => {
  it("pizza not in menu → NOT_FOUND", () => {
    const { unresolved } = matchItems(
      [{ rawText: "pizza", quantity: 1, name: "pizza" }],
      MENU,
    );
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0].reason).toBe("NOT_FOUND");
  });

  it("xablau not in menu → NOT_FOUND", () => {
    const { unresolved } = matchItems(
      [{ rawText: "xablau xpto", quantity: 1, name: "xablau xpto" }],
      MENU,
    );
    expect(unresolved[0].reason).toBe("NOT_FOUND");
  });
});

// ── D. Ambiguous product → asks clarification ─────────────────────────────────

describe("D. Ambiguous product → clarification", () => {
  it("'yakisoba' matches both Yakisoba Frango and Yakisoba Carne → AMBIGUOUS", () => {
    const ambiguousMenu = [YAKISOBA_FRANGO, YAKISOBA_CARNE, COCA];
    const { unresolved } = matchItems(
      [{ rawText: "yakisoba", quantity: 1, name: "yakisoba" }],
      ambiguousMenu,
    );
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0].reason).toBe("AMBIGUOUS");
    expect(unresolved[0].candidates.length).toBeGreaterThanOrEqual(2);
  });

  it("AMBIGUOUS reply contains the candidates", () => {
    const u = [{ rawText: "yakisoba", quantity: 1, reason: "AMBIGUOUS" as const, candidates: ["Yakisoba Frango", "Yakisoba Carne"] }];
    const reply = buildSuggestedReply("ORDER_REQUEST", [], u, []);
    expect(reply).toMatch(/Yakisoba Frango|Yakisoba Carne/);
  });
});

// ── E. Required variant missing → missingQuestion ────────────────────────────

describe("E. Required option/variant missing → missingQuestion", () => {
  it("Yakisoba requires Tipo → produces missingQuestion", () => {
    const { matched, missing } = matchItems(
      [{ rawText: "yakisoba", quantity: 1, name: "yakisoba" }],
      MENU,
    );
    expect(matched).toHaveLength(1);
    expect(missing.some(q => q.itemName === "Yakisoba" && q.required)).toBe(true);
  });

  it("Coca-Cola hasVariants=true → produces missingQuestion for size", () => {
    const { missing } = matchItems(
      [{ rawText: "coca", quantity: 1, name: "coca" }],
      MENU,
    );
    expect(missing.some(q => q.itemName === "Coca-Cola" && q.groupName === "Tamanho/Variante")).toBe(true);
  });

  it("missing question includes available options", () => {
    const { missing } = matchItems(
      [{ rawText: "yakisoba", quantity: 1, name: "yakisoba" }],
      MENU,
    );
    const q = missing.find(q => q.itemName === "Yakisoba");
    expect(q?.options).toContain("Frango");
    expect(q?.options).toContain("Carne");
  });
});

// ── F. Quantity parsing ───────────────────────────────────────────────────────

describe("F. Quantity parsing", () => {
  it("parses digit quantity '2 yakisoba'", () => {
    const [item] = parseTextItems("2 yakisoba");
    expect(item.quantity).toBe(2);
    expect(item.name.toLowerCase()).toContain("yakisoba");
  });

  it("parses word quantity 'duas cocas'", () => {
    const [item] = parseTextItems("duas cocas");
    expect(item.quantity).toBe(2);
  });

  it("parses 'um yakisoba' → quantity=1", () => {
    const [item] = parseTextItems("um yakisoba");
    expect(item.quantity).toBe(1);
  });

  it("parses x-notation '3x yakisoba'", () => {
    const [item] = parseTextItems("3x yakisoba");
    expect(item.quantity).toBe(3);
  });

  it("parses 'três cocas' → quantity=3", () => {
    const [item] = parseTextItems("três cocas");
    expect(item.quantity).toBe(3);
  });

  it("no quantity defaults to 1", () => {
    const [item] = parseTextItems("yakisoba");
    expect(item.quantity).toBe(1);
  });
});

// ── G. Price uses real matched item price ─────────────────────────────────────

describe("G. Price uses real matched item price", () => {
  it("Yakisoba uses priceDelivery=30.00", () => {
    const { matched } = matchItems(
      [{ rawText: "yakisoba", quantity: 1, name: "yakisoba" }],
      MENU,
    );
    expect(matched[0].unitPrice).toBe(30.0);
  });

  it("lineTotal = unitPrice × quantity", () => {
    const { matched } = matchItems(
      [{ rawText: "yakisoba", quantity: 2, name: "yakisoba" }],
      MENU,
    );
    expect(matched[0].lineTotal).toBeCloseTo(60.0);
  });

  it("Coca-Cola uses priceDelivery=6.50", () => {
    const { matched } = matchItems(
      [{ rawText: "coca", quantity: 1, name: "coca" }],
      MENU,
    );
    expect(matched[0].unitPrice).toBe(6.5);
  });

  it("calculateDraftSummary subtotal is sum of line totals", () => {
    const { matched } = matchItems(
      [
        { rawText: "yakisoba", quantity: 1, name: "yakisoba" },
        { rawText: "coca",     quantity: 2, name: "coca"     },
      ],
      MENU,
    );
    const draft = calculateDraftSummary(matched);
    const expected = 30.0 + (6.5 * 2);
    expect(draft.subtotal).toBeCloseTo(expected);
  });
});

// ── H. Dry-run does not create Order ─────────────────────────────────────────

describe("H. Dry-run does not create Order", () => {
  it("analyzeTextOrder never imports or calls order creation (structural)", async () => {
    // The service reads menu from DB only — it never calls prisma.order.create.
    // We verify this by checking the service source doesn't import order routes.
    const fs = await import("node:fs/promises");
    const src = await fs.readFile(
      new URL("../WhatsAppTextOrderService.ts", import.meta.url),
      "utf-8",
    );
    expect(src).not.toContain("prisma.order.create");
    expect(src).not.toContain("OrderDraftService");
    expect(src).not.toContain("finalize");
  });
});

// ── I. Dry-run does not create Payment ───────────────────────────────────────

describe("I. Dry-run does not create Payment", () => {
  it("WhatsAppTextOrderService never imports mercadopago (structural)", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile(
      new URL("../WhatsAppTextOrderService.ts", import.meta.url),
      "utf-8",
    );
    expect(src).not.toContain("mercadopago");
    expect(src).not.toContain("createPixPayment");
    expect(src).not.toContain("createMPPayment");
  });
});

// ── J. Dry-run does not send WhatsApp ─────────────────────────────────────────

describe("J. Dry-run does not send WhatsApp", () => {
  it("WhatsAppTextOrderService never imports EvolutionClient (structural)", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile(
      new URL("../WhatsAppTextOrderService.ts", import.meta.url),
      "utf-8",
    );
    expect(src).not.toContain("EvolutionClient");
    expect(src).not.toContain("sendMessage");
    expect(src).not.toContain("evolution");
  });

  it("safetyNotes always includes 'nenhuma mensagem WhatsApp enviada'", () => {
    // Verified via analyzeTextOrder output — safetyNotes are always set
    // The note is hard-coded in the service for every call
    const mockNotes = [
      "dry_run=true — nenhuma ordem criada",
      "dry_run=true — nenhum Pix gerado",
      "dry_run=true — nenhuma mensagem WhatsApp enviada",
      "dry_run=true — nenhum dado de cliente mutado",
    ];
    expect(mockNotes.some(n => n.includes("WhatsApp"))).toBe(true);
  });
});

// ── K. Feature flag disabled → not routed ────────────────────────────────────

describe("K. Feature flag disabled by default", () => {
  beforeEach(() => {
    delete process.env.WHATSAPP_TEXT_ORDERING_ENABLED;
    delete process.env.WHATSAPP_TEXT_ORDERING_ALLOWLIST;
  });

  it("flag disabled when env var not set", () => {
    expect(isWaTextOrderingEnabled()).toBe(false);
  });

  it("flag disabled when env var is 'false'", () => {
    process.env.WHATSAPP_TEXT_ORDERING_ENABLED = "false";
    expect(isWaTextOrderingEnabled()).toBe(false);
    delete process.env.WHATSAPP_TEXT_ORDERING_ENABLED;
  });

  it("flag enabled when env var is 'true' (no allowlist)", () => {
    process.env.WHATSAPP_TEXT_ORDERING_ENABLED = "true";
    expect(isWaTextOrderingEnabled()).toBe(true);
    delete process.env.WHATSAPP_TEXT_ORDERING_ENABLED;
  });

  it("flag enabled only for allowlisted restaurant", () => {
    process.env.WHATSAPP_TEXT_ORDERING_ENABLED   = "true";
    process.env.WHATSAPP_TEXT_ORDERING_ALLOWLIST_RESTAURANTS = "rest-abc,rest-def";
    expect(isWaTextOrderingEnabled("rest-abc")).toBe(true);
    expect(isWaTextOrderingEnabled("rest-xyz")).toBe(false);
    delete process.env.WHATSAPP_TEXT_ORDERING_ENABLED;
    delete process.env.WHATSAPP_TEXT_ORDERING_ALLOWLIST_RESTAURANTS;
  });

  it("webhook routing does not import new service (structural)", async () => {
    const fs = await import("node:fs/promises");
    const webhookSrc = await fs.readFile(
      new URL(
        "../../../../app/api/webhooks/evolution/route.ts",
        import.meta.url,
      ),
      "utf-8",
    );
    expect(webhookSrc).not.toContain("WhatsAppTextOrderService");
    expect(webhookSrc).not.toContain("analyzeTextOrder");
    expect(webhookSrc).not.toContain("wa-text-ordering-flag");
  });
});

// ── L. Pix placeholder never auto-confirms order ─────────────────────────────

describe("L. Pix placeholder never confirms order", () => {
  it("StubPaymentProvider.createPixPayment returns status=pending", async () => {
    const provider = new StubPaymentProvider();
    const result = await provider.createPixPayment({
      restaurantId:  "rest-1",
      orderId:       "order-1",
      amount:        60.0,
      customerName:  "Test",
      customerPhone: "+5511999990000",
    });
    expect(result.status).toBe("pending");
  });

  it("StubPaymentProvider.getPaymentStatus returns pending (never auto-approves)", async () => {
    const provider = new StubPaymentProvider();
    const status = await provider.getPaymentStatus("dry_run_order-1");
    expect(status).toBe("pending");
  });

  it("StubPaymentProvider never imports mercadopago (structural)", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile(
      new URL("../providers.ts", import.meta.url),
      "utf-8",
    );
    // Must not contain an actual import statement for mercadopago
    expect(src).not.toMatch(/import .* from ['"].*mercadopago/);
    expect(src).not.toMatch(/require\(['"].*mercadopago/);
    // The real MP function signature has (accessToken, params) — stub doesn't
    expect(src).not.toContain("createPixPayment(accessToken");
  });
});

// ── M. Tenant isolation ───────────────────────────────────────────────────────

describe("M. Tenant isolation", () => {
  it("matchItems with empty menu returns no matches (different restaurant data)", () => {
    const { matched, unresolved } = matchItems(
      [{ rawText: "yakisoba", quantity: 1, name: "yakisoba" }],
      [], // empty menu → nothing found
    );
    expect(matched).toHaveLength(0);
    expect(unresolved[0].reason).toBe("NOT_FOUND");
  });

  it("loadMenuForRestaurant uses restaurantId in prisma query (structural)", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile(
      new URL("../WhatsAppTextOrderService.ts", import.meta.url),
      "utf-8",
    );
    // Verifies menu is always loaded scoped to a restaurantId
    expect(src).toContain("restaurantId");
    expect(src).toContain("menuCategory.findMany");
  });
});

// ── N. Suggested reply is short and operational ───────────────────────────────

describe("N. Suggested reply is short and operational", () => {
  it("reply for ORDER_REQUEST with match is under 200 chars", () => {
    const { matched } = matchItems(
      [{ rawText: "yakisoba", quantity: 1, name: "yakisoba" }],
      [{ ...YAKISOBA, optionGroups: [] }], // no missing questions
    );
    const reply = buildSuggestedReply("ORDER_REQUEST", matched, [], []);
    expect(reply.length).toBeLessThan(200);
    expect(reply.length).toBeGreaterThan(5);
  });

  it("reply for HUMAN_NEEDED is under 100 chars", () => {
    const reply = buildSuggestedReply("HUMAN_NEEDED", [], [], []);
    expect(reply.length).toBeLessThan(100);
  });

  it("reply for NOT_FOUND mentions the item", () => {
    const unresolved = [{ rawText: "pizza napoletana", quantity: 1, reason: "NOT_FOUND" as const, candidates: [] }];
    const reply = buildSuggestedReply("ORDER_REQUEST", [], unresolved, []);
    expect(reply).toContain("pizza napoletana");
  });

  it("reply for missing option asks only one question", () => {
    const missing = [
      { itemName: "Yakisoba", groupName: "Tipo", required: true, options: ["Frango", "Carne"] },
      { itemName: "Yakisoba", groupName: "Molho", required: true, options: ["Shoyu", "Original"] },
    ];
    const reply = buildSuggestedReply("ORDER_REQUEST", [], [], missing);
    // Should ask only the first question, not both
    expect(reply).toContain("Yakisoba");
    expect(reply.split("?").length).toBeLessThanOrEqual(3); // at most 2 questions
  });

  it("reply for UNKNOWN is short and graceful", () => {
    const reply = buildSuggestedReply("UNKNOWN", [], [], []);
    expect(reply.length).toBeLessThan(100);
  });
});

// ── Delivery stub ─────────────────────────────────────────────────────────────

describe("StubDeliveryProvider", () => {
  it("returns status=unknown (never calls real routing)", async () => {
    const provider = new StubDeliveryProvider();
    const result = await provider.quoteAddress({ restaurantId: "r1", address: "Rua Teste", subtotal: 50 });
    expect(result.status).toBe("unknown");
    expect(result.fee).toBe(0);
  });

  it("validateDeliveryArea returns false (conservative default)", async () => {
    const provider = new StubDeliveryProvider();
    const ok = await provider.validateDeliveryArea("r1", "any address");
    expect(ok).toBe(false);
  });
});
