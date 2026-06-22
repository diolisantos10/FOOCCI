/**
 * Behavior pin for runLiveLearningReview (the DB-reading orchestrator that fills
 * the Caixa Única with WhatsApp receptionist learnings).
 *
 * Uses the deterministic LOOP detector (two identical AI replies) so the pinned
 * behavior does not depend on the receptionist intent classifiers. The same
 * mocked conversation shape is consumed whether the orchestrator reads Prisma
 * directly or via the shared scanner — so this test guards the read refactor.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  restaurant: { findFirst: vi.fn() },
  conversation: { findMany: vi.fn() },
  waiterTrainingSuggestion: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { runLiveLearningReview } from "../liveLearningReview";

const D = (s: string) => new Date(s);

/** A conversation where the AI repeats itself verbatim → one LOOP learning. */
function loopConversation() {
  return {
    id: "conv-loop",
    restaurantId: "r1",
    channel: "WHATSAPP",
    status: "ACTIVE",
    orderId: null,
    messages: [
      { direction: "INBOUND", senderType: "CUSTOMER", content: "oi", type: "TEXT", sentAt: D("2026-06-22T10:00:00Z") },
      { direction: "OUTBOUND", senderType: "AI", content: "Olá! Posso ajudar?", type: "TEXT", sentAt: D("2026-06-22T10:00:01Z") },
      { direction: "INBOUND", senderType: "CUSTOMER", content: "???", type: "TEXT", sentAt: D("2026-06-22T10:00:02Z") },
      { direction: "OUTBOUND", senderType: "AI", content: "Olá! Posso ajudar?", type: "TEXT", sentAt: D("2026-06-22T10:00:03Z") },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.restaurant.findFirst.mockResolvedValue(null);
  db.conversation.findMany.mockResolvedValue([]);
  db.waiterTrainingSuggestion.findUnique.mockResolvedValue(null);
  db.waiterTrainingSuggestion.create.mockResolvedValue({ id: "new" });
  db.waiterTrainingSuggestion.update.mockResolvedValue({ id: "upd" });
});

describe("runLiveLearningReview — persists distinct learnings from real conversations", () => {
  it("creates one PENDING WhatsApp-learning row for a LOOP conversation", async () => {
    db.conversation.findMany.mockResolvedValue([loopConversation()]);

    const res = await runLiveLearningReview({ restaurantId: "r1", windowHours: 24, dryRun: false });

    expect(res.ok).toBe(true);
    expect(res.conversationsReviewed).toBe(1);
    expect(res.created).toBe(1);
    expect(res.learnings).toHaveLength(1);
    expect(res.learnings[0]?.card.signature).toBe("LOOP");

    expect(db.waiterTrainingSuggestion.create).toHaveBeenCalledTimes(1);
    const data = db.waiterTrainingSuggestion.create.mock.calls[0]![0].data as Record<string, unknown>;
    expect(data.agentSlug).toBe("whatsapp-receptionist");
    expect(data.sourceType).toBe("REAL_CONVERSATION");
    expect(data.sourceId).toBe("LOOP");
    expect(data.status).toBe("PENDING_REVIEW");
    expect(data.riskLevel).toBe("MEDIUM"); // P1 → MEDIUM
    expect(String(data.title)).toMatch(/loop/i);
  });

  it("dry-run analyzes but writes nothing", async () => {
    db.conversation.findMany.mockResolvedValue([loopConversation()]);

    const res = await runLiveLearningReview({ restaurantId: "r1", windowHours: 24, dryRun: true });

    expect(res.ok).toBe(true);
    expect(res.learnings).toHaveLength(1);
    expect(res.created).toBe(0);
    expect(db.waiterTrainingSuggestion.create).not.toHaveBeenCalled();
    expect(db.waiterTrainingSuggestion.update).not.toHaveBeenCalled();
  });

  it("respects a prior human decision (APPROVED) — never resurrects it", async () => {
    db.conversation.findMany.mockResolvedValue([loopConversation()]);
    db.waiterTrainingSuggestion.findUnique.mockResolvedValue({ id: "x", status: "APPROVED" });

    const res = await runLiveLearningReview({ restaurantId: "r1", windowHours: 24, dryRun: false });

    expect(res.created).toBe(0);
    expect(res.updated).toBe(0);
    expect(res.skippedAlreadyDecided).toBe(1);
    expect(db.waiterTrainingSuggestion.create).not.toHaveBeenCalled();
    expect(db.waiterTrainingSuggestion.update).not.toHaveBeenCalled();
  });

  it("surfaces a read failure as a safe error result (no throw)", async () => {
    db.conversation.findMany.mockRejectedValue(new Error("db down"));

    const res = await runLiveLearningReview({ restaurantId: "r1", windowHours: 24, dryRun: false });

    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();
    expect(res.created).toBe(0);
  });
});
