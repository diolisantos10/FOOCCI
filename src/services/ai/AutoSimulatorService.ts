/**
 * AutoSimulatorService
 *
 * Orchestrates automated simulation runs:
 *   1. Calls AISimulatorService.run (with live progress tracking)
 *   2. Analyzes the report via FailureAnalyzer
 *   3. Generates insight + prompt suggestion via InsightGenerator
 *   4. Persists the result in SimulationRun table
 *   5. Updates AutoSimulatorConfig.lastRunAt
 *
 * In-memory singletons (process lifetime):
 *   activeLocks   — prevents concurrent runs per restaurant
 *   runProgress   — live current/total for the status endpoint
 *   stopRequested — signals runWithLock to abort after the next scenario
 *   lastErrors    — stores the last failure message per restaurant
 *
 * Also provides CRUD helpers for config and history.
 */

import { prisma } from "@/lib/prisma";
import { AISimulatorService } from "./AISimulatorService";
import { analyzeReport } from "./FailureAnalyzer";
import { generateInsight } from "./InsightGenerator";

export type TriggerSource = "scheduler" | "manual";
export type SimulatorStatus = "IDLE" | "RUNNING" | "SCHEDULED" | "PAUSED" | "ERROR";

interface RunProgress {
  current:      number;
  total:        number;
  scenarioName: string;
  startedAt:    Date;
  triggeredBy:  TriggerSource;
}

export class AutoSimulatorService {
  private static readonly activeLocks   = new Set<string>();
  private static readonly stopRequested = new Set<string>();
  private static readonly runProgress   = new Map<string, RunProgress>();
  private static readonly lastErrors    = new Map<string, string>();

  // ─── Lock / progress accessors ───────────────────────────────────────────

  static isRunning(restaurantId: string): boolean {
    return this.activeLocks.has(restaurantId);
  }

  static getProgress(restaurantId: string): RunProgress | null {
    return this.runProgress.get(restaurantId) ?? null;
  }

  static requestStop(restaurantId: string): void {
    this.stopRequested.add(restaurantId);
  }

  static getLastError(restaurantId: string): string | null {
    return this.lastErrors.get(restaurantId) ?? null;
  }

  static clearLastError(restaurantId: string): void {
    this.lastErrors.delete(restaurantId);
  }

  // ─── Enqueue (fire-and-forget) ────────────────────────────────────────────

  /**
   * Starts a run in the background without blocking the caller.
   * Returns false if the restaurant already has a run in progress.
   */
  static enqueue(
    restaurantId: string,
    scenarioCount: number,
    triggeredBy: TriggerSource,
  ): boolean {
    if (this.activeLocks.has(restaurantId)) return false;
    void this.runWithLock(restaurantId, scenarioCount, triggeredBy);
    return true;
  }

  // ─── Internal execution ───────────────────────────────────────────────────

