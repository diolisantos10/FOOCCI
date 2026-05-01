import type {
  FailureType,
  StepAssertion,
  WaiterResponse,
  ScenarioResult,
  AutoPilotReport,
} from "./types";

// ── Improvement suggestion map ────────────────────────────────────────────────

export const IMPROVEMENT_SUGGESTIONS: Record<FailureType, string> = {
  missing_options:
    "Quando o Waiter faz uma pergunta ao cliente, response.options[] deve conter botões de resposta.",
  missing_cards:
    "Quando o Waiter recomenda produtos, response.cards[] deve conter IDs válidos do catálogo.",
  product_mismatch:
    "response.cards[] contém IDs não encontrados no catálogo atual. Verifique sincronização do catálogo.",
  invisible_product_mention:
    "Produto foi mencionado no texto sem aparecer em cards[]. Rule 4 deve remover o nome do texto.",
  extra_buttons_after_cards:
    "response.options[] não deve ser enviado junto com cards[]. Rule 9 força options=[].",
  wrong_intent_detection:
    "Intenção do cliente não detectada corretamente. Revise analyzeSalesContext() para essa categoria.",
  weak_sales_response:
    "Resposta fraca detectada (ok, beleza, ótimo). Use copy comercial com proposta de valor clara.",
  ui_invasion_after_click:
    "ON_ITEM_ADDED não deve retornar cards[] nem options[]. Rule 7 deve garantir cards=[], options=[].",
  checkout_interference:
    "Modo CHECKOUT_SUPPORT não deve incluir cards[]. Rule 8 deve forçar cards=[].",
  cart_not_updated:
    "Produto não foi adicionado ao cart antes do checkout. Verifique fluxo ON_ITEM_ADDED.",
  checkout_not_reached:
    "Cenário exige checkout mas ON_CHECKOUT_STARTED não foi disparado corretamente.",
  order_not_confirmed:
    "Cenário exige confirmação mas AFTER_CHECKOUT não retornou resposta válida.",
  response_contract_error:
    "Resposta fora do contrato: reply, cards, options ou mode ausente ou com tipo incorreto.",
  timeout:
    "Evento não respondeu dentro do tempo limite. Verifique latência da API e DATABASE_URL.",
  unknown_error:
    "Erro desconhecido. Verifique logs do servidor e tente novamente.",
};

// ── Validation ────────────────────────────────────────────────────────────────

const VALID_MODES = ["BROWSE", "SUGGESTION", "INTERVENTION", "CHECKOUT_SUPPORT"];
const WEAK_PHRASES = /^(ok|beleza|ótimo|certo|perfeito|entendi|claro)[.!]?$/i;

