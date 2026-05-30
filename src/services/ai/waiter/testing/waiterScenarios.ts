/**
 * waiterScenarios — Deterministic test cases for WaiterBrainV2.decide()
 *
 * Each scenario exercises a specific intent/behavior class against a REAL
 * restaurant catalog fetched at test time. Checks are evaluated by the
 * waiterEvaluator against the V2Output returned by decide().
 *
 * 9 groups:
 *  1. group_size         — "somos 4", "para 4 pessoas", "em família" → shareable cards
 *  2. portion_category   — "tem porção?", "quero uma porção" → Porções category cards
 *  3. light_intent       — "quero algo leve", "mais leve" → real cards, no denial
 *  4. budget_intent      — "quero algo barato", "opção econômica" → real cards
 *  5. recommendation     — "o que você recomenda?", "me sugere algo" → real cards
 *  6. upsell_open        — "o que tem de melhor?" → real cards
 *  7. restrictions       — "sou vegano", "sem glúten" → real cards (best-effort)
 *  8. checkout_guidance  — "quero finalizar", "como pago?" → checkout mode / guidance
 *  9. no_hallucination   — variety of messages → every returned ID in catalog
 */

// ─── check types ──────────────────────────────────────────────────────────────

export type CheckType =
  | "no_forbidden_denial"   // message must NOT match /não (encontrei|temos) (pessoas|porção)/
  | "cards_not_empty"       // cards.length > 0
  | "has_real_cards"        // every card ID exists in the live catalog
  | "no_hallucination"      // alias for has_real_cards (semantic distinction in output)
  | "includes_shareable"    // ≥1 card has servingSize >= 2 OR name/cat contains group keywords
  | "includes_category"     // ≥1 card is from a category matching categoryPattern
  // ── W4 consultative-selling checks ──────────────────────────────────────────
  | "has_cta_or_next_step"  // response invites a next action (CTA 👇 / question / option / add-language)
  | "no_long_menu_dump"     // cards.length ≤ MAX_CARDS_PER_RESPONSE (never dump the whole menu)
  | "respects_refusal";     // when refusedCategory set: NO returned card belongs to that category

export interface EvalCheck {
  type:             CheckType;
  categoryPattern?: string;          // regex string — required for includes_category
  refusedCategory?: "drink" | "dessert"; // required for respects_refusal
}

// ─── scenario definition ──────────────────────────────────────────────────────

export interface WaiterTestCase {
  id:              string;
  group:           string;    // machine ID (e.g. "group_size")
  groupLabel:      string;    // human-readable (e.g. "Grupo / Família")
  description:     string;    // what this case validates
  message:         string;    // the user message to feed into decide()
  cartItemIds?:    string[];  // pre-populate cart with explicit catalog IDs
  /**
   * Regex (string) resolved at eval time against the live catalog to seed the cart
   * with a real item (e.g. "combo|combinado"). Used by scenarios that need cart
   * context (pairing, refusal, checkout) without hard-coding restaurant IDs.
   */
  cartSeedPattern?: string;
  /** Optional session memory to simulate prior turns (e.g. an already-declined upsell). */
  memory?:          Partial<import("../../WaiterBrainV2").WaiterMemory>;
  checks:           EvalCheck[];
}

// ─── scenario library ─────────────────────────────────────────────────────────

