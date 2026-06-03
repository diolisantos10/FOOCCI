/**
 * CrmTestRunnerService — orchestrates the deterministic CRM test suite.
 *
 * SAFETY: this runner is 100% pure-fixture based. It never:
 *   - sends a WhatsApp message
 *   - runs a campaign or creates a CampaignExecution
 *   - mutates customer data
 *   - touches the database (the API route resolves the restaurant; the runner
 *     only consumes the resolved meta)
 *
 * All evaluation runs against in-memory fixtures + pure CRM functions, so it is
 * deterministic and side-effect free. `dryRun` is always true.
 */

import {
  CRM_SCENARIOS,
  getQuickScenarios,
  type CrmScenario,
  type CrmScenarioGroupId,
} from "./crmScenarios";
import { evaluateAll, type CrmEvalReport } from "./crmEvaluator";

export type CrmTestMode = "quick" | "group" | "full";

export interface CrmTestRunInput {
  restaurantId:   string;
  restaurantName: string;
  slug:           string;
  mode:           CrmTestMode;
  scenarioGroup?: CrmScenarioGroupId;
  /** Reserved — LLM draft sanity mode. Off by default; the core suite is deterministic. */
  useLiveLLM?:    boolean;
  /** Always true — the runner is read-only/fixture-based by construction. */
  dryRun?:        boolean;
}

function selectScenarios(mode: CrmTestMode, group?: CrmScenarioGroupId): CrmScenario[] {
  if (mode === "quick") return getQuickScenarios();
  if (mode === "group") {
    if (!group) return CRM_SCENARIOS;
    return CRM_SCENARIOS.filter((s) => s.group === group);
  }
  return CRM_SCENARIOS; // full
}

export class CrmTestRunnerService {
  /**
   * Runs the selected CRM scenarios and returns a graded report.
   * Pure — no DB, no LLM, no sends. `dryRun` is forced to true.
   */
  static run(input: CrmTestRunInput): CrmEvalReport {
    const useLiveLLM = input.useLiveLLM === true; // never auto-enabled
    const scenarios  = selectScenarios(input.mode, input.scenarioGroup);

    return evaluateAll(scenarios, {
      restaurantId:   input.restaurantId,
      restaurantName: input.restaurantName,
      slug:           input.slug,
      mode:           input.mode,
      useLiveLLM,
    });
  }
}
