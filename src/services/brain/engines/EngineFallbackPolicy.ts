/**
 * EngineFallbackPolicy — what happens when an engine is missing or fails.
 *
 * Rule: the Brain NEVER blocks on a missing engine and NEVER produces a wrong
 * generic template. The chain is: preferred engine → default engine → the
 * agent's DETERMINISTIC fallback reasoning (guardrail-correct, reasoningMode=
 * "FALLBACK"). No silent retries against unconfigured providers, no secrets in
 * logs.
 */

import type { AIEngineProvider } from "./AIEngineTypes";

export interface FallbackDecision {
  useDeterministicFallback: boolean;
  reason: string;
}

export function onEngineFailure(provider: AIEngineProvider, error: unknown): FallbackDecision {
  const message = error instanceof Error ? error.message.slice(0, 120) : "erro desconhecido";
  return {
    useDeterministicFallback: true,
    reason: `Engine ${provider} falhou (${message}) — usando raciocínio determinístico seguro.`,
  };
}
