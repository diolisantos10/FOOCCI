/**
 * Part 9 — timeline event contract. The deriver is pure and deterministic:
 * maps a turn (stage + actions + flags) to named events, no DB/PII/runtime.
 */

import { describe, it, expect } from "vitest";
import { deriveOrderingEvents, ORDERING_EVENTS } from "../orderingEvents";

const base = {
  stage: "IDLE" as const,
  intent: "QUESTION" as const,
  actions: [] as string[],
  handoff: false,
  selectedItemsCount: 0,
  unresolvedItemsCount: 0,
  isFirstDraftTurn: false,
};

describe("deriveOrderingEvents", () => {
  it("primeiro turno com item casado → started + item_matched", () => {
    const e = deriveOrderingEvents({ ...base, stage: "COLLECTING_DELIVERY_TYPE", intent: "ORDER_REQUEST", selectedItemsCount: 1, isFirstDraftTurn: true });
    expect(e).toContain("text_order_started");
    expect(e).toContain("item_matched");
  });

  it("ambiguidade → item_ambiguous; não encontrado → item_not_found", () => {
    expect(deriveOrderingEvents({ ...base, stage: "MATCHING_MENU", unresolvedItemsCount: 1 })).toContain("item_ambiguous");
    expect(deriveOrderingEvents({ ...base, stage: "IDLE", unresolvedItemsCount: 1 })).toContain("item_not_found");
  });

  it("confirmação cria order_confirmed; Pix gera pix_generated", () => {
    const e = deriveOrderingEvents({ ...base, stage: "READY_TO_CREATE_ORDER", actions: ["CREATE_ORDER", "GENERATE_PIX"] });
    expect(e).toEqual(expect.arrayContaining(["order_confirmed", "pix_generated"]));
  });

  it("handoff e cancelamento e menu_returned", () => {
    expect(deriveOrderingEvents({ ...base, handoff: true })).toContain("handoff_requested");
    expect(deriveOrderingEvents({ ...base, stage: "CANCELLED" })).toContain("flow_cancelled");
    expect(deriveOrderingEvents({ ...base, intent: "MENU_RETURN" })).toContain("menu_returned");
  });

  it("eventos são únicos e do catálogo conhecido", () => {
    const e = deriveOrderingEvents({ ...base, stage: "COLLECTING_PAYMENT_METHOD", savedAddressOffered: true });
    expect(new Set(e).size).toBe(e.length);
    for (const ev of e) expect(ORDERING_EVENTS).toContain(ev);
  });
});
