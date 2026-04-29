/**
 * AISimulatorService
 *
 * Runs isolated sandboxed conversations against the real AI ordering logic
 * (PromptBuilderService, UpsellEngine, openai, AI_TOOL_DEFINITIONS, executeTool).
 *
 * For each scenario:
 *   1. Create temp Customer + Conversation in the DB.
 *   2. Run a multi-turn loop: customer message → AI response → next customer message.
 *   3. Loop continues until: order confirmed, customer abandons, or MAX_SIM_TURNS reached.
 *   4. Evaluate the full conversation against scenario-specific checks.
 *   5. Delete all temp records regardless of outcome.
 *
 * Nothing is sent to WhatsApp — Evolution API is not called.
 * No AIInteractionLog is written (minor deviation from production noted in report).
 */

import { prisma } from "@/lib/prisma";
import { openai } from "@/lib/openai";
import { BrandConfigService } from "./BrandConfigService";
import { PromptBuilderService } from "./PromptBuilderService";
import { UpsellEngine } from "./UpsellEngine";
import { buildSalesProfile } from "./SalesProfile";
import { resolveMaxTokens } from "./BehaviorEngine";
import { AI_TOOL_DEFINITIONS, executeTool, type ToolContext } from "./AITools";
import { getDrinkAttemptCount, getAlreadySuggestedItems, isBlockedByDietary, isDessertCategory, isMainCategory } from "./ConversationGuardrails";
import * as WaiterBrain from "./WaiterBrain";
import type { UpsellSuggestion } from "./UpsellEngine";
import { ConversationStatus } from "@prisma/client";
import type OpenAI from "openai";
import { generateScenarios } from "./ScenarioGenerator";

const MAX_TOOL_ITERATIONS = 6;

// ─── public types ─────────────────────────────────────────────

export type CheckType =
  | "relevant_suggestion"
  | "no_hallucination"
  | "dietary_respected"
  | "no_repeat_suggestion"
  | "no_loop"
  | "checkout_transition"
  | "clarification_asked"
  | "natural_tone"
  | "post_checkout_completed";

export type PostCheckoutDropPhase =
  | "not_reached"   // confirm_order never called
  | "delivery_type" // stopped before delivery choice
  | "address"       // stopped before address provided (delivery only)
  | "name"          // stopped before name provided
  | "payment"       // stopped before payment method
  | "complete";     // full lifecycle finished

export interface CheckResult {
  type: CheckType;
  label: string;
  passed: boolean;
  detail: string;
}

export interface TurnTranscript {
  role: "customer" | "ai";
  content: string;
  toolCalls: Array<{ name: string; success: boolean; detail: string }>;
  /** Marks turns that belong to the post-confirm lifecycle (address / name / payment). */
  phase?: "ordering" | "post_checkout";
}

export interface SalesMetrics {
  finalCartValue:        number;
  totalItems:            number;
  upsellAttempts:        number;
  acceptedSuggestions:   number;
  rejectedSuggestions:   number;
  conversionSuccess:     boolean;
  acceptedUpsellsOnly:   number;  // add_item calls that originated from suggest_upsell
  upsellValueGenerated:  number;  // price × qty for each accepted upsell item
  flowScore:             number;  // 0–1: main item (0.34) + drink suggested (0.33) + dessert suggested (0.33)
  errorCount:            number;  // total failed tool calls
  upsellsByType:         { drink: number; dessert: number; addon: number };
  postCheckoutCompleted: boolean;           // full lifecycle (delivery + name + payment) done
  postCheckoutDropPhase: PostCheckoutDropPhase; // where the post-checkout flow stopped
}

export interface CartSnapshot {
  turn:  number; // 1-based turn index
  value: number; // cart subtotal after this turn
  items: number; // total item count after this turn
}

export interface ScenarioResult {
  id:               string;
  name:             string;
  description:      string;
  expectedBehavior: string;
  status:           "passed" | "warning" | "failed";
  score:            number;         // 0–100
  transcript:       TurnTranscript[];
  checks:           CheckResult[];
  issues:           string[];
  suggestions:      string[];       // improvement suggestions (structured report field)
  salesMetrics:     SalesMetrics;
  cartEvolution:    CartSnapshot[];
  totalTurns:       number;
  abandoned:        boolean;        // true when conversation ended without confirm_order
  salesWeaknesses:  string[];       // alias for suggestions (legacy field)
}

// ─── analytical report types ──────────────────────────────────

export interface SalesDiagnosis {
  withMainItem:      number;  // 0–1 rate
  withDrink:         number;  // 0–1 rate
  withDessert:       number;  // 0–1 rate
  fullCoverage:      number;  // 0–1 rate (main + drink + dessert)
  avgItemsPerOrder:  number;
  missedUpsells:     number;  // scenarios with cart>0 but zero upsell attempts
}

export interface RevenueAnalysis {
  actualRevenue:      number;
  potentialRevenue:   number;  // projected if all orders reached targetTicket
  lostRevenueDrink:   number;  // scenarios without drink × EST_DRINK_VALUE
  lostRevenueDessert: number;
  lostRevenueTotal:   number;
  avgActualTicket:    number;
  avgPotentialTicket: number;
  ticketGap:          number;
}

export type ErrorSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface PrioritizedError {
  severity:    ErrorSeverity;
  type:        string;
  count:       number;
  scenarios:   string[];
  description: string;
  impact:      string;
}

export interface ErrorPrioritization {
  critical: PrioritizedError[];
  high:     PrioritizedError[];
  medium:   PrioritizedError[];
  low:      PrioritizedError[];
  total:    number;
}

export interface FlowBreakdown {
  beforeMainItem: number;  // % got no main item at all
  afterMainItem:  number;  // % got main but no drink suggested
  duringUpsell:   number;  // % upsell offered but all rejected, no acceptance
  beforeCheckout: number;  // % had items but never confirmed
}

export interface RefusalHandling {
  repeatSuggestions:     number;  // 0–1 rate of no_repeat_suggestion failures
  abandonedAfterRefusal: number;  // 0–1 rate of abandon after ≥1 rejection
}

export interface BehaviorAnalysis {
  flowBreakdown:   FlowBreakdown;
  refusalHandling: RefusalHandling;
}

export interface DetailedPerformanceScore {
  overall:               number;  // 0–100
  salesEffectiveness:    number;  // conversion + upsell acceptance + ticket growth
  flowControl:           number;  // category coverage + turn efficiency
  toolAccuracy:          number;  // tool call success rate + no hallucinations
  restrictionCompliance: number;  // dietary + no-repeat compliance
}

export interface ActionableFix {
  rank:    1 | 2 | 3;
  problem: string;
  why:     string;
  fix:     string;
  impact:  "high" | "medium" | "low";
  metric:  string;
}

export interface SimulationReport {
  // ── existing fields (preserved) ────────────────────────────
  overallScore:        number;
  scenarios:           ScenarioResult[];
  criticalBugs:        string[];
  topFixes:            string[];
  safeToTest:          boolean;
  ranAt:               string;
  restaurantName:      string;
  avgTicket:           number;
  avgItems:            number;
  conversionRate:      number;
  avgTurns:            number;
  abandonmentRate:     number;
  upsellAcceptanceRate: number;
  realRevenue:         number;
  flowScore:           number;
  errorCount:          number;

  // ── post-checkout lifecycle (new) ───────────────────────────
  checkoutCompletionRate: number; // full post-checkout lifecycle completion rate
  dropDuringAddress:      number; // 0–1 rate of drop at address step (delivery orders)
  dropDuringPayment:      number; // 0–1 rate of drop at payment step

  // ── analytical modules (new) ────────────────────────────────
  salesDiagnosis:      SalesDiagnosis;
  revenueAnalysis:     RevenueAnalysis;
  errorPrioritization: ErrorPrioritization;
  behaviorAnalysis:    BehaviorAnalysis;
  performanceScore:    DetailedPerformanceScore;
  actionableFixes:     ActionableFix[];
  summary:             string;
}

type ProgressCallback = (info: { current: number; total: number; scenarioName: string }) => void;
type ResultCallback   = (result: ScenarioResult) => void;

// ─── scenario definition (exported for ScenarioGenerator) ────

export interface VariationLayer {
  indecisionLevel:   "low" | "medium" | "high";
  budgetSensitivity: "low" | "medium" | "high";
  patience:          "short" | "long";
  upsellOpenness:    "closed" | "neutral" | "open";
}

export interface BehaviorProfile {
  intent:    "fome" | "curioso" | "direto" | "indeciso";
  budget:    "baixo" | "médio" | "alto";
  groupSize: "solo" | "dupla" | "família";
  behavior:  "aceita_upsell" | "recusa_upsell" | "ignora" | "muda_de_ideia" | "impaciente" | "recusa_depois_aceita" | "pergunta_primeiro";
  variation: VariationLayer;
}

export interface ScenarioDef {
  id:               string;
  name:             string;
  description:      string;
  expectedBehavior: string;
  openingMessage:   string;
  behaviorProfile:  BehaviorProfile;
  dietary?:         string[];
  allergies?:       string[];
  checks:           CheckType[];
  maxTurns:         number;  // derived from variation.patience
}

// ─── multi-turn constants & customer behavior engine ──────────

const MAX_SIM_TURNS = 12;

// ─── upsell stage inference (mirrors AIOrderService) ─────────

type UpsellStage = "food" | 3 | 4 | "none";

function inferUpsellStage(
  cartItemCount: number,
  suggestions: Array<{ categoryName: string }>,
): UpsellStage {
  if (cartItemCount === 0) return "none";
  // Food expansion: main-category items still available (suggest more food before complements)
  const hasFood = suggestions.some((s) => isMainCategory(s.categoryName));
  if (hasFood) return "food";
  // Drink stage: non-main, non-dessert categories (only reached when food candidates exhausted)
  const hasDrink = suggestions.some(
    (s) => !isMainCategory(s.categoryName) && !isDessertCategory(s.categoryName),
  );
  if (hasDrink) return 3;
  const hasDessert = suggestions.some((s) => isDessertCategory(s.categoryName));
  if (hasDessert) return 4;
  return "none";
}

interface PostCheckoutState {
  phase:             "not_started" | "in_progress" | "complete" | "dropped";
  collectedDelivery: boolean;
  collectedAddress:  boolean;
  collectedName:     boolean;
  collectedPayment:  boolean;
  turnsSinceConfirm: number;
  deliveryType:      "DELIVERY" | "PICKUP";
  paymentType:       "pix" | "cartao" | "entrega";
  dropPhase:         PostCheckoutDropPhase;
}

interface CustomerState {
  turnCount:       number;
  hasOrdered:      boolean;
  upsellsOffered:  number;
  upsellsAccepted: number;
  upsellsRejected: number;
  hasChangedMind:  boolean;
  ignoreCount:     number;
  questionsAsked:  number;  // pergunta_primeiro: how many questions sent so far
  refusedOnce:     boolean; // recusa_depois_aceita: first refusal already done
  postCheckout:    PostCheckoutState;
}

