/**
 * fichaVisibility — o que a ficha técnica INTERNA do agente pode mostrar.
 *
 * Princípio (definido pelo CEO): a ficha é TÉCNICA. Comportamento/tom é config
 * do dono do restaurante, não da ficha. Então as seções ricas de tom/script
 * (princípios de venda, frases de sondagem/fechamento, tom de mensagem,
 * exemplos bom/ruim) NÃO aparecem na ficha — continuam vivas na constituição de
 * código (verdade de runtime), só não poluem a ficha nem a "Visão completa".
 *
 * Este módulo é puro (sem React) de propósito: o componente da ficha e os testes
 * compartilham a mesma regra.
 */

/** Chaves de `extendedSections` que carregam TOM/COMPORTAMENTO — ocultas na ficha. */
export const TONE_EXTENDED_SECTIONS: ReadonlySet<string> = new Set([
  "salesPrinciples",
  "consultativeProbingRules",
  "upsellRules",
  "closingRules",
  "messageToneRules",
  "personalizationRules",
  "reviewRequestRules",
  "relationshipPrinciples",
  "examples",
]);

/** true quando a seção é de tom/comportamento e não deve aparecer na ficha. */
export function isToneSection(key: string): boolean {
  return TONE_EXTENDED_SECTIONS.has(key);
}

/**
 * Filtra `extendedSections` para as entradas TÉCNICAS (as que a ficha exibe).
 * Preserva a ordem original.
 */
export function technicalExtendedEntries(
  sections?: Record<string, unknown>,
): Array<[string, unknown]> {
  return Object.entries(sections ?? {}).filter(([key]) => !isToneSection(key));
}
