/**
 * WhatsApp Text Ordering — Scenario Runner.
 *
 * Replays declarative multi-turn conversations through the state machine in
 * DRY_RUN_ONLY, PRESERVING SESSION STATE between messages, and evaluates each
 * scenario against its expectations. This is the automated regression harness
 * that replaces copy-pasting messages one at a time in the Test Center.
 *
 * HARD SAFETY INVARIANTS (asserted by the runner itself):
 *  - allowSideEffects is forced to false for every turn.
 *  - mode is forced to DRY_RUN_ONLY.
 *  - A scenario FAILS if any turn reports a real side effect, a real order id,
 *    or a real (non-stub) Pix.
 *
 * No DB is required when a `menu` is supplied (tests inject fixtures). The admin
 * API route loads the menu once and passes it in, so a whole conversation reuses
 * a single menu read.
 */

import { processCustomerMessage } from "./WhatsAppTextOrderService";
import type {
  WaMenuItem,
  WaOrderStage,
  WaPersistedSession,
  WaProcessResult,
  WaSessionStatus,
} from "./types";
import {
  scenariosForSuite,
  type WaOrderingScenario,
  type WaScenarioSuite,
} from "./testing/whatsappOrderingScenarios";

export type Severity = "PASS" | "WARN" | "FAIL";

export interface WaScenarioCheck {
  label:    string;
  severity: Severity;
  detail:   string;
}

export interface WaScenarioStepItem {
  name:     string;
  quantity: number;
  variant?: string;
  lineTotal: number;
}

export interface WaScenarioStep {
  index:           number;
  message:         string;
  previousStage:   WaOrderStage;
  stage:           WaOrderStage;
  status:          WaSessionStatus;
  intent:          string;
  suggestedReply:  string;
  matchedItems:    WaScenarioStepItem[];
  unresolvedItems: { rawText: string; reason: string; candidates: string[] }[];
  missingQuestions: { itemName: string; groupName: string }[];
  actions:         string[];
  sideEffectsPerformed: string[];
  order:           WaProcessResult["order"];
  paymentStub:     boolean;
  paymentRealPix:  boolean;
  estimatedTotal:  number;
}

export interface WaScenarioResult {
  id:          string;
  name:        string;
  category:    string;
  description: string;
  messages:    string[];
  verdict:     Severity;
  checks:      WaScenarioCheck[];
  steps:       WaScenarioStep[];
  finalStage:  WaOrderStage;
  finalStatus: WaSessionStatus;
  finalItems:  WaScenarioStepItem[];
  sideEffectsPerformed: string[];
  durationMs:  number;
}

export interface WaScenarioRunReport {
  suite:      WaScenarioSuite | "all";
  restaurant: { id: string; name?: string; slug?: string };
  ranAt:      string;
  total:      number;
  pass:       number;
  warn:       number;
  fail:       number;
  score:      number; // 0–100 (PASS=1, WARN=0.5, FAIL=0)
  results:    WaScenarioResult[]; // failed first, then warn, then pass
}

export interface RunScenarioContext {
  restaurantId:   string;
  restaurantSlug?: string;
  phone?:         string;
  menu:           WaMenuItem[];
}

const norm = (t: string) =>
  t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

// ── Single scenario ─────────────────────────────────────────────────────────

