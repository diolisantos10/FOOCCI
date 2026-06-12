/**
 * WhatsApp Text Ordering — Scenario library.
 *
 * Declarative, multi-turn conversation fixtures for the admin Scenario Runner.
 * Each scenario is a full conversation (a list of customer messages) plus the
 * expectations the runner should evaluate after replaying it through the state
 * machine in DRY_RUN_ONLY. No I/O, no DB — pure data.
 *
 * The runner replays `messages` sequentially, preserving session state between
 * turns (exactly what a real WhatsApp conversation does), so a scenario like
 * "quero 2 yakisoba e uma coca" → "carne e frango" → "normal" is tested as ONE
 * continuing session instead of three isolated messages.
 *
 * SAFETY: every scenario runs with allowSideEffects=false. No scenario may set
 * shouldCreateOrder / shouldCreatePix / shouldSendWhatsApp to true — these exist
 * only so the runner can assert they NEVER happen in dry-run.
 */

import type { WaOrderStage, WaSessionStatus, WaDetectedIntent } from "../types";

export type WaScenarioCategory =
  | "basic"            // 1. Basic order parsing
  | "ambiguous"        // 2. Ambiguous products
  | "required_options" // 3. Required options
  | "quantity"         // 4. Quantity changes
  | "modify"           // 5. Add/remove/change item
  | "delivery"         // 6. Delivery/pickup
  | "address_freight"  // 7. Address/freight
  | "payment"          // 8. Payment
  | "pix_safety"       // 9. Pix safety
  | "handoff"          // 10. Handoff
  | "noise"            // 11. Bad input / noise
  | "regression";      // 12. Regression safety

/** Which runner button(s) include this scenario. "all" always includes it. */
export type WaScenarioSuite = "quick" | "full" | "edge" | "payment";

export interface WaScenarioExpectedItem {
  /** Normalized substring match against the final matched item names. */
  name:      string;
  quantity?: number;
}

export interface WaOrderingScenario {
  id:                 string;
  name:               string;
  category:           WaScenarioCategory;
  description:        string;
  messages:           string[];
  suites:             WaScenarioSuite[];

  // ── Expectations (all optional; unset = not checked) ──────────────────────
  expectedFinalStage?:  WaOrderStage | WaOrderStage[];
  expectedStatus?:      WaSessionStatus | WaSessionStatus[];
  expectedItems?:       WaScenarioExpectedItem[];
  /** Group-name / keyword substrings expected among pending questions. */
  expectedQuestions?:   string[];
  /** Expect at least one unresolved (NOT_FOUND/AMBIGUOUS/UNAVAILABLE) item at the end. */
  expectUnresolved?:    boolean;
  /** Expect the conversation to end in handoff. */
  expectHandoff?:       boolean;
  /** Expect a completed draft (selectedItems present, no missingRequirements). */
  expectCompleteDraft?: boolean;

  // ── W8: stricter expectations (close false-positive gaps) ─────────────────
  /** Delivery type that must be captured by the end (e.g. one-line orders). */
  expectedDeliveryType?:  "DELIVERY" | "PICKUP";
  /** Payment method that must be captured by the end. */
  expectedPaymentMethod?: "PIX" | "CARD" | "CASH";
  /** Cash change amount that must be parsed and stored. */
  expectedCashChange?:    number;
  /** Detected intent expected on at least one turn (e.g. QUESTION for menu Q). */
  expectIntent?:          WaDetectedIntent | WaDetectedIntent[];
  /** Expect NO order draft to be built (a question must not become a product). */
  expectNoDraft?:         boolean;
  /** Exact number of matched item lines expected at the end (add/change flows). */
  expectedItemCount?:     number;
  /** Item-name substrings that must NOT appear in the final draft (replaced items). */
  forbiddenItems?:        string[];

  // ── Safety expectations (dry-run invariants — always asserted) ────────────
  shouldCreateOrder:  false;
  shouldCreatePix:    false;
  shouldSendWhatsApp: false;