export function validateStep(
  event: string,
  response: WaiterResponse | null,
  catalogIds: Set<string>,
  requireCards: boolean,
): { assertions: StepAssertion[]; failureTypes: FailureType[]; passed: boolean } {
  const assertions: StepAssertion[] = [];
  const failureTypes: FailureType[] = [];

  if (!response) {
    assertions.push({ label: "Resposta recebida da API", pass: false, detail: "sem resposta" });
    return { assertions, failureTypes: ["response_contract_error"], passed: false };
  }

  // Contract shape
  const contractOk =
    typeof response.reply   === "string" &&
    Array.isArray(response.cards)         &&
    Array.isArray(response.options)       &&
    typeof response.mode    === "string";
  assertions.push({ label: "Contrato: reply/cards/options/mode presentes", pass: contractOk });
  if (!contractOk) failureTypes.push("response_contract_error");

  // Valid mode
  const modeOk = VALID_MODES.includes(response.mode);
  assertions.push({
    label:  `Mode válido (${response.mode})`,
    pass:   modeOk,
    detail: modeOk ? undefined : response.mode,
  });
  if (!modeOk) failureTypes.push("response_contract_error");

  // Rule 3: ≤ 2 non-empty lines
  const nonEmpty = response.reply.split("\n").filter((l) => l.trim()).length;
  const lineOk   = nonEmpty <= 2;
  assertions.push({
    label:  "Rule 3: message ≤ 2 linhas não-vazias",
    pass:   lineOk,
    detail: lineOk ? undefined : `${nonEmpty} linhas`,
  });

  // Rule 7: ON_ITEM_ADDED → cards=[], options=[]
  if (event === "ON_ITEM_ADDED") {
    const r7 = response.cards.length === 0 && response.options.length === 0;
    assertions.push({ label: "Rule 7: ON_ITEM_ADDED → cards=[], options=[]", pass: r7 });
    if (!r7) failureTypes.push("ui_invasion_after_click");
  }

  // Rule 8: CHECKOUT_SUPPORT → cards=[]
  if (response.mode === "CHECKOUT_SUPPORT") {
    const r8 = response.cards.length === 0;
    assertions.push({
      label:  "Rule 8: CHECKOUT_SUPPORT → cards=[]",
      pass:   r8,
      detail: r8 ? undefined : `${response.cards.length} cards`,
    });
    if (!r8) failureTypes.push("checkout_interference");
  }

  // Rule 9: cards + options mix
  const noMix = !(response.cards.length > 0 && response.options.length > 0);
  assertions.push({ label: "Rule 9: sem options[] quando cards[] existe", pass: noMix });
  if (!noMix) failureTypes.push("extra_buttons_after_cards");

  // Rule 2: cards contain valid catalog IDs
  if (catalogIds.size > 0 && response.cards.length > 0) {
    const ghosts = response.cards.filter((id) => !catalogIds.has(id));
    assertions.push({
      label:  "Rule 2: cards[] contêm apenas IDs do catálogo",
      pass:   ghosts.length === 0,
      detail: ghosts.length > 0 ? `IDs fantasma: ${ghosts.join(", ")}` : undefined,
    });
    if (ghosts.length > 0) failureTypes.push("product_mismatch");
  }

  // Cards expected for last intent message
  if (requireCards && event === "ON_USER_MESSAGE" && response.cards.length === 0 && catalogIds.size > 0) {
    assertions.push({
      label:  "Cards esperados para intenção de produto",
      pass:   false,
      detail: `mode=${response.mode}, options=${response.options.length}`,
    });
    // Only flag if also no options (otherwise it's asking a qualifying question)
    if (response.options.length === 0) {
      failureTypes.push("missing_cards");
    } else {
      // Has options — may still produce cards after qualification
      assertions.push({ label: "Options presentes (qualificando intenção)", pass: true });
    }
  }

  // Weak-phrase check
  if (response.reply && WEAK_PHRASES.test(response.reply.trim())) {
    assertions.push({ label: "Sem resposta fraca (ok/beleza/ótimo)", pass: false });
    failureTypes.push("weak_sales_response");
  }

  const passed = failureTypes.length === 0;
  return { assertions, failureTypes, passed };
}

// ── Report builder ────────────────────────────────────────────────────────────