  private static async runWithLock(
    restaurantId: string,
    scenarioCount: number,
    triggeredBy: TriggerSource,
  ): Promise<void> {
    const startedAt = new Date();
    this.activeLocks.add(restaurantId);
    this.stopRequested.delete(restaurantId);
    this.lastErrors.delete(restaurantId);
    this.runProgress.set(restaurantId, {
      current: 0, total: scenarioCount, scenarioName: "", startedAt, triggeredBy,
    });

    console.log(`[AutoSimulatorService] Run started — restaurant=${restaurantId} source=${triggeredBy}`);

    try {
      await this.executeRun(restaurantId, scenarioCount, triggeredBy, (p) => {
        // Abort signal: throw to interrupt AISimulatorService's scenario loop
        if (this.stopRequested.has(restaurantId)) {
          throw new Error("stopped by user request");
        }
        this.runProgress.set(restaurantId, {
          current:      p.current,
          total:        p.total,
          scenarioName: p.scenarioName ?? "",
          startedAt,
          triggeredBy,
        });
      });

      console.log(`[AutoSimulatorService] Run complete — restaurant=${restaurantId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "stopped by user request") {
        console.log(`[AutoSimulatorService] Run stopped — restaurant=${restaurantId}`);
      } else {
        this.lastErrors.set(restaurantId, msg);
        console.error(`[AutoSimulatorService] Run failed — restaurant=${restaurantId}:`, err);
      }
    } finally {
      this.runProgress.delete(restaurantId);
      this.activeLocks.delete(restaurantId);
      this.stopRequested.delete(restaurantId);
    }
  }

  // ─── Core run logic ───────────────────────────────────────────────────────

  /**
   * Run a simulation, analyze results, store the run record, and return it.
   * Safe to call concurrently for different restaurants.
   */
  static async executeRun(
    restaurantId: string,
    scenarioCount = 10,
    triggeredBy: TriggerSource = "scheduler",
    onProgress?: (p: { current: number; total: number; scenarioName: string }) => void,
  ) {
    const report = await AISimulatorService.run(
      restaurantId,
      scenarioCount,
      (p) => onProgress?.(p),
      () => {},
    );

    // Analyze dominant failure
    const pattern = analyzeReport(report);
    const { insight, suggestedPrompt } = generateInsight(pattern);

    // Build compact error summary
    const topErrorTypes = [
      ...report.errorPrioritization.critical,
      ...report.errorPrioritization.high,
    ]
      .map((e) => e.type)
      .filter((v, i, a) => a.indexOf(v) === i)
      .slice(0, 5);

    const errorSummary = {
      count: report.errorCount,
      types: topErrorTypes,
    };

    // Persist run
    const run = await prisma.simulationRun.create({
      data: {
        restaurantId,
        scenarioCount,
        overallScore:      report.overallScore,
        conversionRate:    report.conversionRate,
        attachRateDrink:   report.salesDiagnosis?.withDrink ?? 0,
        attachRateDessert: report.salesDiagnosis?.withDessert ?? 0,
        errorSummary,
        analysis:   JSON.parse(JSON.stringify(pattern)) as any,
        insight,
        suggestedPrompt,
        triggeredBy,
      },
    });

    // Update lastRunAt
    await prisma.autoSimulatorConfig.upsert({
      where:  { restaurantId },
      create: { restaurantId, lastRunAt: new Date() },
      update: { lastRunAt: new Date() },
    });

    return run;
  }

  // ─── Config helpers ───────────────────────────────────────────────────────

  static async getConfig(restaurantId: string) {
    const config = await prisma.autoSimulatorConfig.findUnique({
      where: { restaurantId },
    });
    return (
      config ?? {
        restaurantId,
        enabled:         false,
        intervalMinutes: 60,
        scenarioCount:   10,
        lastRunAt:       null,
      }
    );
  }

  static async updateConfig(
    restaurantId: string,
    data: { enabled?: boolean; intervalMinutes?: number; scenarioCount?: number },
  ) {
    return prisma.autoSimulatorConfig.upsert({
      where:  { restaurantId },
      create: { restaurantId, ...data },
      update: data,
    });
  }

  /** Derives enum status from live state + persisted config. */
  static deriveStatus(
    restaurantId: string,
    config: { enabled: boolean; lastRunAt: Date | null },
  ): SimulatorStatus {
    if (this.activeLocks.has(restaurantId)) return "RUNNING";
    if (this.lastErrors.has(restaurantId))  return "ERROR";
    if (config.enabled)                      return "SCHEDULED";
    if (config.lastRunAt)                    return "PAUSED";
    return "IDLE";
  }

  // ─── History helpers ──────────────────────────────────────────────────────

  static async getHistory(restaurantId: string, limit = 20) {
    return prisma.simulationRun.findMany({
      where:   { restaurantId },
      orderBy: { ranAt: "desc" },
      take:    limit,
    });
  }

  static async getLatestRun(restaurantId: string) {
    return prisma.simulationRun.findFirst({
      where:   { restaurantId },
      orderBy: { ranAt: "desc" },
    });
  }
}
