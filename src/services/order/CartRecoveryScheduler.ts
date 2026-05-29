/**
 * CartRecoveryScheduler
 *
 * Background singleton that fires cart recovery every 60 seconds from
 * within the Railway Node.js process. This gives true ~1-minute resolution
 * without relying on GitHub Actions (minimum 5-minute cron frequency).
 *
 * GitHub Actions cron (every 5 min) remains as a warm backup for the window after
 * a server restart before this scheduler fires its first tick.
 *
 * Anti-spam safety: even if multiple Railway instances run this scheduler
 * concurrently, the DB-level guards (recoveryAttempts=0, lastRecoveryAt 24h)
 * ensure each draft is recovered at most once.
 *
 * Started once from src/instrumentation.ts on server boot.
 * Safe to call start() multiple times — idempotent.
 * Only runs in production (NODE_ENV=production) to prevent accidental sends
 * in dev/staging environments.
 */

import { OrderDraftRecoverySendService } from "./OrderDraftRecoverySendService";

const TICK_INTERVAL_MS  = 60_000; // 1 minute
const INACTIVITY_MINUTES = 2;     // matches route.ts default

export class CartRecoveryScheduler {
  private static handle:  ReturnType<typeof setInterval> | null = null;
  private static running = false;

  static start(): void {
    if (this.handle !== null) return;
    if (process.env.NODE_ENV !== "production") {
      console.log("[CartRecoveryScheduler] Skipped — NODE_ENV is not 'production'", {
        NODE_ENV:        process.env.NODE_ENV,
        NEXT_RUNTIME:    process.env.NEXT_RUNTIME,
        RAILWAY_ENV:     process.env.RAILWAY_ENVIRONMENT,
      });
      return;
    }
    console.log("[CartRecoveryScheduler] Started", {
      tickIntervalMs:    TICK_INTERVAL_MS,
      inactivityMinutes: INACTIVITY_MINUTES,
      NODE_ENV:          process.env.NODE_ENV,
      NEXT_RUNTIME:      process.env.NEXT_RUNTIME,
      RAILWAY_ENV:       process.env.RAILWAY_ENVIRONMENT,
    });
    this.handle = setInterval(() => void this.tick(), TICK_INTERVAL_MS);
  }

  static stop(): void {
    if (this.handle !== null) {
      clearInterval(this.handle);
      this.handle = null;
    }
  }

  private static async tick(): Promise<void> {
    if (this.running) {
      console.warn("[CartRecoveryScheduler] Previous tick still running — skipping");
      return;
    }
    this.running = true;
    try {
      const result = await OrderDraftRecoverySendService.sendCartRecoveryMessages({
        inactivityMinutes: INACTIVITY_MINUTES,
        limit:             50,
        dryRun:            false,
      });
      // Log every tick that has candidates, or any tick that sent/failed.
      // Silent only when checked=0 (no stale OPEN drafts at all).
      if (result.checked > 0 || result.sent > 0 || result.failed > 0) {
        console.info("[CartRecoveryScheduler] Tick", {
          checked:               result.checked,
          eligible:              result.eligible,
          sent:                  result.sent,
          failed:                result.failed,
          skippedNoPhone:        result.skippedNoPhone,
          skippedAlreadySent:    result.skippedAlreadySent,
          skippedDailyLimit:     result.skippedDailyLimit,
          skippedOrderedAfter:   result.skippedOrderedAfter,
          skippedPendingPayment: result.skippedPendingPayment,
          skippedNoConfig:       result.skippedNoConfig,
          durationMs:            result.durationMs,
        });
      }
    } catch (err) {
      console.error("[CartRecoveryScheduler] Tick error:", err);
    } finally {
      this.running = false;
    }
  }
}
