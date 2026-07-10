/**
 * KnowledgeAdapterRegistry — the dispatch that makes "o Brain não muda" true.
 *
 * The Brain core never imports a vertical adapter directly: each business type
 * registers its BusinessKnowledgeAdapter here, and the reasoner resolves it by
 * businessType at runtime. Adding a new vertical (beauty clinic, agency, …) is
 * one `registerKnowledgeAdapter()` call in the vertical's own module — zero
 * edits to the Brain core.
 */

import type { BusinessType } from "../core/BrainTypes";
import type { BusinessKnowledgeAdapter } from "./BusinessKnowledgeContract";
import { restaurantKnowledgeAdapter } from "./RestaurantKnowledgeAdapter";

const registry = new Map<BusinessType, BusinessKnowledgeAdapter>();

export function registerKnowledgeAdapter(adapter: BusinessKnowledgeAdapter): void {
  registry.set(adapter.businessType, adapter);
}

/** Null when no adapter is registered — the caller degrades to an empty snapshot. */
export function resolveKnowledgeAdapter(businessType: BusinessType): BusinessKnowledgeAdapter | null {
  return registry.get(businessType) ?? null;
}

export function registeredBusinessTypes(): BusinessType[] {
  return [...registry.keys()];
}

// v1 built-in vertical. New verticals register from their own modules.
registerKnowledgeAdapter(restaurantKnowledgeAdapter);
