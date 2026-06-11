/**
 * WhatsAppTextOrderSimulatorService — automated, hermetic proof of the WhatsApp
 * "anotador de pedido" flow that lets an operator (and CI) validate the WHOLE
 * journey WITHOUT a phone, WITHOUT sending WhatsApp, and WITHOUT creating a real
 * order or Pix.
 *
 * It drives the REAL state machine (`processCustomerMessage`) over a SYNTHETIC
 * catalog + SYNTHETIC PaymentSettings + SYNTHETIC saved address (all injected),
 * with `allowSideEffects=false`. For each canonical scenario it returns a full
 * transcript (what the customer would see), the comanda that would be built, the
 * actions that WOULD run (CREATE_ORDER/GENERATE_PIX surfaced as WOULD_*), safety
 * flags and graded checks (P0/P1/P2). Config scenarios reuse `assessReadiness`.
 *
 * HARD INVARIANTS: no Evolution, no real order, no real Pix, runtimeTouched=false.
 */

import { processCustomerMessage } from "./WhatsAppTextOrderService";
import { enrichSessionMetadata, renderPaymentQuestion, type ConfiguredPaymentOptions, type SavedAddress } from "./checkoutBridge";
import { buildFullDraft } from "./WhatsAppOrderDraftBuilder";
import { extractOrderEntities } from "@/services/whatsapp/brain/WhatsAppBrainReasoningAdapter";
import { assessReadiness } from "./configDiagnostic";
import { MENU_FOOTER } from "./menuFooter";
import type { WaMenuItem, WaPersistedSession, WaDeliveryQuoter } from "./types";

// ── Synthetic world (no DB) ──────────────────────────────────────────────────
const mk = (over: Partial<WaMenuItem> & Pick<WaMenuItem, "id" | "name" | "price">): WaMenuItem => ({
  priceDelivery: null, isActive: true, isAvailable: true, showInDelivery: true,
  hasVariants: false, variants: [], optionGroups: [], extras: [], ...over,
} as WaMenuItem);

const CATALOG: WaMenuItem[] = [
  mk({ id: "m1", name: "Yakisoba Frango", price: 39.9 }),
  mk({ id: "m2", name: "Yakisoba Carne e Frango", price: 44.9 }),
  mk({ id: "m3", name: "Yakisoba Legumes", price: 36.9 }),
  mk({ id: "m4", name: "Coca-Cola lata", price: 7 }),
  mk({ id: "m5", name: "Coca-Cola 2L", price: 14 }),
  mk({ id: "m6", name: "Guaraná lata", price: 6.5 }),
  mk({ id: "m7", name: "Temaki Salmão", price: 29.9 }),
  mk({ id: "m8", name: "Combinado 20 peças", price: 69.9 }),
];

const SYNTHETIC_ADDRESS: SavedAddress = {
  street: "Rua das Flores", number: "123", neighborhood: "Centro", formatted: "Rua das Flores, 123 — Centro",
};

// A fixed delivery quote so the DELIVERY payment path runs with no DB.
const syntheticQuoter: WaDeliveryQuoter = async () => ({ fee: 8, distanceKm: 3, status: "ok" });

export type SimMode = "DRY_RUN" | "REPLY_ONLY" | "FULL_TEST";
const SIM_MODE_TO_WA: Record<SimMode, "DRY_RUN_ONLY" | "ALLOWLIST_REPLY_ONLY" | "ALLOWLIST_FULL_TEST"> = {
  DRY_RUN: "DRY_RUN_ONLY", REPLY_ONLY: "ALLOWLIST_REPLY_ONLY", FULL_TEST: "ALLOWLIST_FULL_TEST",
};

export interface SimTranscriptLine { actor: "CUSTOMER" | "AGENT" | "SYSTEM"; text: string; }
export interface SimCheck { name: string; passed: boolean; severity: "P0" | "P1" | "P2"; message: string; }
export interface SimSafety { noEvolution: boolean; noRealOrder: boolean; noRealPix: boolean; runtimeTouched: false; }

/** Operator-facing summary of what the flow did (synthetic data only, no PII). */
export interface SimScenarioSummary {
  itemsFound: { name: string; quantity: number }[];
  itemsAmbiguous: string[];
  paymentMethod: string | null;
  deliveryType: string | null;
  addressUsed: string | null;
}

export interface SimScenarioResult {
  status: "PASS" | "WARNING" | "FAIL";
  scenarioId: string;
  name: string;
  kind: "FLOW" | "CONFIG";
  transcript: SimTranscriptLine[];
  detectedIntent: string;
  extractedEntities: unknown;
  orderDraft: unknown;
  actions: string[];
  summary: SimScenarioSummary;
  safety: SimSafety;
  checks: SimCheck[];
}

