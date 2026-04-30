/**
 * AutoSimulatorScheduler
 *
 * Background singleton that polls AutoSimulatorConfig every 60 s.
 * For each enabled config that is due (lastRunAt + intervalMinutes <= now),
 * it delegates to AutoSimulatorService.enqueue() which owns the per-restaurant
 * lock — preventing duplicates from both scheduler and manual API calls.
 *
 * Started once from src/instrumentation.ts on server boot.
 * Safe to call start() multiple times — idempotent.
 */

import { prisma } from "@/lib/prisma";
import { AutoSimulatorService } from "./AutoSimulatorService";

export class AutoSimulatorScheduler {
  private static handle: ReturnType<typeof setInterval> | null = null;

  static start(): void {
    if (this.handle !== null) return;
    console.log("[AutoSimulatorScheduler] Started (tick every 60 s)");
    this.handle = setInterval(() => void this.tick(), 60_000);
  }

  static stop(): void {
    if (this.handle !== null) {
      clearInterval(this.handle);
      this.handle = null;
    }
  }

  private static async tick(): Promise<void> {
    try {
      const now = new Date();
      const configs = await prisma.autoSimulatorConfig.findMany({
        where:  { enabled: true },
        select: {
          restaurantId:    true,
          intervalMinutes: true,
          scenarioCount:   true,
          lastRunAt:       true,
        },
      });

      for (const cfg of configs) {
        if (AutoSimulatorService.isRunning(cfg.restaurantId)) continue;

        const dueAt = cfg.lastRunAt
          ? new Date(cfg.lastRunAt.getTime() + cfg.intervalMinutes * 60_000)
          : new Date(0); // never run → due immediately

        if (now >= dueAt) {
          AutoSimulatorService.enqueue(cfg.restaurantId, cfg.scenarioCount, "scheduler");
        }
      }
    } catch (err) {
      console.error("[AutoSimulatorScheduler] Tick error:", err);
    }
  }
}
