/**
 * CartRecoveryScheduler
 *
 * Background singleton that fires cart recovery every 60 seconds from
 * within the Railway Node.js process. This gives true ~1-minute resolution
 * without relying on GitHub Actions (minimum 5-minute cron frequency).
 *
 * GitHub Actions cron (*/5) remains as a warm backup for the window after
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
      console.log("[CartRecoveryScheduler] Skipped in non-production environment");
      return;
    }
    console.log(
      "[CartRecoveryScheduler] Started (tick every 60 s, inactivity threshold: 2 min)"
    );
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
      // Only log when something noteworthy happened to avoid log spam
      if (result.sent > 0 || result.failed > 0) {
        console.info("[CartRecoveryScheduler] Tick done", {
          sent:        result.sent,
          eligible:    result.eligible,
          checked:     result.checked,
          failed:      result.failed,
          durationMs:  result.durationMs,
        });
      }
    } catch (err) {
      console.error("[CartRecoveryScheduler] Tick error:", err);
    } finally {
      this.running = false;
    }
  }
}
