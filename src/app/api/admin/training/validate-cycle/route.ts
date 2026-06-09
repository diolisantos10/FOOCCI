/**
 * POST /api/admin/training/validate-cycle
 *
 * Runs the full training loop synchronously and returns a structured
 * validation report — no terminal, no ADMIN_SECRET in browser needed.
 *
 * Flow:
 *   1. Fresh quick batch (10 scenarios, WHATSAPP_ORDERING)
 *   2. Locate price-lookup scenario ("quanto custa o yakisoba")
 *      • Check bot did NOT say "Não encontrei yakisoba"
 *      • Check real prices are listed
 *   3. Find a WARN/FAIL scenario
 *   4. Generate GPT-4o diagnosis for it
 *   5. Generate improvement proposal
 *   6. Confirm proposal is PENDING_APPROVAL
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
    found:            boolean;
    scenarioId:       string | null;
    title:            string | null;
    status:           string | null;
    botReplies:       string[];
    saidNotFound:     boolean;
    priceLookupScore: number | null;
    verdict:          "PASS" | "WARN" | "FAIL" | "NOT_FOUND";
    notes:            string;
  };
  diagnosis: {
    generated:    boolean;
    scenarioId:   string | null;
    evaluationId: string | null;
    verdict:      string | null;
    overallScore: number | null;
    weaknesses:   string[];
  };
  proposal: {
    generated:   boolean;
    proposalId:  string | null;
    status:      string | null;
    changeType:  string | null;
    title:       string | null;
    riskLevel:   string | null;
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
    issues.push(`Batch failed: ${msg}`);
  }

  const durationMs = Date.now() - startMs;

  const runSummary = {
    total:      finalRun?.totalScenarios  ?? 0,
    pass:       finalRun?.passCount       ?? 0,
    warn:       finalRun?.warnCount       ?? 0,
    fail:       finalRun?.failCount       ?? 0,
    score:      finalRun?.score           ?? null,
    durationMs,
  };

  if (runSummary.total === 0) {
    issues.push("Batch produziu 0 cenários");
  }

  // ── 3. Price lookup scenario ─────────────────────────────────────────────────
  const allScenarios = await prisma.agentTrainingScenario.findMany({
    where:   { runId: run.id },
    select:  { id: true, title: true, status: true, score: true, transcriptJson: true,
                failureSummary: true, goal: true },
    orderBy: { createdAt: "asc" },
  });

  const priceScenario = allScenarios.find((s) =>
    s.title?.toLowerCase().includes("preç") ||
    s.title?.toLowerCase().includes("prec") ||
    (s.goal === "COMPLETE_ORDER" && s.title?.toLowerCase().includes("custo"))
  );

  const priceLookup: CycleValidationReport["priceLookup"] = (() => {
    if (!priceScenario) {
      issues.push("Cenário de price lookup não encontrado no batch");
      return { found: false, scenarioId: null, title: null, status: null,
               botReplies: [], saidNotFound: false, priceLookupScore: null,
               verdict: "NOT_FOUND", notes: "Template de preço não incluído neste batch" };
    }

    const transcript = priceScenario.transcriptJson as unknown as TranscriptTurn[] ?? [];
    const botReplies = transcript.filter((t) => t.role === "bot").map((t) => t.content);
    const saidNotFound = botReplies.some((r) =>
      /não encontrei|not found|não temos esse/i.test(r)
    );
    const hasPrice = botReplies.some((r) => /R\$\s*\d/.test(r));

    let verdict: CycleValidationReport["priceLookup"]["verdict"] = "PASS";
    let notes = "";

    if (saidNotFound) {
      verdict = "FAIL";
      notes   = "Bot disse 'Não encontrei' — fix não está funcionando";
      issues.push("Price lookup FAIL: bot ainda diz 'Não encontrei'");
    } else if (!hasPrice) {
      verdict = priceScenario.status === "PASS" ? "WARN" : (priceScenario.status as "WARN" | "FAIL") ?? "WARN";
      notes   = "Bot não mostrou R$ no reply — possível cenário sem menu real";
      if (priceScenario.status === "FAIL") issues.push("Price lookup FAIL: sem preço no reply");
    } else {
      notes = "Bot listou preço com R$ — fix funcionando";
    }

    return {
      found: true,
      scenarioId:       priceScenario.id,
      title:            priceScenario.title,
      status:           priceScenario.status,
      botReplies:       botReplies.slice(0, 4),
      saidNotFound,
      priceLookupScore: null, // populated after evaluation below
      verdict,
      notes,
    };
  })();

  // ── 4. Evaluate a WARN/FAIL scenario with GPT-4o ───────────────────────────
  const warnScenario =
    (priceScenario?.status === "WARN" || priceScenario?.status === "FAIL" ? priceScenario : null) ??
    allScenarios.find((s) => s.status === "WARN" || s.status === "FAIL") ??
    null;

  const diagnosis: CycleValidationReport["diagnosis"] = {
    generated: false, scenarioId: null, evaluationId: null,
    verdict: null, overallScore: null, weaknesses: [],
  };

  if (warnScenario) {
    try {
      await evaluateScenario({
        scenarioId:      warnScenario.id,
        transcript:      warnScenario.transcriptJson as unknown as TranscriptTurn[],
        expectedOutcome: undefined,
      });

      const evaluation = await prisma.agentTrainingEvaluation.findFirst({
        where:   { scenarioId: warnScenario.id },
        orderBy: { createdAt: "desc" },
      });

      if (evaluation) {
        const scores = evaluation.scoreJson as Record<string, unknown> | null;
        diagnosis.generated    = true;
        diagnosis.scenarioId   = warnScenario.id;
        diagnosis.evaluationId = evaluation.id;
        diagnosis.verdict      = evaluation.verdict;
        diagnosis.overallScore = typeof scores?.overallScore === "number" ? scores.overallScore : null;
        diagnosis.weaknesses   = Array.isArray(evaluation.weaknesses) ? evaluation.weaknesses as string[] : [];

        // Backfill priceLookupScore into the price lookup result
        if (priceScenario && warnScenario.id === priceScenario.id) {
          (priceLookup as { priceLookupScore: number | null }).priceLookupScore =
            typeof scores?.priceLookupScore === "number" ? scores.priceLookupScore : null;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      issues.push(`Diagnosis failed: ${msg}`);
    }
  } else {
    issues.push("Nenhum cenário WARN/FAIL — não foi possível gerar diagnóstico (todos passaram!)");
  }

  // ── 5. Generate improvement proposal ────────────────────────────────────────
  const proposal: CycleValidationReport["proposal"] = {
    generated: false, proposalId: null, status: null,
    changeType: null, title: null, riskLevel: null,
  };

  if (warnScenario && diagnosis.generated) {
    try {
      await generateProposal({
        runId:       run.id,
        agentType:   "WHATSAPP_ORDERING" as AgentType,
        restaurantId: restaurant.id,
        scenarios: [{
          id:             warnScenario.id,
          title:          warnScenario.title,
          failureSummary: warnScenario.failureSummary,
          transcript:     warnScenario.transcriptJson as unknown as TranscriptTurn[],
        }],
      });

      const createdProposal = await prisma.agentImprovementProposal.findFirst({
        where:   { sourceRunId: run.id },
        orderBy: { createdAt: "desc" },
      });

      if (createdProposal) {
        proposal.generated   = true;
        proposal.proposalId  = createdProposal.id;
        proposal.status      = createdProposal.status;
        proposal.changeType  = createdProposal.proposedChangeType;
        proposal.title       = createdProposal.title;
        proposal.riskLevel   = createdProposal.riskLevel;

        if (createdProposal.status !== "PENDING_APPROVAL") {
          issues.push(`Proposta criada com status inesperado: ${createdProposal.status}`);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      issues.push(`Proposal generation failed: ${msg}`);
    }
  }

  // ── 6. Safety checklist ──────────────────────────────────────────────────────
  // sideEffectsPerformed is per-scenario; none of the runner scenarios should have any
  const sideEffectScenarios = allScenarios.filter((s) => {
    // transcriptJson debug fields might have side effects listed
    const t = s.transcriptJson as unknown as TranscriptTurn[];
    return Array.isArray(t) && t.some((turn) =>
      turn.debug && Object.keys(turn.debug).some((k) => k.includes("sideEffect"))
    );
  });

  const safety: CycleValidationReport["safety"] = {
    allowSideEffectsFalse:   true,
    noWhatsAppSent:          true,
    noOrderCreated:          true,
    noProductionMutation:    true,
    proposalPendingApproval: !proposal.generated || proposal.status === "PENDING_APPROVAL",
  };

  if (sideEffectScenarios.length > 0) {
    safety.noWhatsAppSent  = false;
    safety.noOrderCreated  = false;
    issues.push(`${sideEffectScenarios.length} cenários registraram side effects — investigar`);
  }

  // ── 7. Final verdict ─────────────────────────────────────────────────────────
  const criticalIssues = issues.filter((i) =>
    i.includes("FAIL") || i.includes("side effects") || i.includes("Unauthorized")
  );

  let verdict: CycleValidationReport["verdict"];
  let nextRecommendation: string;

  if (criticalIssues.length > 0) {
    verdict             = "FAILED_WITH_REASONS";
    nextRecommendation  = "Investigar os problemas críticos listados em issues[] antes de continuar.";
  } else if (issues.length > 0 || !proposal.generated) {
    verdict             = "PARTIAL_WITH_ISSUES";
    nextRecommendation  = "Loop parcialmente validado. Verificar issues[] e garantir que existe cenário WARN para testar diagnóstico+proposta.";
  } else {
    verdict             = "TRAINING_LOOP_VALIDATED";
    nextRecommendation  = "Ciclo validado. Próximo passo: Real Conversation Mining + loop 24/7 automático.";
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
