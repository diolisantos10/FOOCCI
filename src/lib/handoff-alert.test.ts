/**
 * pendingHumanRequestIds — which conversations drive the human-attention alarm.
 *
 *   A. a new HUMAN request is included (alarm starts)
 *   C. a RESOLVED conversation is excluded (alarm stops)
 *   E. an assumed / operator-handled conversation is excluded — so operator
 *      messages (which keep the conversation HUMANO_ASSUMIU, not HUMAN) never
 *      (re)trigger the alarm
 */

import { describe, it, expect } from "vitest";
import { pendingHumanRequestIds } from "@/lib/handoff-alert";

describe("pendingHumanRequestIds", () => {
  it("A — includes conversations waiting for a human (status HUMAN)", () => {
    const ids = pendingHumanRequestIds([
      { id: "c1", status: "HUMAN" },
      { id: "c2", status: "BOT" },
      { id: "c3", status: "HUMAN" },
    ]);
    expect(ids).toEqual(["c1", "c3"]);
  });

  it("C — excludes resolved conversations", () => {
    const ids = pendingHumanRequestIds([
      { id: "c1", status: "HUMAN" },
      { id: "c2", status: "RESOLVED" },
    ]);
    expect(ids).toEqual(["c1"]);
  });

  it("E — excludes already-assumed / non-request statuses", () => {
    const ids = pendingHumanRequestIds([
      { id: "assumed", status: "HUMANO_ASSUMIU" }, // operator took over → silent
      { id: "open",    status: "OPEN" },
      { id: "bot",     status: "BOT" },
      { id: "ai",      status: "AI_ATENDENDO" },
    ]);
    expect(ids).toEqual([]);
  });

  it("excludes Staff/equipe (aiLocked) conversations even when status is HUMAN", () => {
    const ids = pendingHumanRequestIds([
      { id: "staff",    status: "HUMAN", aiLocked: true },  // Staff/equipe → never alarms
      { id: "customer", status: "HUMAN", aiLocked: false }, // real pending request
    ]);
    expect(ids).toEqual(["customer"]);
  });

  it("excludes acknowledged conversations ('Estou ciente' persisted server-side)", () => {
    const ids = pendingHumanRequestIds([
      { id: "acked",   status: "HUMAN", handoffAlarmAckAt: "2026-07-11T12:00:00.000Z" }, // silenced app-wide
      { id: "unacked", status: "HUMAN", handoffAlarmAckAt: null },                        // still ringing
      { id: "fresh",   status: "HUMAN" },                                                 // undefined = never acked
    ]);
    expect(ids).toEqual(["unacked", "fresh"]);
  });

  it("an acknowledged conversation rings again once re-escalated clears its ack", () => {
    // markConversationNeedsHuman nulls handoffAlarmAckAt on a fresh escalation.
    const before = pendingHumanRequestIds([{ id: "c1", status: "HUMAN", handoffAlarmAckAt: new Date() }]);
    const after  = pendingHumanRequestIds([{ id: "c1", status: "HUMAN", handoffAlarmAckAt: null }]);
    expect(before).toEqual([]);
    expect(after).toEqual(["c1"]);
  });

  it("returns [] for no conversations", () => {
    expect(pendingHumanRequestIds([])).toEqual([]);
  });
});
