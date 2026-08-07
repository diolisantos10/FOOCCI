/**
 * ScheduledCampaignScheduler
 *
 * Background singleton that runs due CRM campaigns every 10 minutes from
 * within the Railway Node.js process — the same self-start pattern as
 * CartRecoveryScheduler. This makes scheduled CRM campaigns execute
 * automatically in production WITHOUT relying on GitHub Actions cron
 * (which only fires from the repository default branch and is therefore
 * unreliable while the active branch is a feature branch).
 *
 * The GitHub Actions cron (every 15 min) remains as a warm backup; both
 * paths call the same idempotent runner, and the runner's per-customer
 * dedup + stuck-SENDING recovery keep concurrent execution safe.
 *
 * Started once from src/instrumentation.ts on server boot.
 * Safe to call start() multiple times — idempotent.
 * Only runs in production (NODE_ENV=production) to prevent accidental
 * sends in dev/staging environments.
 *
 * All sending-window / quiet-hours / daily-cap / opt-out guards live in
 * ScheduledCampaignRunnerService + crm-safety.ts and are unchanged — this
 * scheduler is only a timer that invokes the existing runner.
 */

import { ScheduledCampaignRunnerService } from "@/services/crm/ScheduledCampaignRunnerService";

const TICK_INTERVAL_MS = 10 * 60_000; // 10 minutes — conservative
const BATCH_LIMIT      = 5;           // matches the cron endpoint default

/**
 * Atraso do PRIMEIRO tick depois do boot.
 *
 * `setInterval` só dispara ao fim do primeiro período: sem um tick de partida,
 * TODO deploy custava 10 minutos de CRM mudo — e num dia de 6 merges isso vira
 * ~1 hora de janela morta que nenhum painel mostra.
 *
 * Meio minuto de folga para o processo subir (Prisma conectar, env carregada)
 * antes de tocar o banco. Não é uma exceção a nenhuma proteção: o tick de boot
 * chama o MESMO runner, então janela de envio, teto diário, cooldown por cliente,
 * dedupe cross-campanha e o intervalo mínimo entre ciclos continuam valendo. Em
 * particular, o portão `minMinutesBetweenCycles` (lido do banco) impede que uma
 * sequência de deploys aperte a cadência de mensagens para o cliente real.
 */
const BOOT_TICK_DELAY_MS = 30_000;

export interface SchedulerLastRun {
  at:                 string;  // ISO timestamp of the tick
  mode:               "internal-scheduler";
  dueCampaignCount:   number;
  sent:               number;
  failed:             number;
  skipped:            number;
  stuckSendingRecovered: number;
  errors:             number;
  durationMs:         number;
}

export class ScheduledCampaignScheduler {
  private static handle:  ReturnType<typeof setInterval> | null = null;
  private static bootHandle: ReturnType<typeof setTimeout> | null = null;
  private static running = false;
  private static started = false;
  private static lastRun: SchedulerLastRun | null = null;

  /** Whether the in-process scheduler timer is active in this process. */
  static isActive(): boolean {
    return this.handle !== null;
  }

  /** Delay of the post-boot catch-up tick (diagnostics/tests). */
  static get bootTickDelayMs(): number {
    return BOOT_TICK_DELAY_MS;
  }

  /** Whether the post-boot catch-up tick is still pending in this process. */
  static isBootTickPending(): boolean {
    return this.bootHandle !== null;
  }

  /** Last completed tick summary (for diagnostics). Null until the first tick. */
  static getLastRun(): SchedulerLastRun | null {
    return this.lastRun;
  }

  static start(): void {
    if (this.handle !== null) return;
    if (process.env.NODE_ENV !== "production") {
      console.log("[ScheduledCampaignScheduler] Skipped — NODE_ENV is not 'production'", {
        NODE_ENV:     process.env.NODE_ENV,
        NEXT_RUNTIME: process.env.NEXT_RUNTIME,
        RAILWAY_ENV:  process.env.RAILWAY_ENVIRONMENT,
      });
      return;
    }
    this.started = true;
    console.log("[ScheduledCampaignScheduler] Started", {
      tickIntervalMs:   TICK_INTERVAL_MS,
      bootTickDelayMs:  BOOT_TICK_DELAY_MS,
      batchLimit:       BATCH_LIMIT,
      NODE_ENV:         process.env.NODE_ENV,
      NEXT_RUNTIME:     process.env.NEXT_RUNTIME,
      RAILWAY_ENV:      process.env.RAILWAY_ENVIRONMENT,
    });
    this.handle = setInterval(() => void this.tick(), TICK_INTERVAL_MS);
    // Tick de partida: sem ele o primeiro ciclo depois de cada deploy só
    // aconteceria 10 minutos adiante (ver BOOT_TICK_DELAY_MS).
    this.bootHandle = setTimeout(() => {
      this.bootHandle = null;
      void this.tick();
    }, BOOT_TICK_DELAY_MS);
  }

  static stop(): void {
    if (this.handle !== null) {
      clearInterval(this.handle);
      this.handle = null;
    }
    if (this.bootHandle !== null) {
      clearTimeout(this.bootHandle);
      this.bootHandle = null;
    }
  }

  private static async tick(): Promise<void> {
    if (this.running) {
      console.warn("[ScheduledCampaignScheduler] Previous tick still running — skipping");
      return;
    }
    this.running = true;
    const startedAt = Date.now();
    let errors = 0;
    try {
      // Recover any campaigns stuck in SENDING from a previous crashed run.
      const recovery = await ScheduledCampaignRunnerService
        .recoverStuckSendingCampaigns({ dryRun: false })
        .catch((err) => {
          errors += 1;
          console.error("[ScheduledCampaignScheduler] recoverStuckSending error:", err);
          return { recovered: 0, dryRun: false, campaignIds: [] as string[] };
        });
      if (recovery.recovered > 0) {
        console.log(
          `[ScheduledCampaignScheduler] Recovered ${recovery.recovered} stuck-SENDING campaigns → SCHEDULED`,
          recovery.campaignIds,
        );
      }

      // Run all due recurring campaigns.
      const summary = await ScheduledCampaignRunnerService
        .runDueCampaigns({ dryRun: false, limit: BATCH_LIMIT })
        .catch((err) => {
          errors += 1;
          console.error("[ScheduledCampaignScheduler] runDueCampaigns error:", err);
          return {
            dryRun: false, campaignsProcessed: 0, totalEligible: 0,
            totalSent: 0, totalFailed: 0, totalSkipped: 0, results: [],
          };
        });

      this.lastRun = {
        at:                    new Date().toISOString(),
        mode:                  "internal-scheduler",
        dueCampaignCount:      summary.campaignsProcessed,
        sent:                  summary.totalSent,
        failed:                summary.totalFailed,
        skipped:               summary.totalSkipped,
        stuckSendingRecovered: recovery.recovered,
        errors,
        durationMs:            Date.now() - startedAt,
      };

      // Log ticks that did real work, or surfaced errors. Stay quiet otherwise.
      if (summary.campaignsProcessed > 0 || summary.totalSent > 0 || summary.totalFailed > 0 || recovery.recovered > 0 || errors > 0) {
        console.info("[ScheduledCampaignScheduler] Tick", this.lastRun);
      }
    } catch (err) {
      console.error("[ScheduledCampaignScheduler] Tick error:", err);
    } finally {
      this.running = false;
    }
  }
}
