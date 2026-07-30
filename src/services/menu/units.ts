/**
 * Conversão de unidades para a ficha de custo (CMV).
 *
 * O insumo tem uma unidade de COMPRA (catálogo) com custo por essa unidade —
 * ex.: Blend a R$ 30,00/kg. Na ficha, o lojista informa quanto USA no prato,
 * podendo ser em outra unidade da mesma dimensão — ex.: 150 g. O custo da linha
 * converte uso→compra: 150 g × (1 kg / 1000 g) × R$ 30/kg = R$ 4,50.
 *
 * Só convertemos dentro da mesma dimensão (massa g↔kg, volume ml↔L). Contagem
 * (un, fatia, porção, dz…) não converte: a unidade de uso é a própria de compra.
 */

const MASS: Record<string, number> = { g: 1, kg: 1000 }; // gramas por unidade
const VOLUME: Record<string, number> = { ml: 1, L: 1000 }; // ml por unidade

/** Fator que converte 1 `from` em quantidade de `to` (mesma dimensão), ou null. */
export function conversionFactor(from: string, to: string): number | null {
  if (from === to) return 1;
  const mFrom = MASS[from];
  const mTo = MASS[to];
  if (mFrom !== undefined && mTo !== undefined) return mFrom / mTo;
  const vFrom = VOLUME[from];
  const vTo = VOLUME[to];
  if (vFrom !== undefined && vTo !== undefined) return vFrom / vTo;
  return null;
}

/** Unidades de USO compatíveis com a unidade de COMPRA do insumo (mesma dimensão). */
export function compatibleUseUnits(purchaseUnit: string): string[] {
  if (purchaseUnit in MASS) return ["kg", "g"];
  if (purchaseUnit in VOLUME) return ["L", "ml"];
  return [purchaseUnit];
}

/** true se a dimensão do insumo permite escolher uma unidade de uso diferente. */
export function unitIsConvertible(purchaseUnit: string): boolean {
  return purchaseUnit in MASS || purchaseUnit in VOLUME;
}

/**
 * Custo de uma linha: quantidade (na unidade de USO) × custo/unidade (na unidade
 * de COMPRA), convertendo uso→compra. Retorna null se faltar dado ou se as
 * unidades forem de dimensões diferentes (incompatíveis).
 */
export function lineCost(
  quantity: number | null,
  useUnit: string,
  purchaseUnit: string,
  costPerUnit: number | null
): number | null {
  if (quantity === null || costPerUnit === null) return null;
  const f = conversionFactor(useUnit, purchaseUnit);
  if (f === null) return null;
  return quantity * f * costPerUnit;
}