function initCustomerState(): CustomerState {
  // Randomize delivery (60% delivery) and payment method
  const deliveryType: PostCheckoutState["deliveryType"] = Math.random() < 0.6 ? "DELIVERY" : "PICKUP";
  const roll = Math.random();
  const paymentType: PostCheckoutState["paymentType"] =
    roll < 0.5 ? "pix" : roll < 0.8 ? "cartao" : "entrega";

  return {
    turnCount: 0, hasOrdered: false,
    upsellsOffered: 0, upsellsAccepted: 0, upsellsRejected: 0,
    hasChangedMind: false, ignoreCount: 0,
    questionsAsked: 0, refusedOnce: false,
    postCheckout: {
      phase: "not_started",
      collectedDelivery: false,
      collectedAddress:  false,
      collectedName:     false,
      collectedPayment:  false,
      turnsSinceConfirm: 0,
      deliveryType,
      paymentType,
      dropPhase: "not_reached",
    },
  };
}

// Message pools for simulated customer reactions.
// Short answers (~40-50% of each relevant pool) reflect real WhatsApp behavior.
const MSGS = {
  accept: [
    // longer
    "ok, pode adicionar sim", "boa sugestão, pode colocar", "vou querer esse também",
    "pode incluir, gostei", "sim, quero esse", "perfeito, bota aí", "pode sim, adorei a sugestão",
    // short (~50%)
    "sim", "pode", "ok", "isso", "👍", "quero", "bora",
  ],
  reject: [
    // longer
    "não, obrigado, tô bem assim", "dispensa, tá bom como tá", "não preciso de mais",
    "obrigado mas não", "pode deixar, já tá ótimo", "não vai precisar, valeu",
    // short (~45%)
    "não", "dispensa", "tô bem", "deixa", "pode não",
  ],
  ignore:   ["aliás, vocês aceitam cartão?", "quanto tempo leva a entrega?", "tem promoção hoje?", "vocês têm embalagem pra viagem?", "tem desconto pra pedido acima de certo valor?", "entregam no meu bairro?", "tem programa de fidelidade?"],
  change:   ["na verdade espera, quero mudar o pedido", "esquece o que eu disse, quero outra coisa", "muda tudo, quero repensar", "me dá uma segunda opinião", "tô achando que vou querer outra coisa", "me mostra mais opções antes de confirmar"],
  continue: [
    // longer
    "o que mais você recomenda?", "tem mais alguma coisa boa?", "e de bebida tem o quê?",
    "pode sugerir mais alguma coisa?", "o que vai bem com o que eu escolhi?", "tem alguma coisa especial hoje?",
    // short (~40%)
    "e mais?", "tem mais?", "o que mais?", "mais alguma coisa?",
  ],
  checkout: ["acho que é isso, pode fechar o pedido", "tô satisfeito, pode confirmar", "pode finalizar o pedido", "pronto, pode fechar", "tá bom assim, fecha pra mim", "pode confirmar tudo"],
  answer: [
    // longer
    "sim, pode ser", "isso mesmo", "qualquer coisa serve", "o que você recomendar tá ótimo",
    "pode mandar", "tá bom assim", "por favor",
    // short (~42%)
    "sim", "pode", "ok", "isso", "tá",
  ],
  abandon:     ["desculpa, vou pensar mais e volto depois", "na verdade vou deixar pra outra hora", "obrigado, mas por enquanto não", "vou passar mais tarde", "deixa pra amanhã"],
  hurry:         ["pode confirmar logo?", "tô com pressa, fecha o pedido", "rápido por favor, vai confirmar?", "fecha logo, tô sem tempo", "pode agilizar?"],
  postConfirm:   ["ótimo! em quanto tempo chega?", "confirmado, qual o prazo de entrega?", "perfeito! vocês entregam aqui na região?", "massa! vou aguardar então", "certo!", "ok, aguardo"],
  // recusa_depois_aceita: first refuses, then warms up
  softReject:    ["hmm, deixa eu pensar um pouco", "não sei se preciso disso agora", "talvez não... me diz mais sobre esse item", "acho que não... o que faz esse ser bom?"],
  warmAccept:    ["sabe que vai, pode colocar", "tá bom, vou querer sim", "convenceu, pode adicionar", "por que não? coloca aí", "ok tá, me empolguei — pode incluir"],
  // pergunta_primeiro: questions before committing
  preOrderQ:    [
    "antes de decidir, quais são os mais pedidos?",
    "quanto tempo leva pra chegar normalmente?",
    "vocês têm promoção de segunda-feira?",
    "esse item aí é caseiro mesmo ou industrializado?",
    "qual a diferença entre essas duas opções?",
    "tem alguma versão menor ou meia-porção?",
    "vocês aceitam cartão na entrega?",
  ],
  // ── post-checkout phase ────────────────────────────────────
  deliveryEntry_delivery: [
    "entrega", "quero entrega", "pode mandar aqui pra mim",
    "vai de entrega mesmo", "manda pra minha casa",
  ],
  deliveryEntry_pickup: [
    "vou buscar", "retirada", "prefiro retirar", "vou pegar eu mesmo", "pode deixar pra retirada",
  ],
  addressData: [
    "Rua das Flores, 123, apto 45, Jardim América",
    "Av. Brasil, 500, Centro",
    "Rua São Paulo, 77, bloco B apto 12, Vila Nova",
    "Rua do Comércio, 89, sala 3, Centro",
    "Rua Tiradentes, 210, apto 302, Boa Vista",
    "Rua das Acácias, 34, Pinheiros",
    "Av. Paulista, 1500, conjunto 104, Bela Vista",
  ],
  nameData: ["João", "Maria", "Carlos", "Ana", "Pedro", "Fernanda", "Lucas", "Juliana", "Rafael", "Camila"],
  paymentPix:       ["pix", "pode ser pix", "vou pagar no pix", "pix por favor"],
  paymentCard:      ["cartão de crédito", "cartão", "débito", "pode colocar no cartão"],
  paymentOnDelivery: ["pagar na entrega", "pago quando chegar", "dinheiro na entrega", "na entrega mesmo"],
};

function pickMsg(pool: string[]): string {
  return pool[Math.floor(Math.random() * pool.length)]!;
}

/**
 * Generates the next simulated customer message based on:
 *  - what tool calls the AI just made (upsell? add? confirm?)
 *  - the scenario's behavior profile
 *  - how far into the conversation we are
 *
 * Returns null to signal the conversation should end (order confirmed or abandoned).
 */
const MAX_POST_CHECKOUT_TURNS = 6;

// Returns true when the AI response appears to contain a payment link or final confirmation.
function hasPaymentSignal(text: string): boolean {
  return /https?:\/\/|pay\.?link|link.*pag|pix\.[a-z]|qr.*cod/i.test(text);
}

// Returns true when the AI has confirmed that the post-checkout flow is done.
function hasCompletionSignal(text: string): boolean {
  return /(aguardando|pedido (foi |está )?(confirmado|registrado|encaminhado)|obrigado.*pedido|em breve.*entregamos|até logo|até mais)/i.test(text);
}

function nextCustomerMessage(
  state: CustomerState,
  profile: BehaviorProfile,
  lastAiText: string,
  lastToolCalls: TurnToolCall[],
  maxTurns: number,
): string | null {
  const confirmed = lastToolCalls.some((tc) => tc.name === "confirm_order" && tc.success);
  const { variation } = profile;
  const pc = state.postCheckout;

  // ── Post-checkout phase gate ──────────────────────────────
  // Completed / dropped → end conversation
  if (pc.phase === "complete" || pc.phase === "dropped") return null;

  // confirm_order just succeeded → kick off post-checkout phase
  if (confirmed && pc.phase === "not_started") {
    pc.phase = "in_progress";
    return pickMsg(MSGS.postConfirm);
  }

  // Actively in post-checkout → respond to what the AI is asking
  if (pc.phase === "in_progress") {
    pc.turnsSinceConfirm++;

    // Payment link sent by AI → auto-complete
    if (hasPaymentSignal(lastAiText)) {
      pc.collectedPayment = true;
      pc.phase    = "complete";
      pc.dropPhase = "complete";
      return null;
    }

    // AI gave a final "all done" message after collecting data
    if (pc.collectedPayment && hasCompletionSignal(lastAiText)) {
      pc.phase    = "complete";
      pc.dropPhase = "complete";
      return null;
    }

    // "pagar na entrega" path: after customer declared it → next AI acknowledgment = done
    if (pc.collectedPayment && pc.paymentType === "entrega") {
      pc.phase    = "complete";
      pc.dropPhase = "complete";
      return null;
    }

    // Hard cap on post-checkout turns
    if (pc.turnsSinceConfirm > MAX_POST_CHECKOUT_TURNS) {
      pc.phase = "dropped";
      if (!pc.collectedDelivery)                                     pc.dropPhase = "delivery_type";
      else if (!pc.collectedAddress && pc.deliveryType === "DELIVERY") pc.dropPhase = "address";
      else if (!pc.collectedName)                                    pc.dropPhase = "name";
      else if (!pc.collectedPayment)                                 pc.dropPhase = "payment";
      else { pc.phase = "complete"; pc.dropPhase = "complete"; }
      return null;
    }

    const lower = lastAiText.toLowerCase();

    // Delivery type question
    if (
      !pc.collectedDelivery &&
      /entrega|retirada|buscar|delivery|pickup|como gostaria|vai retirar|levar.*endereço|seu endereço/i.test(lower)
    ) {
      pc.collectedDelivery = true;
      return pc.deliveryType === "DELIVERY"
        ? pickMsg(MSGS.deliveryEntry_delivery)
        : pickMsg(MSGS.deliveryEntry_pickup);
    }

    // Address question (only for delivery)
    if (
      !pc.collectedAddress &&
      pc.deliveryType === "DELIVERY" &&
      /endereço|rua|bairro|logradouro|complemento|número|cep|para onde|onde (fica|mora|voc)/i.test(lower)
    ) {
      pc.collectedAddress = true;
      return pickMsg(MSGS.addressData);
    }

    // Name question
    if (
      !pc.collectedName &&
      /nome|como você se chama|qual é o seu nome|confirmar.*nome|seu nome|pra quem/i.test(lower)
    ) {
      pc.collectedName = true;
      return pickMsg(MSGS.nameData);
    }

    // Payment question
    if (
      !pc.collectedPayment &&
      /pagamento|pagar|pix|cartão|forma de|transferência|como vai pagar|meio de|vai pagar/i.test(lower)
    ) {
      pc.collectedPayment = true;
      switch (pc.paymentType) {
        case "pix":    return pickMsg(MSGS.paymentPix);
        case "cartao": return pickMsg(MSGS.paymentCard);
        case "entrega": return pickMsg(MSGS.paymentOnDelivery);
      }
    }

    // AI said something else in post-checkout → acknowledge generically
    return pickMsg(MSGS.postConfirm);
  }

  // ── Normal ordering phase below ───────────────────────────

  // Hard cap from patience setting
  if (state.turnCount >= maxTurns) return null;

  // Short-patience early exit: if short + enough turns + no order yet → give up or rush
  if (variation.patience === "short" && state.turnCount >= 4) {
    return state.hasOrdered ? pickMsg(MSGS.checkout) : pickMsg(MSGS.abandon);
  }

  // Update state from what just happened
  const addedItem = lastToolCalls.some((tc) => tc.name === "add_item" && tc.success);
  if (addedItem) state.hasOrdered = true;

  const hadUpsell = lastToolCalls.some((tc) => tc.name === "suggest_upsell" && tc.success);
  if (hadUpsell) state.upsellsOffered++;

  // pergunta_primeiro: ask up to 2 questions before settling
  if (profile.behavior === "pergunta_primeiro") {
    if (!state.hasOrdered && state.questionsAsked < 2) {
      state.questionsAsked++;
      return pickMsg(MSGS.preOrderQ);
    }
    // After questions, behave like aceita_upsell for the rest
    if (hadUpsell) {
      state.upsellsAccepted++;
      return pickMsg(MSGS.accept);
    }
    return addedItem ? pickMsg(MSGS.checkout) : pickMsg(MSGS.answer);
  }

  // Impatient customer: push hard to checkout from turn 3
  if (profile.behavior === "impaciente") {
    if (state.turnCount >= 3) {
      return state.hasOrdered ? pickMsg(MSGS.hurry) : pickMsg(MSGS.checkout);
    }
    return addedItem ? pickMsg(MSGS.hurry) : pickMsg(MSGS.continue);
  }

  // Late-game: push hard to a conclusion after turn 9
  if (state.turnCount >= 9) {
    return state.hasOrdered ? pickMsg(MSGS.checkout) : pickMsg(MSGS.abandon);
  }

  // React to an upsell suggestion
  if (hadUpsell) {
    // upsellOpenness modulates how eagerly accept/refuse happens
    const openness = variation.upsellOpenness;

    switch (profile.behavior) {
      case "aceita_upsell": {
        const acceptThreshold = openness === "closed" ? 0.4 : openness === "open" ? 0.95 : 0.8;
        if (state.upsellsAccepted < 2 && Math.random() < acceptThreshold) {
          state.upsellsAccepted++;
          return pickMsg(MSGS.accept);
        }
        return pickMsg(MSGS.checkout);
      }

      case "recusa_upsell": {
        const maxRefusals = openness === "open" ? 1 : openness === "closed" ? 3 : 2;
        if (state.upsellsRejected < maxRefusals) {
          state.upsellsRejected++;
          return pickMsg(MSGS.reject);
        }
        return pickMsg(MSGS.checkout);
      }

      case "recusa_depois_aceita":
        // First encounter: soft refusal. Second encounter: warm acceptance.
        if (!state.refusedOnce) {
          state.refusedOnce = true;
          return pickMsg(MSGS.softReject);
        }
        state.upsellsAccepted++;
        return pickMsg(MSGS.warmAccept);

      case "ignora":
        if (state.ignoreCount < 3) {
          state.ignoreCount++;
          return pickMsg(MSGS.ignore);
        }
        return pickMsg(MSGS.checkout);

      case "muda_de_ideia":
        if (!state.hasChangedMind) {
          state.hasChangedMind = true;
          return pickMsg(MSGS.change);
        }
        return state.hasOrdered ? pickMsg(MSGS.checkout) : pickMsg(MSGS.continue);
    }
  }

  // AI added an item but no upsell — continue early, push to checkout after turn 5
  if (addedItem) {
    return state.turnCount < 5 ? pickMsg(MSGS.continue) : pickMsg(MSGS.checkout);
  }

  // AI asked a question — give a cooperative answer
  if (lastAiText.includes("?")) return pickMsg(MSGS.answer);

  // Default: keep the conversation moving
  return state.hasOrdered && state.turnCount >= 5
    ? pickMsg(MSGS.checkout)
    : pickMsg(MSGS.continue);
}

