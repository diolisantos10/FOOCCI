/**
 * AISimulatorService
 *
 * Runs isolated sandboxed conversations against the real AI ordering logic
 * (PromptBuilderService, UpsellEngine, openai, AI_TOOL_DEFINITIONS, executeTool).
 *
 * For each scenario:
 *   1. Create temp Customer + Conversation in the DB.
 *   2. Execute 1–2 AI turns with real services, capturing transcripts.
 *   3. Evaluate the conversation against scenario-specific checks.
 *   4. Delete all temp records regardless of outcome.
 *
 * Nothing is sent to WhatsApp — Evolution API is not called.
 * No AIInteractionLog is written (minor deviation from production noted in report).
 */

import { prisma } from "@/lib/prisma";
import { openai } from "@/lib/openai";
import { BrandConfigService } from "./BrandConfigService";
import { PromptBuilderService } from "./PromptBuilderService";
import { UpsellEngine } from "./UpsellEngine";
import { buildSalesProfile } from "./SalesProfile";
import { resolveMaxTokens } from "./BehaviorEngine";
import { AI_TOOL_DEFINITIONS, executeTool, type ToolContext } from "./AITools";
import { getAlreadySuggestedIds } from "./ConversationGuardrails";
import { isBlockedByDietary } from "./ConversationGuardrails";
import { ConversationStatus } from "@prisma/client";
import type OpenAI from "openai";
import { generateScenarios } from "./ScenarioGenerator";

const MAX_TOOL_ITERATIONS = 6;

// ─── public types ─────────────────────────────────────────────

export type CheckType =
  | "relevant_suggestion"
  | "no_hallucination"
  | "dietary_respected"
  | "no_repeat_suggestion"
  | "no_loop"
  | "checkout_transition"
  | "clarification_asked"
  | "natural_tone";

export interface CheckResult {
  type: CheckType;
  label: string;
  passed: boolean;
  detail: string;
}

export interface TurnTranscript {
  role: "customer" | "ai";
  content: string;
  toolCalls: Array<{ name: string; success: boolean; detail: string }>;
}

export interface SalesMetrics {
  finalCartValue:       number;
  totalItems:           number;
  upsellAttempts:       number;
  acceptedSuggestions:  number;
  rejectedSuggestions:  number;
  conversionSuccess:    boolean;
  acceptedUpsellsOnly:  number;  // add_item calls that originated from suggest_upsell
  upsellValueGenerated: number;  // price × qty for each accepted upsell item
}

export interface ScenarioResult {
  id: string;
  name: string;
  description: string;
  expectedBehavior: string;
  status: "passed" | "warning" | "failed";
  score: number;
  transcript: TurnTranscript[];
  checks: CheckResult[];
  issues: string[];
  salesMetrics: SalesMetrics;
}

export interface SimulationReport {
  overallScore: number;
  scenarios: ScenarioResult[];
  criticalBugs: string[];
  topFixes: string[];
  safeToTest: boolean;
  ranAt: string;
  restaurantName: string;
  avgTicket:       number;
  avgItems:        number;
  conversionRate:  number;
}

type ProgressCallback = (info: { current: number; total: number; scenarioName: string }) => void;
type ResultCallback   = (result: ScenarioResult) => void;

// ─── scenario definition (exported for ScenarioGenerator) ────

export interface ScenarioDef {
  id: string;
  name: string;
  description: string;
  expectedBehavior: string;
  turns: Array<{ customer: string }>;
  dietary?: string[];
  allergies?: string[];
  checks: CheckType[];
}

// ─── check labels ─────────────────────────────────────────────

const CHECK_LABELS: Record<CheckType, string> = {
  relevant_suggestion:  "Sugestão de produto relevante",
  no_hallucination:     "Sem produtos inventados",
  dietary_respected:    "Restrições alimentares respeitadas",
  no_repeat_suggestion: "Sem repetição de sugestões",
  no_loop:              "Sem loops de tool calls",
  checkout_transition:  "Transição para checkout",
  clarification_asked:  "Pediu esclarecimento em vez de adivinhar",
  natural_tone:         "Tom de resposta adequado",
};

// ─── public service ───────────────────────────────────────────

