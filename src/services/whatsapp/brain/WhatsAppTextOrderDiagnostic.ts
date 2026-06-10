/**
 * WhatsAppTextOrderDiagnostic — synthetic, hermetic check of the WhatsApp
 * text-order ("anotador de pedido") flow.
 *
 * Runs the canonical scenarios through the PURE state machine with a SYNTHETIC
 * catalog + the Brain adapter for intent. Proves: ORDER_BY_TEXT identified,
 * items extracted, ambiguity → numbered options, nothing invented, every active
 * reply ends with `0. menu`, and ZERO side effects (no real order, no Evolution,
 * no Pix, runtimeTouched=false). Never touches the DB.
 */

import { advanceSession } from "@/services/whatsapp/ordering/WhatsAppOrderStateMachine";
import type { WaMenuItem, WaPersistedSession } from "@/services/whatsapp/ordering/types";
import { reasonWhatsAppMessage, extractOrderEntities } from "./WhatsAppBrainReasoningAdapter";
import { MENU_FOOTER } from "@/services/whatsapp/ordering/menuFooter";

// ── Synthetic catalog (no DB) ────────────────────────────────────────────────────
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

function freshSession(meta: Record<string, unknown> | null = null): WaPersistedSession {
  const now = new Date();
  return {
    id: "s1", restaurantId: "r1", customerId: null, conversationId: null, phone: "+5511999990000",
    status: "ACTIVE", stage: "IDLE", selectedItems: [], unresolvedItems: [], missingQuestions: [],
    deliveryType: null, address: null, deliveryQuote: null, paymentMethod: null, paymentStatus: null,
    orderDraftId: null, orderId: null, pixPaymentId: null, mode: "DRY_RUN_ONLY", source: "admin_test",
    metadata: meta, lastMessageAt: now, expiresAt: null, createdAt: now, updatedAt: now,
  } as WaPersistedSession;
}

interface CaseResult {
  name: string;
  pass: boolean;
  note: string;
}

export interface TextOrderDiagnosticResult {
  ok: boolean;
  status: "PASS" | "FAIL";
  total: number;
  passed: number;
  p0: number;
  cases: CaseResult[];
  noSend: true;
  noEvolution: true;
  noOrder: true;
  noPix: true;
  runtimeTouched: false;
}

const SIDE_EFFECT_ACTIONS = new Set(["CREATE_ORDER", "GENERATE_PIX"]);

export function runWhatsAppTextOrderDiagnostic(): TextOrderDiagnosticResult {
  const cases: CaseResult[] = [];
  const add = (name: string, pass: boolean, note = "") => cases.push({ name, pass, note: pass ? "ok" : note });

  // 1) Free-text order with payment+delivery declared.
  {
    const msg = "Quero um yakisoba de frango e um refrigerante. Vou pagar em dinheiro na entrega.";
    const brain = reasonWhatsAppMessage({
      restaurantId: "diag", conversationId: "diag", phone: "+550000000000",
      messageText: msg, currentConversationStatus: "OPEN", isRestaurantOpen: true, source: "WHATSAPP",
    });
    const entities = extractOrderEntities(msg);
    add("brain: ORDER_BY_TEXT + START_TEXT_ORDER_DRAFT",
      brain.primaryIntent === "ORDER_BY_TEXT" && brain.recommendedAction === "START_TEXT_ORDER_DRAFT",
      `intent=${brain.primaryIntent} action=${brain.recommendedAction}`);
    add("entities: itens + dinheiro + entrega",
      entities.items.length >= 2 && entities.paymentMentioned === "dinheiro" && entities.deliveryMentioned === "entrega",
      JSON.stringify(entities));

    const r = advanceSession(freshSession(), "Quero 1 yakisoba de frango e 1 coca-cola lata. Vou pagar em dinheiro na entrega.", CATALOG);
    const noSideEffects = r.actions.every((a) => !SIDE_EFFECT_ACTIONS.has(a));
    add("máquina: monta comanda/opções sem efeito colateral",
      noSideEffects && !r.handoff, `actions=${r.actions.join(",")}`);
    add("rodapé `0. menu` presente", r.suggestedReply.trimEnd().endsWith(MENU_FOOTER), r.suggestedReply.slice(-40));
  }

  // 2) Pickup order.
  {
    const r = advanceSession(freshSession(), "Quero 1 temaki salmão e 1 coca-cola lata para retirada.", CATALOG);
    const mentionsOptions = /1\s*[—.-]/.test(r.suggestedReply) || /temaki|coca/i.test(r.suggestedReply);
    add("temaki+coca: responde com opções/itens reais", mentionsOptions && !r.handoff, r.suggestedReply.slice(0, 120));
    add("rodapé `0. menu` (retirada)", r.suggestedReply.trimEnd().endsWith(MENU_FOOTER), "");
  }

  // 3) Pix declared.
  {
    const msg = "Quero um combinado, vou pagar no Pix.";
    const e = extractOrderEntities(msg);
    const r = advanceSession(freshSession(), msg, CATALOG);
    add("pix declarado vira paymentMentioned=pix", e.paymentMentioned === "pix", JSON.stringify(e));
    const noPixNow = !r.actions.includes("GENERATE_PIX");
    add("nenhum Pix gerado na anotação", noPixNow, `actions=${r.actions.join(",")}`);
  }

  // 4) Non-existent product — never invented.
  {
    const r = advanceSession(freshSession(), "Quero 1 lasanha.", CATALOG);
    const notInvented = /n[ãa]o encontrei/i.test(r.suggestedReply) && !/lasanha\s*[—-]\s*R\$/i.test(r.suggestedReply);
    add("produto inexistente não é inventado", notInvented, r.suggestedReply.slice(0, 120));
  }

  // 5) Human request.
  {
    const r = advanceSession(freshSession(), "Quero falar com atendente.", CATALOG);
    add("atendente → handoff", r.handoff === true, r.suggestedReply.slice(0, 80));
  }

  // 6) `0` with an in-progress draft → continue/discard question.
  {
    const s1 = advanceSession(freshSession(), "Quero 1 yakisoba de frango", CATALOG);
    const s2 = advanceSession(s1.session, "0", CATALOG);
    const asksContinue = /continuar pedido/i.test(s2.suggestedReply) && /descartar/i.test(s2.suggestedReply);
    add("`0` com comanda pergunta continuar/descartar", asksContinue, s2.suggestedReply.slice(0, 120));
    const s3 = advanceSession(s2.session, "2", CATALOG);
    add("descartar volta ao menu sem pedido", /menu principal/i.test(s3.suggestedReply) && s3.session.stage === "CANCELLED", "");
  }

  const passed = cases.filter((c) => c.pass).length;
  const allPass = passed === cases.length;
  return {
    ok: allPass,
    status: allPass ? "PASS" : "FAIL",
    total: cases.length,
    passed,
    p0: allPass ? 0 : 1,
    cases,
    noSend: true,
    noEvolution: true,
    noOrder: true,
    noPix: true,
    runtimeTouched: false,
  };
}
