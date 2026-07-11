import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  campaignExecution: { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import {
  SendTimingIntelligenceService,
  MIN_SAMPLE_SIZE,
} from "../SendTimingIntelligenceService";

/** Build a row whose sentAt lands on the given LOCAL hour in America/Sao_Paulo (UTC-3). */
function rowAtLocalHour(localHour: number): { sentAt: Date } {
  const utcHour = (localHour + 3) % 24;
  return { sentAt: new Date(Date.UTC(2026, 0, 5, utcHour, 15, 0)) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SendTimingIntelligenceService.bestSendHours", () => {
  it("aggregates converted sends into an hour-of-day distribution (local timezone)", async () => {
    // 20 conversions sent at 18h local, 10 at 11h local → 30 total (= minimum sample).
    db.campaignExecution.findMany.mockResolvedValue([
      ...Array.from({ length: 20 }, () => rowAtLocalHour(18)),
      ...Array.from({ length: 10 }, () => rowAtLocalHour(11)),
    ]);

    const learned = await SendTimingIntelligenceService.bestSendHours("r1");

    expect(learned).not.toBeNull();
    expect(learned!.sampleSize).toBe(30);
    expect(learned!.hourScores[18]).toBe(1);       // best hour normalized to 1
    expect(learned!.hourScores[11]).toBeCloseTo(0.5);
    expect(learned!.topHours[0]).toBe(18);
    expect(learned!.topHours).toContain(11);
  });

  it("queries only POSITIVE outcomes (converted = true) with a real sentAt", async () => {
    db.campaignExecution.findMany.mockResolvedValue([]);
    await SendTimingIntelligenceService.bestSendHours("r1");

    const where = db.campaignExecution.findMany.mock.calls[0][0].where;
    expect(where.restaurantId).toBe("r1");
    expect(where.converted).toBe(true);
    expect(where.sentAt).toEqual({ not: null });
  });

  it(`returns null with fewer than ${MIN_SAMPLE_SIZE} samples (no data = no opinion)`, async () => {
    db.campaignExecution.findMany.mockResolvedValue(
      Array.from({ length: MIN_SAMPLE_SIZE - 1 }, () => rowAtLocalHour(18)),
    );
    expect(await SendTimingIntelligenceService.bestSendHours("r1")).toBeNull();
  });

  it("returns null with zero history", async () => {
    db.campaignExecution.findMany.mockResolvedValue([]);
    expect(await SendTimingIntelligenceService.bestSendHours("r1")).toBeNull();
  });
});

describe("SendTimingIntelligenceService.pickBestHourWithin", () => {
  const scores = { 9: 0.4, 12: 1, 20: 0.9 };

  it("picks the best-scoring hour inside the window", () => {
    expect(SendTimingIntelligenceService.pickBestHourWithin("10:00", "18:00", scores)).toBe(12);
  });

  it("NEVER leaves the merchant window — a higher score outside is ignored", () => {
    // 12 has the global best score but sits outside 18:00-21:00 → 20 wins.
    expect(SendTimingIntelligenceService.pickBestHourWithin("18:00", "21:00", scores)).toBe(20);
  });

  it("returns null when no scored hour overlaps the window", () => {
    expect(SendTimingIntelligenceService.pickBestHourWithin("13:00", "16:00", scores)).toBeNull();
  });

  it("returns null for an empty or inverted window", () => {
    expect(SendTimingIntelligenceService.pickBestHourWithin("18:00", "18:00", scores)).toBeNull();
    expect(SendTimingIntelligenceService.pickBestHourWithin("20:00", "10:00", scores)).toBeNull();
  });

  it("counts an hour whose block only partially overlaps the window", () => {
    // Window 11:30-12:30 overlaps both hour 11 and hour 12 blocks; 12 scores higher.
    expect(SendTimingIntelligenceService.pickBestHourWithin("11:30", "12:30", scores)).toBe(12);
  });

  it("accepts whole-hour numbers as window bounds", () => {
    expect(SendTimingIntelligenceService.pickBestHourWithin(10, 18, scores)).toBe(12);
  });
});
