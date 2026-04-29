/**
 * FailureAnalyzer
 *
 * Pure function: SimulationReport → dominant FailurePattern.
 * No DB, no side effects. Used by AutoSimulatorService after each run.
 */
import type { SimulationReport } from "./AISimulatorService";

export type FailureType =
  | "low_conversion"
  | "upsell_not_happening"
  | "early_checkout_drop"
  | "too_many_questions"
  | "repetition"
  | "tool_errors"
  | "drink_not_offered"
  | "dessert_not_offered"
  | "dietary_violation"
  | "none";

export interface FailurePattern {
  type:      FailureType;
  mainIssue: string;
  frequency: string;  // e.g. "70%"
  impact:    "high" | "medium" | "low";
}

export function analyzeReport(report: SimulationReport): FailurePattern {
  const n = report.scenarios.length || 1;

  // ── Critical checks first ────────────────────────────────────
  const dietaryViolations = report.scenarios.filter(
    (r) => r.checks.some((c) => c.type === "dietary_respected" && !c.passed),
  ).length;
  if (dietaryViolations > 0) {
    return {
      type:      "dietary_violation",
      mainIssue: "Itens incompatíveis com restrições alimentares foram sugeridos",
      frequency: pct(dietaryViolations, n),
      impact:    "high",
    };
  }

  const hallucinations = report.scenarios.filter(
    (r) => r.checks.some((c) => c.type === "no_hallucination" && !c.passed),
  ).length;
  if (hallucinations > 0) {
    return {
      type:      "tool_errors",
      mainIssue: "IA inventou IDs de itens inexistentes no cardápio",
      frequency: pct(hallucinations, n),
      impact:    "high",
    };
  }

  // ── Score each candidate failure ─────────────────────────────
  const candidates: Array<{ pattern: FailurePattern; score: number }> = [];

  // Low conversion
  if (report.conversionRate < 0.5) {
    candidates.push({
      score:   (0.5 - report.conversionRate) * 100 + 50,
      pattern: {
        type:      "low_conversion",
        mainIssue: `Apenas ${pct(report.conversionRate)} dos pedidos foram confirmados`,
        frequency: pct(1 - report.conversionRate),
        impact:    report.conversionRate < 0.3 ? "high" : "medium",
      },
    });
  }

  // Upsell not happening
  const noUpsellCount = report.scenarios.filter(
    (r) => r.salesMetrics.totalItems > 0 && r.salesMetrics.upsellAttempts === 0,
  ).length;
  if (noUpsellCount / n > 0.3) {
    candidates.push({
      score:   (noUpsellCount / n) * 80,
      pattern: {
        type:      "upsell_not_happening",
        mainIssue: "IA não está fazendo sugestões de upsell após o prato principal",
        frequency: pct(noUpsellCount, n),
        impact:    noUpsellCount / n > 0.5 ? "high" : "medium",
      },
    });
  }

  // Early checkout drop
  const beforeCheckout = report.behaviorAnalysis?.flowBreakdown?.beforeCheckout ?? 0;
  if (beforeCheckout > 0.3) {
    candidates.push({
      score:   beforeCheckout * 70,
      pattern: {
        type:      "early_checkout_drop",
        mainIssue: "Pedidos com itens no carrinho não estão sendo confirmados",
        frequency: pct(beforeCheckout),
        impact:    "high",
      },
    });
  }

  // Drink not offered
  const withDrink = report.salesDiagnosis?.withDrink ?? 1;
  if (withDrink < 0.5) {
    candidates.push({
      score:   (0.5 - withDrink) * 60,
      pattern: {
        type:      "drink_not_offered",
        mainIssue: "Bebida não está sendo sugerida na fase de complemento",
        frequency: pct(1 - withDrink),
        impact:    "medium",
      },
    });
  }

  // Repetition
  const repeatRate = report.behaviorAnalysis?.refusalHandling?.repeatSuggestions ?? 0;
  if (repeatRate > 0.2) {
    candidates.push({
      score:   repeatRate * 50,
      pattern: {
        type:      "repetition",
        mainIssue: "IA está repetindo sugestões já feitas anteriormente",
        frequency: pct(repeatRate),
        impact:    "medium",
      },
    });
  }

  // Excessive questions (proxy: conversion failed + AI kept asking questions + many turns)
  const excessiveQCount = report.scenarios.filter(
    (r) =>
      !r.salesMetrics.conversionSuccess &&
      r.checks.some((c) => c.type === "clarification_asked" && c.passed) &&
      r.totalTurns >= 5,
  ).length;
  if (excessiveQCount / n > 0.3) {
    candidates.push({
      score:   (excessiveQCount / n) * 45,
      pattern: {
        type:      "too_many_questions",
        mainIssue: "IA faz muitas perguntas antes de sugerir itens, causando abandono",
        frequency: pct(excessiveQCount, n),
        impact:    "medium",
      },
    });
  }

  // Tool errors
  const affectedByErrors = report.scenarios.filter(
    (r) => r.salesMetrics.errorCount > 0,
  ).length;
  if (report.errorCount > n * 2) {
    candidates.push({
      score:   Math.min(40, report.errorCount / n * 10),
      pattern: {
        type:      "tool_errors",
        mainIssue: `Alto número de erros de ferramenta (${report.errorCount} no total)`,
        frequency: pct(affectedByErrors, n),
        impact:    "medium",
      },
    });
  }

  if (candidates.length === 0) {
    return {
      type:      "none",
      mainIssue: "Nenhum problema crítico detectado nesta rodada",
      frequency: "0%",
      impact:    "low",
    };
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]!.pattern;
}

function pct(value: number, total?: number): string {
  const ratio = total !== undefined ? value / (total || 1) : value;
  return `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%`;
}
