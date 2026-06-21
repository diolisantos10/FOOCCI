/**
 * WhatsAppOrderBrainRouter — brain-aware turn router for WhatsApp ordering.
 *
 * The Brain owns the "front" (understand intent + detect items); the legacy state
 * machine owns clarification + finalization (options, delivery, address, payment —
 * all already reusing the shared Fute checkout). This wrapper glues them:
 *
 *  - Non-order messages (menu browse, hours/rodízio questions, complaints) are
 *    answered by the Brain, so they NEVER hit the regex matcher (kills the
 *    "Não encontrei 'Cardápio' no cardápio" class of bugs).
 *  - Order messages are cleaned to EXACT item names and handed to the legacy
 *    machine, which then builds the comanda and runs finalization unchanged.
 *
 * Always safe: when the Brain is disabled, the stage is a legacy stage, or there
 * is no AI pilot (FALLBACK), it delegates to the legacy machine — never worse than
 * today.
 */

import { advanceSession, type AdvanceResult } from "./WhatsAppOrderStateMachine";
import { reasonOrderTurn, type WaOrderKnowledge } from "./WhatsAppOrderBrain";
import { isMenuReturn } from "./menuFooter";
import { matchItems } from "./menuMatcher";
import { parseTextItems } from "./parser";
import type { WaMenuItem, WaPersistedSession, WaOrderStage } from "./types";

/** Stages the legacy machine owns (clarification / finalization / terminal). */
const LEGACY_STAGES: ReadonlySet<WaOrderStage> = new Set<WaOrderStage>([
  "MATCHING_MENU",
  "COLLECTING_REQUIRED_OPTIONS",
  "REVIEWING_ORDER",
  "COLLECTING_DELIVERY_TYPE",
  "COLLECTING_ADDRESS",
  "CALCULATING_DELIVERY_FEE",
  "COLLECTING_PAYMENT_METHOD",
  "AWAITING_PIX_PAYMENT",
  "READY_TO_CREATE_ORDER",
  "HANDOFF_REQUIRED",
  "COMPLETED",
  "CANCELLED",
]);

export interface AdvanceTurnOptions {
  /** When false, always uses the legacy machine (today's behavior). */
  brainEnabled: boolean;
  /** Host knowledge for INFO questions (hours / rodízio / payments / …). */
  knowledge?: WaOrderKnowledge;
}

/** Order-taking Brain — ON by default; set WHATSAPP_ORDER_BRAIN_ENABLED=false to disable. */
export function isOrderBrainEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.WHATSAPP_ORDER_BRAIN_ENABLED !== "false";
}

function cleanItemMessage(items: { quantity: number; menuItemName: string }[]): string {
  return items.map((i) => `${i.quantity} ${i.menuItemName}`).join(", ");
}

function replyResult(session: WaPersistedSession, text: string): AdvanceResult {
  return { session, intent: "QUESTION", suggestedReply: text, actions: [], handoff: false, operatorSummary: "IA respondeu (Brain)" };
}

function handoffResult(session: WaPersistedSession, text: string): AdvanceResult {
  return {
    session: { ...session, status: "HANDOFF_REQUIRED", stage: "HANDOFF_REQUIRED" },
    intent: "HUMAN_REQUEST",
    suggestedReply: text,
    actions: [],
    handoff: true,
    operatorSummary: "IA escalou para humano (Brain)",
  };
}

export async function advanceTurn(
  session: WaPersistedSession,
  message: string,
  menu: WaMenuItem[],
  opts: AdvanceTurnOptions,
): Promise<AdvanceResult> {
  // Brain off, or a legacy-owned stage (finalization/clarification/terminal) → legacy.
  if (!opts.brainEnabled || LEGACY_STAGES.has(session.stage)) {
    return advanceSession(session, message, menu);
  }

  // "0" (menu-return) must always reach advanceSession's isMenuReturn guard so the
  // active-cart disambiguation flow (Continuar / Descartar / Atendente) fires correctly.
  if (isMenuReturn(message)) {
    return advanceSession(session, message, menu);
  }

  // Pending menu-return confirmation (customer previously typed "0") → legacy owns this turn.
  if (session.metadata?.menuReturnPending === true) {
    return advanceSession(session, message, menu);
  }

  const decision = await reasonOrderTurn({
    message,
    menu,
    comanda: session.selectedItems,
    knowledge: opts.knowledge,
  });

  // Diagnostic (production observability): one line per live brain turn so the logs
  // show whether the order brain is engaging and in which mode (LLM vs FALLBACK).
  console.log(
    `[WhatsAppOrderBrain] stage=${session.stage} intent=${decision.intent} items=${decision.items.length} mode=${decision.reasoningMode}`,
  );

  // No pilot configured (or unusable output) → legacy machine (no worse than today).
  if (decision.reasoningMode === "FALLBACK") {
    return advanceSession(session, message, menu);
  }

  switch (decision.intent) {
    case "ADD_ITEMS":
      if (decision.items.length === 0) {
        return decision.reply ? replyResult(session, decision.reply) : advanceSession(session, message, menu);
      }
      // Guard: if the original message is inherently ambiguous (e.g. "coca" matches
      // Coca-Cola Lata AND Coca-Cola 2L), let the legacy machine show numbered options
      // rather than letting the Brain pick one silently.
      {
        const parsed = parseTextItems(message);
        const { unresolved } = matchItems(parsed, menu);
        if (unresolved.some((u) => u.reason === "AMBIGUOUS")) {
          return advanceSession(session, message, menu);
        }
      }
      // Cleaned, exact item list → legacy builds the comanda + asks options + routes
      // to finalization (all reused, no "Não encontrei" because the names are exact).
      return advanceSession(session, cleanItemMessage(decision.items), menu);

    case "MENU_BROWSE":
    case "INFO_QUESTION":
    case "SMALLTALK":
      return replyResult(session, decision.reply || "Como posso te ajudar? 😊");

    case "HUMAN":
      return handoffResult(session, decision.reply || "Vou chamar um atendente pra te ajudar. 🤝");

    case "CHECKOUT":
    case "MODIFY":
      // Finalization / item edits stay with the legacy machine (Final Intent Lock,
      // option edits, checkout flow).
      return advanceSession(session, message, menu);

    default: // UNKNOWN
      return decision.reply ? replyResult(session, decision.reply) : advanceSession(session, message, menu);
  }
}
