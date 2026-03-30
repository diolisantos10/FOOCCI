/**
 * FOOCCI QA — Critical Scenario Registry
 *
 * The fixed set of scenario IDs that run when the user clicks
 * "Rodar testes críticos". These cover the four highest-value
 * flows; the list never changes at runtime.
 *
 * Rules for inclusion:
 *  1. Scenario failure must imply the product is broken for real users.
 *  2. Each distinct user path is represented at most once.
 *  3. Maximum 5 scenarios so the critical suite stays fast (<500ms).
 */

export const CRITICAL_SCENARIO_IDS = [
  "direct-buyer",        // full happy path — delivery, all categories, confirm
  "incomplete-address",  // address validation gate must block progression
  "pickup-flow",         // pickup skips address stages entirely
  "refuse-drink",        // double upsell refusal + full checkout completion
] as const;

export type CriticalScenarioId = (typeof CRITICAL_SCENARIO_IDS)[number];