  /**
   * The scenario references restaurant-specific products. When true, item/stage
   * mismatches that look like "the menu simply doesn't have this product" are
   * downgraded to WARN (tuning needed) instead of FAIL. Structural invariants
   * (session continuity, no answer-reparse, no duplicate, no side effects) stay
   * FAIL regardless.
   */
  menuDependent:      boolean;

  tags?:              string[];
}

const SAFE = { shouldCreateOrder: false, shouldCreatePix: false, shouldSendWhatsApp: false } as const;

// ════════════════════════════════════════════════════════════════════════════
//  PART 4 — Smoke scenarios (quick)
// ════════════════════════════════════════════════════════════════════════════

const SMOKE: WaOrderingScenario[] = [
  {
    id: "smoke-yakisoba-coca-ambiguity",
    name: "Yakisoba + Coca (fila de ambiguidade)",
    category: "ambiguous",
    description:
      "Dois itens ambíguos resolvidos um de cada vez, preservando quantidade e sem duplicar.",
    messages: ["quero 2 yakisoba e uma coca", "carne e frango", "normal"],
    suites: ["quick", "full"],
    expectedItems: [
      { name: "yakisoba", quantity: 2 },
      { name: "coca", quantity: 1 },
    ],
    expectedFinalStage: ["COLLECTING_DELIVERY_TYPE", "COLLECTING_REQUIRED_OPTIONS", "REVIEWING_ORDER"],
    menuDependent: true,
    tags: ["regression", "ambiguity", "quantity"],
    ...SAFE,
  },
  {
    id: "smoke-coca-zero-direct",
    name: "Coca Zero direta",
    category: "basic",
    description: "Pedido direto de um item específico, sem ambiguidade.",
    messages: ["quero uma coca zero"],
    suites: ["quick", "full"],
    expectedItems: [{ name: "coca", quantity: 1 }],
    menuDependent: true,
    tags: ["basic"],
    ...SAFE,
  },
  {
    id: "smoke-unknown-product",
    name: "Produto inexistente",
    category: "noise",
    description: "Produto que não existe no cardápio deve virar item não resolvido / pedido de esclarecimento.",
    messages: ["quero um produto inexistente absurdo"],
    suites: ["quick", "full", "edge"],
    expectUnresolved: true,
    expectCompleteDraft: false,
    menuDependent: false,
    tags: ["noise", "not_found"],
    ...SAFE,
  },
  {
    id: "smoke-human-request",
    name: "Falar com atendente",
    category: "handoff",
    description: "Pedido explícito de atendente deve escalar para humano.",
    messages: ["quero falar com atendente"],
    suites: ["quick", "full"],
    expectedFinalStage: "HANDOFF_REQUIRED",
    expectedStatus: "HANDOFF_REQUIRED",
    expectHandoff: true,
    menuDependent: false,
    tags: ["handoff"],
    ...SAFE,
  },
  {
    id: "smoke-cancel",
    name: "Cancelar pedido",
    category: "regression",
    description: "Cliente cancela no meio do pedido — sessão deve encerrar como CANCELLED.",
    messages: ["quero 2 yakisoba", "cancela"],
    suites: ["quick", "full"],
    expectedFinalStage: "CANCELLED",
    expectedStatus: "CANCELLED",
    menuDependent: false,
    tags: ["cancel"],
    ...SAFE,
  },
];

// ════════════════════════════════════════════════════════════════════════════
//  PART 5 — Full ordering scenarios (full)
// ════════════════════════════════════════════════════════════════════════════

