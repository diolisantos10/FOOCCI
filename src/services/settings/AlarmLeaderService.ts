/**
 * AlarmLeaderService — cross-DEVICE alarm leader lease.
 *
 * WHY THIS EXISTS: GlobalAlertEngine already elects a single LEADER TAB within
 * one browser (Web Locks API) so several open tabs on the same computer don't
 * all ring at once. But a restaurant commonly has the Foocci app open on
 * SEVERAL SEPARATE DEVICES at the same time (the counter computer, a kitchen
 * tablet, the owner's phone) — Web Locks cannot coordinate across those; each
 * device is its own isolated browser instance. Without this, every device's
 * own local-leader tab rings independently — the alarm "plays everywhere,
 * uncontrollably."
 *
 * This adds a SECOND, server-side layer: exactly one device (identified by a
 * client-generated, localStorage-persisted deviceId) may hold the lease for a
 * restaurant at a time. The lease is renewed by a heartbeat; if a device goes
 * offline (closed, network dropped, crashed) its lease naturally goes stale
 * and the next device's heartbeat claims it — no explicit release needed,
 * though a graceful release is also supported for the common "tab closed
 * cleanly" case.
 *
 * Claiming is a single atomic UPDATE guarded by a WHERE clause (free OR own OR
 * stale) — under Postgres's default READ COMMITTED isolation, two concurrent
 * claims for the same restaurant serialize at the row level, so exactly one
 * request's UPDATE can match while the lease is genuinely contested. Never
 * throws — callers get { isLeader: false } on any failure (fail toward
 * silence, not toward every device ringing).
 */

import { prisma } from "@/lib/prisma";

/** No heartbeat within this window → the lease is stale and reclaimable. */
export const ALARM_LEASE_STALE_MS = 15_000;
/** Suggested client heartbeat cadence — comfortably inside the stale window. */
export const ALARM_LEASE_HEARTBEAT_MS = 6_000;

export interface ClaimResult {
  isLeader: boolean;
}

/**
 * Attempts to claim (or renew) the alarm leader lease for a restaurant on
 * behalf of `deviceId`. Returns isLeader=true iff this device now holds it.
 */
export async function claimAlarmLeader(restaurantId: string, deviceId: string): Promise<ClaimResult> {
  if (!restaurantId || !deviceId) return { isLeader: false };
  const staleThreshold = new Date(Date.now() - ALARM_LEASE_STALE_MS);

  try {
    const claimed = await prisma.restaurantSoundSettings.updateMany({
      where: {
        restaurantId,
        OR: [
          { alarmLeaderDeviceId: null },
          { alarmLeaderDeviceId: deviceId },
          { alarmLeaderHeartbeatAt: { lt: staleThreshold } },
        ],
      },
      data: { alarmLeaderDeviceId: deviceId, alarmLeaderHeartbeatAt: new Date() },
    });
    if (claimed.count > 0) return { isLeader: true };

    // No row updated: either a fresher lease is held by another device, or no
    // settings row exists yet for this restaurant (first-ever claim).
    const exists = await prisma.restaurantSoundSettings.findUnique({
      where: { restaurantId },
      select: { id: true },
    });
    if (exists) return { isLeader: false };

    // First claim for this restaurant — create the row. A unique-constraint
    // race (another device's first claim landing at the same instant) means
    // we lost the race; that device is the leader instead.
    await prisma.restaurantSoundSettings.create({
      data: { restaurantId, alarmLeaderDeviceId: deviceId, alarmLeaderHeartbeatAt: new Date() },
    });
    return { isLeader: true };
  } catch {
    return { isLeader: false };
  }
}

/** Graceful release for a clean tab-close — best-effort, never throws. Only
 *  clears the lease when `deviceId` is still the current holder (a stale
 *  lease already reclaimed by another device must never be clobbered). */
export async function releaseAlarmLeader(restaurantId: string, deviceId: string): Promise<void> {
  if (!restaurantId || !deviceId) return;
  await prisma.restaurantSoundSettings
    .updateMany({
      where: { restaurantId, alarmLeaderDeviceId: deviceId },
      data: { alarmLeaderDeviceId: null, alarmLeaderHeartbeatAt: null },
    })
    .catch(() => undefined);
}