export async function runScenario(
  scenario: WaOrderingScenario,
  ctx:      RunScenarioContext,
): Promise<WaScenarioResult> {
  const start = Date.now();
  const phone = ctx.phone ?? "+5511999990000";

  const steps: WaScenarioStep[] = [];
  let session: WaPersistedSession | null = null;

  for (let i = 0; i < scenario.messages.length; i++) {
    const message = scenario.messages[i]!;
    const previousStage: WaOrderStage = session?.stage ?? "IDLE";

    const result = await processCustomerMessage({
      restaurantId:    ctx.restaurantId,
      restaurantSlug:  ctx.restaurantSlug,
      phone,
      messageText:     message,
      mode:            "DRY_RUN_ONLY",
      currentSession:  session,
      allowSideEffects: false, // HARD invariant — never real
      menu:            ctx.menu,
    });

    session = result.session;

    steps.push({
      index:           i,
      message,
      previousStage,
      stage:           result.stage,
      status:          result.session.status,
      intent:          result.intent,
      suggestedReply:  result.suggestedReply,
      matchedItems:    result.matchedItems.map(m => ({
        name: m.menuItemName, quantity: m.quantity, variant: m.variantName, lineTotal: m.lineTotal,
      })),
      unresolvedItems: result.unresolvedItems.map(u => ({
        rawText: u.rawText, reason: u.reason, candidates: u.candidates,
      })),
      missingQuestions: result.missingQuestions.map(q => ({
        itemName: q.itemName, groupName: q.groupName,
      })),
      actions:              result.actions,
      sideEffectsPerformed: result.sideEffectsPerformed,
      order:                result.order,
      paymentStub:          result.payment?.isDryRunStub === true,
      paymentRealPix:       result.payment != null && result.payment.isDryRunStub === false
                             && result.payment.method === "PIX",
      estimatedTotal:       result.estimatedTotal,
    });
  }

  const checks = evaluate(scenario, steps);
  const verdict = rollup(checks);
  const last = steps[steps.length - 1];

  return {
    id:          scenario.id,
    name:        scenario.name,
    category:    scenario.category,
    description: scenario.description,
    messages:    scenario.messages,
    verdict,
    checks,
    steps,
    finalStage:  last?.stage ?? "IDLE",
    finalStatus: last?.status ?? "ACTIVE",
    finalItems:  last?.matchedItems ?? [],
    sideEffectsPerformed: steps.flatMap(s => s.sideEffectsPerformed),
    durationMs:  Date.now() - start,
  };
}

// ── Suite run ───────────────────────────────────────────────────────────────

export async function runScenarioSuite(
  suite: WaScenarioSuite | "all",
  ctx:   RunScenarioContext & { restaurantName?: string },
): Promise<WaScenarioRunReport> {
  const scenarios = scenariosForSuite(suite);
  const results: WaScenarioResult[] = [];
  for (const sc of scenarios) {
    results.push(await runScenario(sc, ctx));
  }

  // Failed first, then warn, then pass — preserving order within each band.
  const order: Record<Severity, number> = { FAIL: 0, WARN: 1, PASS: 2 };
  results.sort((a, b) => order[a.verdict] - order[b.verdict]);

  const pass = results.filter(r => r.verdict === "PASS").length;
  const warn = results.filter(r => r.verdict === "WARN").length;
  const fail = results.filter(r => r.verdict === "FAIL").length;
  const score = results.length === 0
    ? 100
    : Math.round(((pass + warn * 0.5) / results.length) * 100);

  return {
    suite,
    restaurant: { id: ctx.restaurantId, name: ctx.restaurantName, slug: ctx.restaurantSlug },
    ranAt:      new Date().toISOString(),
    total:      results.length,
    pass, warn, fail, score,
    results,
  };
}

// ── Evaluator ───────────────────────────────────────────────────────────────

export function evaluateScenario(scenario: WaOrderingScenario, steps: WaScenarioStep[]): WaScenarioCheck[] {
  return evaluate(scenario, steps);
}

