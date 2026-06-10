/**
 * AgentTrainingEvaluatorService
 *
 * Uses GPT-4o to evaluate a training scenario transcript against 15 criteria.
 * Scores 0-100 per dimension. Stores result in AgentTrainingEvaluation.
 *
 * SAFETY: evaluation is read-only — it never triggers any side effects.
 */

import { openai } from "@/lib/openai";
import { prisma } from "@/lib/prisma";
import type { EvaluationScores, TranscriptTurn } from "./types";

const EVALUATOR_MODEL = "gpt-4o";

const EVALUATION_SYSTEM_PROMPT = `Você é um avaliador de qualidade de agentes de atendimento WhatsApp para restaurantes brasileiros.
Avalie a conversa com base nos 9 critérios abaixo. Responda APENAS em JSON válido, sem texto adicional.

Critérios de avaliação (cada um de 0 a 100):
1. conversionScore: O bot conduziu o cliente até finalizar o pedido?
2. clarityScore: As respostas foram claras, diretas e em português correto?
3. safetyScore: O bot NÃO inventou produtos, preços ou informações que não existem? (100=sem invenção, 0=inventou algo)
4. frictionScore: (invertido — 100 = sem fricção) O cliente ficou travado, teve que repetir ou o bot fez perguntas desnecessárias?
5. menuAccuracyScore: O bot usou apenas itens reais do cardápio apresentado?
6. orderCompletionScore: O pedido foi concluído ou o fluxo foi completado corretamente?
7. handoffScore: Quando solicitado atendente humano, foi tratado corretamente? (se não houve pedido de atendente, dê 100)
8. priceLookupScore: Quando o cliente perguntou o preço de um produto, o bot respondeu com o preço real do cardápio? (100=respondeu com preço real, 50=deu resposta genérica ou enviou link do cardápio, 0=disse que não encontrou quando o produto existe, ou inventou preço. Se não houve pergunta de preço, dê 100)
9. overallScore: Pontuação geral da conversa considerando todos os critérios.

ATENÇÃO — falhas graves que devem ser detectadas:
- Bot diz "não encontrei X" quando X existe no cardápio e é pedido com sucesso depois → priceLookupScore=0, frictionScore baixo, safetyScore=80
- Bot envia link do cardápio quando deveria responder diretamente → priceLookupScore=50
- Bot inventa preços → safetyScore=0, priceLookupScore=0
- Bot faz a mesma pergunta duas vezes seguidas → frictionScore=20-40
- Bot pede entrega/retirada antes de ter o item confirmado → frictionScore baixo
- Bot não completa o pedido quando o cliente claramente quis pedir → conversionScore baixo, orderCompletionScore baixo

Resposta esperada (JSON):
{
  "conversionScore": 80,
  "clarityScore": 90,
  "safetyScore": 100,
  "frictionScore": 70,
  "menuAccuracyScore": 95,
  "orderCompletionScore": 85,
  "handoffScore": 100,
  "priceLookupScore": 100,
  "overallScore": 88,
  "verdict": "PASS",
  "strengths": "O bot foi claro e concluiu o pedido sem fricção.",
  "weaknesses": "Poderia ter confirmado o endereço antes de apresentar o Pix.",
  "safetyIssues": null,
  "conversionIssues": null,
  "frictionIssues": "Cliente teve que repetir o endereço duas vezes.",
  "recommendation": "Confirmar endereço antes de avançar para pagamento."
}

Critérios para verdict:
- PASS: overallScore >= 75 E safetyScore >= 95
- WARN: overallScore entre 50-74 OU safetyScore entre 80-94 OU priceLookupScore < 60
- FAIL: overallScore < 50 OU safetyScore < 80`;

// ── Core evaluation ───────────────────────────────────────────────────────────

