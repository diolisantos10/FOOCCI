/**
 * WhatsAppRoutingTestService — dry-run scenario runner for the Routing Test Lab.
 *
 * Runs simulated WhatsApp events through the PURE
 * WhatsAppRoutingClassifier and asserts each against an expected outcome. There
 * are NO DB writes, NO WhatsApp sends, NO LLM calls, NO campaigns. The whole
 * point is to replace manual WhatsApp testing: define a scenario, read the
 * verdict.
 *
 * Hard no-send invariant (PART 6): any scenario in which an internal command
 * would send to the customer is a FAIL. The runner itself never imports or
 * envia WhatsApp.
 */

import {
  classifyRoutingEvent,
  type SimulatedRoutingEvent,
  type RoutingDecision,
} from "@/services/whatsapp/WhatsAppRoutingClassifier";

export type CheckStatus = "pass" | "warn" | "fail";

/** A subset of RoutingDecision fields a scenario asserts on. */
type ExpectedDecision = Partial<
  Pick<
    RoutingDecision,
    | "isInternalCommand"
    | "commandType"
    | "actor"
    | "source"
    | "direction"
    | "visibility"
    | "shouldPersistConversationMessage"
    | "shouldShowInAtendimento"
    | "shouldRenderAsCustomerBubble"
    | "shouldCallWhatsAppAgent"
    | "shouldCallWaiter"
    | "shouldCallProviderSend"
  >
> & { blocked?: boolean };

export interface RoutingScenario {
  id: string;
  name: string;
  event: SimulatedRoutingEvent;
  expected: ExpectedDecision;
}

export interface ScenarioResult {
  scenarioId: string;
  name: string;
  input: SimulatedRoutingEvent;
  expected: ExpectedDecision;
  actual: RoutingDecision;
  status: CheckStatus;
  failedChecks: string[];
  redFlags: string[];
  explanation: string;
  wouldCallProviderSend: boolean;
  wouldShowInAtendimento: boolean;
  wouldRenderAsCustomerBubble: boolean;
  wouldCallWhatsAppAgent: boolean;
  wouldCallWaiter: boolean;
  wouldPersistMessage: boolean;
}

export interface RoutingTestSummary {
  mode: "quick" | "full" | "custom";
  total: number;
  passed: number;
  warned: number;
  failed: number;
  score: number; // 0..100
  results: ScenarioResult[];
  generatedAt: string;
}

// ── Canonical scenarios (the 10 required + a couple of guards) ────────────────

