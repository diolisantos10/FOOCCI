/**
 * Text-order observability — the timeline event contract.
 *
 * A PURE catalog + deriver: maps a state-machine step (stage + actions + flags)
 * to the named events a timeline should record. No DB, no PII, no runtime: this
 * is the single source of truth for WHAT happens, so the runtime/CRM can persist
 * it later behind the same gates without re-deriving meaning here.
 */

import type { WaOrderStage, WaDetectedIntent } from "./types";

export const ORDERING_EVENTS = [
  "text_order_started",
  "item_matched",
  "item_ambiguous",
  "item_not_found",
  "cart_reviewed",
  "delivery_selected",
  "saved_address_offered",
  "payment_selected",
  "order_confirmed",
  "pix_generated",
  "handoff_requested",
  "menu_returned",
  "flow_cancelled",
] as const;

export type OrderingEvent = (typeof ORDERING_EVENTS)[number];

/** Who/what drove a timeline entry — keeps "foi IA / humano / sistema" explicit. */
export type TimelineActor = "ai" | "human" | "system";

export interface DeriveEventsInput {
  stage: WaOrderStage;
  intent: WaDetectedIntent;
  actions: string[];
  handoff: boolean;
  /** Counts from the resulting session, used to classify item events. */
  selectedItemsCount: number;
  unresolvedItemsCount: number;
  /** True the first time a draft is opened (was IDLE, now has items/parsing). */
  isFirstDraftTurn: boolean;
  /** True when the saved-address offer is being shown this turn. */
  savedAddressOffered?: boolean;
}

/**
 * Derives the timeline events for one inbound turn. Deterministic and side-effect
 * free — the same input always yields the same ordered event list.
 */
export function deriveOrderingEvents(input: DeriveEventsInput): OrderingEvent[] {
  const events: OrderingEvent[] = [];

  if (input.isFirstDraftTurn) events.push("text_order_started");

  if (input.intent === "MENU_RETURN") events.push("menu_returned");
  if (input.handoff || input.stage === "HANDOFF_REQUIRED") events.push("handoff_requested");
  if (input.stage === "CANCELLED") events.push("flow_cancelled");

  // Item classification for this turn.
  if (input.unresolvedItemsCount > 0) {
    events.push(input.stage === "MATCHING_MENU" ? "item_ambiguous" : "item_not_found");
  } else if (input.selectedItemsCount > 0 && input.isFirstDraftTurn) {
    events.push("item_matched");
  }

  if (input.stage === "REVIEWING_ORDER") events.push("cart_reviewed");
  if (input.stage === "COLLECTING_ADDRESS" || input.stage === "CALCULATING_DELIVERY_FEE") {
    events.push("delivery_selected");
  }
  if (input.savedAddressOffered) events.push("saved_address_offered");
  if (input.stage === "COLLECTING_PAYMENT_METHOD" || input.stage === "AWAITING_PIX_PAYMENT") {
    events.push("payment_selected");
  }

  if (input.actions.includes("CREATE_ORDER")) events.push("order_confirmed");
  if (input.actions.includes("GENERATE_PIX")) events.push("pix_generated");

  // De-dup while preserving order.
  return [...new Set(events)];
}
