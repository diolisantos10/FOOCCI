/**
 * Shared types for the Waiter Runtime Merge (Library → runtime bridge + versioning).
 *
 * The whole module is governed: a Library technique only ever reaches the Waiter
 * prompt when it is ACTIVE + runtimeEnabled AND selected by an ACTIVE
 * LIBRARY_ASSISTED version. The default is always the safe CURRENT runtime.
 */

export type WaiterRuntimeMode = "CURRENT" | "LIBRARY_ASSISTED";

/** A technique formatted for safe injection into the Waiter prompt. */
export interface RuntimeTechnique {
  id: string;
  name: string;
  category: string;
  application: string;
  usageRule: string;
  qualityTest?: string;
  priority?: number;
}

/** The payload the bridge returns to the runtime. Never throws — always safe. */
export interface WaiterRuntimeKnowledge {
  /** true only when an ACTIVE LIBRARY_ASSISTED version contributed techniques. */
  enabled: boolean;
  versionId?: string;
  mode: WaiterRuntimeMode;
  techniques: RuntimeTechnique[];
  /** Ready-to-append system-prompt block (empty string when disabled). */
  promptBlock: string;
  /** Non-fatal notes (fallbacks, DB errors, empty selections). */
  warnings: string[];
}

export interface GetWaiterRuntimeKnowledgeInput {
  restaurantId?: string | null;
  agentSlug?: string;
  /** Force a mode (mostly for comparison/shadow); normally derived from the version. */
  mode?: WaiterRuntimeMode;
  maxTechniques?: number;
}

/** Result of the pre-activation Quality gate. */
export interface WaiterQualityGateResult {
  passed: boolean;
  p0Count: number;
  globalStatus: string;
  runId: string;
  ranAt: string;
  reason: string;
}