export async function evaluateScenario(opts: {
  scenarioId:     string;
  transcript:     TranscriptTurn[];
  expectedOutcome?: Record<string, unknown>;
}): Promise<void> {
  const { scenarioId, transcript, expectedOutcome } = opts;

  const transcriptText = transcript
    .map((t) => `${t.role === "customer" ? "Cliente" : "Bot"}: ${t.content}`)
    .join("\n");

  const userMessage = [
    "Avalie a seguinte conversa de WhatsApp:",
    "---",
    transcriptText,
    "---",
    expectedOutcome
      ? `Resultado esperado: ${JSON.stringify(expectedOutcome)}`
      : "",
  ].filter(Boolean).join("\n");

  let parsed: Partial<EvaluationScores & {
    verdict:          string;
    strengths:        string | null;
    weaknesses:       string | null;
    safetyIssues:     string | null;
    conversionIssues: string | null;
    frictionIssues:   string | null;
    recommendation:   string | null;
  }>;
  try {
    const response = await openai.chat.completions.create({
      model:           EVALUATOR_MODEL,
      messages:        [
        { role: "system", content: EVALUATION_SYSTEM_PROMPT },
        { role: "user",   content: userMessage },
      ],
      temperature:     0.1,
      max_tokens:      600,
      response_format: { type: "json_object" },
    });
    const raw = response.choices[0]?.message?.content ?? "{}";
    // Strip markdown fences defensively (belt + suspenders alongside json_object)
    const clean = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    parsed = JSON.parse(clean);
  } catch (err) {
    console.error("[AgentTrainingEvaluator] GPT parse failed — using fallback scores:", err);
    // Fallback: store conservative 50-point scores so the scenario stays WARN and
    // can be re-evaluated later, rather than crashing the whole batch.
    parsed = {
      verdict:    "WARN",
      weaknesses: "Avaliação GPT-4o indisponível — scores de fallback aplicados.",
    };
  }

  const scoreJson: EvaluationScores = {
    conversionScore:      parsed.conversionScore      ?? 50,
    clarityScore:         parsed.clarityScore         ?? 50,
    safetyScore:          parsed.safetyScore          ?? 50,
    frictionScore:        parsed.frictionScore        ?? 50,
    menuAccuracyScore:    parsed.menuAccuracyScore    ?? 50,
    orderCompletionScore: parsed.orderCompletionScore ?? 50,
    handoffScore:         parsed.handoffScore         ?? 100,
    priceLookupScore:     (parsed as Record<string, unknown>)["priceLookupScore"] as number ?? 100,
    overallScore:         parsed.overallScore         ?? 50,
  };

  const verdict = (parsed.verdict ?? "WARN") as "PASS" | "WARN" | "FAIL";

  // Store evaluation
  await prisma.agentTrainingEvaluation.create({
    data: {
      scenarioId,
      evaluatorModel:  EVALUATOR_MODEL,
      scoreJson:       scoreJson as unknown as Parameters<typeof prisma.agentTrainingEvaluation.create>[0]["data"]["scoreJson"],
      verdict,
      strengths:        parsed.strengths        ?? null,
      weaknesses:       parsed.weaknesses       ?? null,
      safetyIssues:     parsed.safetyIssues     ?? null,
      conversionIssues: parsed.conversionIssues ?? null,
      frictionIssues:   parsed.frictionIssues   ?? null,
      recommendation:   parsed.recommendation   ?? null,
    },
  });

  // Update scenario with AI-evaluated score and status
  await prisma.agentTrainingScenario.update({
    where: { id: scenarioId },
    data:  {
      score:  scoreJson.overallScore,
      status: verdict,
      failureSummary: verdict === "FAIL"
        ? (parsed.weaknesses ?? "Falha detectada pelo avaliador.")
        : null,
    },
  });
}

// ── Evaluate all pending scenarios in a run ───────────────────────────────────

export async function evaluateRun(runId: string): Promise<void> {
  const scenarios = await prisma.agentTrainingScenario.findMany({
    where: { runId, status: { not: "PENDING" } },
    select: { id: true, transcriptJson: true, expectedOutcomeJson: true },
  });

  for (const s of scenarios) {
    await evaluateScenario({
      scenarioId:      s.id,
      transcript:      s.transcriptJson as unknown as TranscriptTurn[],
      expectedOutcome: s.expectedOutcomeJson as unknown as Record<string, unknown> | undefined,
    });
    // Small delay to avoid rate limiting
    await new Promise((r) => setTimeout(r, 300));
  }
}
