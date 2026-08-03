/**
 * Plan gate for the AI Waiter — the rules that keep this from being a production
 * incident instead of a launch.
 *
 * The trap this locks: the live customer (Sushi Cazza) runs the Waiter on a STARTER
 * plan. A plan-only gate — the obvious implementation — would have shut down its AI
 * the moment the deploy landed. The override column exists exactly for that, and the
 * rollout migration sets it to TRUE for every restaurant existing at rollout.
 */

import { describe, it, expect } from "vitest";
import { aiWaiterIncluded } from "./plan-features";

describe("aiWaiterIncluded", () => {
  it("denies the entry plan by default — this is the paid gate", () => {
    expect(aiWaiterIncluded({ plan: "STARTER", aiWaiterEnabled: null })).toBe(false);
  });

  it("includes the paid plans by default", () => {
    expect(aiWaiterIncluded({ plan: "GROWTH", aiWaiterEnabled: null })).toBe(true);
    expect(aiWaiterIncluded({ plan: "PRO", aiWaiterEnabled: null })).toBe(true);
  });

  it("grandfather clause: an explicit TRUE beats the plan — the live customer is STARTER with the Waiter on", () => {
    expect(aiWaiterIncluded({ plan: "STARTER", aiWaiterEnabled: true })).toBe(true);
  });

  it("an explicit FALSE beats the plan in the other direction too", () => {
    // Abuse or billing dispute: the Waiter can be switched off without a plan change.
    expect(aiWaiterIncluded({ plan: "PRO", aiWaiterEnabled: false })).toBe(false);
  });
});