export const WAITER_TEST_CASES: WaiterTestCase[] = [

  // ── 1. group_size ────────────────────────────────────────────────────────────

  {
    id:          "gs-01",
    group:       "group_size",
    groupLabel:  "Grupo / Família",
    description: "'para 4 pessoas' → shareable cards, no literal denial",
    message:     "o que vc tem para 4 pessoas?",
    checks: [
      { type: "no_forbidden_denial" },
      { type: "cards_not_empty" },
      { type: "has_real_cards" },
      { type: "includes_shareable" },
    ],
  },
  {
    id:          "gs-02",
    group:       "group_size",
    groupLabel:  "Grupo / Família",
    description: "'somos 4' → shareable cards, no literal denial",
    message:     "somos 4",
    checks: [
      { type: "no_forbidden_denial" },
      { type: "cards_not_empty" },
      { type: "has_real_cards" },
      { type: "includes_shareable" },
    ],
  },
  {
    id:          "gs-03",
    group:       "group_size",
    groupLabel:  "Grupo / Família",
    description: "'para a família' → shareable cards",
    message:     "quero algo para a família",
    checks: [
      { type: "no_forbidden_denial" },
      { type: "cards_not_empty" },
      { type: "has_real_cards" },
      { type: "includes_shareable" },
    ],
  },
  {
    id:          "gs-04",
    group:       "group_size",
    groupLabel:  "Grupo / Família",
    description: "'para 3 pessoas' with explicit number → shareable cards",
    message:     "me indica algo para 3 pessoas",
    checks: [
      { type: "no_forbidden_denial" },
      { type: "cards_not_empty" },
      { type: "has_real_cards" },
      { type: "includes_shareable" },
    ],
  },
  {
    id:          "gs-05",
    group:       "group_size",
    groupLabel:  "Grupo / Família",
    description: "'para compartilhar' → shareable cards",
    message:     "tem algo para compartilhar?",
    checks: [
      { type: "no_forbidden_denial" },
      { type: "cards_not_empty" },
      { type: "has_real_cards" },
      { type: "includes_shareable" },
    ],
  },

  // ── 2. portion_category ──────────────────────────────────────────────────────

  {
    id:          "pc-01",
    group:       "portion_category",
    groupLabel:  "Porção / Categoria",
    description: "'tem porção?' → Porções category cards, no literal denial",
    message:     "tem porção?",
    checks: [
      { type: "no_forbidden_denial" },
      { type: "cards_not_empty" },
      { type: "has_real_cards" },
    ],
  },
  {
    id:          "pc-02",
    group:       "portion_category",
    groupLabel:  "Porção / Categoria",
    description: "'quero uma porção' → real cards, no denial",
    message:     "quero uma porção",
    checks: [
      { type: "no_forbidden_denial" },
      { type: "cards_not_empty" },
      { type: "has_real_cards" },
    ],
  },
  {
    id:          "pc-03",
    group:       "portion_category",
    groupLabel:  "Porção / Categoria",
    description: "'me mostra as porções' → real cards, no denial",
    message:     "me mostra as porções",
    checks: [
      { type: "no_forbidden_denial" },
      { type: "cards_not_empty" },
      { type: "has_real_cards" },
    ],
  },

  // ── 3. light_intent ──────────────────────────────────────────────────────────

  {
    id:          "li-01",
    group:       "light_intent",
    groupLabel:  "Opção Leve",
    description: "'quero algo leve' → real cards, no denial",
    message:     "quero algo leve",
    checks: [
      { type: "no_forbidden_denial" },
      { type: "cards_not_empty" },
      { type: "has_real_cards" },
    ],
  },
  {
    id:          "li-02",
    group:       "light_intent",
    groupLabel:  "Opção Leve",
    description: "'tem opção mais leve?' → real cards",
    message:     "tem opção mais leve?",
    checks: [
      { type: "no_forbidden_denial" },
      { type: "cards_not_empty" },
      { type: "has_real_cards" },
    ],
  },
  {
    id:          "li-03",
    group:       "light_intent",
    groupLabel:  "Opção Leve",
    description: "'algo menos pesado' → real cards",
    message:     "quero algo menos pesado",
    checks: [
      { type: "no_forbidden_denial" },
      { type: "cards_not_empty" },
      { type: "has_real_cards" },
    ],
  },

  // ── 4. budget_intent ─────────────────────────────────────────────────────────

  {
    id:          "bi-01",
    group:       "budget_intent",
    groupLabel:  "Orçamento / Econômico",
    description: "'quero algo barato' → real cards, no denial",
    message:     "quero algo barato",
    checks: [
      { type: "no_forbidden_denial" },
      { type: "cards_not_empty" },
      { type: "has_real_cards" },
    ],
  },
  {
    id:          "bi-02",
    group:       "budget_intent",
    groupLabel:  "Orçamento / Econômico",
    description: "'opção mais em conta' → real cards",
    message:     "tem opção mais em conta?",
    checks: [
      { type: "no_forbidden_denial" },
      { type: "cards_not_empty" },
      { type: "has_real_cards" },
    ],
  },

  // ── 5. recommendation ────────────────────────────────────────────────────────

  {
    id:          "rc-01",
    group:       "recommendation",
    groupLabel:  "Recomendação",
    description: "'o que você recomenda?' → real cards, no denial",
    message:     "o que você recomenda?",
    checks: [
      { type: "no_forbidden_denial" },
      { type: "cards_not_empty" },
      { type: "has_real_cards" },
    ],
  },
  {
    id:          "rc-02",
    group:       "recommendation",
    groupLabel:  "Recomendação",
    description: "'me sugere algo' → real cards",
    message:     "me sugere algo",
    checks: [
      { type: "no_forbidden_denial" },
      { type: "cards_not_empty" },
      { type: "has_real_cards" },
    ],
  },
  {
    id:          "rc-03",
    group:       "recommendation",
    groupLabel:  "Recomendação",
    description: "'o que tem de bom?' → real cards",
    message:     "o que tem de bom?",
    checks: [
      { type: "no_forbidden_denial" },
      { type: "cards_not_empty" },
      { type: "has_real_cards" },
    ],
  },

  // ── 6. upsell_open ───────────────────────────────────────────────────────────

  {
    id:          "up-01",
    group:       "upsell_open",
    groupLabel:  "Upsell / Premium",
    description: "'o que tem de melhor?' → real cards",
    message:     "o que tem de melhor?",
    checks: [
      { type: "no_forbidden_denial" },
      { type: "cards_not_empty" },
      { type: "has_real_cards" },
    ],
  },
  {
    id:          "up-02",
    group:       "upsell_open",
    groupLabel:  "Upsell / Premium",
    description: "'quero a melhor opção' → real cards, no denial",
    message:     "quero a melhor opção do cardápio",
    checks: [
      { type: "no_forbidden_denial" },
      { type: "cards_not_empty" },
      { type: "has_real_cards" },
    ],
  },

  // ── 7. restrictions ──────────────────────────────────────────────────────────

  {
    id:          "re-01",
    group:       "restrictions",
    groupLabel:  "Restrições / Dieta",
    description: "'sou vegano' → real cards OR empty (no hallucination)",
    message:     "sou vegano, o que posso comer?",
    checks: [
      { type: "no_forbidden_denial" },
      { type: "has_real_cards" },
      { type: "no_hallucination" },
    ],
  },
  {
    id:          "re-02",
    group:       "restrictions",
    groupLabel:  "Restrições / Dieta",
    description: "'sem glúten' → real cards OR empty (no hallucination)",
    message:     "tem algo sem glúten?",
    checks: [
      { type: "no_forbidden_denial" },
      { type: "has_real_cards" },
      { type: "no_hallucination" },
    ],
  },

  // ── 8. checkout_guidance ─────────────────────────────────────────────────────

  {
    id:          "cg-01",
    group:       "checkout_guidance",
    groupLabel:  "Finalização / Checkout",
    description: "'quero finalizar' → always returns real output (no crash)",
    message:     "quero finalizar meu pedido",
    checks: [
      { type: "no_forbidden_denial" },
      { type: "has_real_cards" },
      { type: "no_hallucination" },
    ],
  },
  {
    id:          "cg-02",
    group:       "checkout_guidance",
    groupLabel:  "Finalização / Checkout",
    description: "'como pago?' → no hallucination, no denial",
    message:     "como eu pago?",
    checks: [
      { type: "no_forbidden_denial" },
      { type: "has_real_cards" },
      { type: "no_hallucination" },
    ],
  },

  // ── 9. no_hallucination ──────────────────────────────────────────────────────

  {
    id:          "nh-01",
    group:       "no_hallucination",
    groupLabel:  "Anti-Alucinação",
    description: "group-size query → every card ID in catalog",
    message:     "o que vc tem para 4 pessoas?",
    checks: [
      { type: "no_hallucination" },
      { type: "has_real_cards" },
    ],
  },
  {
    id:          "nh-02",
    group:       "no_hallucination",
    groupLabel:  "Anti-Alucinação",
    description: "porção query → every card ID in catalog",
    message:     "tem porção?",
    checks: [
      { type: "no_hallucination" },
      { type: "has_real_cards" },
    ],
  },
  {
    id:          "nh-03",
    group:       "no_hallucination",
    groupLabel:  "Anti-Alucinação",
    description: "recommendation → every card ID in catalog",
    message:     "me sugere algo",
    checks: [
      { type: "no_hallucination" },
      { type: "has_real_cards" },
    ],
  },
  {
    id:          "nh-04",
    group:       "no_hallucination",
    groupLabel:  "Anti-Alucinação",
    description: "light intent → every card ID in catalog",
    message:     "quero algo leve",
    checks: [
      { type: "no_hallucination" },
      { type: "has_real_cards" },
    ],
  },

  // ── 10. consultative_close (W4) — venda consultiva / fechamento ───────────────

  {
    id:          "vc-01",
    group:       "consultative_close",
    groupLabel:  "Venda Consultiva / Fechamento",
    description: "'me sugere algo' → real cards + CTA, no empty output, no dump",
    message:     "me sugere algo",
    checks: [
      { type: "no_forbidden_denial" },
      { type: "cards_not_empty" },
      { type: "has_real_cards" },
      { type: "has_cta_or_next_step" },
      { type: "no_long_menu_dump" },
    ],
  },
  {
    id:          "vc-02",
    group:       "consultative_close",
    groupLabel:  "Venda Consultiva / Fechamento",
    description: "'somos em 3 e queremos algo completo' → shareable rec + CTA",
    message:     "somos em 3 e queremos algo completo",
    checks: [
      { type: "no_forbidden_denial" },
      { type: "cards_not_empty" },
      { type: "has_real_cards" },
      { type: "includes_shareable" },
      { type: "has_cta_or_next_step" },
    ],
  },
  {
    id:          "vc-03",
    group:       "consultative_close",
    groupLabel:  "Venda Consultiva / Fechamento",
    description: "'quero algo leve' → light cards + short reason + CTA",
    message:     "quero algo leve",
    checks: [
      { type: "no_forbidden_denial" },
      { type: "cards_not_empty" },
      { type: "has_real_cards" },
      { type: "has_cta_or_next_step" },
      { type: "no_long_menu_dump" },
    ],
  },
  {
    id:          "vc-04",
    group:       "consultative_close",
    groupLabel:  "Venda Consultiva / Fechamento",
    description: "'tem opção mais em conta?' → budget cards + helpful CTA",
    message:     "tem opção mais em conta?",
    checks: [
      { type: "no_forbidden_denial" },
      { type: "cards_not_empty" },
      { type: "has_real_cards" },
      { type: "has_cta_or_next_step" },
    ],
  },
  {
    id:          "vc-05",
    group:       "consultative_close",
    groupLabel:  "Venda Consultiva / Fechamento",
    description: "'gostei, pode colocar' → confirm/ask-which, never a denial or dump",
    message:     "gostei, pode colocar",
    checks: [
      { type: "no_forbidden_denial" },
      { type: "no_hallucination" },
      { type: "has_cta_or_next_step" },
      { type: "no_long_menu_dump" },
    ],
  },
  {
    id:              "vc-06",
    group:           "consultative_close",
    groupLabel:      "Venda Consultiva / Fechamento",
    description:     "'não quero bebida' (cart has food) → refusal respected, no drink re-push",
    message:         "não quero bebida",
    cartSeedPattern: "uramaki|sushi|temaki|hot|combo|combinado|yakisoba|frango|carne|salm",
    checks: [
      { type: "no_forbidden_denial" },
      { type: "no_hallucination" },
      { type: "respects_refusal", refusedCategory: "drink" },
    ],
  },
  {
    id:              "vc-07",
    group:           "consultative_close",
    groupLabel:      "Venda Consultiva / Fechamento",
    description:     "'quero finalizar' (cart has items) → checkout guidance, no upsell dump",
    message:         "quero finalizar",
    cartSeedPattern: "uramaki|sushi|temaki|hot|combo|combinado|yakisoba|frango|carne|salm|.",
    checks: [
      { type: "no_forbidden_denial" },
      { type: "no_hallucination" },
      { type: "has_cta_or_next_step" },
      { type: "no_long_menu_dump" },
      { type: "respects_refusal", refusedCategory: "drink" },
    ],
  },
  {
    id:              "vc-08",
    group:           "consultative_close",
    groupLabel:      "Venda Consultiva / Fechamento",
    description:     "'o que combina com esse combo?' (combo in cart) → contextual pairing + CTA",
    message:         "o que combina com esse combo?",
    cartSeedPattern: "combo|combinado|festival|bandeja|uramaki|sushi|temaki|.",
    checks: [
      { type: "no_forbidden_denial" },
      { type: "cards_not_empty" },
      { type: "has_real_cards" },
      { type: "has_cta_or_next_step" },
      { type: "no_long_menu_dump" },
    ],
  },
];

// ─── group registry ───────────────────────────────────────────────────────────

export interface ScenarioGroup {
  id:    string;
  label: string;
  count: number;
}

export function getScenarioGroups(): ScenarioGroup[] {
  const groups = new Map<string, { label: string; count: number }>();
  for (const tc of WAITER_TEST_CASES) {
    const g = groups.get(tc.group);
    if (g) { g.count++; }
    else    { groups.set(tc.group, { label: tc.groupLabel, count: 1 }); }
  }
  return Array.from(groups.entries()).map(([id, { label, count }]) => ({ id, label, count }));
}