export interface SimReport {
  ok: boolean;
  status: "PASS" | "WARNING" | "FAIL";
  total: number;
  passed: number;
  warned: number;
  failed: number;
  p0: number;
  mode: SimMode;
  scenarios: SimScenarioResult[];
  safety: SimSafety;
  runtimeTouched: false;
}

interface FlowScenario {
  id: string;
  name: string;
  messages: string[];
  /** Synthetic PaymentSettings for this scenario (defaults to all three). */
  payment?: ConfiguredPaymentOptions["order"];
  /** Provide a saved address (offered on DELIVERY). */
  withSavedAddress?: boolean;
  check: (ctx: ScenarioEval) => SimCheck[];
}

interface ScenarioEval {
  transcript: SimTranscriptLine[];
  agentReplies: string[];
  firstIntent: string;
  actions: string[];
  entities: unknown;
  createdRealOrder: boolean;
  createdRealPix: boolean;
  wouldCreateOrder: boolean;
  wouldGeneratePix: boolean;
  /** Index of the agent reply on the turn that emitted GENERATE_PIX (-1 if none). */
  pixTurnIndex: number;
  finalItems: { name: string; quantity: number }[];
  joinedReplies: string;
  /** All agent replies strictly before a given turn index, joined. */
  repliesBefore: (index: number) => string;
}

const has = (haystack: string, needle: string) => haystack.toLowerCase().includes(needle.toLowerCase());
const ALL3: ConfiguredPaymentOptions["order"] = ["PIX", "CARD", "CASH"];

