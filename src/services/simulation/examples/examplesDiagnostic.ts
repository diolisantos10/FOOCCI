/**
 * Examples diagnostic — proves, end-to-end and safely, the real-conversation
 * example pipeline: synthetic conversation WITH PII → sanitize → create example
 * (PENDING) → approve → approved example influences the generator → no literal
 * copy → no PII leak → cleanup. Fully dry-run; never throws; runtimeTouched=false.
 *
 * Uses a synthetic conversation with deliberate PII (no real customer). The
 * example is scoped to a unique synthetic sourceId and deleted at the end.
 */

import { prisma } from "@/lib/prisma";
import { sanitizeText, sanitizeTranscript, detectRiskFlags } from "../simulationSanitizer";
import { classifyIntent } from "./intentClassifier";
import { reviewExample, getApprovedExampleSeeds } from "./SimulationExampleStore";
import { runWaiterSimulation } from "../waiter/runWaiterSimulation";
import type { TranscriptTurn } from "../types";

const AGENT = "waiter";

/** Synthetic conversation with deliberate PII (NOT a real customer). */
const DIAG_CUSTOMER_MESSAGE =
  "Oi, sou a Maria, meu telefone é 11999998888, meu email é maria@email.com, moro na Rua das Flores 50, CPF 123.456.789-09. Queria uma opção mais em conta para jantar.";
const DIAG_AGENT_MESSAGE = "Claro, posso te ajudar com opções custo-benefício.";

/** Raw PII tokens that must NEVER survive into storage or generated text. */
const PII_TOKENS = ["Maria", "11999998888", "maria@email.com", "Rua das Flores", "123.456.789-09"];

export interface ExamplesDiagnosticResult {
  ok: boolean;
  status: "PASS" | "FAIL";
  stage?: string;
  exampleCreated: boolean;
  sanitizationPassed: boolean;
  approvedForSimulation: boolean;
  inspiredScenarios: number;
  literalLeak: boolean;
  piiLeak: boolean;
  p0Count: number;
  runtimeTouched: false;
  cleanup: boolean;
  message: string;
}

