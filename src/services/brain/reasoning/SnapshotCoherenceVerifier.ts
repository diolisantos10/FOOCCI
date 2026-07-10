/**
 * SnapshotCoherenceVerifier — verificação claim-vs-snapshot, determinística.
 *
 * Substitui o antigo stub que hardcodava `doesNotInventFacts: true` sem checar
 * nada. Versão v1 (sem LLM, hermética e barata) cobre as duas classes de falha
 * que já machucaram clientes reais:
 *
 *  1. PREÇO INVENTADO — todo valor "R$ X" citado na resposta TEM que existir na
 *     Base de Conhecimento (nos preços estruturados ou no texto curado);
 *  2. NEGAÇÃO DE SERVIÇO — "não temos/não fazemos" (o incidente rodízio) nunca
 *     passa direto: vira NEEDS_REVIEW, porque negar exige verdade explícita,
 *     não ausência de informação.
 *
 * Um crítico LLM-judge mais profundo se pluga por cima na Fase 3 do roadmap —
 * este é o piso que nunca sai.
 */

import type { BusinessKnowledgeSnapshot } from "../knowledge/BusinessKnowledgeContract";

export interface SnapshotClaimCheck {
  /** Preços citados na resposta que NÃO existem na base de conhecimento. */
  inventedPrices: string[];
  /** Frases de negação de serviço/produto detectadas na resposta. */
  serviceDenials: string[];
  doesNotInventFacts: boolean;
  needsReview: boolean;
  reason: string;
}

const MONEY_IN_TEXT_RE = /R\$\s?(\d{1,4}(?:[.,]\d{2})?)/g;
const DENIAL_RE =
  /\b(?:n[ãa]o)\s+(?:temos|tem|fazemos|oferecemos|trabalhamos|servimos|existe|aceitamos)\b/gi;

/** Normaliza "89,90" / "89.90" / "89" para centavos (8990 / 8990 / 8900). */
function toCents(raw: string): number {
  const normalized = raw.replace(",", ".");
  const value = Number.parseFloat(normalized);
  return Math.round(value * 100);
}

/** Coleta todos os valores monetários presentes na verdade (números e textos). */
function collectTruthCents(snapshot: BusinessKnowledgeSnapshot): Set<number> {
  const cents = new Set<number>();

  const walk = (node: unknown): void => {
    if (node == null) return;
    if (typeof node === "number" && Number.isFinite(node)) {
      cents.add(Math.round(node * 100));
      return;
    }
    if (typeof node === "string") {
      for (const m of node.matchAll(MONEY_IN_TEXT_RE)) if (m[1]) cents.add(toCents(m[1]));
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (typeof node === "object") {
      for (const value of Object.values(node as Record<string, unknown>)) walk(value);
    }
  };

  walk(snapshot.truthSources);
  return cents;
}

export function verifyAgainstSnapshot(
  idealResponse: string,
  snapshot: BusinessKnowledgeSnapshot,
): SnapshotClaimCheck {
  const truthCents = collectTruthCents(snapshot);

  const inventedPrices: string[] = [];
  for (const m of idealResponse.matchAll(MONEY_IN_TEXT_RE)) {
    if (m[1] && !truthCents.has(toCents(m[1]))) inventedPrices.push(`R$ ${m[1]}`);
  }

  const serviceDenials = [...idealResponse.matchAll(DENIAL_RE)].map((m) => m[0]);

  const doesNotInventFacts = inventedPrices.length === 0;
  const needsReview = !doesNotInventFacts || serviceDenials.length > 0;

  const reasons: string[] = [];
  if (inventedPrices.length) reasons.push(`preço fora da base: ${inventedPrices.join(", ")}`);
  if (serviceDenials.length) reasons.push(`negação de serviço exige verdade explícita: "${serviceDenials[0]}"`);

  return {
    inventedPrices,
    serviceDenials,
    doesNotInventFacts,
    needsReview,
    reason: reasons.join("; ") || "claims compatíveis com a base de conhecimento",
  };
}