// ── Canonical flow scenarios (Part 2, 1–8) ───────────────────────────────────
const ORDER_INTENTS = ["ORDER_REQUEST", "ORDER_BY_TEXT"];
const FLOW_SCENARIOS: FlowScenario[] = [
  {
    // Cenário 1 (headline): prova detecção + extração no texto livre como o cliente escreve.
    id: "sim-free-text-detect",
    name: "Texto livre — detecção e extração",
    messages: ["Quero um yakisoba de frango e uma coca. Vou pagar em dinheiro na entrega."],
    check: (c) => [
      check("detecta intenção de pedido", ORDER_INTENTS.includes(c.firstIntent), "P0", `intent=${c.firstIntent}`),
      check("extrai itens (yakisoba/coca)", entItems(c.entities).length >= 1, "P1", "não extraiu itens"),
      check("detecta pagamento (dinheiro)", /dinheiro/i.test(String((c.entities as Record<string, unknown>)?.paymentMentioned ?? "")), "P1", "não detectou dinheiro"),
      check("detecta entrega", /entrega/i.test(String((c.entities as Record<string, unknown>)?.deliveryMentioned ?? "")), "P1", "não detectou entrega"),
      check("não cria pedido na simulação", !c.createdRealOrder, "P0", "pedido real criado em simulação"),
      check("rodapé 0. menu", c.agentReplies.every(r => hasFooter(r)), "P1", "resposta ativa sem 0. menu"),
    ],
  },
  {
    // Cenário 1 (completo): dinheiro + entrega + endereço salvo + troco, até montar a comanda.
    id: "sim-cash-delivery",
    name: "Pedido + dinheiro + entrega + endereço salvo",
    messages: ["Quero um combinado", "entrega", "1", "dinheiro", "1"],
    withSavedAddress: true,
    check: (c) => [
      check("oferece endereço salvo", has(c.joinedReplies, "Rua das Flores"), "P1", "não ofereceu o endereço salvo"),
      check("pergunta troco no dinheiro", has(c.joinedReplies, "troco"), "P1", "não perguntou troco"),
      check("montaria o pedido (WOULD_CREATE_ORDER)", c.wouldCreateOrder, "P1", "não chegou a montar pedido"),
      check("não cria pedido real na simulação", !c.createdRealOrder, "P0", "pedido real criado"),
      check("rodapé 0. menu nas respostas ativas", c.agentReplies.every(r => hasFooter(r)), "P1", "resposta ativa sem 0. menu"),
    ],
  },
  {
    // Cenário 2: Pix — só gera após o resumo/confirmação, e em simulação é stub.
    id: "sim-pix-pickup",
    name: "Pedido + Pix",
    messages: ["Quero um temaki", "retirada", "pix"],
    check: (c) => [
      check("Pix sinalizado (WOULD_GENERATE_PIX)", c.wouldGeneratePix, "P1", "não sinalizou geração de Pix"),
      check("Pix só após o resumo do pedido", c.pixTurnIndex >= 0 && has(c.repliesBefore(c.pixTurnIndex), "resumo do pedido"), "P1", "Pix antes do resumo"),
      check("não gera Pix real na simulação", !c.createdRealPix, "P0", "Pix real gerado em simulação"),
    ],
  },
  {
    // Cenário 3: retirada — sem endereço, vai direto para pagamento.
    id: "sim-pickup",
    name: "Retirada",
    messages: ["Quero um combinado", "retirada", "dinheiro", "1"],
    check: (c) => [
      check("não pede endereço na retirada", !has(c.joinedReplies, "endereço de entrega") && !has(c.joinedReplies, "Rua das Flores"), "P1", "pediu endereço na retirada"),
      check("montaria o pedido (WOULD_CREATE_ORDER)", c.wouldCreateOrder, "P1", "não chegou a montar pedido"),
      check("não cria pedido real", !c.createdRealOrder, "P0", "pedido real criado"),
    ],
  },
  {
    // Cenário 4: produto inexistente — nunca inventa.
    id: "sim-not-found",
    name: "Produto inexistente",
    messages: ["Quero uma lasanha."],
    check: (c) => [
      check("não inventa produto", !c.finalItems.some(i => /lasanha/i.test(i.name)), "P0", "inventou lasanha na comanda"),
      check("oferece confirmar/atendente", has(c.joinedReplies, "atendente") || has(c.joinedReplies, "confirmar") || has(c.joinedReplies, "cardápio"), "P1", "não ofereceu saída segura"),
    ],
  },
  {
    // Cenário 5: produto ambíguo — lista opções numeradas, não escolhe sozinho.
    id: "sim-ambiguous",
    name: "Produto ambíguo",
    messages: ["Quero uma coca"],
    check: (c) => [
      check("lista opções numeradas reais", /1\s*[—.\-]/.test(c.joinedReplies), "P1", "não listou opções numeradas"),
      check("não escolhe sozinho", c.finalItems.length === 0, "P1", "escolheu uma opção sozinho"),
    ],
  },
  {
    // Cenário 6: 0 com comanda — pergunta continuar/descartar, não descarta sozinho.
    id: "sim-menu-zero",
    name: "Menu (0) com comanda em andamento",
    messages: ["Quero um combinado", "0"],
    check: (c) => [
      check("0 com comanda pergunta continuar/descartar", has(c.joinedReplies, "continuar") && has(c.joinedReplies, "descartar"), "P1", "não ofereceu continuar/descartar"),
      check("não descarta sozinho (sem pedido real)", !c.createdRealOrder, "P2", ""),
    ],
  },
  {
    // Cenário 7: atendente — handoff.
    id: "sim-handoff",
    name: "Atendente (handoff)",
    messages: ["Quero falar com atendente."],
    check: (c) => [
      check("faz handoff", has(c.joinedReplies, "atendente"), "P0", "não encaminhou para atendente"),
      check("não cria pedido", !c.createdRealOrder, "P0", "pedido real criado no handoff"),
    ],
  },
  {
    // Cenário 8: perguntas de cardápio (W8/W9) — não cita a frase como produto inexistente.
    id: "sim-menu-questions",
    name: "Perguntas de cardápio (W8/W9)",
    messages: ["tem yakisoba vegetariano?"],
    check: (c) => [
      check("não cita a frase entre aspas como produto", !/n[ãa]o encontrei "[^"]+" no card[aá]pio/i.test(c.joinedReplies), "P0", "citou a frase entre aspas como produto"),
      check("responde como pergunta, sem inventar", c.firstIntent === "QUESTION", "P1", `intent=${c.firstIntent}`),
    ],
  },
];

function check(name: string, passed: boolean, severity: SimCheck["severity"], failMsg: string): SimCheck {
  return { name, passed, severity, message: passed ? "ok" : failMsg };
}
function entItems(entities: unknown): unknown[] {
  const items = (entities as { items?: unknown[] } | null)?.items;
  return Array.isArray(items) ? items : [];
}
/** Active replies must carry the `0. menu` footer; terminal replies (order/Pix/handoff) don't. */
function hasFooter(reply: string): boolean {
  if (reply.includes(MENU_FOOTER)) return true;
  return /pedido anotado|pedido confirmado|pix gerado|chamar um atendente|transferir|atendente agora/i.test(reply);
}
function statusFromChecks(checks: SimCheck[]): "PASS" | "WARNING" | "FAIL" {
  if (checks.some(c => !c.passed && c.severity === "P0")) return "FAIL";
  if (checks.some(c => !c.passed)) return "WARNING";
  return "PASS";
}

