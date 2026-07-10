/**
 * MessageVariationService — unit tests (A–N)
 *
 * Tests target the PURE functions (composePreview, buildDeterministicVariants,
 * detectSpamLanguage, extractFacts, resolveIntent, etc.). No DB, no LLM, no sends.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  composePreview,
  buildDeterministicVariants,
  detectSpamLanguage,
  impliesDiscount,
  extractFacts,
  resolveIntent,
  isRepetitive,
  textSimilarity,
  DEFAULT_TONE,
  type GenerationSafety,
} from "@/services/crm/MessageVariationService";
import type { CustomerIntelligenceSnapshot } from "@/services/crm/CustomerIntelligenceSnapshotService";

// ── Snapshot factory ─────────────────────────────────────────────────────────

function makeSnapshot(overrides: Partial<CustomerIntelligenceSnapshot> = {}): CustomerIntelligenceSnapshot {
  return {
    id: "cust-1",
    name: "Diego Santos",
    phone: "5511999999999",
    contactability: "CONTACTABLE",
    totalOrders: 5,
    totalSpent: 350,
    averageTicket: 70,
    tier: "PRATA",
    lastOrderAt: "2025-04-01T12:00:00Z",
    daysSinceLastOrder: 80,
    segment: "FRIO",
    source: "native",
    averageDaysBetweenOrders: 15,
    orderFrequencyLabel: "quinzenal",
    favoriteProducts: [{ name: "Temaki Salmão", count: 4 }],
    favoriteCategories: [{ name: "Temakis", count: 6 }],
    lastProducts: ["Temaki Salmão", "Hot Roll"],
    couponUser: false,
    campaignReceivedCount: 1,
    lastCampaignAt: null,
    responseCount: 0,
    lastResponseAt: null,
    hasOptedOut: false,
    crmContactable: true,
    safetyStatus: "OK",
    nextBestAction: {
      actionType: "REACTIVATION",
      priority: "MEDIUM",
      priorityScore: 75,
      reason: "Cliente frio recuperável",
      recommendedChannel: "WHATSAPP",
      safeToContact: true,
      suggestedCampaignType: "recuperar-frios",
      suggestedOfferType: "DISCOUNT",
      suggestedMessageGoal: "Trazer o cliente de volta",
    },
    ...overrides,
  };
}

const SAFE: GenerationSafety = { hasOptedOut: false, contactable: true, hasPhone: true };

function compose(
  snapshot: CustomerIntelligenceSnapshot | null,
  candidates: string[],
  opts: Partial<Parameters<typeof composePreview>[0]> = {},
) {
  return composePreview({
    snapshot,
    intent: opts.intent ?? "REACTIVATION",
    couponCode: opts.couponCode ?? null,
    safety: opts.safety ?? SAFE,
    candidates,
    generatedBy: opts.generatedBy ?? "deterministic",
    previousMessages: opts.previousMessages ?? [],
    maxVariants: opts.maxVariants ?? 3,
  });
}

// ── Test A — cold customer with history → uses real product/category ──────────

describe("A — cold customer with history → reactivation draft uses real facts", () => {
  it("deterministic reactivation includes the real favorite product", () => {
    const snap = makeSnapshot({ segment: "FRIO" });
    const variants = buildDeterministicVariants({
      intent: "REACTIVATION",
      snapshot: snap,
      couponCode: null,
      tone: DEFAULT_TONE,
      restaurantName: "Sushi Cazza",
      maxVariants: 2,
    });
    expect(variants[0]).toContain("Temaki Salmão");
    const result = compose(snap, variants);
    expect(result.usedFacts.some((f) => f.includes("Temaki Salmão"))).toBe(true);
    expect(result.usedFacts.some((f) => f.includes("nome: Diego"))).toBe(true);
  });
});

// ── Test B — lost customer → stronger comeback tone but not spammy ─────────────

describe("B — lost customer → winback tone, not spammy", () => {
  it("winback draft is human and contains no forbidden spam language", () => {
    const snap = makeSnapshot({ segment: "PERDIDO", daysSinceLastOrder: 150 });
    const variants = buildDeterministicVariants({
      intent: "WINBACK",
      snapshot: snap,
      couponCode: null,
      tone: DEFAULT_TONE,
      restaurantName: "Sushi Cazza",
      maxVariants: 2,
    });
    const result = compose(snap, variants, { intent: "WINBACK" });
    expect(result.draftMessage).not.toBeNull();
    expect(detectSpamLanguage(result.draftMessage!)).toHaveLength(0);
    expect(result.intent).toBe("WINBACK");
  });
});

// ── Test C — no history → generic but human message ────────────────────────────

describe("C — no history → generic but human message", () => {
  it("produces a human generic draft with no invented facts", () => {
    const variants = buildDeterministicVariants({
      intent: "WELCOME",
      snapshot: null,
      couponCode: null,
      tone: DEFAULT_TONE,
      restaurantName: "Sushi Cazza",
      maxVariants: 2,
    });
    const result = compose(null, variants, { intent: "WELCOME" });
    expect(result.draftMessage).not.toBeNull();
    expect(detectSpamLanguage(result.draftMessage!)).toHaveLength(0);
    // No favorite product fabricated
    expect(result.draftMessage!).not.toMatch(/temaki|favorito/i);
    expect(result.missingFacts.some((f) => f.includes("sem snapshot"))).toBe(true);
  });
});

// ── Test D — provided coupon → included accurately ─────────────────────────────

describe("D — provided coupon → included accurately", () => {
  it("includes the exact coupon code and records it as a used fact", () => {
    const snap = makeSnapshot();
    const variants = buildDeterministicVariants({
      intent: "REACTIVATION",
      snapshot: snap,
      couponCode: "VOLTA10",
      tone: DEFAULT_TONE,
      restaurantName: "Sushi Cazza",
      maxVariants: 1,
    });
    expect(variants[0]).toContain("VOLTA10");
    const result = compose(snap, variants, { couponCode: "VOLTA10" });
    expect(result.draftMessage).toContain("VOLTA10");
    expect(result.usedFacts.some((f) => f.includes("cupom: VOLTA10"))).toBe(true);
  });
});

// ── Test E — no coupon → no fake discount ──────────────────────────────────────

describe("E — no coupon → no fake discount", () => {
  it("deterministic draft without coupon implies no discount", () => {
    const snap = makeSnapshot();
    const variants = buildDeterministicVariants({
      intent: "REACTIVATION",
      snapshot: snap,
      couponCode: null,
      tone: DEFAULT_TONE,
      restaurantName: "Sushi Cazza",
      maxVariants: 1,
    });
    expect(impliesDiscount(variants[0])).toBe(false);
  });

  it("composePreview rejects a candidate that implies discount without a coupon", () => {
    const snap = makeSnapshot();
    const sneaky = "Oi, Diego! Aproveite nosso super desconto imperdível hoje!";
    const result = compose(snap, [sneaky], { couponCode: null });
    // Spam + discount → no safe draft produced from this single candidate
    expect(result.draftMessage).toBeNull();
    expect(result.blockedReasons.length).toBeGreaterThan(0);
  });
});

// ── Test F — opted-out customer → blocked, no send-ready draft ─────────────────

describe("F — opted-out customer → blocked", () => {
  it("returns blocked with no draftMessage", () => {
    const snap = makeSnapshot({ hasOptedOut: true });
    const result = compose(snap, ["Oi, Diego! Volta pra gente."], {
      safety: { hasOptedOut: true, contactable: true, hasPhone: true },
    });
    expect(result.draftMessage).toBeNull();
    expect(result.blockedReasons.some((r) => r.toLowerCase().includes("opt-out"))).toBe(true);
    expect(result.generatedBy).toBe("none");
    expect(result.requiresApproval).toBe(true);
  });
});

// ── Test G — no phone customer → blocked/warning, no send-ready draft ──────────

describe("G — no phone customer → blocked", () => {
  it("returns blocked when customer has no phone", () => {
    const snap = makeSnapshot({ phone: null });
    const result = compose(snap, ["Oi, Diego!"], {
      safety: { hasOptedOut: false, contactable: true, hasPhone: false },
    });
    expect(result.draftMessage).toBeNull();
    expect(result.blockedReasons.some((r) => r.toLowerCase().includes("telefone"))).toBe(true);
  });
});

// ── Test H — previous message → draft differs ──────────────────────────────────

describe("H — previous message → draft differs", () => {
  it("rejects a candidate identical to a previous message", () => {
    const snap = makeSnapshot();
    const prior = "Oi, Diego! Senti sua falta por aqui. Quando quiser pedir, é só chamar.";
    const result = compose(snap, [prior], { previousMessages: [prior] });
    expect(result.draftMessage).toBeNull(); // only candidate was a repeat
  });

  it("accepts a sufficiently different candidate over a previous message", () => {
    const snap = makeSnapshot();
    const prior = "Oi, Diego! Senti sua falta por aqui.";
    const fresh = "E aí, Diego, beleza? Passando rapidinho só pra mandar um abraço da nossa equipe.";
    const result = compose(snap, [fresh], { previousMessages: [prior] });
    expect(result.draftMessage).toBe(fresh);
  });

  it("isRepetitive detects near-identical text", () => {
    expect(isRepetitive("Oi Diego tudo bem com voce", ["Oi Diego, tudo bem com você?"])).toBe(true);
    expect(textSimilarity("abc def ghi", "xyz uvw rst")).toBe(0);
  });
});

// ── Test I — generated text contains no forbidden spam language ─────────────────

describe("I — no forbidden spam language", () => {
  it("detectSpamLanguage flags creepy / spammy phrases", () => {
    expect(detectSpamLanguage("Detectamos inatividade no seu perfil de consumo.").length).toBeGreaterThan(0);
    expect(detectSpamLanguage("Promoção imperdível, clique agora!").length).toBeGreaterThan(0);
    expect(detectSpamLanguage("Última chance, não perca!").length).toBeGreaterThan(0);
  });

  it("all deterministic intents produce spam-free drafts", () => {
    const snap = makeSnapshot();
    const intents = ["REACTIVATION", "WINBACK", "VIP_APPRECIATION", "REVIEW_REQUEST", "WELCOME", "BIRTHDAY", "LOYALTY", "GENERIC"] as const;
    for (const intent of intents) {
      const variants = buildDeterministicVariants({
        intent, snapshot: snap, couponCode: null, tone: DEFAULT_TONE, restaurantName: "X", maxVariants: 2,
      });
      for (const v of variants) {
        expect(detectSpamLanguage(v), `intent ${intent}: "${v}"`).toHaveLength(0);
      }
    }
  });
});

// ── Test J — usedFacts only include real snapshot facts ────────────────────────

describe("J — usedFacts only include real snapshot facts", () => {
  it("does not list a favorite when snapshot has none", () => {
    const snap = makeSnapshot({ favoriteProducts: [], favoriteCategories: [] });
    const draft = "Oi, Diego! Que tal pedir aquele Temaki Salmão hoje?"; // mentions a product NOT in snapshot
    const { usedFacts, missingFacts } = extractFacts(draft, snap, null);
    // Temaki Salmão is not in snapshot favorites → must NOT be a used fact
    expect(usedFacts.some((f) => f.includes("Temaki"))).toBe(false);
    expect(missingFacts.some((f) => f.includes("produto favorito desconhecido"))).toBe(true);
  });

  it("only lists name/product when actually present in snapshot AND draft", () => {
    const snap = makeSnapshot();
    const draft = "Oi, Diego! Que tal pedir de novo aquele Temaki Salmão?";
    const { usedFacts } = extractFacts(draft, snap, null);
    expect(usedFacts).toContain("nome: Diego");
    expect(usedFacts.some((f) => f.includes("Temaki Salmão"))).toBe(true);
  });
});

// ── Test K — requiresApproval is always true ───────────────────────────────────

describe("K — requiresApproval always true", () => {
  it("is true on a successful draft", () => {
    const result = compose(makeSnapshot(), ["Oi, Diego! Que bom falar com você de novo."]);
    expect(result.requiresApproval).toBe(true);
  });
  it("is true even when blocked", () => {
    const result = compose(makeSnapshot({ hasOptedOut: true }), ["x"], {
      safety: { hasOptedOut: true, contactable: true, hasPhone: true },
    });
    expect(result.requiresApproval).toBe(true);
  });
});

// ── Intent resolution ──────────────────────────────────────────────────────────

describe("resolveIntent", () => {
  it("maps action center types to generation intents", () => {
    expect(resolveIntent("RECOVER_COLD_CUSTOMERS")).toBe("REACTIVATION");
    expect(resolveIntent("RECOVER_LOST_CUSTOMERS")).toBe("WINBACK");
    expect(resolveIntent("VIP_APPRECIATION")).toBe("VIP_APPRECIATION");
    expect(resolveIntent("REVIEW_REQUEST")).toBe("REVIEW_REQUEST");
    expect(resolveIntent("BIRTHDAY_CAMPAIGN")).toBe("BIRTHDAY");
    expect(resolveIntent("NO_ORDER_FIRST_PURCHASE")).toBe("WELCOME");
  });
  it("falls back to GENERIC for unknown", () => {
    expect(resolveIntent("SOMETHING_ELSE")).toBe("GENERIC");
    expect(resolveIntent(undefined, undefined)).toBe("GENERIC");
  });
});

// ── Composition extras ─────────────────────────────────────────────────────────

// ── Test L — endpoint tenant isolation (snapshot is tenant-scoped) ─────────────

describe("L — tenant isolation", () => {
  const serviceSrc = readFileSync(
    resolve(__dirname, "../MessageVariationService.ts"),
    "utf8",
  );
  const routeSrc = readFileSync(
    resolve(__dirname, "../../../app/api/crm/message-variation/preview/route.ts"),
    "utf8",
  );

  it("endpoint resolves tenant via getTenantContext and passes restaurantId", () => {
    expect(routeSrc).toContain("getTenantContext");
    expect(routeSrc).toContain("ctx.restaurantId");
  });

  it("snapshot lookup is scoped by restaurantId (tenant boundary)", () => {
    // getSnapshot(restaurantId, customerId, ...) — restaurantId is the first arg
    expect(serviceSrc).toMatch(/getSnapshot\(\s*input\.restaurantId/);
  });

  it("previous-message query filters by restaurantId", () => {
    expect(serviceSrc).toMatch(/campaignExecution\.findMany/);
    expect(serviceSrc).toMatch(/restaurantId:\s*input\.restaurantId/);
  });
});

// ── Test M — never sends a WhatsApp message ────────────────────────────────────

describe("M — no WhatsApp message is sent", () => {
  const serviceSrc = readFileSync(
    resolve(__dirname, "../MessageVariationService.ts"),
    "utf8",
  );

  it("service does not import or call any WhatsApp/Evolution send path", () => {
    expect(serviceSrc).not.toMatch(/EvolutionService|sendWhatsApp|sendMessage|sendText/i);
    expect(serviceSrc).not.toMatch(/messages\/sendText|\/message\/send/i);
  });

  it("LLM usage is read-only generation via the Brain engine router, no send side-effects", () => {
    // Fase 4 (Regra de Ouro): a geração passa pelo portão do Brain
    // (selectEngineRouted + callStructuredJson), nunca por um client direto.
    expect(serviceSrc).toContain("callStructuredJson");
    expect(serviceSrc).toContain("selectEngineRouted");
    expect(serviceSrc).not.toContain("openai.chat.completions.create");
  });
});

// ── Test N — never creates a CampaignExecution / Campaign ──────────────────────

describe("N — no CampaignExecution or Campaign is created", () => {
  const serviceSrc = readFileSync(
    resolve(__dirname, "../MessageVariationService.ts"),
    "utf8",
  );

  it("does not create CampaignExecution rows", () => {
    expect(serviceSrc).not.toMatch(/campaignExecution\.(create|createMany|update|upsert)/);
  });

  it("does not create Campaign rows", () => {
    expect(serviceSrc).not.toMatch(/campaign\.(create|createMany)/);
  });

  it("only reads campaignExecution (findMany) for anti-repetition", () => {
    expect(serviceSrc).toMatch(/campaignExecution\.findMany/);
  });
});

describe("composePreview behavior", () => {
  it("returns alternatives distinct from the draft", () => {
    const snap = makeSnapshot();
    const result = compose(snap, [
      "Oi, Diego! Faz tempo que não te vemos por aqui.",
      "E aí, Diego! A nossa equipe mandou um alô especial pra você voltar.",
    ], { maxVariants: 3 });
    expect(result.draftMessage).not.toBeNull();
    expect(result.alternatives.every((a) => a !== result.draftMessage)).toBe(true);
  });

  it("collapses near-duplicate candidates", () => {
    const snap = makeSnapshot();
    const result = compose(snap, [
      "Oi, Diego! Tudo bem com você?",
      "Oi, Diego! Tudo bem com você??",
    ]);
    expect(result.alternatives).toHaveLength(0);
  });

  it("adds a note when no coupon is provided", () => {
    const result = compose(makeSnapshot(), ["Oi, Diego! Que bom falar com você."]);
    expect(result.safetyNotes.some((n) => n.toLowerCase().includes("cupom"))).toBe(true);
  });
});