// ─── check labels ─────────────────────────────────────────────

const CHECK_LABELS: Record<CheckType, string> = {
  relevant_suggestion:     "Sugestão de produto relevante",
  no_hallucination:        "Sem produtos inventados",
  dietary_respected:       "Restrições alimentares respeitadas",
  no_repeat_suggestion:    "Sem repetição de sugestões",
  no_loop:                 "Sem loops de tool calls",
  checkout_transition:     "Transição para checkout",
  clarification_asked:     "Pediu esclarecimento em vez de adivinhar",
  natural_tone:            "Tom de resposta adequado",
  post_checkout_completed: "Fluxo pós-checkout completo (entrega + nome + pagamento)",
};

const BATCH_SIZE           = 5;
const BATCH_DELAY_MS       = 3_000;   // pause between batches to respect TPM limits
const MAX_SCENARIO_RETRIES = 3;       // max retries per scenario (covers 429 + network errors)
const TURN_TIMEOUT_MS      = 25_000;  // abort each OpenAI call after 25 s (complex prompts need more time)

// ─── public service ───────────────────────────────────────────

export class AISimulatorService {
  static async runScenarios(
    restaurantId: string,
    scenarios: ScenarioDef[],
    onProgress: ProgressCallback,
    onResult: ResultCallback,
  ): Promise<SimulationReport> {
    return AISimulatorService.run(restaurantId, 0, onProgress, onResult, scenarios);
  }

  static async run(
    restaurantId: string,
    scenarioCount: number,
    onProgress: ProgressCallback,
    onResult: ResultCallback,
    prebuiltScenarios?: ScenarioDef[],
  ): Promise<SimulationReport> {
    const actualCount = prebuiltScenarios?.length ?? scenarioCount;
    console.log(`[AISimulator] SIMULATOR VERSION: retry-enabled | scenarioCount=${actualCount}`);
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { name: true },
    });

    // Load full menu for evaluation (name + ingredients + category per item)
    const menu = await prisma.menuItem.findMany({
      where: { isActive: true, category: { restaurantId } },
      select: { id: true, name: true, ingredients: true, price: true, category: { select: { name: true } } },
    });

    const menuById = new Map<string, { categoryName: string }>(
      menu.map((m) => [m.id, { categoryName: m.category?.name ?? "" }] as [string, { categoryName: string }]),
    );

    const scenarios = prebuiltScenarios ?? generateScenarios(scenarioCount);
    const results: ScenarioResult[] = [];

    // ── Batch execution: BATCH_SIZE scenarios per batch ───────────
    // Partial results are emitted after each scenario so the job store
    // always has up-to-date data even if the client disconnects mid-run.
    const batches: typeof scenarios[] = [];
    for (let i = 0; i < scenarios.length; i += BATCH_SIZE) {
      batches.push(scenarios.slice(i, i + BATCH_SIZE));
    }

    let scenarioIndex = 0;
    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
      const batch = batches[batchIdx]!;

      for (const scenario of batch) {
        onProgress({ current: scenarioIndex + 1, total: scenarios.length, scenarioName: scenario.name });

        const result = await runScenarioWithRetry(scenario, restaurantId, menu, menuById);
        results.push(result);
        onResult(result);
        scenarioIndex++;
      }

      // Pause between batches (skip after the last one)
      if (batchIdx < batches.length - 1) {
        await sleep(BATCH_DELAY_MS);
      }
    }

    return buildReport(results, restaurant?.name ?? restaurantId);
  }
}

// ─── helpers ──────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Returns true for any error that is worth retrying (429, network, timeout). */
function isRetryableError(err: unknown): boolean {
  if (!err) return false;

  // AbortError — our own timeout signal fired
  if (err instanceof Error && err.name === "AbortError") return true;

  // TypeError covers "fetch failed", "network error", ECONNRESET wrapped by the SDK
  if (err instanceof TypeError) return true;

  if (typeof err !== "object") return false;
  const e = err as Record<string, unknown>;

  // OpenAI SDK 429 shapes
  if (e["status"] === 429) return true;
  const inner = e["error"] as Record<string, unknown> | undefined;
  if (inner?.["type"] === "rate_limit_exceeded") return true;

  // Message-based fallbacks
  const msg = typeof e["message"] === "string" ? e["message"] : "";
  if (msg.includes("429"))         return true;
  if (msg.includes("fetch failed")) return true;
  if (msg.includes("ECONNRESET"))  return true;
  if (msg.includes("network error")) return true;
  if (msg.includes("timeout"))     return true;

  return false;
}

/** Delay schedule: 1 s, 2 s, 4 s (index = attempt number starting at 0). */
const RETRY_DELAYS_MS = [1_000, 2_000, 4_000] as const;

// Wraps runScenario with exponential-backoff retry on 429 and network errors.
async function runScenarioWithRetry(
  scenario: ScenarioDef,
  restaurantId: string,
  menu: Array<{ id: string; name: string; ingredients: string | null; price: unknown }>,
  menuById: Map<string, { categoryName: string }>,
): Promise<ScenarioResult> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_SCENARIO_RETRIES; attempt++) {
    try {
      return await runScenario(scenario, restaurantId, menu, menuById);
    } catch (err) {
      lastErr = err;
      if (isRetryableError(err) && attempt < MAX_SCENARIO_RETRIES) {
        const wait = RETRY_DELAYS_MS[attempt] ?? 4_000;
        const errType = err instanceof Error ? err.constructor.name : typeof err;
        console.warn(
          `[AISimulator] Retryable error on scenario "${scenario.id}" ` +
          `(attempt ${attempt + 1}/${MAX_SCENARIO_RETRIES}, type=${errType}) — retrying in ${wait}ms`,
        );
        await sleep(wait);
        continue;
      }
      break;
    }
  }
  const errType = lastErr instanceof Error ? lastErr.constructor.name : typeof lastErr;
  console.error(`[AISimulator] Scenario "${scenario.id}" failed after ${MAX_SCENARIO_RETRIES} retries (type=${errType}):`, lastErr);
  return buildErrorResult(scenario, String(lastErr));
}

// ─── scenario runner ──────────────────────────────────────────

