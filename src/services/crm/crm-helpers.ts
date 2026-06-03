/**
 * Pure CRM helper functions — no DB imports.
 *
 * Tier thresholds (aligned with CRMService.getTier and CustomerProfileClient):
 *   DIAMANTE ≥ R$2000 | OURO ≥ R$800 | PRATA ≥ R$300 | BRONZE < R$300
 *
 * Segment thresholds (configurable — defaults match SegmentConfig defaults):
 *   SEM_PEDIDOS = no countable orders yet
 *   QUENTE      = last order within hotMaxDays (default 30)
 *   MORNO       = last order hotMaxDays+1 – warmMaxDays days ago (default 31–60)
 *   FRIO        = last order more than warmMaxDays days ago (default 60+)
 */

export type CustomerTierValue    = "BRONZE" | "PRATA" | "OURO" | "DIAMANTE";
export type CustomerSegmentValue = "QUENTE" | "MORNO" | "FRIO" | "PERDIDO" | "SEM_PEDIDOS";

export function computeTier(totalSpend: number): CustomerTierValue {
  if (totalSpend >= 2000) return "DIAMANTE";
  if (totalSpend >= 800)  return "OURO";
  if (totalSpend >= 300)  return "PRATA";
  return "BRONZE";
}

/**
 * Compute the relationship segment for a customer.
 * Optional `thresholds` allows callers to pass configurable day limits.
 * Falls back to hardcoded defaults (30/60/120) when not provided.
 */
export function computeSegment(
  lastOrderAt: Date | null,
  totalOrders: number,
  thresholds?: { hotMaxDays: number; warmMaxDays: number; lostMinDays?: number }
): CustomerSegmentValue {
  if (totalOrders === 0 || !lastOrderAt) return "SEM_PEDIDOS";
  const days    = Math.floor((Date.now() - lastOrderAt.getTime()) / 86_400_000);
  const hotMax  = thresholds?.hotMaxDays  ?? 30;
  const warmMax = thresholds?.warmMaxDays ?? 60;
  const lostMin = thresholds?.lostMinDays ?? 120;
  if (days <= hotMax)  return "QUENTE";
  if (days <= warmMax) return "MORNO";
  if (days <  lostMin) return "FRIO";
  return "PERDIDO";
}