const FULL: WaOrderingScenario[] = [
  {
    id: "full-delivery-pix",
    name: "Entrega + Pix (dry-run)",
    category: "payment",
    description: "Fluxo completo até Pix — Pix deve ser apenas stub, sem pedido/Pix real.",
    messages: [
      "quero 2 yakisoba e uma coca",
      "carne e frango",
      "normal",
      "entrega",
      "01310-100",
      "1",
      "123",
      "pix",
    ],
    suites: ["full", "payment"],
    expectedItems: [{ name: "yakisoba", quantity: 2 }, { name: "coca", quantity: 1 }],
    menuDependent: true,
    tags: ["delivery", "pix", "regression"],
    ...SAFE,
  },
  {
    id: "full-pickup-card",
    name: "Retirada + cartão na retirada",
    category: "delivery",
    description: "Retirada não pede endereço, frete 0, pagamento cartão.",
    messages: ["quero um yakisoba de camarão", "retirada", "cartão"],
    suites: ["full", "payment"],
    expectedItems: [{ name: "yakisoba", quantity: 1 }],
    menuDependent: true,
    tags: ["pickup", "card"],
    ...SAFE,
  },
  {
    id: "full-cash-change",
    name: "Dinheiro com troco",
    category: "payment",
    description: "Pagamento em dinheiro com troco para R$ 100, sem Pix. Yakisoba Carne e Frango resolvido direto (sem ambiguidade de 'frango').",
    messages: [
      "quero um yakisoba carne e frango",
      "entrega",
      "01310-100",
      "1",
      "123",
      "dinheiro, troco para 100",
    ],
    suites: ["full", "payment"],
    expectedItems: [{ name: "yakisoba", quantity: 1 }],
    expectedDeliveryType: "DELIVERY",
    expectedPaymentMethod: "CASH",
    expectedCashChange: 100,
    menuDependent: true,
    tags: ["cash", "change", "delivery"],
    ...SAFE,
  },
  {
    id: "full-add-item",
    name: "Adicionar item depois",
    category: "modify",
    description: "Cliente adiciona um segundo item após o primeiro, sem substituir — draft final com Coca-Cola + Coca Zero.",
    messages: ["quero uma coca", "normal", "adiciona mais uma coca zero"],
    suites: ["full"],
    expectedItems: [{ name: "coca cola" }, { name: "zero" }],
    expectedItemCount: 2,
    menuDependent: true,
    tags: ["add"],
    ...SAFE,
  },
  {
    id: "full-change-quantity",
    name: "Alterar quantidade",
    category: "quantity",
    description: "Cliente reduz a quantidade — não deve duplicar a linha nem criar item novo.",
    messages: ["quero 2 yakisoba carne e frango", "na verdade só 1"],
    suites: ["full"],
    expectedItems: [{ name: "yakisoba", quantity: 1 }],
    expectedItemCount: 1,
    menuDependent: true,
    tags: ["quantity"],
    ...SAFE,
  },
  {
    id: "full-change-item",
    name: "Trocar item",
    category: "modify",
    description: "Cliente troca o item escolhido por outro — Camarão sai, Carne e Frango entra.",
    messages: ["quero yakisoba de camarão", "troca por carne e frango"],
    suites: ["full"],
    expectedItems: [{ name: "yakisoba" }],
    expectedItemCount: 1,
    forbiddenItems: ["camar"],
    menuDependent: true,
    tags: ["change"],
    ...SAFE,
  },
];

// ════════════════════════════════════════════════════════════════════════════
//  PART 6 — Edge cases (edge)
// ════════════════════════════════════════════════════════════════════════════

