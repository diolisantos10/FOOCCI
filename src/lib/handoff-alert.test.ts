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
import { pendingHumanRequestIds, HANDOFF_ALARM_MAX_AGE_MS } from "@/lib/handoff-alert";

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

  it("no maxAgeMs → age is ignored (original behaviour, rings regardless of how old)", () => {
    const ancient = new Date("2000-01-01T00:00:00.000Z");
    const ids = pendingHumanRequestIds([{ id: "c1", status: "HUMAN", lastMessageAt: ancient }]);
    expect(ids).toEqual(["c1"]);
  });

  it("auto-silences a STALE handoff (customer silent past maxAgeMs) — sound stops by itself", () => {
    const now = Date.parse("2026-07-11T15:00:00.000Z");
    const fresh = new Date(now - 5 * 60_000);                         // 5 min ago → still rings
    const stale = new Date(now - (HANDOFF_ALARM_MAX_AGE_MS + 60_000)); // just past the window → silent
    const ids = pendingHumanRequestIds(
      [
        { id: "fresh", status: "HUMAN", lastMessageAt: fresh },
        { id: "stale", status: "HUMAN", lastMessageAt: stale },
      ],
      { now, maxAgeMs: HANDOFF_ALARM_MAX_AGE_MS },
    );
    expect(ids).toEqual(["fresh"]);
  });

  it("a NEW customer message re-arms a previously-stale handoff (fresh lastMessageAt)", () => {
    const now = Date.parse("2026-07-11T15:00:00.000Z");
    const ids = pendingHumanRequestIds(
      [{ id: "c1", status: "HUMAN", lastMessageAt: new Date(now - 30_000) }], // messaged 30s ago
      { now, maxAgeMs: HANDOFF_ALARM_MAX_AGE_MS },
    );
    expect(ids).toEqual(["c1"]);
  });

  it("missing lastMessageAt under a cap still rings (never silences an unknown-age request)", () => {
    const ids = pendingHumanRequestIds(
      [{ id: "c1", status: "HUMAN" }],
      { now: Date.now(), maxAgeMs: HANDOFF_ALARM_MAX_AGE_MS },
    );
    expect(ids).toEqual(["c1"]);
  });

  it("returns [] for no conversations", () => {
    expect(pendingHumanRequestIds([])).toEqual([]);
  });
});