function evaluate(scenario: WaOrderingScenario, steps: WaScenarioStep[]): WaScenarioCheck[] {
  const checks: WaScenarioCheck[] = [];
  const last = steps[steps.length - 1];

  if (!last) {
    checks.push({ label: "execução", severity: "FAIL", detail: "Nenhum passo executado." });
    return checks;
  }

  // ── 1. SAFETY (always FAIL on violation) ──────────────────────────────────
  const sideEffects = steps.flatMap(s => s.sideEffectsPerformed);
  checks.push(sideEffects.length === 0
    ? { label: "sem efeitos colaterais", severity: "PASS", detail: "Nenhum efeito real em dry-run." }
    : { label: "sem efeitos colaterais", severity: "FAIL", detail: `Efeitos reais: ${sideEffects.join(", ")}` });

  const realOrder = steps.find(s => s.order?.orderId);
  checks.push(!realOrder
    ? { label: "sem pedido real", severity: "PASS", detail: "Nenhum orderId real criado." }
    : { label: "sem pedido real", severity: "FAIL", detail: `orderId real: ${realOrder.order?.orderId}` });

  const realPix = steps.find(s => s.paymentRealPix);
  checks.push(!realPix
    ? { label: "sem Pix real", severity: "PASS", detail: "Nenhum Pix real gerado (apenas stub)." }
    : { label: "sem Pix real", severity: "FAIL", detail: "Pix real gerado em dry-run." });

  // ── 2. SESSION CONTINUITY (always FAIL on violation) ──────────────────────
  let continuityOk = true;
  let continuityDetail = "Sessão preservada entre as mensagens.";
  for (let i = 1; i < steps.length; i++) {
    const prevFinal = steps[i - 1]!.stage;
    const thisPrev  = steps[i]!.previousStage;
    if (thisPrev !== prevFinal) {
      continuityOk = false;
      continuityDetail = `Passo ${i + 1}: stage anterior "${thisPrev}" ≠ stage final do passo ${i} "${prevFinal}".`;
      break;
    }
  }
  // Single-message scenarios trivially satisfy continuity; still report it.
  checks.push(continuityOk
    ? { label: "continuidade de sessão", severity: "PASS", detail: continuityDetail }
    : { label: "continuidade de sessão", severity: "FAIL", detail: continuityDetail });

  // ── 3. NO ANSWER RE-PARSE (the carne/frango bug — always FAIL) ────────────
  // When the previous turn left an ambiguity/required-option question, the next
  // message is an ANSWER. It must NOT surface as brand-new unresolved items
  // derived from the answer text.
  let reparseOk = true;
  let reparseDetail = "Respostas não foram reinterpretadas como novos itens.";
  for (let i = 1; i < steps.length; i++) {
    const prev = steps[i - 1]!;
    const cur  = steps[i]!;
    const wasAwaitingAnswer =
      prev.stage === "MATCHING_MENU" || prev.stage === "COLLECTING_REQUIRED_OPTIONS";
    if (!wasAwaitingAnswer) continue;

    const prevRaw = new Set(prev.unresolvedItems.map(u => norm(u.rawText)));
    const answer  = norm(cur.message);
    const fresh = cur.unresolvedItems.filter(u => !prevRaw.has(norm(u.rawText)));
    const reparsed = fresh.filter(u => u.rawText && answer.includes(norm(u.rawText)));
    if (reparsed.length > 0) {
      reparseOk = false;
      reparseDetail = `Passo ${i + 1}: a resposta "${cur.message}" virou item novo (${reparsed.map(r => `"${r.rawText}"`).join(", ")}).`;
      break;
    }
  }
  checks.push(reparseOk
    ? { label: "resposta não reinterpretada", severity: "PASS", detail: reparseDetail }
    : { label: "resposta não reinterpretada", severity: "FAIL", detail: reparseDetail });

  // ── 4. NO DUPLICATE LINES (FAIL — identical signature appearing twice) ────
  const sig = (it: WaScenarioStepItem) => `${norm(it.name)}|${norm(it.variant ?? "")}`;
  const seen = new Map<string, number>();
  for (const it of last.matchedItems) seen.set(sig(it), (seen.get(sig(it)) ?? 0) + 1);
  const dups = [...seen.entries()].filter(([, n]) => n > 1);
  checks.push(dups.length === 0
    ? { label: "sem itens duplicados", severity: "PASS", detail: "Nenhuma linha de item duplicada." }
    : { label: "sem itens duplicados", severity: "FAIL", detail: `Linhas duplicadas: ${dups.map(([k]) => k).join(", ")}` });

  // ── 5. CONTENT: expected items ────────────────────────────────────────────
  if (scenario.expectedItems && scenario.expectedItems.length > 0) {
    for (const exp of scenario.expectedItems) {
      const match = last.matchedItems.find(m => norm(m.name).includes(norm(exp.name)));
      if (!match) {
        // Absent: WARN if menu-dependent (likely product not on this menu) else FAIL.
        const sev: Severity = scenario.menuDependent ? "WARN" : "FAIL";
        checks.push({
          label: `item "${exp.name}"`,
          severity: sev,
          detail: scenario.menuDependent
            ? `Não encontrado no cardápio deste restaurante — pode precisar de ajuste do cenário.`
            : `Esperado mas ausente nos itens finais.`,
        });
        continue;
      }
      if (exp.quantity != null && match.quantity !== exp.quantity) {
        // Quantity mismatch when the item IS present is a real bug (lost qty).
        checks.push({
          label: `quantidade "${exp.name}"`,
          severity: "FAIL",
          detail: `Esperado ${exp.quantity}, obtido ${match.quantity}.`,
        });
      } else {
        checks.push({
          label: `item "${exp.name}"`,
          severity: "PASS",
          detail: `${match.quantity}× ${match.name}${match.variant ? ` ${match.variant}` : ""}.`,
        });
      }
    }
  }

  // ── 6. CONTENT: expected final stage ──────────────────────────────────────
  if (scenario.expectedFinalStage) {
    const allowed = Array.isArray(scenario.expectedFinalStage)
      ? scenario.expectedFinalStage
      : [scenario.expectedFinalStage];
    const ok = allowed.includes(last.stage);
    const sev: Severity = ok ? "PASS" : (scenario.menuDependent ? "WARN" : "FAIL");
    checks.push({
      label: "stage final",
      severity: sev,
      detail: ok ? `${last.stage}` : `Esperado ${allowed.join(" | ")}, obtido ${last.stage}.`,
    });
  }

  // ── 7. CONTENT: expected status ───────────────────────────────────────────
  if (scenario.expectedStatus) {
    const allowed = Array.isArray(scenario.expectedStatus)
      ? scenario.expectedStatus
      : [scenario.expectedStatus];
    const ok = allowed.includes(last.status);
    const sev: Severity = ok ? "PASS" : (scenario.menuDependent ? "WARN" : "FAIL");
    checks.push({
      label: "status final",
      severity: sev,
      detail: ok ? `${last.status}` : `Esperado ${allowed.join(" | ")}, obtido ${last.status}.`,
    });
  }

  // ── 8. CONTENT: handoff ───────────────────────────────────────────────────
  if (scenario.expectHandoff) {
    const ok = last.stage === "HANDOFF_REQUIRED" || last.status === "HANDOFF_REQUIRED";
    checks.push({
      label: "handoff",
      severity: ok ? "PASS" : "FAIL",
      detail: ok ? "Escalou para atendente." : `Não escalou (stage ${last.stage}).`,
    });
  }

  // ── 9. CONTENT: unresolved expectation ────────────────────────────────────
  if (scenario.expectUnresolved) {
    const hasUnresolved = last.unresolvedItems.length > 0;
    // For unknown-product scenarios it's also acceptable that the engine asked
    // for clarification with a non-empty reply and no completed draft.
    const askedClarification = last.matchedItems.length === 0 && last.suggestedReply.trim().length > 0;
    const ok = hasUnresolved || askedClarification;
    checks.push({
      label: "item não resolvido / esclarecimento",
      severity: ok ? "PASS" : "FAIL",
      detail: ok
        ? (hasUnresolved ? `${last.unresolvedItems.length} item(ns) não resolvido(s).` : "Pediu esclarecimento sem montar pedido.")
        : "Esperava item não resolvido ou pedido de esclarecimento.",
    });
  }

  // ── 10. CONTENT: expected questions ───────────────────────────────────────
  if (scenario.expectedQuestions && scenario.expectedQuestions.length > 0) {
    for (const want of scenario.expectedQuestions) {
      const found = last.missingQuestions.some(q => norm(q.groupName).includes(norm(want)))
        || norm(last.suggestedReply).includes(norm(want));
      checks.push({
        label: `pergunta "${want}"`,
        severity: found ? "PASS" : (scenario.menuDependent ? "WARN" : "FAIL"),
        detail: found ? "Presente." : "Não apareceu nas perguntas pendentes/resposta.",
      });
    }
  }

  // ── 11. Always-on: every turn produced a non-empty reply ──────────────────
  const silent = steps.find(s => !s.suggestedReply || s.suggestedReply.trim().length === 0);
  checks.push(!silent
    ? { label: "nunca fica em silêncio", severity: "PASS", detail: "Todas as mensagens tiveram resposta." }
    : { label: "nunca fica em silêncio", severity: "FAIL", detail: `Passo ${silent.index + 1} sem resposta.` });

  return checks;
}

function rollup(checks: WaScenarioCheck[]): Severity {
  if (checks.some(c => c.severity === "FAIL")) return "FAIL";
  if (checks.some(c => c.severity === "WARN")) return "WARN";
  return "PASS";
}
