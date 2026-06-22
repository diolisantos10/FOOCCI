/**
 * selectOverdueHandoffs — which assumed/pending handoffs have gone unanswered.
 *
 *   A. customer waiting past the threshold → alerted
 *   B. customer waiting but under the threshold → not yet
 *   C. a human/AI reply is the last message → answered → excluded
 *   D. an OUTBOUND SYSTEM marker ([handoff:…]) does NOT count as a reply → alerted
 *   E. no lastMessageAt → excluded (nothing to time from)
 *   F. results are sorted most-overdue first
 */

import { describe, it, expect } from "vitest";
import {
  isAwaitingHumanReply,
  selectOverdueHandoffs,
  type OverdueCandidate,
} from "@/lib/handoff-overdue";

const now = new Date("2026-06-22T12:00:00.000Z");
const minsAgo = (m: number) => new Date(now.getTime() - m * 60_000);
const THRESHOLD = 10 * 60_000;

function cand(p: Partial<OverdueCandidate>): OverdueCandidate {
  return {
    id: "c1",
    customerName: "Ana",
    lastMessageAt: minsAgo(15),
    lastDirection: "INBOUND",
    lastSenderType: "CUSTOMER",
    ...p,
  };
}

describe("isAwaitingHumanReply", () => {
  it("false when a human replied last", () => {
    expect(isAwaitingHumanReply({ lastDirection: "OUTBOUND", lastSenderType: "HUMAN" })).toBe(false);
  });
  it("false when the AI replied last", () => {
    expect(isAwaitingHumanReply({ lastDirection: "OUTBOUND", lastSenderType: "AI" })).toBe(false);
  });
  it("true when the customer spoke last", () => {
    expect(isAwaitingHumanReply({ lastDirection: "INBOUND", lastSenderType: "CUSTOMER" })).toBe(true);
  });
  it("true when only the SYSTEM handoff marker follows (not a real reply)", () => {
    expect(isAwaitingHumanReply({ lastDirection: "OUTBOUND", lastSenderType: "SYSTEM" })).toBe(true);
  });
});

describe("selectOverdueHandoffs", () => {
  it("A — flags a customer waiting past the threshold", () => {
    const r = selectOverdueHandoffs([cand({ lastMessageAt: minsAgo(15) })], now, THRESHOLD);
    expect(r).toEqual([{ id: "c1", customer: "Ana", waitingMinutes: 15 }]);
  });

  it("B — ignores a customer waiting under the threshold", () => {
    const r = selectOverdueHandoffs([cand({ lastMessageAt: minsAgo(4) })], now, THRESHOLD);
    expect(r).toEqual([]);
  });

  it("C — excludes conversations already answered by a human", () => {
    const r = selectOverdueHandoffs(
      [cand({ lastDirection: "OUTBOUND", lastSenderType: "HUMAN", lastMessageAt: minsAgo(30) })],
      now,
      THRESHOLD,
    );
    expect(r).toEqual([]);
  });

  it("D — a lone SYSTEM handoff marker still counts as waiting", () => {
    const r = selectOverdueHandoffs(
      [cand({ id: "h1", lastDirection: "OUTBOUND", lastSenderType: "SYSTEM", lastMessageAt: minsAgo(20) })],
      now,
      THRESHOLD,
    );
    expect(r.map((o) => o.id)).toEqual(["h1"]);
  });

  it("E — excludes conversations with no lastMessageAt", () => {
    const r = selectOverdueHandoffs([cand({ lastMessageAt: null })], now, THRESHOLD);
    expect(r).toEqual([]);
  });

  it("F — sorts most-overdue first and falls back to 'Cliente' for a blank name", () => {
    const r = selectOverdueHandoffs(
      [
        cand({ id: "a", lastMessageAt: minsAgo(12) }),
        cand({ id: "b", customerName: "  ", lastMessageAt: minsAgo(40) }),
      ],
      now,
      THRESHOLD,
    );
    expect(r).toEqual([
      { id: "b", customer: "Cliente", waitingMinutes: 40 },
      { id: "a", customer: "Ana", waitingMinutes: 12 },
    ]);
  });
});