const EDGE: WaOrderingScenario[] = [
  {
    id: "edge-typo-kisoba",
    name: "Erro de digitação: kisoba",
    category: "noise",
    description: "Erro de digitação leve no nome do produto.",
    messages: ["quero um kisoba"],
    suites: ["edge"],
    menuDependent: true,
    tags: ["typo"],
    ...SAFE,
  },
  {
    id: "edge-cocacola-variants",
    name: "Variações de escrita: coca cola / cocacola",
    category: "noise",
    description: "Mesmo produto escrito de formas diferentes.",
    messages: ["quero uma cocacola"],
    suites: ["edge"],
    menuDependent: true,
    tags: ["typo", "variants"],
    ...SAFE,
  },
  {
    id: "edge-plural-cocas",
    name: "Plural: duas cocas",
    category: "quantity",
    description: "Quantidade por extenso no plural — normaliza 'cocas' → 'coca', resolve ambiguidade.",
    messages: ["quero duas cocas", "normal"],
    suites: ["edge"],
    expectedItems: [{ name: "coca", quantity: 2 }],
    menuDependent: true,
    tags: ["plural", "quantity"],
    ...SAFE,
  },
  {
    id: "edge-words-numbers",
    name: "Números por extenso: dois yakisobas",
    category: "quantity",
    description: "Quantidade escrita por extenso — normaliza 'yakisobas' → 'yakisoba', resolve ambiguidade.",
    messages: ["quero dois yakisobas", "carne e frango"],
    suites: ["edge"],
    expectedItems: [{ name: "yakisoba", quantity: 2 }],
    menuDependent: true,
    tags: ["words", "quantity"],
    ...SAFE,
  },
  {
    id: "edge-mixed-order-one-line",
    name: "Pedido misto em uma linha",
    category: "basic",
    description: "Vários itens e instruções na mesma mensagem — itens, entrega e Pix capturados; pede o endereço (que falta). Nunca volta para 'o que deseja'.",
    messages: ["2 yakisoba frango, 1 coca normal, entrega, pix"],
    suites: ["edge"],
    expectedItems: [{ name: "yakisoba", quantity: 2 }, { name: "coca", quantity: 1 }],
    expectedDeliveryType: "DELIVERY",
    expectedPaymentMethod: "PIX",
    expectedFinalStage: "COLLECTING_ADDRESS",
    menuDependent: true,
    tags: ["mixed"],
    ...SAFE,
  },
  {
    id: "edge-address-before-asked",
    name: "Endereço antes da hora",
    category: "address_freight",
    description: "Cliente manda endereço antes de escolher itens — não deve quebrar.",
    messages: ["Rua das Flores, 123, Centro", "quero uma coca"],
    suites: ["edge"],
    menuDependent: true,
    tags: ["address", "out_of_order"],
    ...SAFE,
  },
  {
    id: "edge-payment-before-asked",
    name: "Pagamento antes da hora",
    category: "payment",
    description: "Cliente fala em pix antes de montar o pedido.",
    messages: ["vou pagar no pix", "quero uma coca"],
    suites: ["edge"],
    menuDependent: true,
    tags: ["payment", "out_of_order"],
    ...SAFE,
  },
  {
    id: "edge-menu-question",
    name: "Pergunta de cardápio",
    category: "noise",
    description: "Cliente faz pergunta em vez de pedir — classifica como QUESTION, não monta pedido e não trata a frase inteira como produto inexistente.",
    messages: ["vocês têm yakisoba vegetariano?"],
    suites: ["edge"],
    expectIntent: "QUESTION",
    expectNoDraft: true,
    menuDependent: false,
    tags: ["question"],
    ...SAFE,
  },
  {
    id: "edge-complaint",
    name: "Reclamação",
    category: "handoff",
    description: "Reclamação deve escalar para humano.",
    messages: ["meu último pedido veio errado, que absurdo"],
    suites: ["edge"],
    expectHandoff: true,
    menuDependent: false,
    tags: ["complaint", "handoff"],
    ...SAFE,
  },
  {
    id: "edge-empty-noise",
    name: "Ruído / mensagem vazia de sentido",
    category: "noise",
    description: "Mensagem sem intenção clara de pedido.",
    messages: ["oi tudo bem?"],
    suites: ["edge"],
    menuDependent: false,
    tags: ["noise"],
    ...SAFE,
  },
];

export const WHATSAPP_ORDERING_SCENARIOS: WaOrderingScenario[] = [
  ...SMOKE,
  ...FULL,
  ...EDGE,
];

/** Returns the scenarios for a given runner suite ("all" returns everything). */
export function scenariosForSuite(
  suite: WaScenarioSuite | "all",
): WaOrderingScenario[] {
  if (suite === "all") return WHATSAPP_ORDERING_SCENARIOS;
  return WHATSAPP_ORDERING_SCENARIOS.filter(s => s.suites.includes(suite));
}
