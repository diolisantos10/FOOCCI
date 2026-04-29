/**
 * AutoSimulatorService
 *
 * Orchestrates automated simulation runs:
 *   1. Calls AISimulatorService.run (no streaming needed)
 *   2. Analyzes the report via FailureAnalyzer
 *   3. Generates insight + prompt suggestion via InsightGenerator
 *   4. Persists the result in SimulationRun table
 *   5. Updates AutoSimulatorConfig.lastRunAt
 *
 * Also provides CRUD helpers for config and history.
 */

import { prisma } from "@/lib/prisma";
import { AISimulatorService } from "./AISimulatorService";
import { analyzeReport } from "./FailureAnalyzer";
import { generateInsight } from "./InsightGenerator";

export type TriggerSource = "scheduler" | "manual";

export class AutoSimulatorService {
  /**
   * Run a simulation, analyze results, store the run record, and return it.
   * Safe to call concurrently for different restaurants.
   */
  static async executeRun(
    restaurantId: string,
    scenarioCount = 10,
    triggeredBy: TriggerSource = "scheduler",
  ) {
    // Run simulation — noop callbacks (no streaming needed for background runs)
    const report = await AISimulatorService.run(
      restaurantId,
      scenarioCount,
      () => {},
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
        analysis:   pattern,
        insight,
        suggestedPrompt,
        triggeredBy,
      },
    });

    // Update lastRunAt (upsert in case config doesn't exist yet)
    await prisma.autoSimulatorConfig.upsert({
      where:  { restaurantId },
      create: { restaurantId, lastRunAt: new Date() },
      update: { lastRunAt: new Date() },
    });

    return run;
  }

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
}
