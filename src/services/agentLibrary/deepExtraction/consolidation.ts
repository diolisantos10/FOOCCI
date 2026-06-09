/**
 * deepExtraction/consolidation — pure consolidation + dedupe of chunk technique
 * candidates into the final set. No DB, no LLM.
 *
 * Filters generic/empty techniques, normalizes names, dedupes by normalized
 * name + category (keeping the most complete/confident), and caps the output.
 */

export interface CandidateLike {
  techniqueName: string;
  category?: string | null;
  purpose?: string | null;
  principle?: string | null;
  application?: string | null;
  usageRule?: string | null;
  qualityTest?: string | null;
  goodExample?: string | null;
  badExample?: string | null;
  confidence?: number | null;
}

/** Default cap on consolidated techniques per source. */
export const MAX_TECHNIQUES = 40;

const GENERIC_NAME = [
  /^fa[çc]a perguntas?\.?$/i,
  /^pergunte\.?$/i,
  /^seja (gentil|educado|simp[áa]tico)\.?$/i,
  /^ajude o cliente\.?$/i,
  /^seja bom\.?$/i,
];

/** True when a candidate is too generic/empty to be useful operational knowledge. */
export function isGenericTechnique(c: CandidateLike): boolean {
  const name = (c.techniqueName ?? "").trim();
  if (name.length < 8) return true;
  if (GENERIC_NAME.some((re) => re.test(name))) return true;
  // Keep it when it carries ANY substantive operational content (a concrete
  // application, usage rule, quality test or principle). Only drop the truly
  // empty/vague candidates — otherwise good-but-partial techniques are lost.
  const hasSubstance = [c.application, c.usageRule, c.qualityTest, c.principle].some(
    (f) => typeof f === "string" && f.trim().length >= 12,
  );
  return !hasSubstance;
}

/** Lowercased, accent/punctuation-stripped name for dedupe keys. */
export function normalizeTechniqueName(name: string): string {
  return (name ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Completeness/confidence score — higher wins on dedupe. */
export function candidateScore(c: CandidateLike): number {
  let s = typeof c.confidence === "number" ? c.confidence : 0.5;
  for (const f of [c.application, c.usageRule, c.qualityTest, c.principle, c.goodExample]) {
    if (f && f.trim()) s += 0.2;
  }
  return s;
}

/** Dedupes by normalized name + category, keeping the strongest candidate. */
export function dedupeCandidates(cands: readonly CandidateLike[]): CandidateLike[] {
  const byKey = new Map<string, CandidateLike>();
  for (const c of cands) {
    if (isGenericTechnique(c)) continue;
    const key = `${normalizeTechniqueName(c.techniqueName)}|${(c.category ?? "").toLowerCase().trim()}`;
    const existing = byKey.get(key);
    if (!existing || candidateScore(c) > candidateScore(existing)) byKey.set(key, c);
  }
  return [...byKey.values()];
}

/** Final consolidated techniques: deduped, sorted by score, capped. */
export function consolidateToTechniques(cands: readonly CandidateLike[], cap = MAX_TECHNIQUES): CandidateLike[] {
  return dedupeCandidates(cands)
    .sort((a, b) => candidateScore(b) - candidateScore(a))
    .slice(0, cap);
}