async function runFlowScenario(sc: FlowScenario, mode: SimMode): Promise<SimScenarioResult> {
  const waMode = SIM_MODE_TO_WA[mode];
  const paymentOrder = sc.payment ?? ALL3;

  // Seed the session with the SAME Fute metadata the runtime injects, but synthetic.
  const enriched = await enrichSessionMetadata(
    { restaurantId: "sim", customerId: sc.withSavedAddress ? "sim-cust" : null, currentMetadata: null, hasAddress: false },
    {
      getPaymentOptions: async () => ({ order: paymentOrder, question: renderPaymentQuestion(paymentOrder) }),
      getSavedAddress: async () => (sc.withSavedAddress ? SYNTHETIC_ADDRESS : null),
    },
  );

  let session: WaPersistedSession | null = {
    id: "sim", restaurantId: "sim", customerId: sc.withSavedAddress ? "sim-cust" : null, conversationId: null,
    phone: "+5511999990000", status: "ACTIVE", stage: "IDLE", selectedItems: [], unresolvedItems: [],
    missingQuestions: [], deliveryType: null, address: null, deliveryQuote: null, paymentMethod: null,
    paymentStatus: null, orderDraftId: null, orderId: null, pixPaymentId: null, mode: waMode,
    source: "admin_test", metadata: enriched.metadata, lastMessageAt: new Date(), expiresAt: null,
    createdAt: new Date(), updatedAt: new Date(),
  } as WaPersistedSession;

  const transcript: SimTranscriptLine[] = [];
  const agentReplies: string[] = [];
  const actions = new Set<string>();
  let firstIntent = "";
  let createdRealOrder = false;
  let createdRealPix = false;
  let pixTurnIndex = -1;

  for (let i = 0; i < sc.messages.length; i++) {
    const message = sc.messages[i]!;
    transcript.push({ actor: "CUSTOMER", text: message });
    const result = await processCustomerMessage({
      restaurantId: "sim", restaurantSlug: "sim", phone: "+5511999990000", messageText: message,
      mode: waMode, currentSession: session, allowSideEffects: false, menu: CATALOG, deliveryQuoter: syntheticQuoter,
    });
    session = result.session;
    if (i === 0) firstIntent = result.intent;
    transcript.push({ actor: "AGENT", text: result.suggestedReply });
    agentReplies.push(result.suggestedReply);
    for (const a of result.actions) actions.add(a);
    if (result.actions.includes("GENERATE_PIX") && pixTurnIndex < 0) pixTurnIndex = agentReplies.length - 1;
    if (result.order?.orderId) createdRealOrder = true;
    if (result.payment && result.payment.isDryRunStub === false && result.payment.method === "PIX") createdRealPix = true;
  }

  const finalItems = (session?.selectedItems ?? []).map(it => ({ name: it.menuItemName, quantity: it.quantity }));
  let orderDraft: unknown = null;
  if (session && session.selectedItems.length > 0) {
    try { orderDraft = buildFullDraft(session); } catch { /* non-critical */ }
  }

  const summary: SimScenarioSummary = {
    itemsFound: finalItems,
    itemsAmbiguous: (session?.unresolvedItems ?? []).map(u => u.rawText),
    paymentMethod: session?.paymentMethod ?? null,
    deliveryType: session?.deliveryType ?? null,
    // Synthetic address only — never a real customer's.
    addressUsed: session?.address?.street ? `${session.address.street}, ${session.address.number ?? ""}`.trim() : null,
  };

  const wouldCreateOrder = actions.has("CREATE_ORDER");
  const wouldGeneratePix = actions.has("GENERATE_PIX");
  const entities = extractOrderEntities(sc.messages[0]!);

  const evalCtx: ScenarioEval = {
    transcript, agentReplies, firstIntent, actions: [...actions], entities,
    createdRealOrder, createdRealPix, wouldCreateOrder, wouldGeneratePix, pixTurnIndex,
    finalItems, joinedReplies: agentReplies.join("\n"),
    repliesBefore: (index: number) => agentReplies.slice(0, Math.max(0, index)).join("\n"),
  };
  const checks = sc.check(evalCtx);

  // In simulation, surface deferred side-effect actions as WOULD_* so the operator
  // sees "isto criaria pedido/Pix" without anything real happening.
  const displayActions = [...actions].map(a =>
    a === "CREATE_ORDER" ? "WOULD_CREATE_ORDER" : a === "GENERATE_PIX" ? "WOULD_GENERATE_PIX" : a,
  );

  return {
    status: statusFromChecks(checks),
    scenarioId: sc.id,
    name: sc.name,
    kind: "FLOW",
    transcript,
    detectedIntent: firstIntent,
    extractedEntities: entities,
    orderDraft,
    actions: displayActions,
    summary,
    safety: { noEvolution: true, noRealOrder: !createdRealOrder, noRealPix: !createdRealPix, runtimeTouched: false },
    checks,
  };
}