export const ROUTING_SCENARIOS: RoutingScenario[] = [
  {
    id: "customer-normal",
    name: "Cliente inbound normal (\"Oi\")",
    event: { source: "WEBHOOK", fromMe: false, messageText: "Oi", fromPhone: "+5511988887777" },
    expected: {
      isInternalCommand: false,
      actor: "CUSTOMER",
      direction: "INBOUND",
      shouldRenderAsCustomerBubble: true,
      shouldCallWhatsAppAgent: true,
      shouldCallProviderSend: false,
    },
  },
  {
    id: "customer-build",
    name: "Cliente inbound /build teste",
    event: { source: "WEBHOOK", fromMe: false, messageText: "/build teste", fromPhone: "+5511988887777" },
    expected: {
      isInternalCommand: true,
      commandType: "BUILD",
      actor: "INTERNAL_COMMAND",
      shouldCallWhatsAppAgent: false,
      shouldCallWaiter: false,
      shouldCallProviderSend: false,
      shouldRenderAsCustomerBubble: false,
      shouldPersistConversationMessage: false,
    },
  },
  {
    id: "fromme-build",
    name: "Loja/fromMe /build teste (mirror)",
    event: {
      source: "WEBHOOK",
      fromMe: true,
      messageText: "/build teste",
      fromPhone: "+5511990001122",
      connectedBusinessPhone: "+5511990001122",
    },
    expected: {
      isInternalCommand: true,
      actor: "INTERNAL_COMMAND",
      direction: "OUTBOUND",
      visibility: "HIDDEN",
      shouldCallProviderSend: false,
      shouldRenderAsCustomerBubble: false,
      shouldShowInAtendimento: false,
    },
  },
  {
    id: "operator-build",
    name: "Operador envio manual /build teste",
    event: { source: "MANUAL_OPERATOR", messageText: "/build teste", operatorId: "op-1" },
    expected: {
      isInternalCommand: true,
      blocked: true,
      shouldCallProviderSend: false,
      shouldPersistConversationMessage: false,
    },
  },
  {
    id: "handler-throw",
    name: "handleBuildCommand lança exceção (fail-safe)",
    // The classifier is independent of handleBuildCommand: detection alone
    // decides suppression, so a thrown handler cannot change the outcome.
    event: { source: "WEBHOOK", fromMe: false, messageText: "/build raio-x", fromPhone: "+5511988887777" },
    expected: {
      isInternalCommand: true,
      shouldCallProviderSend: false,
      shouldRenderAsCustomerBubble: false,
      shouldPersistConversationMessage: false,
    },
  },
  {
    id: "unauthorized-build",
    name: "Comando /build de remetente não autorizado (Build OS on)",
    event: {
      source: "WEBHOOK",
      fromMe: false,
      messageText: "/build deploy",
      fromPhone: "+5511977776666",
      buildOsEnabled: true,
      authorizedBuildPhone: false,
    },
    expected: {
      isInternalCommand: true,
      shouldCallProviderSend: false,
      shouldRenderAsCustomerBubble: false,
      shouldPersistConversationMessage: false,
    },
  },
  {
    id: "historical-leaked",
    name: "Mensagem /build histórica vazada",
    event: { source: "WEBHOOK", fromMe: false, messageText: "/build comando antigo", isHistoricalRecord: true },
    expected: {
      isInternalCommand: true,
      visibility: "HIDDEN",
      shouldShowInAtendimento: false,
      shouldRenderAsCustomerBubble: false,
    },
  },
  {
    id: "cardapio-normal",
    name: "Mensagem do Cardápio (/pedido)",
    event: { source: "CARDAPIO", messageText: "Quero uma pizza", fromPhone: "+5511988887777" },
    expected: {
      isInternalCommand: false,
      actor: "CUSTOMER",
      source: "CARDAPIO",
      shouldRenderAsCustomerBubble: true,
      shouldCallProviderSend: false,
    },
  },
  {
    id: "system-handoff",
    name: "Evento de sistema (handoff)",
    event: { source: "SYSTEM", messageText: "[handoff:CUSTOMER_REQUEST]" },
    expected: {
      actor: "SYSTEM",
      direction: "INTERNAL",
      shouldRenderAsCustomerBubble: false,
      shouldCallProviderSend: false,
    },
  },
  {
    id: "build-midsentence",
    name: "Mensagem com /build no meio (não é comando)",
    event: { source: "WEBHOOK", fromMe: false, messageText: "como uso /build no app?", fromPhone: "+5511988887777" },
    expected: {
      isInternalCommand: false,
      actor: "CUSTOMER",
      shouldRenderAsCustomerBubble: true,
      shouldCallWhatsAppAgent: true,
    },
  },
];

// ── Assertion engine ───────────────────────────────────────────────────────────

const QUICK_IDS = new Set([
  "customer-normal",
  "customer-build",
  "fromme-build",
  "operator-build",
]);