export async function runExamplesDiagnostic(): Promise<ExamplesDiagnosticResult> {
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const sourceId = `__examples_diag_${stamp}`;
  let exampleId: string | null = null;

  const res: ExamplesDiagnosticResult = {
    ok: false,
    status: "FAIL",
    exampleCreated: false,
    sanitizationPassed: false,
    approvedForSimulation: false,
    inspiredScenarios: 0,
    literalLeak: false,
    piiLeak: false,
    p0Count: -1,
    runtimeTouched: false,
    cleanup: false,
    message: "",
  };

  try {
    // 1+2. Build the synthetic conversation and sanitize it.
    const rawTranscript: TranscriptTurn[] = [
      { role: "customer", content: DIAG_CUSTOMER_MESSAGE },
      { role: "agent", content: DIAG_AGENT_MESSAGE },
    ];
    const sanitized = sanitizeTranscript(rawTranscript);
    const transcriptStr = JSON.stringify(sanitized);

    // 3. Sanitization must remove every raw PII token.
    res.sanitizationPassed = PII_TOKENS.every((t) => !transcriptStr.includes(t));
    if (!res.sanitizationPassed) {
      res.stage = "sanitization";
      res.message = "Sanitização falhou — PII bruto sobreviveu no transcript.";
      return await finalize(res, exampleId);
    }

    // 4. Create the example — PENDING, not approved, raw transcript never stored.
    const { intent, scenarioType } = classifyIntent(sanitizeText(DIAG_CUSTOMER_MESSAGE));
    const created = await prisma.agentSimulationExample.create({
      data: {
        agentSlug: AGENT,
        restaurantId: null,
        sourceType: "GENERATED",
        sourceId,
        channel: "DIAGNOSTIC",
        intent,
        scenarioType,
        sanitizedTranscript: transcriptStr,
        summary: `diagnóstico: ${intent} · ${scenarioType}`,
        labels: JSON.stringify([scenarioType, intent]),
        riskFlags: JSON.stringify(detectRiskFlags(DIAG_CUSTOMER_MESSAGE)),
        status: "PENDING_REVIEW",
        isApprovedForSimulation: false,
      },
      select: { id: true, status: true, isApprovedForSimulation: true },
    });
    exampleId = created.id;
    res.exampleCreated = true;
    if (created.status !== "PENDING_REVIEW" || created.isApprovedForSimulation) {
      res.stage = "pending";
      res.message = "Exemplo não nasceu pendente/não-aprovado.";
      return await finalize(res, exampleId);
    }

    // 5. Approve it (human step, simulated) → must become usable.
    const approved = await reviewExample(created.id, "APPROVED", "examples-diagnostic");
    res.approvedForSimulation = approved.isApprovedForSimulation === true;
    if (!res.approvedForSimulation) {
      res.stage = "approve";
      res.message = "Aprovação não habilitou o exemplo para simulação.";
      return await finalize(res, exampleId);
    }

    // 6. The approved example must surface via the generator query, then bias it.
    const seeds = await getApprovedExampleSeeds(AGENT);
    const ourSeed = seeds.find((s) => s.exampleId === created.id);
    if (!ourSeed) {
      res.stage = "approve_query";
      res.message = "Exemplo aprovado não apareceu na consulta de seeds.";
      return await finalize(res, exampleId);
    }

    // 7. Run a PURE simulation (no persistence) biased by our approved example.
    const sim = await runWaiterSimulation({ seed: `examples-diag-${stamp}`, scenarioCount: 12, examples: [ourSeed] });
    res.p0Count = sim.p0Count;
    res.inspiredScenarios = sim.scenarios.filter(
      (s) => (s.scenario.customerConstraints as Record<string, unknown>).inspiredByExampleId,
    ).length;

    // Generated text must not copy the conversation literally nor leak PII.
    const genText = sim.scenarios
      .map((s) => `${s.scenario.initialMessage} ${s.output.finalMessage}`)
      .join(" ");
    res.literalLeak =
      PII_TOKENS.some((t) => genText.includes(t)) || genText.includes(created.id) || genText.includes(DIAG_CUSTOMER_MESSAGE);
    res.piiLeak = detectRiskFlags(genText).length > 0;

    const pass =
      res.sanitizationPassed &&
      res.exampleCreated &&
      res.approvedForSimulation &&
      res.inspiredScenarios >= 1 &&
      !res.literalLeak &&
      !res.piiLeak &&
      res.p0Count === 0;

    if (!pass) {
      res.stage = res.inspiredScenarios < 1 ? "generator" : res.literalLeak || res.piiLeak ? "leak" : "p0";
      res.message = "Validação do pipeline de exemplos falhou.";
      return await finalize(res, exampleId);
    }

    res.status = "PASS";
    res.ok = true;
    res.message = "Simulation examples diagnostic validated successfully.";
    return await finalize(res, exampleId);
  } catch (err) {
    res.stage = res.stage ?? "exception";
    res.message = err instanceof Error ? err.message.slice(0, 180) : "erro desconhecido";
    return await finalize(res, exampleId);
  }
}

/** Deletes the synthetic example and confirms nothing test-related remains. */
async function finalize(res: ExamplesDiagnosticResult, exampleId: string | null): Promise<ExamplesDiagnosticResult> {
  try {
    if (exampleId) await prisma.agentSimulationExample.deleteMany({ where: { id: exampleId } });
    const leftover = exampleId ? await prisma.agentSimulationExample.count({ where: { id: exampleId } }) : 0;
    res.cleanup = leftover === 0;
  } catch {
    res.cleanup = false;
  }
  res.ok = res.status === "PASS";
  return res;
}