// ── Config scenarios (Part 2, 9–10) ──────────────────────────────────────────
function runConfigScenario(id: string, name: string, input: Parameters<typeof assessReadiness>[0], expect: (r: ReturnType<typeof assessReadiness>) => SimCheck[]): SimScenarioResult {
  const r = assessReadiness(input);
  const checks = expect(r);
  return {
    status: statusFromChecks(checks),
    scenarioId: id,
    name,
    kind: "CONFIG",
    transcript: [{ actor: "SYSTEM", text: `scope=${input.scope} mode=${input.mode} → riskLevel=${r.riskLevel}, canRunReplyOnly=${r.canRunReplyOnly}, canRunFullTest=${r.canRunFullTest}` }],
    detectedIntent: "CONFIG",
    extractedEntities: null,
    orderDraft: null,
    actions: [],
    summary: { itemsFound: [], itemsAmbiguous: [], paymentMethod: null, deliveryType: null, addressUsed: null },
    safety: { noEvolution: true, noRealOrder: true, noRealPix: true, runtimeTouched: false },
    checks,
  };
}

export async function runTextOrderSimulator(mode: SimMode = "REPLY_ONLY"): Promise<SimReport> {
  const flow = await Promise.all(FLOW_SCENARIOS.map(sc => runFlowScenario(sc, mode)));

  const dangerous = runConfigScenario(
    "sim-config-dangerous", "Config perigosa (RESTAURANT_WIDE sem aprovação)",
    { globalKillSwitch: false, globalPause: false, enabled: true, paused: false, mode: "ALLOWLIST_REPLY_ONLY", scope: "RESTAURANT_WIDE", allowlistCount: 1, paymentOptionsEnabled: true, sampleProductsAvailable: 50, scopeApproved: false },
    (r) => [
      check("riskLevel=HIGH", r.riskLevel === "HIGH", "P0", `riskLevel=${r.riskLevel}`),
      check("bloqueia REPLY_ONLY (exposição)", r.canRunReplyOnly === false, "P0", "deixou rodar com exposição"),
      check("recomenda PHONE_ALLOWLIST", r.missingForReplyOnly.some(m => m.includes("PHONE_ALLOWLIST")), "P1", "não recomendou PHONE_ALLOWLIST"),
    ],
  );

  const safe = runConfigScenario(
    "sim-config-safe", "Config segura (PHONE_ALLOWLIST + REPLY_ONLY)",
    { globalKillSwitch: false, globalPause: false, enabled: true, paused: false, mode: "ALLOWLIST_REPLY_ONLY", scope: "PHONE_ALLOWLIST", allowlistCount: 1, paymentOptionsEnabled: true, sampleProductsAvailable: 50, scopeApproved: false },
    (r) => [
      check("riskLevel=LOW", r.riskLevel === "LOW", "P1", `riskLevel=${r.riskLevel}`),
      check("replyOnly pronto", r.canRunReplyOnly === true, "P1", "REPLY_ONLY não ficou pronto"),
      check("fullTest ainda não", r.canRunFullTest === false, "P2", ""),
    ],
  );

  const scenarios = [...flow, dangerous, safe];
  const passed = scenarios.filter(s => s.status === "PASS").length;
  const warned = scenarios.filter(s => s.status === "WARNING").length;
  const failed = scenarios.filter(s => s.status === "FAIL").length;
  const p0 = scenarios.reduce((n, s) => n + s.checks.filter(c => !c.passed && c.severity === "P0").length, 0);
  const status = failed > 0 ? "FAIL" : warned > 0 ? "WARNING" : "PASS";

  return {
    ok: status !== "FAIL",
    status,
    total: scenarios.length,
    passed, warned, failed, p0, mode,
    scenarios,
    safety: { noEvolution: true, noRealOrder: scenarios.every(s => s.safety.noRealOrder), noRealPix: scenarios.every(s => s.safety.noRealPix), runtimeTouched: false },
    runtimeTouched: false,
  };
}
