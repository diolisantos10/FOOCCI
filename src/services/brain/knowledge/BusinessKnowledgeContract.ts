/**
 * BusinessKnowledgeContract — the Knowledge Base is THE TRUTH of the Brain.
 *
 * Every agent reasons ONLY over a BusinessKnowledgeSnapshot: what the business
 * actually configured (products, prices, hours, payments, policies…). Whatever is
 * not in the snapshot goes to `missingContext` and the agent must say "preciso
 * confirmar" instead of inventing. Snapshots are aggregate/summary level — NEVER
 * raw PII (no customer names/phones/addresses).
 */

import type { BusinessType } from "../core/BrainTypes";

export interface BusinessKnowledgeSnapshot {
  businessId: string;
  businessType: BusinessType;
  truthSources: {
    products?: unknown[];
    prices?: unknown[];
    hours?: unknown;
    payments?: unknown;
    customers?: unknown[];
    orders?: unknown[];
    policies?: unknown[];
    materials?: unknown[];
    conversations?: unknown[];
    evidence?: unknown[];
  };
  missingContext: string[];
  safetyNotes: string[];
  /** Quando esta verdade foi montada — auditável: "o que o Brain sabia quando respondeu". */
  snapshotAsOf?: string;
  /** 0–1: quanto da verdade essencial do negócio está presente (gate de promoção na Fase 3). */
  completenessScore?: number;
}

/** Optional context an adapter may use to scope the snapshot (never required). */
export interface KnowledgeSnapshotOptions {
  /** Which agent is asking — lets adapters scope agent-specific materials. */
  agentId?: string;
  /** Sanitized customer message — lets adapters pull query-RELEVANT knowledge beyond the top-N. */
  queryHint?: string;
}

/** Every business adapter (restaurant, agency, …) implements this. */
export interface BusinessKnowledgeAdapter {
  businessType: BusinessType;
  getSnapshot(businessId: string, opts?: KnowledgeSnapshotOptions): Promise<BusinessKnowledgeSnapshot>;
}
