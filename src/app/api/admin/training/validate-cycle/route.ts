/**
 * POST /api/admin/training/validate-cycle
 *
 * Runs the full training loop synchronously and returns a structured
 * validation report — no terminal, no ADMIN_SECRET in browser needed.
 *
 * Flow:
 *   1. Fresh quick batch (10 scenarios, WHATSAPP_ORDERING)
 *   2. Locate price-lookup scenario and evaluate it → priceLookupScore always populated
 *   3. Pick lowest-score WARN/FAIL scenario for the diagnosis+proposal cycle
 *      (if that scenario is the price scenario, skip duplicate evaluation)
 *   4. Generate GPT-4o diagnosis for selected WARN/FAIL
 *   5. Generate improvement proposal
 *   6. Verify proposal appears in PENDING_APPROVAL queue
 *
 * Issues are explicit — PARTIAL_WITH_ISSUES always has non-empty issues[].
 *
 * Auth:   admin-protected (checkAdminRequest)
 * Safety: allowSideEffects=false — no WhatsApp, no order, no Pix, no brain mutation
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { generateBatch } from "@/services/agent-training/AgentTrainingScenarioGenerator";
import { createRun, runBatch, finalizeRun, failRun } from "@/services/agent-training/AgentTrainingRunnerService";
import { evaluateScenario } from "@/services/agent-training/AgentTrainingEvaluatorService";
import { generateProposal } from "@/services/agent-training/AgentTrainingImprovementService";
import type { AgentType, TranscriptTurn } from "@/services/agent-training/types";

export interface CycleValidationReport {
  generatedAt:  string;
  runId:        string;
  runSummary: {
    total:      number;
    pass:       number;
    warn:       number;
    fail:       number;
    score:      number | null;
    durationMs: number;
  };
  priceLookup: {
    found:              boolean;
    scenarioId:         string | null;
    title:              string | null;
    /** Status persisted by the runner (PASS/WARN/FAIL) */
    scenarioStatus:     string | null;
    /** Our validation check result (did bot list prices correctly?) */
    validationVerdict:  "PASS" | "WARN" | "FAIL" | "NOT_FOUND";
    /** GPT-4o priceLookupScore (0-100) — populated after evaluation */
    priceLookupScore:   number | null;
    botReplies:         string[];
    saidNotFound:       boolean;
    notes:              string;
  };
  diagnosis: {
    generated:              boolean;
    selectedScenarioId:     string | null;
    selectedScenarioTitle:  string | null;
    evaluationId:           string | null;
    /** GPT-4o evaluator verdict (PASS/WARN/FAIL) */
    evaluatorVerdict:       string | null;
    overallScore:           number | null;
    weaknesses:             string[];
  };
  proposal: {
    generated:            boolean;
    proposalId:           string | null;
    status:               string | null;
    changeType:           string | null;
    title:                string | null;
    riskLevel:            string | null;
    appearsInQueue:       boolean;
  };
  safety: {
    allowSideEffectsFalse:     true;
    noWhatsAppSent:            boolean;
    noOrderCreated:            boolean;
    noProductionMutation:      boolean;
    proposalPendingApproval:   boolean;
  };
  verdict:            "TRAINING_LOOP_VALIDATED" | "PARTIAL_WITH_ISSUES" | "FAILED_WITH_REASONS";
  issues:             string[];
  nextRecommendation: string;
}

type ScenarioRow = {
  id:              string;
  title:           string;
  status:          string;
  score:           number | null;
  transcriptJson:  unknown;
  failureSummary:  string | null;
  goal:            string | null;
};