export class AISimulatorService {
  static async run(
    restaurantId: string,
    onProgress: ProgressCallback,
    onResult: ResultCallback,
  ): Promise<SimulationReport> {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { name: true },
    });

    // Load full menu for evaluation (name + ingredients per item)
    const menu = await prisma.menuItem.findMany({
      where: { isActive: true, category: { restaurantId } },
      select: { id: true, name: true, ingredients: true, price: true },
    });

    const scenarios = generateScenarios(10);
    const results: ScenarioResult[] = [];

    for (let i = 0; i < scenarios.length; i++) {
      const scenario = scenarios[i]!;
      onProgress({ current: i + 1, total: scenarios.length, scenarioName: scenario.name });

      const result = await runScenario(scenario, restaurantId, menu).catch((err) => {
        console.error(`[AISimulator] Scenario "${scenario.id}" failed:`, err);
        return buildErrorResult(scenario, String(err));
      });

      results.push(result);
      onResult(result);
    }

    return buildReport(results, restaurant?.name ?? restaurantId);
  }
}

// ─── scenario runner ──────────────────────────────────────────

async function runScenario(
  scenario: ScenarioDef,
  restaurantId: string,
  menu: Array<{ id: string; name: string; ingredients: string | null; price: unknown }>,
): Promise<ScenarioResult> {
  // Create sandbox records
  const runId = `SIM_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const simPhone = `+5500${runId.slice(-10).padEnd(10, "0")}`;

  const customer = await prisma.customer.create({
    data: {
      restaurantId,
      name: `[SIM] ${scenario.name}`,
      phone: simPhone,
    },
  });

  // Create dietary preferences if scenario requires them
  if ((scenario.dietary?.length ?? 0) > 0 || (scenario.allergies?.length ?? 0) > 0) {
    await prisma.customerPreference.create({
      data: {
        customerId: customer.id,
        dietary:   scenario.dietary   ?? [],
        allergies: scenario.allergies ?? [],
      },
    });
  }

  const conversation = await prisma.conversation.create({
    data: {
      restaurantId,
      customerId: customer.id,
      status: ConversationStatus.BOT,
    },
  });

  const transcript: TurnTranscript[] = [];
  const allToolCalls: TurnToolCall[] = [];
  let salesMetrics: SalesMetrics = emptyMetrics();

  try {
    for (const turn of scenario.turns) {
      // Record customer message
      transcript.push({ role: "customer", content: turn.customer, toolCalls: [] });

      const turnResult = await executeSimulatedTurn({
        conversationId: conversation.id,
        restaurantId,
        customerId:     customer.id,
        customerMessage: turn.customer,
      });

      allToolCalls.push(...turnResult.toolCalls);

      transcript.push({
        role:      "ai",
        content:   turnResult.text,
        toolCalls: turnResult.toolCalls.map((tc) => ({
          name:    tc.name,
          success: tc.success,
          detail:  tc.resultMsg,
        })),
      });
    }

    // Capture real cart state before sandbox is deleted
    const cart = await getCartSnapshot(customer.id, restaurantId);
    salesMetrics = computeSalesMetrics(allToolCalls, cart.value, cart.itemCount);
  } finally {
    await cleanupSimulation(customer.id, conversation.id);
  }

  return evaluateScenario(scenario, transcript, allToolCalls, menu, salesMetrics);
}

// ─── turn executor ────────────────────────────────────────────

interface TurnParams {
  conversationId: string;
  restaurantId:   string;
  customerId:     string;
  customerMessage: string;
}

interface TurnToolCall {
  name:       string;
  args:       unknown;
  success:    boolean;
  resultMsg:  string;
  resultData: unknown;
}

interface TurnResult {
  text:      string;
  toolCalls: TurnToolCall[];
}

async function executeSimulatedTurn(params: TurnParams): Promise<TurnResult> {
  const { conversationId, restaurantId, customerId, customerMessage } = params;

  // Insert customer message into conversation
  await prisma.message.create({
    data: {
      conversationId,
      direction: "INBOUND",
      content:   customerMessage,
      type:      "TEXT",
      sentAt:    new Date(),
    },
  });

  // Load brand config + restaurant name
  const [brandConfig, restaurantRow] = await Promise.all([
    BrandConfigService.getOrDefault(restaurantId),
    prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { name: true } }),
  ]);
  const restaurantName = restaurantRow?.name ?? "";
  const salesProfile   = buildSalesProfile(brandConfig, restaurantName);

  // Find existing OPEN draft
  const existingDraft = await prisma.orderDraft.findFirst({
    where:   { restaurantId, customerId, status: "OPEN" },
    orderBy: { createdAt: "desc" },
    select:  { id: true },
  });

  let draftId: string | null = existingDraft?.id ?? null;
  let handoffRequested = false;

  const toolCtx: ToolContext = {
    restaurantId,
    conversationId,
    customerId,
    draftId,
    setDraftId:     (id) => { draftId = id; toolCtx.draftId = id; },
    requestHandoff: ()   => { handoffRequested = true; },
    upsellSuggestedThisTurn: false,
  };

  // Guardrail data
  const [alreadySuggestedIds, customerPrefs] = await Promise.all([
    getAlreadySuggestedIds(conversationId),
    prisma.customerPreference.findUnique({
      where:  { customerId },
      select: { dietary: true, allergies: true },
    }),
  ]);

  const customerDietary   = customerPrefs?.dietary   ?? [];
  const customerAllergies = customerPrefs?.allergies ?? [];

  // Upsell suggestions (real UpsellEngine)
  const upsellResult = await UpsellEngine.suggest(
    restaurantId,
    draftId,
    salesProfile.salesPriority,
    alreadySuggestedIds,
    customerDietary,
    customerAllergies,
    salesProfile.targetTicket,
    salesProfile.targetItems,
  );
  const { suggestions: upsellSuggestions, cartValue, cartItemCount, valueGap, itemGap } = upsellResult;

  // Build messages (real PromptBuilderService)
  const messages = await PromptBuilderService.build({
    conversationId,
    restaurantId,
    customerId,
    brandConfig,
  });

  // System addenda (mirrors AIOrderService logic exactly)
  const sysMsg = messages[0] as OpenAI.Chat.ChatCompletionSystemMessageParam;
  let sysAddendum = "";

  if (upsellSuggestions.length > 0 && brandConfig.upsellStyle !== "none") {
    sysAddendum +=
      "\n\nSUGESTÕES DE UPSELL DISPONÍVEIS (use suggest_upsell se adequado):\n" +
      upsellSuggestions
        .map((s) => `  • [ID: ${s.menuItemId}] ${s.name} — R$ ${s.price.toFixed(2)} (${s.categoryName}) — ${s.reason}`)
        .join("\n");
  }
  if (cartItemCount > 0) {
    sysAddendum += buildGoalContextAddendum(cartValue, cartItemCount, salesProfile.targetTicket, salesProfile.targetItems, valueGap, itemGap);
  }
  if (alreadySuggestedIds.size > 0) {
    sysAddendum +=
      "\n\nPRODUTOS JÁ SUGERIDOS NESTA CONVERSA (não repita):\n" +
      [...alreadySuggestedIds].map((id) => `  • ${id}`).join("\n");
  }

  if (sysAddendum) {
    messages[0] = { ...sysMsg, content: sysMsg.content + sysAddendum };
  }

  // OpenAI tool-call loop (identical to AIOrderService)
  const toolCallsMade: TurnToolCall[] = [];
  let finalResponse = "";
  const loopMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [...messages];

  for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
    const response = await openai.chat.completions.create({
      model:       brandConfig.aiModel,
      messages:    loopMessages,
      tools:       AI_TOOL_DEFINITIONS,
      tool_choice: "auto",
      max_tokens:  resolveMaxTokens(salesProfile),
      temperature: 0.3,
    });

    const choice = response.choices[0];
    if (!choice) break;

    const { finish_reason, message } = choice;
    loopMessages.push(message);

    if (finish_reason === "stop" || finish_reason === "length") {
      finalResponse = message.content ?? "";
      break;
    }

    if (finish_reason === "tool_calls" && message.tool_calls) {
      const fnCalls = message.tool_calls.filter(
        (tc): tc is Extract<typeof tc, { type: "function"; function: { name: string; arguments: string } }> =>
          tc.type === "function" && "function" in tc
      );

      for (const tc of fnCalls) {
        const result = await executeTool(tc.function.name, tc.function.arguments, toolCtx);
        let args: unknown = tc.function.arguments;
        try { args = JSON.parse(tc.function.arguments); } catch { /* keep raw */ }

        toolCallsMade.push({
          name:       tc.function.name,
          args,
          success:    result.success,
          resultMsg:  result.message,
          resultData: result.data ?? null,
        });

        loopMessages.push({
          role:         "tool",
          tool_call_id: tc.id,
          content:      JSON.stringify(result),
        });

        if (handoffRequested) break;
      }

      if (handoffRequested) break;
      continue;
    }

    finalResponse = message.content ?? "";
    break;
  }

  // Save AI response as OUTBOUND (so next turn sees conversation history)
  if (finalResponse) {
    await prisma.message.create({
      data: {
        conversationId,
        direction: "OUTBOUND",
        content:   finalResponse,
        type:      "TEXT",
        sentAt:    new Date(),
      },
    });
  }

  return { text: finalResponse, toolCalls: toolCallsMade };
}

// mirrors AIOrderService.buildGoalContext
function buildGoalContextAddendum(
  cartValue: number, cartItemCount: number,
  targetTicket: number, targetItems: number,
  valueGap: number, itemGap: number,
): string {
  const lines = [
    `\n\nCONTEXTO DE METAS (turno atual):`,
    `  Pedido: R$ ${cartValue.toFixed(2)} | ${cartItemCount} itens`,
    `  Meta:   R$ ${targetTicket.toFixed(2)} | ${targetItems} itens`,
  ];
  if (valueGap > 0 || itemGap > 0) {
    const gaps: string[] = [];
    if (valueGap > 0) gaps.push(`R$ ${valueGap.toFixed(2)} em valor`);
    if (itemGap > 0)  gaps.push(`${itemGap} itens`);
    lines.push(`  Gap: ${gaps.join(" | ")}`);
  }
  return lines.join("\n");
}

// ─── evaluation ───────────────────────────────────────────────

function evaluateScenario(
  scenario: ScenarioDef,
  transcript: TurnTranscript[],
  toolCalls: Array<{ name: string; args: unknown; success: boolean; resultMsg: string }>,
  menu: Array<{ id: string; name: string; ingredients: string | null }>,
  salesMetrics: SalesMetrics,
): ScenarioResult {
  const lastAiTurn   = [...transcript].reverse().find((t) => t.role === "ai");
  const lastAiText   = lastAiTurn?.content ?? "";
  const issues: string[] = [];
  const checks: CheckResult[] = [];

  for (const checkType of scenario.checks) {
    const r = runCheck(checkType, toolCalls, lastAiText, scenario, menu);
    checks.push(r);
    if (!r.passed) issues.push(r.detail);
  }

  const passedCount = checks.filter((c) => c.passed).length;
  const score       = checks.length > 0 ? (passedCount / checks.length) * 10 : 10;
  const status: ScenarioResult["status"] =
    score >= 7 ? "passed" : score >= 5 ? "warning" : "failed";

  return {
    id:               scenario.id,
    name:             scenario.name,
    description:      scenario.description,
    expectedBehavior: scenario.expectedBehavior,
    status,
    score,
    transcript,
    checks,
    issues,
    salesMetrics,
  };
}

function runCheck(
  type: CheckType,
  toolCalls: Array<{ name: string; args: unknown; success: boolean; resultMsg: string }>,
  lastAiText: string,
  scenario: ScenarioDef,
  menu: Array<{ id: string; name: string; ingredients: string | null }>,
): CheckResult {
  const label = CHECK_LABELS[type];

  switch (type) {
    case "no_hallucination": {
      const failed = toolCalls.filter(
        (tc) => tc.name === "add_item" && !tc.success &&
          (tc.resultMsg.includes("não encontrado") || tc.resultMsg.includes("Nunca invente"))
      );
      return {
        type, label,
        passed: failed.length === 0,
        detail: failed.length > 0
          ? `IA tentou adicionar itens inválidos: ${failed.map((tc) => (tc.args as Record<string, unknown>)?.menuItemId ?? "?").join(", ")}`
          : "Nenhum item inválido solicitado",
      };
    }

    case "relevant_suggestion": {
      const hasToolSuggestion = toolCalls.some(
        (tc) => (tc.name === "suggest_upsell" || tc.name === "add_item") && tc.success
      );
      const hasTextualContent = lastAiText.length > 50;
      return {
        type, label,
        passed: hasToolSuggestion || hasTextualContent,
        detail: hasToolSuggestion
          ? "IA sugeriu produto via ferramenta"
          : hasTextualContent
          ? "IA respondeu com conteúdo (sem tool call)"
          : "IA não sugeriu nenhum produto e resposta foi vazia",
      };
    }

    case "dietary_respected": {
      const suggestedItemIds = toolCalls
        .filter((tc) => (tc.name === "suggest_upsell" || tc.name === "add_item") && tc.success)
        .map((tc) => (tc.args as Record<string, unknown>)?.menuItemId as string | undefined)
        .filter((id): id is string => !!id);

      const violations: string[] = [];
      for (const id of suggestedItemIds) {
        const item = menu.find((m) => m.id === id);
        if (item && isBlockedByDietary(item.name, item.ingredients, scenario.dietary ?? [], scenario.allergies ?? [])) {
          violations.push(item.name);
        }
      }
      return {
        type, label,
        passed: violations.length === 0,
        detail: violations.length > 0
          ? `Itens incompatíveis sugeridos: ${violations.join(", ")}`
          : "Restrições alimentares respeitadas",
      };
    }

    case "no_repeat_suggestion": {
      const suggestions = toolCalls
        .filter((tc) => tc.name === "suggest_upsell")
        .map((tc) => (tc.args as Record<string, unknown>)?.menuItemId as string | undefined)
        .filter((id): id is string => !!id);
      const unique   = new Set(suggestions);
      const repeated = suggestions.length > unique.size;
      return {
        type, label,
        passed: !repeated,
        detail: repeated ? "Mesmo produto sugerido mais de uma vez" : "Sem repetições de sugestões",
      };
    }

    case "no_loop": {
      const countByName = new Map<string, number>();
      for (const tc of toolCalls) {
        countByName.set(tc.name, (countByName.get(tc.name) ?? 0) + 1);
      }
      const looped = [...countByName.entries()].filter(([, n]) => n > 3);
      return {
        type, label,
        passed: looped.length === 0,
        detail: looped.length > 0
          ? `Possível loop: ${looped.map(([n, c]) => `${n} x${c}`).join(", ")}`
          : "Nenhum loop detectado",
      };
    }

    case "checkout_transition": {
      const confirmed = toolCalls.some((tc) => tc.name === "confirm_order");
      const mentionedCheckout = /confirm|finaliz|pedido concluíd|resumo/i.test(lastAiText);
      return {
        type, label,
        passed: confirmed || mentionedCheckout,
        detail: confirmed
          ? "IA chamou confirm_order"
          : mentionedCheckout
          ? "IA mencionou confirmação no texto (sem tool call)"
          : "IA não encaminhou para confirmação do pedido",
      };
    }

    case "clarification_asked": {
      const hasQuestion = lastAiText.includes("?");
      return {
        type, label,
        passed: hasQuestion,
        detail: hasQuestion
          ? "IA pediu esclarecimento ao cliente"
          : "IA não fez pergunta de esclarecimento — pode ter inventado contexto",
      };
    }

    case "natural_tone": {
      const adequate = lastAiText.trim().length > 20;
      return {
        type, label,
        passed: adequate,
        detail: adequate
          ? "Resposta tem comprimento e conteúdo adequados"
          : "Resposta muito curta ou vazia",
      };
    }
  }
}

// ─── report builder ───────────────────────────────────────────

function buildReport(results: ScenarioResult[], restaurantName: string): SimulationReport {
  const overallScore = results.length > 0
    ? results.reduce((sum, r) => sum + r.score, 0) / results.length
    : 0;

  const criticalBugs: string[] = [];
  for (const r of results) {
    for (const c of r.checks) {
      if (!c.passed) {
        criticalBugs.push(`[${r.name}] ${c.detail}`);
      }
    }
  }

  // Top 3 most common failure types
  const failTypeCounts = new Map<string, number>();
  for (const r of results) {
    for (const c of r.checks) {
      if (!c.passed) {
        failTypeCounts.set(c.label, (failTypeCounts.get(c.label) ?? 0) + 1);
      }
    }
  }
  const topFixes = [...failTypeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([label, count]) => `${label} (${count} cenário${count > 1 ? "s" : ""})`);

  const safeToTest =
    overallScore >= 6 &&
    results.every((r) => r.status !== "failed") &&
    !results.some(
      (r) =>
        r.status === "failed" &&
        r.checks.some((c) => c.type === "dietary_respected"),
    );

  const n = results.length || 1;
  const avgTicket      = results.reduce((s, r) => s + r.salesMetrics.finalCartValue, 0) / n;
  const avgItems       = results.reduce((s, r) => s + r.salesMetrics.totalItems,     0) / n;
  const conversionRate = results.filter((r) => r.salesMetrics.conversionSuccess).length / n;

  return {
    overallScore,
    scenarios: results,
    criticalBugs,
    topFixes,
    safeToTest,
    ranAt: new Date().toISOString(),
    restaurantName,
    avgTicket,
    avgItems,
    conversionRate,
  };
}

function buildErrorResult(scenario: ScenarioDef, error: string): ScenarioResult {
  return {
    id:               scenario.id,
    name:             scenario.name,
    description:      scenario.description,
    expectedBehavior: scenario.expectedBehavior,
    status:           "failed",
    score:            0,
    transcript:       [],
    checks:           scenario.checks.map((type) => ({
      type,
      label:  CHECK_LABELS[type],
      passed: false,
      detail: `Erro durante simulação: ${error}`,
    })),
    issues:       [`Erro de execução: ${error}`],
    salesMetrics: emptyMetrics(),
  };
}

// ─── sales metrics helpers ────────────────────────────────────

function emptyMetrics(): SalesMetrics {
  return {
    finalCartValue:       0,
    totalItems:           0,
    upsellAttempts:       0,
    acceptedSuggestions:  0,
    rejectedSuggestions:  0,
    conversionSuccess:    false,
    acceptedUpsellsOnly:  0,
    upsellValueGenerated: 0,
  };
}

async function getCartSnapshot(
  customerId: string,
  restaurantId: string,
): Promise<{ value: number; itemCount: number }> {
  try {
    const draft = await prisma.orderDraft.findFirst({
      where:   { customerId, restaurantId, status: "OPEN" },
      orderBy: { createdAt: "desc" },
      select:  {
        subtotal: true,
        items:    { select: { quantity: true } },
      },
    });
    return {
      value:     Number(draft?.subtotal ?? 0),
      itemCount: draft?.items.reduce((s, i) => s + i.quantity, 0) ?? 0,
    };
  } catch {
    return { value: 0, itemCount: 0 };
  }
}

function computeSalesMetrics(
  toolCalls: Array<{ name: string; args: unknown; success: boolean; resultData: unknown }>,
  finalCartValue: number,
  totalItems: number,
): SalesMetrics {
  // IDs successfully shown via suggest_upsell
  const suggestedIds = new Set<string>();
  for (const tc of toolCalls) {
    if (tc.name === "suggest_upsell" && tc.success) {
      const id = (tc.args as Record<string, unknown>)?.menuItemId as string | undefined;
      if (id) suggestedIds.add(id);
    }
  }

  const upsellAttempts = suggestedIds.size;

  // add_item calls that originated from a prior suggest_upsell
  const acceptedUpsellCalls = toolCalls.filter(
    (tc) =>
      tc.name === "add_item" &&
      tc.success &&
      suggestedIds.has((tc.args as Record<string, unknown>)?.menuItemId as string),
  );

  const acceptedUpsellsOnly  = acceptedUpsellCalls.length;
  const acceptedSuggestions  = acceptedUpsellsOnly; // same — for report compatibility

  // Value generated exclusively by accepted upsell items (price × qty from result.data)
  const upsellValueGenerated = acceptedUpsellCalls.reduce((sum, tc) => {
    const d = tc.resultData as Record<string, unknown> | null;
    const price = Number(d?.price ?? 0);
    const qty   = Number(d?.quantity ?? 1);
    return sum + price * qty;
  }, 0);

  const rejectedSuggestions = Math.max(0, upsellAttempts - acceptedUpsellsOnly);
  const conversionSuccess   = toolCalls.some(
    (tc) => tc.name === "confirm_order" && tc.success,
  );

  return {
    finalCartValue,
    totalItems,
    upsellAttempts,
    acceptedSuggestions,
    rejectedSuggestions,
    conversionSuccess,
    acceptedUpsellsOnly,
    upsellValueGenerated,
  };
}

// ─── sandbox cleanup ──────────────────────────────────────────

async function cleanupSimulation(customerId: string, conversationId: string): Promise<void> {
  try {
    // Orders + OrderItems (cascade)
    await prisma.order.deleteMany({ where: { customerId } });
    // Draft items (no cascade) → Drafts
    const drafts = await prisma.orderDraft.findMany({ where: { customerId }, select: { id: true } });
    if (drafts.length > 0) {
      await prisma.orderDraftItem.deleteMany({ where: { orderDraftId: { in: drafts.map((d) => d.id) } } });
      await prisma.orderDraft.deleteMany({ where: { customerId } });
    }
    // Conversation (Messages cascade)
    await prisma.conversation.delete({ where: { id: conversationId } }).catch(() => null);
    // Customer (CustomerPreference cascades)
    await prisma.customer.delete({ where: { id: customerId } }).catch(() => null);
  } catch (err) {
    console.warn("[AISimulator] Cleanup error (non-fatal):", err);
  }
}
