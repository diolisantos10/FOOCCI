/**
 * AnalyticsTestRunnerService — orchestrates the deterministic Analytics test suite (W5).
 *
 * SAFETY: this runner is 100% pure-fixture based. It never:
 *   - sends a WhatsApp message
 *   - runs a campaign or creates a CampaignExecution
 *   - mutates restaurant / customer / order data
 *   - touches the database (the API route resolves the restaurant; the runner
 *     only consumes the resolved meta)
 *   - calls an LLM or any external service
 *
 * All evaluation runs against in-memory fixtures + pure Analytics functions, so
 * it is deterministic and side-effect free. `includeLiveData` is reserved and
 * forced off — if ever implemented it must be strictly read-only and labeled.
 */

import {
  ANALYTICS_SCENARIOS,
  getQuickScenarios,
  type AnalyticsScenario,
  type AnalyticsScenarioGroupId,
} from "./analyticsScenarios";
import { evaluateAll, type AnalyticsEvalReport } from "./analyticsEvaluator";

export type AnalyticsTestMode = "quick" | "group" | "full";

export interface AnalyticsTestRunInput {
  restaurantId:    string;
  restaurantName:  string;
  slug:            string;
  mode:            AnalyticsTestMode;
  scenarioGroup?:  AnalyticsScenarioGroupId;
  /** Reserved — read-only live-data sampling. Off by default; the core suite is fixture-based. */
  includeLiveData?: boolean;
}

function selectScenarios(mode: AnalyticsTestMode, group?: AnalyticsScenarioGroupId): AnalyticsScenario[] {
  if (mode === "quick") return getQuickScenarios();
  if (mode === "group") {
    if (!group) return ANALYTICS_SCENARIOS;
    return ANALYTICS_SCENARIOS.filter((s) => s.group === group);
  }
  return ANALYTICS_SCENARIOS; // full
}

export class AnalyticsTestRunnerService {
  /**
   * Runs the selected Analytics scenarios and returns a graded report.
   * Pure — no DB, no LLM, no sends, no mutation. `includeLiveData` is forced off.
   */
  static run(input: AnalyticsTestRunInput): AnalyticsEvalReport {
    const scenarios = selectScenarios(input.mode, input.scenarioGroup);

    return evaluateAll(scenarios, {
      restaurantId:    input.restaurantId,
      restaurantName:  input.restaurantName,
      slug:            input.slug,
      mode:            input.mode,
      includeLiveData: false, // forced off — deterministic fixtures only
    });
  }
}