function evaluate(scenario: RoutingScenario): ScenarioResult {
  const actual = classifyRoutingEvent(scenario.event);
  const exp = scenario.expected;
  const failedChecks: string[] = [];

  const check = <K extends keyof RoutingDecision>(key: K, want: RoutingDecision[K] | undefined) => {
    if (want === undefined) return;
    if (actual[key] !== want) failedChecks.push(`${String(key)}: expected ${JSON.stringify(want)}, got ${JSON.stringify(actual[key])}`);
  };

  check("isInternalCommand", exp.isInternalCommand);
  check("commandType", exp.commandType);
  check("actor", exp.actor);
  check("source", exp.source);
  check("direction", exp.direction);
  check("visibility", exp.visibility);
  check("shouldPersistConversationMessage", exp.shouldPersistConversationMessage);
  check("shouldShowInAtendimento", exp.shouldShowInAtendimento);
  check("shouldRenderAsCustomerBubble", exp.shouldRenderAsCustomerBubble);
  check("shouldCallWhatsAppAgent", exp.shouldCallWhatsAppAgent);
  check("shouldCallWaiter", exp.shouldCallWaiter);
  check("shouldCallProviderSend", exp.shouldCallProviderSend);

  if (exp.blocked !== undefined) {
    const isBlocked = actual.blockReason !== null;
    if (isBlocked !== exp.blocked) failedChecks.push(`blocked: expected ${exp.blocked}, got ${isBlocked}`);
  }

  // ── Hard safety red flags (PART 6) — independent of the scenario's expected. ──
  const redFlags: string[] = [];
  if (actual.isInternalCommand && actual.shouldCallProviderSend) {
    redFlags.push("CRÍTICO: comando interno enviaria mensagem ao cliente.");
  }
  if (actual.isInternalCommand && actual.shouldRenderAsCustomerBubble) {
    redFlags.push("CRITICAL: internal command would render as a customer bubble.");
  }
  if (actual.isInternalCommand && (actual.shouldCallWhatsAppAgent || actual.shouldCallWaiter)) {
    redFlags.push("CRITICAL: internal command would reach an AI agent.");
  }

  let status: CheckStatus = "pass";
  if (redFlags.length > 0 || failedChecks.length > 0) status = "fail";

  return {
    scenarioId: scenario.id,
    name: scenario.name,
    input: scenario.event,
    expected: exp,
    actual,
    status,
    failedChecks,
    redFlags,
    explanation: actual.explanation,
    wouldCallProviderSend: actual.shouldCallProviderSend,
    wouldShowInAtendimento: actual.shouldShowInAtendimento,
    wouldRenderAsCustomerBubble: actual.shouldRenderAsCustomerBubble,
    wouldCallWhatsAppAgent: actual.shouldCallWhatsAppAgent,
    wouldCallWaiter: actual.shouldCallWaiter,
    wouldPersistMessage: actual.shouldPersistConversationMessage,
  };
}

function summarize(mode: RoutingTestSummary["mode"], results: ScenarioResult[]): RoutingTestSummary {
  const passed = results.filter((r) => r.status === "pass").length;
  const warned = results.filter((r) => r.status === "warn").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const total = results.length;
  const score = total === 0 ? 100 : Math.round((passed / total) * 100);
  return { mode, total, passed, warned, failed, score, results, generatedAt: new Date().toISOString() };
}

/** Run the built-in scenario suite (quick = critical subset, full = all). */
export function runRoutingScenarios(mode: "quick" | "full"): RoutingTestSummary {
  const scenarios = mode === "quick"
    ? ROUTING_SCENARIOS.filter((s) => QUICK_IDS.has(s.id))
    : ROUTING_SCENARIOS;
  return summarize(mode, scenarios.map(evaluate));
}

/** Classify a single ad-hoc event (custom simulator panel). */
export function runCustomEvent(event: SimulatedRoutingEvent): ScenarioResult {
  return evaluate({
    id: "custom",
    name: "Evento personalizado",
    event,
    expected: {}, // no assertions; the operator reads the classification + red flags
  });
}

/** Render a plain-text report for export. */
export function renderTextReport(summary: RoutingTestSummary): string {
  const lines: string[] = [];
  lines.push("FOOCCI — WhatsApp Routing Test Lab");
  lines.push(`Modo: ${summary.mode}   Gerado: ${summary.generatedAt}`);
  lines.push(`Score: ${summary.score}/100   ✓ ${summary.passed}  ⚠ ${summary.warned}  ✗ ${summary.failed}  (total ${summary.total})`);
  lines.push("");
  for (const r of summary.results) {
    const icon = r.status === "pass" ? "✓" : r.status === "warn" ? "⚠" : "✗";
    lines.push(`${icon} [${r.scenarioId}] ${r.name}`);
    lines.push(`    in : ${JSON.stringify(r.input)}`);
    lines.push(`    out: actor=${r.actual.actor} source=${r.actual.source} dir=${r.actual.direction} vis=${r.actual.visibility}`);
    lines.push(`         providerSend=${r.wouldCallProviderSend} bubble=${r.wouldRenderAsCustomerBubble} agent=${r.wouldCallWhatsAppAgent} waiter=${r.wouldCallWaiter} persist=${r.wouldPersistMessage}`);
    if (r.failedChecks.length) lines.push(`    fail: ${r.failedChecks.join("; ")}`);
    if (r.redFlags.length) lines.push(`    RED : ${r.redFlags.join("; ")}`);
    lines.push(`    why: ${r.explanation}`);
    lines.push("");
  }
  return lines.join("\n");
}