async function runScenario(
  scenario: ScenarioDef,
  restaurantId: string,
  menu: Array<{ id: string; name: string; ingredients: string | null; price: unknown }>,
  menuById: Map<string, { categoryName: string }>,
): Promise<ScenarioResult> {
  // Create sandbox records
  const runId = `SIM_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const simPhone = `+5500${runId.slice(-10).padEnd(10, "0")}`;

  const customer = await prisma.customer.create({
    data: {
      restaurantId,
      name: `[SIM] ${scenario.name}`,
      phone: simPhone,
    },
  });

  // Create dietary preferences if scenario requires them
  if ((scenario.dietary?.length ?? 0) > 0 || (scenario.allergies?.length ?? 0) > 0) {
    await prisma.customerPreference.create({
      data: {
        customerId: customer.id,
        dietary:   scenario.dietary   ?? [],
        allergies: scenario.allergies ?? [],
      },
    });
  }

  const conversation = await prisma.conversation.create({
    data: {
      restaurantId,
      customerId: customer.id,
      status: ConversationStatus.BOT,
    },
  });

  const transcript: TurnTranscript[] = [];
  const allToolCalls: TurnToolCall[] = [];
  const perTurnCalls: TurnToolCall[][] = []; // tool calls per AI turn, for loop detection
  const cartEvolution: CartSnapshot[] = [];
  let salesMetrics: SalesMetrics = emptyMetrics();

  try {
    const cState = initCustomerState();
    let nextMsg: string | null = scenario.openingMessage;
    let inPostCheckout = false; // flips true after confirm_order succeeds

    // The while loop continues past scenario.maxTurns if post-checkout is in progress.
    // Post-checkout has its own internal turn cap (MAX_POST_CHECKOUT_TURNS).
    while (
      nextMsg !== null &&
      (cState.turnCount < scenario.maxTurns || cState.postCheckout.phase === "in_progress")
    ) {
      // Customer sends message
      const turnPhase: TurnTranscript["phase"] = inPostCheckout ? "post_checkout" : "ordering";
      transcript.push({ role: "customer", content: nextMsg, toolCalls: [], phase: turnPhase });

      // AI responds (real production logic)
      const turnResult = await executeSimulatedTurn({
        conversationId:  conversation.id,
        restaurantId,
        customerId:      customer.id,
        customerMessage: nextMsg,
      });

      allToolCalls.push(...turnResult.toolCalls);
      perTurnCalls.push(turnResult.toolCalls);

      // Detect confirm_order success to flip post-checkout phase marker
      const justConfirmed = turnResult.toolCalls.some(
        (tc) => tc.name === "confirm_order" && tc.success,
      );

      transcript.push({
        role:      "ai",
        content:   turnResult.text,
        toolCalls: turnResult.toolCalls.map((tc) => ({
          name:    tc.name,
          success: tc.success,
          detail:  tc.resultMsg,
        })),
        phase: turnPhase,
      });

      // Flip to post-checkout phase AFTER recording the confirm_order AI turn
      if (justConfirmed) inPostCheckout = true;

      // Capture cart state after each AI turn
      const snap = await getCartSnapshot(customer.id, restaurantId);
      cartEvolution.push({ turn: cState.turnCount + 1, value: snap.value, items: snap.itemCount });

      cState.turnCount++;

      // Generate next customer message (returns null when conversation ends)
      nextMsg = nextCustomerMessage(cState, scenario.behaviorProfile, turnResult.text, turnResult.toolCalls, scenario.maxTurns);
    }

    const finalCart = cartEvolution.at(-1);
    salesMetrics = computeSalesMetrics(
      allToolCalls,
      finalCart?.value ?? 0,
      finalCart?.items ?? 0,
      menuById,
      cState.postCheckout,
    );
  } finally {
    await cleanupSimulation(customer.id, conversation.id);
  }

  return evaluateScenario(scenario, transcript, allToolCalls, perTurnCalls, menu, salesMetrics, cartEvolution);
}

// ─── turn executor ────────────────────────────────────────────

interface TurnParams {
  conversationId: string;
  restaurantId:   string;
  customerId:     string;
  customerMessage: string;
}

interface TurnToolCall {
  name:       string;
  args:       unknown;
  success:    boolean;
  resultMsg:  string;
  resultData: unknown;
}

interface TurnResult {
  text:      string;
  toolCalls: TurnToolCall[];
}

async function executeSimulatedTurn(params: TurnParams): Promise<TurnResult> {
  const { conversationId, restaurantId, customerId, customerMessage } = params;

  // Insert customer message into conversation
  await prisma.message.create({
    data: {
      conversationId,
      direction: "INBOUND",
      content:   customerMessage,
      type:      "TEXT",
      sentAt:    new Date(),
    },
  });

  // Load brand config + restaurant name
  const [brandConfig, restaurantRow] = await Promise.all([
    BrandConfigService.getOrDefault(restaurantId),
    prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { name: true } }),
  ]);
  const restaurantName = restaurantRow?.name ?? "";
  const salesProfile   = buildSalesProfile(brandConfig, restaurantName);

  // Find existing OPEN draft
  const existingDraft = await prisma.orderDraft.findFirst({
    where:   { restaurantId, customerId, status: "OPEN" },
    orderBy: { createdAt: "desc" },
    select:  { id: true },
  });

  let draftId: string | null = existingDraft?.id ?? null;
  let handoffRequested = false;

  const toolCtx: ToolContext = {
    restaurantId,
    conversationId,
    customerId,
    draftId,
    setDraftId:     (id) => { draftId = id; toolCtx.draftId = id; },
    requestHandoff: ()   => { handoffRequested = true; },
    upsellSuggestedThisTurn: false,
    drinkAttemptsThisTurn:   0,
    drinkAttemptsPriorTurns: 0,
    confirmOrderAttempts:    0,
    checkoutIntent:          false,
  };

  // Guardrail data — mirrors AIOrderService parallel query
  const [alreadySuggestedItems, customerPrefs, drinkAttemptsPriorTurns] = await Promise.all([
    getAlreadySuggestedItems(conversationId),
    prisma.customerPreference.findUnique({
      where:  { customerId },
      select: { dietary: true, allergies: true },
    }),
    getDrinkAttemptCount(conversationId),
  ]);
  const alreadySuggestedIds = new Set<string>(alreadySuggestedItems.map((i: { id: string }) => i.id));
  toolCtx.drinkAttemptsPriorTurns = drinkAttemptsPriorTurns;

  const customerDietary   = customerPrefs?.dietary   ?? [];
  const customerAllergies = customerPrefs?.allergies ?? [];

  // Upsell suggestions (real UpsellEngine)
  const upsellResult = await UpsellEngine.suggest(
    restaurantId,
    draftId,
    salesProfile.salesPriority,
    alreadySuggestedIds,
    customerDietary,
    customerAllergies,
    salesProfile.targetTicket,
    salesProfile.targetItems,
  );
  const { suggestions: upsellSuggestions, cartValue, cartItemCount, valueGap, itemGap } = upsellResult;

  const upsellStage = inferUpsellStage(cartItemCount, upsellSuggestions);

  // Build messages (real PromptBuilderService)
  const messages = await PromptBuilderService.build({
    conversationId,
    restaurantId,
    customerId,
    brandConfig,
  });

  // System addenda — exact production order: WaiterBrain → goal context → dietary → already-suggested
  const sysMsg = messages[0] as OpenAI.Chat.ChatCompletionSystemMessageParam;
  let sysAddendum = "";

  // WaiterBrain: main item fallback for empty cart (UpsellEngine requires a draft to return results)
  const mainItemFallback: UpsellSuggestion[] = cartItemCount === 0
    ? await (async () => {
        const rows = await prisma.menuItem.findMany({
          where:   { isActive: true, category: { restaurantId } },
          include: { category: { select: { name: true } } },
          take: 20,
        });
        return rows
          .filter((i) => isMainCategory(i.category.name))
          .slice(0, 3)
          .map((i) => ({
            menuItemId:   i.id,
            name:         i.name,
            price:        Number(i.price),
            categoryName: i.category.name,
            reason:       "prato principal",
          }));
      })()
    : [];

  const waiterCandidates = cartItemCount === 0 ? mainItemFallback : upsellSuggestions;
  const waiterDecision = WaiterBrain.decide({
    userMessage: customerMessage,
    state: { cartItemCount, upsellStage, drinkAttemptsPrior: drinkAttemptsPriorTurns },
    candidates: brandConfig.upsellStyle !== "none" ? waiterCandidates : [],
  });
  sysAddendum += waiterDecision.directive;

  if (cartItemCount > 0) {
    sysAddendum += buildGoalContextAddendum(cartValue, cartItemCount, salesProfile.targetTicket, salesProfile.targetItems, valueGap, itemGap);
  }

  if (customerDietary.length > 0 || customerAllergies.length > 0) {
    const lines: string[] = [];
    if (customerDietary.length > 0)   lines.push(`Restrições: ${customerDietary.join(", ")}`);
    if (customerAllergies.length > 0) lines.push(`Alergias: ${customerAllergies.join(", ")}`);
    sysAddendum +=
      "\n\n⚠️ RESTRIÇÕES ALIMENTARES ATIVAS (filtro obrigatório neste turno):\n" +
      lines.map((l) => `  ${l}`).join("\n") +
      "\n  → PROIBIDO sugerir, mencionar ou adicionar qualquer item incompatível." +
      "\n  → Se não houver opções compatíveis: responda 'Hoje não temos opções compatíveis" +
      " com essa restrição' — nunca sugira substituto não verificado.";
  }

  if (alreadySuggestedItems.length > 0) {
    sysAddendum +=
      "\n\nITENS JÁ SUGERIDOS NESTA CONVERSA (alreadySuggestedIds + rejectedIds — PROIBIDO repetir):\n" +
      alreadySuggestedItems
        .map((i: { id: string; name: string }) => `  • ${i.name} [ID: ${i.id}]`)
        .join("\n") +
      "\n  → Estes itens NÃO devem aparecer novamente como sugestão, independente do estágio." +
      "\n  → Se não houver item novo disponível em uma categoria → PULE a categoria inteira.";
  }

  if (sysAddendum) {
    messages[0] = { ...sysMsg, content: sysMsg.content + sysAddendum };
  }

  // OpenAI tool-call loop (identical to AIOrderService)
  const toolCallsMade: TurnToolCall[] = [];
  let finalResponse = "";
  const loopMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [...messages];
  let addItemAttempts = 0;  // guard: max 2 add_item calls per turn

  for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
    // Per-call retry for 429 and network errors — up to MAX_SCENARIO_RETRIES attempts
    let response: Awaited<ReturnType<typeof openai.chat.completions.create>>;
    let callAttempt = 0;
    while (true) {
      const abort = new AbortController();
      const timeoutId = setTimeout(() => abort.abort(), TURN_TIMEOUT_MS);
      try {
        response = await openai.chat.completions.create(
          {
            model:       brandConfig.aiModel,
            messages:    loopMessages,
            tools:       AI_TOOL_DEFINITIONS,
            tool_choice: "auto",
            max_tokens:  resolveMaxTokens(salesProfile),
            temperature: 0.3,
          },
          { signal: abort.signal },
        );
        clearTimeout(timeoutId);
        break;  // success
      } catch (err) {
        clearTimeout(timeoutId);
        callAttempt++;
        if (isRetryableError(err) && callAttempt <= MAX_SCENARIO_RETRIES) {
          const wait = RETRY_DELAYS_MS[callAttempt - 1] ?? 4_000;
          const errType = err instanceof Error ? err.constructor.name : typeof err;
          console.warn(
            `[AISimulator] Retryable error on turn call for conversation "${conversationId}" ` +
            `(attempt ${callAttempt}/${MAX_SCENARIO_RETRIES}, type=${errType}) — retrying in ${wait}ms`,
          );
          await sleep(wait);
          continue;
        }
        throw err;  // non-retryable or retries exhausted
      }
    }

    const choice = response.choices[0];
    if (!choice) break;

    const { finish_reason, message } = choice;
    loopMessages.push(message);

    if (finish_reason === "stop" || finish_reason === "length") {
      finalResponse = message.content ?? "";
      break;
    }

    if (finish_reason === "tool_calls" && message.tool_calls) {
      const fnCalls = message.tool_calls.filter(
        (tc): tc is Extract<typeof tc, { type: "function"; function: { name: string; arguments: string } }> =>
          tc.type === "function" && "function" in tc
      );

      for (const tc of fnCalls) {
        // Server-side guard: max 2 add_item calls per turn (original + 1 retry)
        if (tc.function.name === "add_item") {
          addItemAttempts++;
          if (addItemAttempts > 2) {
            const blocked = {
              success: false,
              message: "PARAR: limite de tentativas add_item atingido neste turno. " +
                       "Responda ao cliente diretamente sem chamar add_item novamente.",
            };
            loopMessages.push({
              role:         "tool",
              tool_call_id: tc.id,
              content:      JSON.stringify(blocked),
            });
            toolCallsMade.push({
              name:       "add_item",
              args:       {},
              success:    false,
              resultMsg:  blocked.message,
              resultData: null,
            });
            continue;
          }
        }

        const result = await executeTool(tc.function.name, tc.function.arguments, toolCtx);
        let args: unknown = tc.function.arguments;
        try { args = JSON.parse(tc.function.arguments); } catch { /* keep raw */ }

        toolCallsMade.push({
          name:       tc.function.name,
          args,
          success:    result.success,
          resultMsg:  result.message,
          resultData: result.data ?? null,
        });

        loopMessages.push({
          role:         "tool",
          tool_call_id: tc.id,
          content:      JSON.stringify(result),
        });

        if (handoffRequested) break;
      }

      if (handoffRequested) break;
      continue;
    }

    finalResponse = message.content ?? "";
    break;
  }

  // Observe-only: log when AI skipped suggest_upsell without explicitly calling it.
  // No auto-fire — AI only gets credit for tools it actually called (matches production).
  if (
    upsellSuggestions.length > 0 &&
    brandConfig.upsellStyle !== "none" &&
    !toolCallsMade.some((tc) => tc.name === "suggest_upsell")
  ) {
    console.warn(
      `[AISimulator] [MISSED-UPSELL] conversationId="${conversationId}" ` +
      `reason="model did not call suggest_upsell — missed upsell opportunity recorded"`,
    );
  }

  // Save AI response as OUTBOUND (so next turn sees conversation history)
  if (finalResponse) {
    await prisma.message.create({
      data: {
        conversationId,
        direction: "OUTBOUND",
        content:   finalResponse,
        type:      "TEXT",
        sentAt:    new Date(),
      },
    });
  }

  return { text: finalResponse, toolCalls: toolCallsMade };
}

// mirrors AIOrderService.buildGoalContext
function buildGoalContextAddendum(
  cartValue: number, cartItemCount: number,
  targetTicket: number, targetItems: number,
  valueGap: number, itemGap: number,
): string {
  const lines = [
    `\n\nCONTEXTO DE METAS (turno atual):`,
    `  Pedido: R$ ${cartValue.toFixed(2)} | ${cartItemCount} itens`,
    `  Meta:   R$ ${targetTicket.toFixed(2)} | ${targetItems} itens`,
  ];
  if (valueGap > 0 || itemGap > 0) {
    const gaps: string[] = [];
    if (valueGap > 0) gaps.push(`R$ ${valueGap.toFixed(2)} em valor`);
    if (itemGap > 0)  gaps.push(`${itemGap} itens`);
    lines.push(`  Gap: ${gaps.join(" | ")}`);
  }
  return lines.join("\n");
}

// ─── evaluation ───────────────────────────────────────────────

function computeSalesWeaknesses(
  metrics: SalesMetrics,
  totalTurns: number,
): string[] {
  const w: string[] = [];

  if (!metrics.conversionSuccess) {
    w.push("Pedido não finalizado — cliente não converteu");
  }

  if (metrics.finalCartValue === 0 && totalTurns >= 4) {
    w.push("Carrinho vazio após vários turnos — IA não conseguiu iniciar o pedido");
  }

  if (metrics.upsellAttempts === 0 && totalTurns >= 3) {
    w.push("Nenhuma sugestão de upsell oferecida durante toda a conversa");
  }

  if (metrics.upsellAttempts > 0 && metrics.acceptedUpsellsOnly === 0) {
    w.push("Upsell foi tentado mas nenhum foi aceito — sugestões podem estar fora de contexto");
  }

  const acceptRate = metrics.upsellAttempts > 0
    ? metrics.acceptedUpsellsOnly / metrics.upsellAttempts
    : null;
  if (acceptRate !== null && acceptRate < 0.3 && metrics.upsellAttempts >= 2) {
    w.push(`Baixa taxa de aceitação de upsell: ${(acceptRate * 100).toFixed(0)}%`);
  }

  if (totalTurns >= 10 && !metrics.conversionSuccess) {
    w.push("Conversa muito longa sem conclusão — IA não conduziu para checkout a tempo");
  }

  return w;
}

function evaluateScenario(
  scenario: ScenarioDef,
  transcript: TurnTranscript[],
  toolCalls: Array<{ name: string; args: unknown; success: boolean; resultMsg: string }>,
  perTurnCalls: TurnToolCall[][],
  menu: Array<{ id: string; name: string; ingredients: string | null; price: unknown }>,
  salesMetrics: SalesMetrics,
  cartEvolution: CartSnapshot[],
): ScenarioResult {
  const lastAiTurn = [...transcript].reverse().find((t) => t.role === "ai");
  const lastAiText = lastAiTurn?.content ?? "";
  const issues: string[] = [];
  const checks: CheckResult[] = [];

  for (const checkType of scenario.checks) {
    const r = runCheck(checkType, toolCalls, perTurnCalls, lastAiText, scenario, menu, salesMetrics);
    checks.push(r);
    if (!r.passed) issues.push(r.detail);
  }

  const passedCount = checks.filter((c) => c.passed).length;
  const checkRate   = checks.length > 0 ? passedCount / checks.length : 1;
  const totalTurns  = transcript.filter((t) => t.role === "customer").length;

  // Multi-factor score 0–100:
  // checks 60% + conversion 20% + upsell 10% + efficiency 10% − error penalty − UX penalty
  let score = checkRate * 60;
  if (salesMetrics.conversionSuccess)        score += 20;
  if (salesMetrics.acceptedUpsellsOnly > 0)  score += 10;
  if (salesMetrics.conversionSuccess && totalTurns <= 8) score += 10;
  score -= Math.min(20, salesMetrics.errorCount * 5);

  // UX penalties: behaviors that harm customer experience regardless of tool success
  const { penalty: uxPenalty, violations: uxViolations } = computeUxPenalty(
    scenario, transcript, toolCalls, menu,
  );
  score -= uxPenalty;
  if (uxViolations.length > 0) {
    issues.push(...uxViolations.map((v) => `[UX] ${v.description} (-${v.penalty}pts)`));
  }

  score = Math.round(Math.max(0, Math.min(100, score)));

  const status: ScenarioResult["status"] =
    score >= 70 ? "passed" : score >= 50 ? "warning" : "failed";

  const abandoned       = !salesMetrics.conversionSuccess;
  const salesWeaknesses = computeSalesWeaknesses(salesMetrics, totalTurns);

  return {
    id:               scenario.id,
    name:             scenario.name,
    description:      scenario.description,
    expectedBehavior: scenario.expectedBehavior,
    status,
    score,
    transcript,
    checks,
    issues,
    suggestions:      salesWeaknesses,
    salesMetrics,
    cartEvolution,
    totalTurns,
    abandoned,
    salesWeaknesses,
  };
}

function runCheck(
  type: CheckType,
  toolCalls: Array<{ name: string; args: unknown; success: boolean; resultMsg: string }>,
  perTurnCalls: TurnToolCall[][],
  lastAiText: string,
  scenario: ScenarioDef,
  menu: Array<{ id: string; name: string; ingredients: string | null }>,
  salesMetrics: SalesMetrics,
): CheckResult {
  const label = CHECK_LABELS[type];

  switch (type) {
    case "no_hallucination": {
      const failed = toolCalls.filter(
        (tc) => tc.name === "add_item" && !tc.success &&
          (tc.resultMsg.includes("não encontrado") || tc.resultMsg.includes("Nunca invente"))
      );
      return {
        type, label,
        passed: failed.length === 0,
        detail: failed.length > 0
          ? `IA tentou adicionar itens inválidos: ${failed.map((tc) => (tc.args as Record<string, unknown>)?.menuItemId ?? "?").join(", ")}`
          : "Nenhum item inválido solicitado",
      };
    }

    case "relevant_suggestion": {
      const hasToolSuggestion = toolCalls.some(
        (tc) => tc.name === "suggest_upsell" && tc.success
      );
      // Check if AI text explicitly mentions a real menu item by name
      const normalizedText = lastAiText.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
      const mentionedMenuItem = menu.some(
        (item) => item.name.length >= 4 &&
          normalizedText.includes(item.name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""))
      );
      return {
        type, label,
        passed: hasToolSuggestion || mentionedMenuItem,
        detail: hasToolSuggestion
          ? "IA sugeriu produto via suggest_upsell"
          : mentionedMenuItem
          ? "IA mencionou produto real do cardápio no texto (sem tool call)"
          : "IA não chamou suggest_upsell nem mencionou item real do cardápio",
      };
    }

    case "dietary_respected": {
      const suggestedItemIds = toolCalls
        .filter((tc) => (tc.name === "suggest_upsell" || tc.name === "add_item") && tc.success)
        .map((tc) => (tc.args as Record<string, unknown>)?.menuItemId as string | undefined)
        .filter((id): id is string => !!id);

      const violations: string[] = [];
      for (const id of suggestedItemIds) {
        const item = menu.find((m) => m.id === id);
        if (item && isBlockedByDietary(item.name, item.ingredients, scenario.dietary ?? [], scenario.allergies ?? [])) {
          violations.push(item.name);
        }
      }
      return {
        type, label,
        passed: violations.length === 0,
        detail: violations.length > 0
          ? `Itens incompatíveis sugeridos: ${violations.join(", ")}`
          : "Restrições alimentares respeitadas",
      };
    }

    case "no_repeat_suggestion": {
      const suggestions = toolCalls
        .filter((tc) => tc.name === "suggest_upsell")
        .map((tc) => (tc.args as Record<string, unknown>)?.menuItemId as string | undefined)
        .filter((id): id is string => !!id);
      const unique   = new Set(suggestions);
      const repeated = suggestions.length > unique.size;
      return {
        type, label,
        passed: !repeated,
        detail: repeated ? "Mesmo produto sugerido mais de uma vez" : "Sem repetições de sugestões",
      };
    }

    case "no_loop": {
      // A loop = same tool called > 3 times within a single AI response cycle.
      // Cross-turn counts are normal in multi-turn conversations and must not be flagged.
      let loopDetail = "";
      const hasLoop = perTurnCalls.some((turnCalls) => {
        const counts = new Map<string, number>();
        for (const tc of turnCalls) {
          counts.set(tc.name, (counts.get(tc.name) ?? 0) + 1);
        }
        const offender = [...counts.entries()].find(([, n]) => n > 3);
        if (offender) {
          loopDetail = `${offender[0]} chamado ${offender[1]}x em um único turno`;
          return true;
        }
        return false;
      });
      return {
        type, label,
        passed: !hasLoop,
        detail: hasLoop ? `Loop detectado: ${loopDetail}` : "Nenhum loop por turno detectado",
      };
    }

    case "checkout_transition": {
      const confirmedSuccess = toolCalls.some((tc) => tc.name === "confirm_order" && tc.success);
      const confirmedAttempt = toolCalls.some((tc) => tc.name === "confirm_order");
      return {
        type, label,
        passed: confirmedAttempt,
        detail: confirmedSuccess
          ? "IA executou confirm_order com sucesso"
          : confirmedAttempt
          ? "IA chamou confirm_order (falhou — carrinho vazio ou erro de tool)"
          : "IA não chamou confirm_order — texto sozinho não conta como checkout",
      };
    }

    case "clarification_asked": {
      const hasQuestion = lastAiText.includes("?");
      // Must be a qualification question about the customer's preference/context,
      // not just any sentence ending in "?" (e.g., "Posso confirmar?" is not a clarification).
      const qualificationPattern = /prefer|lev[eo]|complet|fom[ei]|divid|sozinho|só para voc|quantas|pra quantos|vai dividir|como prefer|que tipo|qual prefer|qual opção|pra você|o que você|mais leve|mais complet/i;
      const isQualificationQuestion = hasQuestion && qualificationPattern.test(lastAiText);
      return {
        type, label,
        passed: isQualificationQuestion,
        detail: isQualificationQuestion
          ? "IA fez pergunta de qualificação relevante sobre a preferência do cliente"
          : hasQuestion
          ? "IA fez uma pergunta mas não foi de qualificação sobre preferência"
          : "IA não fez pergunta de esclarecimento",
      };
    }

    case "natural_tone": {
      const trimmed = lastAiText.trim();
      if (trimmed.length === 0) {
        return { type, label, passed: false, detail: "Resposta vazia" };
      }
      if (trimmed.length < 15) {
        return { type, label, passed: false, detail: `Resposta muito curta (${trimmed.length} chars)` };
      }
      if (trimmed.length > 800) {
        return { type, label, passed: false, detail: `Resposta excessivamente longa (${trimmed.length} chars) — parece monólogo robótico` };
      }
      // Detect repetitive generation: many sentences with identical 30-char prefix
      const sentences = trimmed.split(/[.!?]+/).map((s) => s.trim()).filter((s) => s.length > 0);
      const uniquePrefixes = new Set(sentences.map((s) => s.toLowerCase().slice(0, 30)));
      if (sentences.length >= 4 && uniquePrefixes.size / sentences.length < 0.5) {
        return { type, label, passed: false, detail: "Resposta com padrão repetitivo — possível loop de geração" };
      }
      return { type, label, passed: true, detail: "Resposta com comprimento e estrutura adequados" };
    }

    case "post_checkout_completed": {
      const { postCheckoutCompleted, postCheckoutDropPhase } = salesMetrics;
      if (postCheckoutCompleted) {
        return { type, label, passed: true, detail: "Fluxo pós-checkout concluído (entrega + nome + pagamento coletados)" };
      }
      const phaseLabels: Record<PostCheckoutDropPhase, string> = {
        not_reached:   "pedido não foi confirmado (confirm_order não chamado)",
        delivery_type: "tipo de entrega não coletado",
        address:       "endereço não coletado (entrega a domicílio)",
        name:          "nome do cliente não coletado",
        payment:       "método de pagamento não coletado",
        complete:      "completo",  // shouldn't reach here
      };
      return {
        type, label, passed: false,
        detail: `Pós-checkout incompleto — parou em: ${phaseLabels[postCheckoutDropPhase]}`,
      };
    }
  }
}

// ─── UX penalty engine ────────────────────────────────────────

interface UxViolation {
  description: string;
  penalty:     number;
}

function computeUxPenalty(
  scenario: ScenarioDef,
  transcript: TurnTranscript[],
  toolCalls: Array<{ name: string; args: unknown; success: boolean; resultMsg: string }>,
  menu: Array<{ id: string; name: string; price: unknown }>,
): { penalty: number; violations: UxViolation[] } {
  const violations: UxViolation[] = [];

  // 1. Empty AI response turns — each empty turn costs 5pts, capped at 10
  const emptyAiTurns = transcript.filter((t) => t.role === "ai" && t.content.trim().length === 0);
  if (emptyAiTurns.length > 0) {
    const p = Math.min(10, emptyAiTurns.length * 5);
    violations.push({ description: `${emptyAiTurns.length} turno(s) com resposta vazia`, penalty: p });
  }

  // 2. Checkout-lock violations: add_item or suggest_upsell blocked after checkout started
  const checkoutLocked = toolCalls.filter(
    (tc) => !tc.success && tc.resultMsg?.includes("BLOQUEADO: pedido em fase de confirmação"),
  );
  if (checkoutLocked.length > 0) {
    const p = Math.min(9, checkoutLocked.length * 3);
    violations.push({ description: `${checkoutLocked.length} chamada(s) bloqueada(s) por checkout lock`, penalty: p });
  }

  // 3. confirm_order loop: hard-limit hit in same turn
  const confirmLoops = toolCalls.filter(
    (tc) => tc.name === "confirm_order" && !tc.success &&
      tc.resultMsg?.includes("PARAR: confirm_order já foi tentado"),
  );
  if (confirmLoops.length > 0) {
    const p = Math.min(10, confirmLoops.length * 5);
    violations.push({ description: `confirm_order em loop: ${confirmLoops.length} chamada(s) extras bloqueadas`, penalty: p });
  }

  // 4. Budget mismatch: premium item suggested to budget=baixo customer
  if (scenario.behaviorProfile.budget === "baixo" && menu.length > 0) {
    const avgPrice = menu.reduce((s, m) => s + Number(m.price), 0) / menu.length;
    const premiumThreshold = avgPrice * 1.6;
    const suggestedIds = toolCalls
      .filter((tc) => tc.name === "suggest_upsell" && tc.success)
      .map((tc) => (tc.args as Record<string, unknown>)?.menuItemId as string | undefined)
      .filter((id): id is string => !!id);
    const premiumCount = suggestedIds.filter((id) => {
      const item = menu.find((m) => m.id === id);
      return item && Number(item.price) > premiumThreshold;
    }).length;
    if (premiumCount > 0) {
      violations.push({
        description: `${premiumCount} item(s) premium sugerido(s) a cliente com orçamento baixo`,
        penalty: 5,
      });
    }
  }

  const totalPenalty = Math.min(20, violations.reduce((s, v) => s + v.penalty, 0));
  return { penalty: totalPenalty, violations };
}

// ─── report builder ───────────────────────────────────────────

// Estimated average values for missing-revenue projection
const EST_DRINK_VALUE   = 10;
const EST_DESSERT_VALUE = 14;
const DEFAULT_TARGET_TICKET = 80;

function buildReport(results: ScenarioResult[], restaurantName: string): SimulationReport {
  const n = results.length || 1;

  // ── base metrics ──────────────────────────────────────────
  const overallScore     = results.reduce((s, r) => s + r.score,                          0) / n;
  const avgTicket        = results.reduce((s, r) => s + r.salesMetrics.finalCartValue,    0) / n;
  const avgItems         = results.reduce((s, r) => s + r.salesMetrics.totalItems,        0) / n;
  const avgTurns         = results.reduce((s, r) => s + r.totalTurns,                     0) / n;
  const conversionRate   = results.filter((r) =>  r.salesMetrics.conversionSuccess).length / n;
  const abandonmentRate  = results.filter((r) =>  r.abandoned).length / n;
  const totalUpsellAttempts = results.reduce((s, r) => s + r.salesMetrics.upsellAttempts,      0);
  const totalUpsellAccepted = results.reduce((s, r) => s + r.salesMetrics.acceptedUpsellsOnly, 0);
  const upsellAcceptanceRate = totalUpsellAttempts > 0 ? totalUpsellAccepted / totalUpsellAttempts : 0;
  const realRevenue      = results.filter((r) => r.salesMetrics.conversionSuccess)
                                   .reduce((s, r) => s + r.salesMetrics.finalCartValue, 0);
  const flowScore        = results.reduce((s, r) => s + r.salesMetrics.flowScore,   0) / n;
  const errorCount       = results.reduce((s, r) => s + r.salesMetrics.errorCount,  0);

  // ── post-checkout lifecycle ───────────────────────────────
  const convertedResults = results.filter((r) => r.salesMetrics.conversionSuccess);
  const nConverted = convertedResults.length || 1;
  const checkoutCompletionRate = results.filter(
    (r) => r.salesMetrics.postCheckoutCompleted,
  ).length / n;
  const dropDuringAddress = convertedResults.filter(
    (r) => r.salesMetrics.postCheckoutDropPhase === "address",
  ).length / nConverted;
  const dropDuringPayment = convertedResults.filter(
    (r) => r.salesMetrics.postCheckoutDropPhase === "payment",
  ).length / nConverted;

  // ── legacy fields ─────────────────────────────────────────
  const criticalBugs: string[] = [];
  for (const r of results) {
    for (const c of r.checks) {
      if (!c.passed) criticalBugs.push(`[${r.name}] ${c.detail}`);
    }
  }
  const failTypeCounts = new Map<string, number>();
  for (const r of results) {
    for (const c of r.checks) {
      if (!c.passed) failTypeCounts.set(c.label, (failTypeCounts.get(c.label) ?? 0) + 1);
    }
  }
  const topFixes = [...failTypeCounts.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([label, count]) => `${label} (${count} cenário${count > 1 ? "s" : ""})`);

  const safeToTest =
    overallScore >= 60 &&
    results.every((r) => r.status !== "failed") &&
    !results.some((r) => r.status === "failed" && r.checks.some((c) => c.type === "dietary_respected"));

  // ── 1. SALES DIAGNOSIS ────────────────────────────────────
  const salesDiagnosis = buildSalesDiagnosis(results, n);

  // ── 2. REVENUE ANALYSIS ───────────────────────────────────
  const revenueAnalysis = buildRevenueAnalysis(results, n, avgTicket, realRevenue);

  // ── 3. ERROR PRIORITIZATION ───────────────────────────────
  const errorPrioritization = buildErrorPrioritization(results);

  // ── 4. BEHAVIOR ANALYSIS ──────────────────────────────────
  const behaviorAnalysis = buildBehaviorAnalysis(results, n);

  // ── 5. DETAILED PERFORMANCE SCORE ────────────────────────
  const performanceScore = buildPerformanceScore(
    overallScore, conversionRate, upsellAcceptanceRate, avgTicket,
    flowScore, avgTurns, errorCount, n, results,
  );

  // ── 6. TOP 3 ACTIONABLE FIXES ─────────────────────────────
  const actionableFixes = buildActionableFixes(
    salesDiagnosis, revenueAnalysis, errorPrioritization,
    behaviorAnalysis, performanceScore, conversionRate,
  );

  // ── SUMMARY ───────────────────────────────────────────────
  const summary = buildSummary(
    overallScore, conversionRate, salesDiagnosis,
    revenueAnalysis, performanceScore, actionableFixes,
  );

  return {
    overallScore: Math.round(overallScore),
    scenarios: results,
    criticalBugs,
    topFixes,
    safeToTest,
    ranAt: new Date().toISOString(),
    restaurantName,
    avgTicket,
    avgItems,
    conversionRate,
    avgTurns,
    abandonmentRate,
    upsellAcceptanceRate,
    realRevenue,
    flowScore,
    errorCount,
    checkoutCompletionRate,
    dropDuringAddress,
    dropDuringPayment,
    salesDiagnosis,
    revenueAnalysis,
    errorPrioritization,
    behaviorAnalysis,
    performanceScore,
    actionableFixes,
    summary,
  };
}

// ─── analytical builders ──────────────────────────────────────

function buildSalesDiagnosis(results: ScenarioResult[], n: number): SalesDiagnosis {
  const withMainItem  = results.filter((r) => r.salesMetrics.totalItems > 0).length / n;
  const withDrink     = results.filter((r) => r.salesMetrics.upsellsByType.drink   > 0).length / n;
  const withDessert   = results.filter((r) => r.salesMetrics.upsellsByType.dessert > 0).length / n;
  const fullCoverage  = results.filter((r) => r.salesMetrics.flowScore >= 0.99).length / n;
  const avgItemsPerOrder = results.reduce((s, r) => s + r.salesMetrics.totalItems, 0) / n;
  const missedUpsells = results.filter(
    (r) => r.salesMetrics.totalItems > 0 && r.salesMetrics.upsellAttempts === 0
  ).length;

  return { withMainItem, withDrink, withDessert, fullCoverage, avgItemsPerOrder, missedUpsells };
}

function buildRevenueAnalysis(
  results: ScenarioResult[],
  n: number,
  avgActualTicket: number,
  actualRevenue: number,
): RevenueAnalysis {
  const withoutDrink    = results.filter((r) => r.salesMetrics.upsellsByType.drink   === 0);
  const withoutDessert  = results.filter((r) => r.salesMetrics.upsellsByType.dessert === 0);

  const lostRevenueDrink   = withoutDrink.length   * EST_DRINK_VALUE;
  const lostRevenueDessert = withoutDessert.length * EST_DESSERT_VALUE;
  const lostRevenueTotal   = lostRevenueDrink + lostRevenueDessert;

  const potentialRevenue   = n * DEFAULT_TARGET_TICKET;
  const avgPotentialTicket = DEFAULT_TARGET_TICKET;
  const ticketGap          = Math.max(0, avgPotentialTicket - avgActualTicket);

  return {
    actualRevenue,
    potentialRevenue,
    lostRevenueDrink,
    lostRevenueDessert,
    lostRevenueTotal,
    avgActualTicket,
    avgPotentialTicket,
    ticketGap,
  };
}

function buildErrorPrioritization(results: ScenarioResult[]): ErrorPrioritization {
  // Classify each failed check by severity
  type CheckEntry = { severity: ErrorSeverity; type: string; description: string; impact: string };

  const CHECK_SEVERITY: Record<CheckType, CheckEntry> = {
    no_hallucination:        { severity: "CRITICAL", type: "hallucinated_item",        description: "IA inventou ID de item inexistente",                   impact: "Pedido inválido — cliente recebe produto errado ou erro" },
    dietary_respected:       { severity: "CRITICAL", type: "dietary_violation",        description: "Item incompatível com restrição alimentar sugerido",    impact: "Risco de saúde / experiência inaceitável para o cliente" },
    no_loop:                 { severity: "HIGH",     type: "tool_loop",                description: "IA entrou em loop de chamadas de ferramenta",            impact: "Resposta falha ou travada — cliente recebe mensagem vazia" },
    checkout_transition:     { severity: "HIGH",     type: "missing_checkout",         description: "IA não encaminhou o pedido para confirmação",            impact: "Receita perdida — pedido não foi finalizado" },
    post_checkout_completed: { severity: "HIGH",     type: "incomplete_post_checkout", description: "IA não completou o fluxo pós-checkout (entrega/pagamento)", impact: "Pedido confirmado mas dados de entrega/pagamento não coletados" },
    no_repeat_suggestion:    { severity: "MEDIUM",   type: "repeated_suggestion",      description: "Mesmo produto sugerido mais de uma vez",                impact: "Má experiência — cliente sente pressão ou desorganização" },
    relevant_suggestion:     { severity: "MEDIUM",   type: "irrelevant_suggestion",    description: "IA não sugeriu produto ou sugestão foi genérica",        impact: "Oportunidade de upsell perdida" },
    clarification_asked:     { severity: "MEDIUM",   type: "no_clarification",         description: "IA não perguntou antes de assumir intenção",             impact: "Pode resultar em pedido errado ou insatisfação" },
    natural_tone:            { severity: "LOW",      type: "poor_tone",                description: "Tom de resposta inadequado ou muito curto",              impact: "Experiência abaixo do padrão — cliente pode desistir" },
  };

  const groups = new Map<string, { entry: CheckEntry; count: number; scenarios: string[] }>();

  for (const r of results) {
    for (const c of r.checks) {
      if (!c.passed) {
        const def = CHECK_SEVERITY[c.type];
        if (!def) continue;
        const existing = groups.get(def.type);
        if (existing) {
          existing.count++;
          existing.scenarios.push(r.name);
        } else {
          groups.set(def.type, { entry: def, count: 1, scenarios: [r.name] });
        }
      }
    }
  }

  const allErrors = [...groups.entries()].map(([, v]) => ({
    severity:    v.entry.severity,
    type:        v.entry.type,
    count:       v.count,
    scenarios:   v.scenarios,
    description: v.entry.description,
    impact:      v.entry.impact,
  } satisfies PrioritizedError));

  return {
    critical: allErrors.filter((e) => e.severity === "CRITICAL").sort((a, b) => b.count - a.count),
    high:     allErrors.filter((e) => e.severity === "HIGH").sort((a, b) => b.count - a.count),
    medium:   allErrors.filter((e) => e.severity === "MEDIUM").sort((a, b) => b.count - a.count),
    low:      allErrors.filter((e) => e.severity === "LOW").sort((a, b) => b.count - a.count),
    total:    allErrors.reduce((s, e) => s + e.count, 0),
  };
}

function buildBehaviorAnalysis(results: ScenarioResult[], n: number): BehaviorAnalysis {
  const beforeMainItem = results.filter((r) => r.salesMetrics.totalItems === 0).length / n;

  const afterMainItem  = results.filter(
    (r) => r.salesMetrics.totalItems > 0 && r.salesMetrics.upsellsByType.drink === 0
  ).length / n;

  const duringUpsell   = results.filter(
    (r) => r.salesMetrics.rejectedSuggestions > 0 && r.salesMetrics.acceptedUpsellsOnly === 0
  ).length / n;

  const beforeCheckout = results.filter(
    (r) => r.salesMetrics.totalItems > 0 && !r.salesMetrics.conversionSuccess
  ).length / n;

  const repeatSuggestions = results.filter(
    (r) => r.checks.some((c) => c.type === "no_repeat_suggestion" && !c.passed)
  ).length / n;

  const abandonedAfterRefusal = results.filter(
    (r) => r.abandoned && r.salesMetrics.rejectedSuggestions > 0
  ).length / n;

  return {
    flowBreakdown:   { beforeMainItem, afterMainItem, duringUpsell, beforeCheckout },
    refusalHandling: { repeatSuggestions, abandonedAfterRefusal },
  };
}

function buildPerformanceScore(
  overallScore: number,
  conversionRate: number,
  upsellAcceptanceRate: number,
  avgTicket: number,
  flowScore: number,
  avgTurns: number,
  errorCount: number,
  n: number,
  results: ScenarioResult[],
): DetailedPerformanceScore {
  const hallucinationCount = results.filter(
    (r) => r.checks.some((c) => c.type === "no_hallucination" && !c.passed)
  ).length;
  const dietaryViolations = results.filter(
    (r) => r.checks.some((c) => c.type === "dietary_respected" && !c.passed)
  ).length;
  const repeatCount = results.filter(
    (r) => r.checks.some((c) => c.type === "no_repeat_suggestion" && !c.passed)
  ).length;

  const totalToolCalls = results.reduce(
    (s, r) => s + r.checks.filter((c) => c.type === "no_loop").length, 0
  ) + errorCount || 1;

  const errorRate          = Math.min(1, errorCount / (totalToolCalls * n));
  const hallucinationRate  = hallucinationCount / n;
  const dietaryViolRate    = dietaryViolations / n;
  const repeatRate         = repeatCount / n;

  const ticketScore        = Math.min(1, avgTicket / DEFAULT_TARGET_TICKET);
  const turnEfficiency     = avgTurns > 0 ? Math.min(1, 8 / avgTurns) : 0.5;

  const salesEffectiveness    = Math.round((conversionRate * 0.4 + upsellAcceptanceRate * 0.3 + ticketScore * 0.3) * 100);
  const flowControl           = Math.round((flowScore * 0.6 + turnEfficiency * 0.4) * 100);
  const toolAccuracy          = Math.round(((1 - errorRate) * 0.6 + (1 - hallucinationRate) * 0.4) * 100);
  const restrictionCompliance = Math.round(((1 - dietaryViolRate) * 0.6 + (1 - repeatRate) * 0.4) * 100);

  return {
    overall: Math.round(overallScore),
    salesEffectiveness:    Math.max(0, Math.min(100, salesEffectiveness)),
    flowControl:           Math.max(0, Math.min(100, flowControl)),
    toolAccuracy:          Math.max(0, Math.min(100, toolAccuracy)),
    restrictionCompliance: Math.max(0, Math.min(100, restrictionCompliance)),
  };
}

function buildActionableFixes(
  diag:    SalesDiagnosis,
  rev:     RevenueAnalysis,
  errors:  ErrorPrioritization,
  behav:   BehaviorAnalysis,
  perf:    DetailedPerformanceScore,
  conversionRate: number,
): ActionableFix[] {
  // Score each candidate fix by severity and frequency, pick top 3
  type Candidate = Omit<ActionableFix, "rank">;

  const candidates: Array<Candidate & { score: number }> = [];

  // Critical errors first
  if (errors.critical.length > 0) {
    const top = errors.critical[0]!;
    candidates.push({
      score:   100 + top.count * 10,
      problem: `${top.description} (${top.count} cenário${top.count > 1 ? "s" : ""})`,
      why:     top.type === "hallucinated_item"
        ? "A IA usa IDs de memória em vez de ler o cardápio — acontece quando a instrução 'use IDs exatos' não está sendo respeitada."
        : "A IA não está cruzando o perfil do cliente com as restrições antes de chamar suggest_upsell.",
      fix:     top.type === "hallucinated_item"
        ? "Reforce a regra 15 no prompt: verificar o bloco CARDÁPIO antes de qualquer ID. Adicione um exemplo de ID correto e incorreto."
        : "Adicione pré-verificação de dietary no prompt: antes de cada suggest_upsell, confirmar que o item não viola restrição declarada.",
      impact:  "high",
      metric:  "no_hallucination / dietary_respected",
    });
  }

  // Missing drink suggests gap in category coverage
  if (diag.withDrink < 0.5) {
    candidates.push({
      score:   80 + Math.round((1 - diag.withDrink) * 20),
      problem: `Bebida sugerida em apenas ${Math.round(diag.withDrink * 100)}% dos cenários`,
      why:     "A IA finaliza o pedido após o prato principal sem passar pela etapa de bebida. O MOTOR DE VENDAS não está sendo seguido na sequência correta.",
      fix:     "Ajuste o bloco PASSO 1 do MOTOR DE VENDAS: deixe a verificação de bebida mais explícita. Exemplo: 'Se BEBIDA ausente → obrigatório sugerir antes de checkout'.",
      impact:  "high",
      metric:  `salesDiagnosis.withDrink — receita perdida estimada: R$ ${rev.lostRevenueDrink.toFixed(2)}`,
    });
  }

  // Low conversion rate
  if (conversionRate < 0.5) {
    candidates.push({
      score:   75 + Math.round((0.5 - conversionRate) * 50),
      problem: `Taxa de conversão baixa: ${Math.round(conversionRate * 100)}% dos pedidos finalizados`,
      why:     "A IA não está conduzindo as conversas para o checkout — abandona após recusas ou perde o fio do pedido em turnos longos.",
      fix:     "Adicione um gatilho explícito no PASSO 3: após qualquer item adicionado + 2 recusas de upsell, chame confirm_order imediatamente.",
      impact:  "high",
      metric:  "conversionRate",
    });
  }

  // High loop / missed checkout
  if (behav.flowBreakdown.beforeCheckout > 0.3) {
    candidates.push({
      score:   70,
      problem: `${Math.round(behav.flowBreakdown.beforeCheckout * 100)}% dos pedidos com itens não foram confirmados`,
      why:     "A IA não detecta o momento certo para ir ao checkout — continua sugerindo em vez de fechar.",
      fix:     "Adicione uma regra: se AÇÃO RECOMENDADA = 'metas atingidas' OU turnCount >= 6 com itens no carrinho → chamar confirm_order.",
      impact:  "high",
      metric:  "behaviorAnalysis.flowBreakdown.beforeCheckout",
    });
  }

  // Repeated suggestions
  if (behav.refusalHandling.repeatSuggestions > 0.2) {
    candidates.push({
      score:   60,
      problem: `Sugestões repetidas em ${Math.round(behav.refusalHandling.repeatSuggestions * 100)}% dos cenários`,
      why:     "A IA não registra internamente quais itens foram recusados. Sem memória de recusa, repete o mesmo produto.",
      fix:     "O bloco PRODUTOS JÁ SUGERIDOS já existe — certifique-se que itens recusados são adicionados ao alreadySuggestedIds. Reforce a regra 9 no prompt.",
      impact:  "medium",
      metric:  "behaviorAnalysis.refusalHandling.repeatSuggestions",
    });
  }

  // Low tool accuracy
  if (perf.toolAccuracy < 70) {
    candidates.push({
      score:   55,
      problem: `Precisão de ferramentas abaixo de 70% (atual: ${perf.toolAccuracy})`,
      why:     "Alto número de chamadas de ferramenta com falha — provavelmente IDs inválidos ou chamadas fora de ordem.",
      fix:     "Habilite retry automático: quando add_item falhar com 'não encontrado', a IA deve reler o CARDÁPIO e tentar com ID correto antes de desistir.",
      impact:  "medium",
      metric:  "performanceScore.toolAccuracy",
    });
  }

  // Missing dessert (lower priority if drink is already missing)
  if (diag.withDessert < 0.3 && diag.withDrink >= 0.5) {
    candidates.push({
      score:   50,
      problem: `Sobremesa nunca sugerida (apenas ${Math.round(diag.withDessert * 100)}% dos cenários)`,
      why:     "A IA fecha o pedido após prato + bebida sem completar o ciclo com sobremesa.",
      fix:     "No PASSO 1 do MOTOR DE VENDAS, adicione verificação de sobremesa como terceira etapa obrigatória antes do checkout.",
      impact:  "medium",
      metric:  `salesDiagnosis.withDessert — receita perdida estimada: R$ ${rev.lostRevenueDessert.toFixed(2)}`,
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  const top3 = candidates.slice(0, 3);

  return top3.map((c, i) => ({
    rank:    (i + 1) as 1 | 2 | 3,
    problem: c.problem,
    why:     c.why,
    fix:     c.fix,
    impact:  c.impact,
    metric:  c.metric,
  }));
}

function buildSummary(
  overallScore:    number,
  conversionRate:  number,
  diag:            SalesDiagnosis,
  rev:             RevenueAnalysis,
  perf:            DetailedPerformanceScore,
  fixes:           ActionableFix[],
): string {
  const scoreLabel  = overallScore >= 70 ? "satisfatório" : overallScore >= 50 ? "mediano" : "crítico";
  const drinkPct    = Math.round(diag.withDrink * 100);
  const convPct     = Math.round(conversionRate * 100);
  const topFix      = fixes[0]?.problem ?? "nenhuma falha crítica identificada";
  const lostStr     = rev.lostRevenueTotal > 0 ? ` Receita potencial não capturada: R$ ${rev.lostRevenueTotal.toFixed(2)} por rodada.` : "";

  return (
    `Score geral ${Math.round(overallScore)}/100 (${scoreLabel}). ` +
    `Taxa de conversão: ${convPct}% — bebida sugerida em ${drinkPct}% dos cenários.${lostStr} ` +
    `Efetividade de vendas: ${perf.salesEffectiveness}/100 · Controle de fluxo: ${perf.flowControl}/100 · ` +
    `Precisão de ferramentas: ${perf.toolAccuracy}/100 · Conformidade de restrições: ${perf.restrictionCompliance}/100. ` +
    `Prioridade máxima: ${topFix}.`
  );
}

function buildErrorResult(scenario: ScenarioDef, error: string): ScenarioResult {
  return {
    id:               scenario.id,
    name:             scenario.name,
    description:      scenario.description,
    expectedBehavior: scenario.expectedBehavior,
    status:           "failed",
    score:            0,
    transcript:       [],
    checks:           scenario.checks.map((type) => ({
      type,
      label:  CHECK_LABELS[type],
      passed: false,
      detail: `Erro durante simulação: ${error}`,
    })),
    issues:          [`Erro de execução: ${error}`],
    suggestions:     [`Simulação interrompida por erro: ${error}`],
    salesMetrics:    emptyMetrics(),
    cartEvolution:   [],
    totalTurns:      0,
    abandoned:       true,
    salesWeaknesses: [`Simulação interrompida por erro: ${error}`],
  };
}

// ─── sales metrics helpers ────────────────────────────────────

function classifyUpsellType(categoryName: string): "drink" | "dessert" | "addon" {
  const lower = categoryName.toLowerCase();
  if (/bebida|suco|drink|refri|água|cerveja|vinho|refrigerante/.test(lower)) return "drink";
  if (/sobremesa|doce|dessert|sorvete|torta|pudim|brigadeiro/.test(lower)) return "dessert";
  return "addon";
}

function computeFlowScore(
  toolCalls: Array<{ name: string; args: unknown; success: boolean }>,
  menuById: Map<string, { categoryName: string }>,
): number {
  const hasMainItem = toolCalls.some((tc) => tc.name === "add_item" && tc.success);

  const suggestedIds = toolCalls
    .filter((tc) => tc.name === "suggest_upsell" && tc.success)
    .map((tc) => (tc.args as Record<string, unknown>)?.menuItemId as string | undefined)
    .filter((id): id is string => !!id);

  const hasDrinkSuggested = suggestedIds.some((id) => {
    const item = menuById.get(id);
    return item && classifyUpsellType(item.categoryName) === "drink";
  });

  const hasDessertSuggested = suggestedIds.some((id) => {
    const item = menuById.get(id);
    return item && classifyUpsellType(item.categoryName) === "dessert";
  });

  return (hasMainItem ? 0.34 : 0) + (hasDrinkSuggested ? 0.33 : 0) + (hasDessertSuggested ? 0.33 : 0);
}

function emptyMetrics(): SalesMetrics {
  return {
    finalCartValue:        0,
    totalItems:            0,
    upsellAttempts:        0,
    acceptedSuggestions:   0,
    rejectedSuggestions:   0,
    conversionSuccess:     false,
    acceptedUpsellsOnly:   0,
    upsellValueGenerated:  0,
    flowScore:             0,
    errorCount:            0,
    upsellsByType:         { drink: 0, dessert: 0, addon: 0 },
    postCheckoutCompleted: false,
    postCheckoutDropPhase: "not_reached",
  };
}

async function getCartSnapshot(
  customerId: string,
  restaurantId: string,
): Promise<{ value: number; itemCount: number }> {
  try {
    // No status filter — after confirm_order the draft is no longer OPEN,
    // but we still need its final value for metrics.
    const draft = await prisma.orderDraft.findFirst({
      where:   { customerId, restaurantId },
      orderBy: { updatedAt: "desc" },
      select:  {
        subtotal: true,
        items:    { select: { quantity: true } },
      },
    });
    return {
      value:     Number(draft?.subtotal ?? 0),
      itemCount: draft?.items.reduce((s, i) => s + i.quantity, 0) ?? 0,
    };
  } catch {
    return { value: 0, itemCount: 0 };
  }
}

function computeSalesMetrics(
  toolCalls: Array<{ name: string; args: unknown; success: boolean; resultData: unknown }>,
  finalCartValue: number,
  totalItems: number,
  menuById: Map<string, { categoryName: string }>,
  postCheckout: PostCheckoutState,
): SalesMetrics {
  // IDs successfully shown via suggest_upsell
  const suggestedIds = new Set<string>();
  for (const tc of toolCalls) {
    if (tc.name === "suggest_upsell" && tc.success) {
      const id = (tc.args as Record<string, unknown>)?.menuItemId as string | undefined;
      if (id) suggestedIds.add(id);
    }
  }

  const upsellAttempts = suggestedIds.size;

  // add_item calls that originated from a prior suggest_upsell
  const acceptedUpsellCalls = toolCalls.filter(
    (tc) =>
      tc.name === "add_item" &&
      tc.success &&
      suggestedIds.has((tc.args as Record<string, unknown>)?.menuItemId as string),
  );

  const acceptedUpsellsOnly  = acceptedUpsellCalls.length;
  const acceptedSuggestions  = acceptedUpsellsOnly; // same — for report compatibility

  // Value generated exclusively by accepted upsell items (price × qty from result.data)
  const upsellValueGenerated = acceptedUpsellCalls.reduce((sum, tc) => {
    const d = tc.resultData as Record<string, unknown> | null;
    const price = Number(d?.price ?? 0);
    const qty   = Number(d?.quantity ?? 1);
    return sum + price * qty;
  }, 0);

  const rejectedSuggestions = Math.max(0, upsellAttempts - acceptedUpsellsOnly);
  const conversionSuccess   = toolCalls.some(
    (tc) => tc.name === "confirm_order" && tc.success,
  );

  // Upsells classified by category type
  const upsellsByType = { drink: 0, dessert: 0, addon: 0 };
  for (const id of suggestedIds) {
    const item = menuById.get(id);
    const type = classifyUpsellType(item?.categoryName ?? "");
    upsellsByType[type]++;
  }

  const flowScore  = computeFlowScore(toolCalls, menuById);
  const errorCount = toolCalls.filter((tc) => !tc.success).length;

  return {
    finalCartValue,
    totalItems,
    upsellAttempts,
    acceptedSuggestions,
    rejectedSuggestions,
    conversionSuccess,
    acceptedUpsellsOnly,
    upsellValueGenerated,
    flowScore,
    errorCount,
    upsellsByType,
    postCheckoutCompleted: postCheckout.phase === "complete",
    postCheckoutDropPhase: postCheckout.dropPhase,
  };
}

// ─── sandbox cleanup ──────────────────────────────────────────

async function cleanupSimulation(customerId: string, conversationId: string): Promise<void> {
  try {
    // Orders + OrderItems (cascade)
    await prisma.order.deleteMany({ where: { customerId } });
    // Draft items (no cascade) → Drafts
    const drafts = await prisma.orderDraft.findMany({ where: { customerId }, select: { id: true } });
    if (drafts.length > 0) {
      await prisma.orderDraftItem.deleteMany({ where: { orderDraftId: { in: drafts.map((d) => d.id) } } });
      await prisma.orderDraft.deleteMany({ where: { customerId } });
    }
    // Conversation (Messages cascade)
    await prisma.conversation.delete({ where: { id: conversationId } }).catch(() => null);
    // Customer (CustomerPreference cascades)
    await prisma.customer.delete({ where: { id: customerId } }).catch(() => null);
  } catch (err) {
    console.warn("[AISimulator] Cleanup error (non-fatal):", err);
  }
}