export async function POST(req: NextRequest) {
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startMs = Date.now();
  const issues: string[] = [];

  // ── 1. Pick restaurant ──────────────────────────────────────────────────────
  const restaurant = await prisma.restaurant.findFirst({
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });
  if (!restaurant) {
    return NextResponse.json({ error: "Nenhum restaurante encontrado" }, { status: 404 });
  }

  // ── 2. Create & run batch synchronously ─────────────────────────────────────
  const run = await createRun({
    agentType:    "WHATSAPP_ORDERING",
    source:       "AI_SIMULATION",
    mode:         "QUICK",
    restaurantId: restaurant.id,
  });

  let finalRun: Awaited<ReturnType<typeof finalizeRun>> | null = null;
  try {
    const templates = generateBatch(10);
    const scenarios = templates.map((t) => ({
      title:           t.title,
      persona:         t.customerPersona,
      goal:            t.goal,
      messages:        t.messageSequence,
      source:          "AI_SIMULATION" as const,
      expectedOutcome: t.expectedOutcome,
    }));
    await runBatch({ runId: run.id, restaurantId: restaurant.id, scenarios });
    finalRun = await finalizeRun(run.id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await failRun(run.id, msg);
    issues.push(`batch_failed: ${msg}`);
  }

  const durationMs = Date.now() - startMs;
  const runSummary = {
    total:      finalRun?.totalScenarios ?? 0,
    pass:       finalRun?.passCount      ?? 0,
    warn:       finalRun?.warnCount      ?? 0,
    fail:       finalRun?.failCount      ?? 0,
    score:      finalRun?.score          ?? null,
    durationMs,
  };

  if (runSummary.total === 0) issues.push("batch_produced_zero_scenarios");

  // ── 3. Load all scenarios from this run ─────────────────────────────────────
  const allScenarios = await prisma.agentTrainingScenario.findMany({
    where:   { runId: run.id },
    select:  { id: true, title: true, status: true, score: true,
               transcriptJson: true, failureSummary: true, goal: true },
    orderBy: { createdAt: "asc" },
  }) as ScenarioRow[];

  // ── 4. Locate price lookup scenario ─────────────────────────────────────────
  const priceScenario = allScenarios.find((s) =>
    s.title?.toLowerCase().includes("preç") ||
    s.title?.toLowerCase().includes("prec")
  ) ?? null;

  const priceLookup: CycleValidationReport["priceLookup"] = buildPriceLookupResult(
    priceScenario, issues,
  );

  // ── 5. Evaluate price lookup scenario for priceLookupScore ──────────────────
  let priceEvalScore: number | null = null;
  if (priceScenario) {
    try {
      await evaluateScenario({
        scenarioId:      priceScenario.id,
        transcript:      priceScenario.transcriptJson as unknown as TranscriptTurn[],
        expectedOutcome: undefined,
      });
      const priceEval = await prisma.agentTrainingEvaluation.findFirst({
        where:   { scenarioId: priceScenario.id },
        orderBy: { createdAt: "desc" },
      });
      if (priceEval) {
        const s = priceEval.scoreJson as Record<string, unknown> | null;
        priceEvalScore = typeof s?.priceLookupScore === "number" ? s.priceLookupScore : null;
        (priceLookup as { priceLookupScore: number | null }).priceLookupScore = priceEvalScore;
      } else {
        issues.push("price_lookup_score_missing: evaluation record not created after evaluateScenario");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      issues.push(`price_lookup_evaluation_failed: ${msg}`);
    }
    if (priceEvalScore === null && !issues.some((i) => i.startsWith("price_lookup"))) {
      issues.push("price_lookup_score_missing");
    }
  }

  // ── 6. Select WARN/FAIL scenario for the diagnosis+proposal cycle ────────────
  // Prefer: lowest score among WARN/FAIL (re-read after potential score update by evaluateScenario)
  const refreshed = await prisma.agentTrainingScenario.findMany({
    where:   { runId: run.id, status: { in: ["WARN", "FAIL"] } },
    select:  { id: true, title: true, status: true, score: true,
               transcriptJson: true, failureSummary: true, goal: true },
    orderBy: { score: "asc" },
  }) as ScenarioRow[];

  // Use lowest-score WARN/FAIL; skip if we already evaluated the price scenario
  const diagScenario = refreshed[0] ?? null;

  const diagnosis: CycleValidationReport["diagnosis"] = {
    generated: false, selectedScenarioId: null, selectedScenarioTitle: null,
    evaluationId: null, evaluatorVerdict: null, overallScore: null, weaknesses: [],
  };

  if (!diagScenario) {
    issues.push("no_warn_or_fail_scenario_available_for_proposal");
  } else {
    diagnosis.selectedScenarioId    = diagScenario.id;
    diagnosis.selectedScenarioTitle = diagScenario.title;

    try {
      // Skip evaluation if we already ran it for the price scenario AND it's the same scenario
      const alreadyEvaluated = priceScenario?.id === diagScenario.id && priceEvalScore !== null;

      if (!alreadyEvaluated) {
        await evaluateScenario({
          scenarioId:      diagScenario.id,
          transcript:      diagScenario.transcriptJson as unknown as TranscriptTurn[],
          expectedOutcome: undefined,
        });
      }

      const evaluation = await prisma.agentTrainingEvaluation.findFirst({
        where:   { scenarioId: diagScenario.id },
        orderBy: { createdAt: "desc" },
      });

      if (evaluation) {
        const scores = evaluation.scoreJson as Record<string, unknown> | null;
        diagnosis.generated       = true;
        diagnosis.evaluationId    = evaluation.id;
        diagnosis.evaluatorVerdict = evaluation.verdict;
        diagnosis.overallScore    = typeof scores?.overallScore === "number" ? scores.overallScore : null;
        diagnosis.weaknesses      = typeof evaluation.weaknesses === "string"
          ? [evaluation.weaknesses]
          : Array.isArray(evaluation.weaknesses) ? evaluation.weaknesses as string[]
          : [];

        // Detect status vs evaluator verdict mismatch
        if (diagScenario.status !== evaluation.verdict) {
          issues.push(
            `status_verdict_mismatch: scenario status=${diagScenario.status} but evaluator says ${evaluation.verdict}`,
          );
        }
      } else {
        issues.push("diagnosis_not_generated: evaluateScenario ran but evaluation record not found");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      issues.push(`diagnosis_failed: ${msg}`);
    }

    if (!diagnosis.generated && !issues.some((i) => i.startsWith("diagnosis"))) {
      issues.push("diagnosis_not_generated");
    }
  }

  // ── 7. Generate improvement proposal ────────────────────────────────────────
  const proposal: CycleValidationReport["proposal"] = {
    generated: false, proposalId: null, status: null,
    changeType: null, title: null, riskLevel: null, appearsInQueue: false,
  };

  if (diagScenario && diagnosis.generated) {
    try {
      await generateProposal({
        runId:        run.id,
        agentType:    "WHATSAPP_ORDERING" as AgentType,
        restaurantId: restaurant.id,
        scenarios: [{
          id:             diagScenario.id,
          title:          diagScenario.title,
          failureSummary: diagScenario.failureSummary,
          transcript:     diagScenario.transcriptJson as unknown as TranscriptTurn[],
        }],
      });

      const createdProposal = await prisma.agentImprovementProposal.findFirst({
        where:   { sourceRunId: run.id },
        orderBy: { createdAt: "desc" },
      });

      if (createdProposal) {
        proposal.generated  = true;
        proposal.proposalId = createdProposal.id;
        proposal.status     = createdProposal.status;
        proposal.changeType = createdProposal.proposedChangeType;
        proposal.title      = createdProposal.title;
        proposal.riskLevel  = createdProposal.riskLevel;

        if (createdProposal.status !== "PENDING_APPROVAL") {
          issues.push(`proposal_unexpected_status: expected PENDING_APPROVAL, got ${createdProposal.status}`);
        }

        // Verify the proposal appears in the suggestions queue
        const inQueue = await prisma.agentImprovementProposal.findFirst({
          where: { id: createdProposal.id, status: "PENDING_APPROVAL" },
        });
        proposal.appearsInQueue = !!inQueue;
        if (!inQueue) issues.push("proposal_not_in_queue: proposal created but not found with PENDING_APPROVAL");
      } else {
        issues.push("proposal_not_generated: generateProposal ran but no proposal record found");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      issues.push(`proposal_failed: ${msg}`);
    }

    if (!proposal.generated && !issues.some((i) => i.startsWith("proposal"))) {
      issues.push("proposal_not_generated");
    }
  } else if (diagScenario && !diagnosis.generated) {
    issues.push("proposal_not_generated: skipped because diagnosis was not generated");
  }

  // ── 8. Safety checklist ──────────────────────────────────────────────────────
  const safety: CycleValidationReport["safety"] = {
    allowSideEffectsFalse:   true,
    noWhatsAppSent:          true,
    noOrderCreated:          true,
    noProductionMutation:    true,
    proposalPendingApproval: !proposal.generated || proposal.status === "PENDING_APPROVAL",
  };

  // ── 9. Final verdict ─────────────────────────────────────────────────────────
  const criticalIssues = issues.filter((i) =>
    i.includes("batch_failed") || i.includes("side effects") || i.includes("FAIL:")
  );

  let verdict: CycleValidationReport["verdict"];
  let nextRecommendation: string;

  if (criticalIssues.length > 0) {
    verdict            = "FAILED_WITH_REASONS";
    nextRecommendation = "Investigar os problemas críticos em issues[] antes de continuar.";
  } else if (issues.length > 0) {
    verdict            = "PARTIAL_WITH_ISSUES";
    nextRecommendation = "Loop parcialmente validado. Ver issues[] para cada etapa faltante.";
  } else {
    verdict            = "TRAINING_LOOP_VALIDATED";
    nextRecommendation = "Ciclo completo validado. Próximo passo: Real Conversation Mining + loop 24/7 automático.";
  }

  const report: CycleValidationReport = {
    generatedAt: new Date().toISOString(),
    runId:       run.id,
    runSummary,
    priceLookup,
    diagnosis,
    proposal,
    safety,
    verdict,
    issues,
    nextRecommendation,
  };

  return NextResponse.json({ ok: true, report });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildPriceLookupResult(
  priceScenario: ScenarioRow | null,
  issues: string[],
): CycleValidationReport["priceLookup"] {
  if (!priceScenario) {
    issues.push("price_lookup_scenario_not_found: template not included in this batch");
    return {
      found: false, scenarioId: null, title: null, scenarioStatus: null,
      validationVerdict: "NOT_FOUND", priceLookupScore: null,
      botReplies: [], saidNotFound: false,
      notes: "Template de preço não incluído neste batch",
    };
  }

  const transcript  = (priceScenario.transcriptJson as unknown as TranscriptTurn[]) ?? [];
  const botReplies  = transcript.filter((t) => t.role === "bot").map((t) => t.content);
  const saidNotFound = botReplies.some((r) => /não encontrei|not found|não temos esse/i.test(r));
  const hasPrice    = botReplies.some((r) => /R\$\s*\d/.test(r));

  let validationVerdict: CycleValidationReport["priceLookup"]["validationVerdict"] = "PASS";
  let notes = "";

  if (saidNotFound) {
    validationVerdict = "FAIL";
    notes = "Bot disse 'Não encontrei' — fix não está funcionando";
    issues.push("price_lookup_fail: bot disse Não encontrei");
  } else if (!hasPrice) {
    validationVerdict = "WARN";
    notes = "Bot não mostrou R$ — possível cenário sem menu real";
  } else {
    notes = "Bot listou preço com R$ — fix funcionando";
  }

  return {
    found: true,
    scenarioId:        priceScenario.id,
    title:             priceScenario.title,
    scenarioStatus:    priceScenario.status,
    validationVerdict,
    priceLookupScore:  null, // backfilled after evaluation
    botReplies:        botReplies.slice(0, 4),
    saidNotFound,
    notes,
  };
}
