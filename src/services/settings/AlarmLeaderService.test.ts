/**
 * AlarmLeaderService — cross-device alarm lease tests (hermetic: prisma mocked).
 *
 * Covers: free lease claimed, own-device renewal, contested lease rejected,
 * stale lease reclaimed, first-ever-claim creates the row, create-race loses
 * gracefully, and graceful release only clears when still the holder.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  restaurantSoundSettings: {
    updateMany: vi.fn(),
    findUnique: vi.fn(),
    create:     vi.fn(),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { claimAlarmLeader, releaseAlarmLeader, ALARM_LEASE_STALE_MS } from "./AlarmLeaderService";

const RESTAURANT_ID = "rest_1";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("claimAlarmLeader", () => {
  it("claims a free lease (updateMany matches, count > 0)", async () => {
    db.restaurantSoundSettings.updateMany.mockResolvedValue({ count: 1 });
    const r = await claimAlarmLeader(RESTAURANT_ID, "device-A");
    expect(r.isLeader).toBe(true);
    expect(db.restaurantSoundSettings.findUnique).not.toHaveBeenCalled();
    expect(db.restaurantSoundSettings.create).not.toHaveBeenCalled();
  });

  it("renews its own lease (same deviceId matches the OR clause)", async () => {
    db.restaurantSoundSettings.updateMany.mockResolvedValue({ count: 1 });
    const r = await claimAlarmLeader(RESTAURANT_ID, "device-A");
    expect(r.isLeader).toBe(true);
    const where = db.restaurantSoundSettings.updateMany.mock.calls[0][0].where;
    expect(where.OR).toContainEqual({ alarmLeaderDeviceId: "device-A" });
  });

  it("rejects a contested lease held fresh by another device (updateMany matches 0 rows, settings row exists)", async () => {
    db.restaurantSoundSettings.updateMany.mockResolvedValue({ count: 0 });
    db.restaurantSoundSettings.findUnique.mockResolvedValue({ id: "s1" });
    const r = await claimAlarmLeader(RESTAURANT_ID, "device-B");
    expect(r.isLeader).toBe(false);
    expect(db.restaurantSoundSettings.create).not.toHaveBeenCalled();
  });

  it("stale lease is reclaimable — the WHERE clause includes the staleness threshold", async () => {
    db.restaurantSoundSettings.updateMany.mockResolvedValue({ count: 1 });
    await claimAlarmLeader(RESTAURANT_ID, "device-B");
    const where = db.restaurantSoundSettings.updateMany.mock.calls[0][0].where;
    const staleClause = where.OR.find((c: Record<string, unknown>) => "alarmLeaderHeartbeatAt" in c);
    expect(staleClause).toBeTruthy();
    const threshold = staleClause.alarmLeaderHeartbeatAt.lt as Date;
    // Threshold is ALARM_LEASE_STALE_MS in the past (allow small test-run slack).
    expect(Date.now() - threshold.getTime()).toBeGreaterThanOrEqual(ALARM_LEASE_STALE_MS - 50);
    expect(Date.now() - threshold.getTime()).toBeLessThan(ALARM_LEASE_STALE_MS + 2000);
  });

  it("first-ever claim for a restaurant creates the settings row", async () => {
    db.restaurantSoundSettings.updateMany.mockResolvedValue({ count: 0 });
    db.restaurantSoundSettings.findUnique.mockResolvedValue(null);
    db.restaurantSoundSettings.create.mockResolvedValue({ id: "s1" });
    const r = await claimAlarmLeader(RESTAURANT_ID, "device-A");
    expect(r.isLeader).toBe(true);
    expect(db.restaurantSoundSettings.create).toHaveBeenCalledWith({
      data: { restaurantId: RESTAURANT_ID, alarmLeaderDeviceId: "device-A", alarmLeaderHeartbeatAt: expect.any(Date) },
    });
  });

  it("loses a create-race to another device claiming the same brand-new row", async () => {
    db.restaurantSoundSettings.updateMany.mockResolvedValue({ count: 0 });
    db.restaurantSoundSettings.findUnique.mockResolvedValue(null);
    db.restaurantSoundSettings.create.mockRejectedValue(new Error("Unique constraint failed"));
    const r = await claimAlarmLeader(RESTAURANT_ID, "device-A");
    expect(r.isLeader).toBe(false);
  });

  it("never throws — DB failure resolves to isLeader:false", async () => {
    db.restaurantSoundSettings.updateMany.mockRejectedValue(new Error("db down"));
    const r = await claimAlarmLeader(RESTAURANT_ID, "device-A");
    expect(r.isLeader).toBe(false);
  });

  it("empty restaurantId/deviceId short-circuits to false without touching the DB", async () => {
    expect((await claimAlarmLeader("", "device-A")).isLeader).toBe(false);
    expect((await claimAlarmLeader(RESTAURANT_ID, "")).isLeader).toBe(false);
    expect(db.restaurantSoundSettings.updateMany).not.toHaveBeenCalled();
  });
});

describe("releaseAlarmLeader", () => {
  it("clears the lease only when this device is still the holder (scoped in WHERE)", async () => {
    db.restaurantSoundSettings.updateMany.mockResolvedValue({ count: 1 });
    await releaseAlarmLeader(RESTAURANT_ID, "device-A");
    expect(db.restaurantSoundSettings.updateMany).toHaveBeenCalledWith({
      where: { restaurantId: RESTAURANT_ID, alarmLeaderDeviceId: "device-A" },
      data:  { alarmLeaderDeviceId: null, alarmLeaderHeartbeatAt: null },
    });
  });

  it("never throws on DB failure", async () => {
    db.restaurantSoundSettings.updateMany.mockRejectedValue(new Error("db down"));
    await expect(releaseAlarmLeader(RESTAURANT_ID, "device-A")).resolves.toBeUndefined();
  });
});
