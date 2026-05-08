/**
 * Pure CRM helper functions — no DB imports.
 *
 * Tier thresholds (aligned with CRMService.getTier and CustomerProfileClient):
 *   DIAMANTE ≥ R$2000 | OURO ≥ R$800 | PRATA ≥ R$300 | BRONZE < R$300
 *
 * Segment thresholds:
 *   SEM_PEDIDOS = no countable orders yet
 *   QUENTE      = last order within 30 days
 *   MORNO       = last order 31–60 days ago
 *   FRIO        = last order more than 60 days ago
 */

export type CustomerTierValue    = "BRONZE" | "PRATA" | "OURO" | "DIAMANTE";
export type CustomerSegmentValue = "QUENTE" | "MORNO" | "FRIO" | "SEM_PEDIDOS";

export function computeTier(totalSpend: number): CustomerTierValue {
  if (totalSpend >= 2000) return "DIAMANTE";
  if (totalSpend >= 800)  return "OURO";
  if (totalSpend >= 300)  return "PRATA";
  return "BRONZE";
}

export function computeSegment(
  lastOrderAt: Date | null,
  totalOrders: number
): CustomerSegmentValue {
  if (totalOrders === 0 || !lastOrderAt) return "SEM_PEDIDOS";
  const days = Math.floor((Date.now() - lastOrderAt.getTime()) / 86_400_000);
  if (days <= 30) return "QUENTE";
  if (days <= 60) return "MORNO";
  return "FRIO";
}
