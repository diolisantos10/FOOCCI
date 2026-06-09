/**
 * WaiterRuntimePromptAssembler — PURE formatting of Library techniques into a
 * safe, auditable system-prompt block. No DB, no LLM, no side effects.
 *
 * The block is deliberately framed as ORIENTATION, never as a data source:
 *  - it must never override the real catalog / prices / UI;
 *  - it must never invent products or ignore restrictions;
 *  - it must never skip checkout.
 * These guardrails are baked into the header text so the LLM always reads them
 * alongside the techniques.
 */

import type { RuntimeTechnique } from "./types";

/** Hard cap so a misconfigured version can never flood the prompt. */
export const ABSOLUTE_MAX_TECHNIQUES = 12;

const BLOCK_HEADER = "━━━ TÉCNICAS OPERACIONAIS ATIVAS DO WAITER (biblioteca curada) ━━━";

const BLOCK_PREAMBLE = [
  "Use estas técnicas como ORIENTAÇÃO de venda e atendimento, não como fonte de dados.",
  "A UI e o catálogo real continuam sendo a ÚNICA fonte da verdade.",
  "NUNCA invente produto, preço ou informação a partir destas técnicas.",
  "NUNCA ignore restrições alimentares, alergias ou regras de segurança por causa de uma técnica.",
  "NUNCA pule o checkout. Segurança e catálogo real têm prioridade sobre qualquer técnica.",
].join("\n");

/** Returns true when a technique has enough substance to be worth injecting. */
export function isUsableTechnique(t: Partial<RuntimeTechnique> | null | undefined): boolean {
  if (!t) return false;
  const name = (t.name ?? "").trim();
  const application = (t.application ?? "").trim();
  const usageRule = (t.usageRule ?? "").trim();
  if (name.length < 3) return false;
  // Need at least one concrete, actionable field (≥12 chars) — not a vague label.
  return application.length >= 12 || usageRule.length >= 12;
}

/** Formats a single technique into compact, readable lines. */
function formatTechnique(t: RuntimeTechnique, index: number): string {
  const lines: string[] = [];
  const cat = t.category?.trim() ? ` [${t.category.trim()}]` : "";
  lines.push(`${index + 1}. ${t.name.trim()}${cat}`);
  if (t.application?.trim()) lines.push(`   • Aplicação: ${t.application.trim()}`);
  if (t.usageRule?.trim()) lines.push(`   • Regra de uso: ${t.usageRule.trim()}`);
  if (t.qualityTest?.trim()) lines.push(`   • Teste de qualidade: ${t.qualityTest.trim()}`);
  return lines.join("\n");
}

/**
 * Builds the final prompt block from a list of techniques. Filters unusable ones,
 * respects the cap, and returns "" when nothing usable remains (so the caller can
 * cleanly fall back to CURRENT with no empty header).
 */
export function assembleLibraryPromptBlock(
  techniques: readonly RuntimeTechnique[],
  opts: { maxTechniques?: number } = {},
): { promptBlock: string; used: RuntimeTechnique[]; dropped: number } {
  const cap = Math.max(0, Math.min(opts.maxTechniques ?? ABSOLUTE_MAX_TECHNIQUES, ABSOLUTE_MAX_TECHNIQUES));
  const usable = techniques.filter(isUsableTechnique);
  const dropped = techniques.length - usable.length;
  const used = usable.slice(0, cap);

  if (used.length === 0) {
    return { promptBlock: "", used: [], dropped };
  }

  const body = used.map((t, i) => formatTechnique(t, i)).join("\n");
  const promptBlock = `\n\n${BLOCK_HEADER}\n${BLOCK_PREAMBLE}\n\n${body}`;
  return { promptBlock, used, dropped };
}