export function buildReport(
  results:        ScenarioResult[],
  slug:           string,
  restaurantName: string,
): AutoPilotReport {
  const total   = results.length;
  const passed  = results.filter((r) => r.status === "PASS").length;
  const failed  = results.filter((r) => r.status === "FAIL").length;
  const errored = results.filter((r) => r.status === "ERROR").length;
  const score   = total > 0 ? Math.round((passed / total) * 100) : 0;

  const avgTurns =
    total > 0
      ? Math.round((results.reduce((s, r) => s + r.stepsRun, 0) / total) * 10) / 10
      : 0;
  const avgCardsReturned =
    total > 0
      ? Math.round((results.reduce((s, r) => s + r.cardsShown.length, 0) / total) * 10) / 10
      : 0;
  const conversionRate =
    total > 0
      ? Math.round((results.filter((r) => r.checkoutReached).length / total) * 100)
      : 0;

  // Aggregate failure types
  const failureTypes: Partial<Record<FailureType, number>> = {};
  for (const r of results) {
    for (const ft of r.failures) {
      failureTypes[ft] = (failureTypes[ft] ?? 0) + 1;
    }
  }

  // Top-3 recommendations from most-frequent failures
  const sorted = Object.entries(failureTypes).sort(([, a], [, b]) => b - a);
  const recommendations: string[] = sorted
    .slice(0, 3)
    .map(([ft]) => IMPROVEMENT_SUGGESTIONS[ft as FailureType])
    .filter(Boolean);

  if (passed === total && total > 0) {
    recommendations.push("Todos os cenários passaram. Sistema pronto para piloto QA.");
  }

  return {
    runAt:            new Date().toISOString(),
    slug,
    restaurantName,
    totalScenarios:   total,
    passed,
    failed,
    errored,
    score,
    avgTurns,
    avgCardsReturned,
    conversionRate,
    failureTypes,
    recommendations,
    scenarioResults: results,
  };
}

// ── Export helpers ────────────────────────────────────────────────────────────

export function toCsv(report: AutoPilotReport): string {
  const header = [
    "Cenário",
    "Objetivo",
    "Status",
    "Turnos",
    "Cards mostrados",
    "Checkout",
    "Falhas",
    "Sugestão de melhoria",
  ].join(",");

  const rows = report.scenarioResults.map((r) =>
    [
      `"${r.profileName}"`,
      `"${r.goal}"`,
      r.status,
      r.stepsRun,
      r.cardsShown.length,
      r.checkoutReached ? "Sim" : "Não",
      `"${r.failures.join("; ")}"`,
      `"${(r.improvementSuggestions[0] ?? "").replace(/"/g, "'")}"`,
    ].join(",")
  );

  return [header, ...rows].join("\n");
}

export function toSummaryText(report: AutoPilotReport): string {
  const date = new Date(report.runAt).toLocaleString("pt-BR");
  const lines: string[] = [
    "=== WAITER LAB AUTOPILOT REPORT ===",
    `Data:         ${date}`,
    `Restaurante:  ${report.restaurantName} (${report.slug})`,
    "",
    `Score:        ${report.score}/100`,
    `Passou:       ${report.passed}/${report.totalScenarios}`,
    `Falhou:       ${report.failed}/${report.totalScenarios}`,
    `Erro:         ${report.errored}/${report.totalScenarios}`,
    `Conversão:    ${report.conversionRate}% (chegou ao checkout)`,
    `Média turnos: ${report.avgTurns}`,
    `Média cards:  ${report.avgCardsReturned}`,
    "",
    "=== PRINCIPAIS FALHAS ===",
    ...Object.entries(report.failureTypes)
      .sort(([, a], [, b]) => b - a)
      .map(([k, v]) => `  ${k}: ${v} ocorrência(s)`),
    ...(Object.keys(report.failureTypes).length === 0 ? ["  Nenhuma falha registrada."] : []),
    "",
    "=== RECOMENDAÇÕES ===",
    ...report.recommendations.map((r, i) => `  ${i + 1}. ${r}`),
    ...(report.recommendations.length === 0 ? ["  Nenhuma."] : []),
    "",
    "=== CENÁRIOS ===",
    ...report.scenarioResults.map((r) =>
      [
        `  [${r.status}] ${r.profileName}`,
        `          Objetivo: ${r.goal}`,
        `          Turnos: ${r.stepsRun} | Cards: ${r.cardsShown.length} | Checkout: ${r.checkoutReached ? "Sim" : "Não"}`,
        r.failures.length > 0 ? `          Falhas: ${r.failures.join(", ")}` : "",
        r.improvementSuggestions[0] ? `          Sugestão: ${r.improvementSuggestions[0]}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    ),
  ];
  return lines.join("\n");
}
