/**
 * Plan feature resolution — the ONE place that answers "does this restaurant's plan
 * include X?".
 *
 * Today it answers a single question, the AI Waiter, because that is the gate the
 * pricing table needs. Written as its own module so the next feature gate lands here
 * instead of as a second inline `plan === "STARTER"` check that drifts from this one.
 */

import type { Plan } from "@prisma/client";

export interface PlanGateFields {
  plan: Plan;
  /**
   * Per-restaurant override. NULL means "follow the plan". The rollout migration
   * grandfathered every then-existing restaurant to TRUE — the live customer runs
   * the Waiter on a STARTER plan, and flipping it off at deploy time would have
   * been a production incident, not a launch.
   */
  aiWaiterEnabled: boolean | null;
}

/**
 * Whether the public store may call the AI Waiter for this restaurant.
 *
 * Order matters: the explicit override wins over the plan, in BOTH directions —
 * it can grant the Waiter to a STARTER (grandfather, courtesy, pilot) and it can
 * remove it from a higher plan (abuse, billing dispute) without a plan change.
 */
export function aiWaiterIncluded(r: PlanGateFields): boolean {
  if (r.aiWaiterEnabled !== null) return r.aiWaiterEnabled;
  return r.plan !== "STARTER";
}
