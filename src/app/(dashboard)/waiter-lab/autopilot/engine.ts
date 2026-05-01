import type {
  FailureType,
  StepAssertion,
  WaiterResponse,
  ScenarioResult,
  AutoPilotReport,
  AreaScores,
  FixRecommendation,
  Severity,
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
  bad_product_fit:
    "Produtos sugeridos não são adequados ao perfil/orçamento do cliente. Revise o ranqueamento de produtos.",
  repeated_suggestion:
    "O mesmo produto foi sugerido múltiplas vezes. Implemente memória de sessão para evitar repetições.",
  invalid_card_id:
    "IDs em cards[] não existem no catálogo ativo. Valide IDs antes de incluir na resposta.",
};

// ── Failure → fix-area map ────────────────────────────────────────────────────

export const FAILURE_TO_FIX_AREA: Record<FailureType, string> = {
  missing_options:           "response contract / qualifying flow",
  missing_cards:             "response contract / product selection",
  product_mismatch:          "catalog validation",
  invisible_product_mention: "response contract / Rule 4",
  extra_buttons_after_cards: "response validation / UI rendering",
  wrong_intent_detection:    "intent detection — analyzeSalesContext()",
  weak_sales_response:       "commercial response builder",
  ui_invasion_after_click:   "event routing / ON_ITEM_ADDED handler",
  checkout_interference:     "checkout guard — Rule 8",
  cart_not_updated:          "cart update flow / ON_ITEM_ADDED",
  checkout_not_reached:      "checkout navigation / session flow",
  order_not_confirmed:       "AFTER_CHECKOUT handler",
  response_contract_error:   "response contract / API shape",
  timeout:                   "API latency / infrastructure / DATABASE_URL",
  unknown_error:             "general error handling / server logs",
  bad_product_fit:           "product ranking / menu analysis",
  repeated_suggestion:       "session memory / deduplication",
  invalid_card_id:           "catalog validation / ID sync",
};

// ── Probable root cause map ───────────────────────────────────────────────────

const ROOT_CAUSE_MAP: Record<FailureType, string> = {
  missing_options:
    "Waiter não gerou botões de qualificação quando o contexto era ambíguo.",
  missing_cards:
    "Waiter respondeu sobre produtos sem incluir cards[], violando o contrato de UI.",
  product_mismatch:
    "IDs em cards[] não batem com o catálogo ativo — possível desatualização ou bug de ID.",
  invisible_product_mention:
    "Nome de produto apareceu no reply mas não em cards[], expondo dado não renderizável.",
  extra_buttons_after_cards:
    "Waiter enviou cards[] e options[] simultaneamente, violando Rule 9.",
  wrong_intent_detection:
    "analyzeSalesContext() classificou incorretamente a intenção do cliente.",
  weak_sales_response:
    "Construtor de resposta usou copy fraco sem proposta de valor ou diferencial.",
  ui_invasion_after_click:
    "ON_ITEM_ADDED retornou cards[] ou options[], invadindo UI após clique do usuário.",
  checkout_interference:
    "Resposta em modo CHECKOUT_SUPPORT incluiu cards[], violando Rule 8.",
  cart_not_updated:
    "Fluxo ON_ITEM_ADDED não atualizou o carrinho antes de iniciar checkout.",
  checkout_not_reached:
    "Sequência de checkout não foi disparada pelo cenário conforme esperado.",
  order_not_confirmed:
    "AFTER_CHECKOUT não retornou resposta válida de confirmação.",
  response_contract_error:
    "Resposta da API com campos obrigatórios ausentes ou de tipo incorreto.",
  timeout:
    "API não respondeu dentro do limite — latência ou problema de infraestrutura.",
  unknown_error:
    "Erro não categorizado — verificar logs do servidor para detalhes.",
  bad_product_fit:
    "Produtos sugeridos não correspondem ao perfil de orçamento ou preferência.",
  repeated_suggestion:
    "Waiter sem memória de curto prazo sugeriu o mesmo produto repetidamente.",
  invalid_card_id:
    "ID enviado em cards[] não existe no catálogo — sincronização de IDs com problema.",
};

// ── Recommended fix map ───────────────────────────────────────────────────────

const RECOMMENDED_FIX_MAP: Record<FailureType, string> = {
  missing_options:
    "Adicionar lógica de qualificação em analyzeSalesContext() para contextos ambíguos.",
  missing_cards:
    "Garantir que toda menção a produtos inclua IDs em cards[] — remover nome do texto se não houver card.",
  product_mismatch:
    "Sincronizar catálogo no deploy e validar IDs antes de incluir em cards[].",
  invisible_product_mention:
    "Aplicar Rule 4: se produto mencionado não tem card correspondente, remover nome do texto.",
  extra_buttons_after_cards:
    "Aplicar Rule 9 no pós-processamento: se cards.length > 0, forçar options=[].",
  wrong_intent_detection:
    "Revisar e ampliar os padrões de detecção em analyzeSalesContext() para essa categoria.",
  weak_sales_response:
    "Adicionar templates de copy comercial para os modos SUGGESTION e INTERVENTION.",
  ui_invasion_after_click:
    "No handler ON_ITEM_ADDED, forçar cards=[] e options=[] antes de retornar.",
  checkout_interference:
    "No modo CHECKOUT_SUPPORT, aplicar Rule 8: sempre forçar cards=[].",
  cart_not_updated:
    "Garantir que ON_ITEM_ADDED atualize o carrinho antes de qualquer lógica subsequente.",
  checkout_not_reached:
    "Verificar se o fluxo de checkout é disparado corretamente após adição ao carrinho.",
  order_not_confirmed:
    "Revisar AFTER_CHECKOUT para garantir retorno de resposta válida de confirmação.",
  response_contract_error:
    "Adicionar validação de schema na saída do WaiterBrain antes de retornar resposta.",
  timeout:
    "Otimizar queries de banco, adicionar cache de catálogo e verificar DATABASE_URL no Railway.",
  unknown_error:
    "Ativar logging estruturado no servidor e investigar stack trace completo.",
  bad_product_fit:
    "Implementar filtro de adequação por orçamento/perfil no ranqueamento de produtos.",
  repeated_suggestion:
    "Adicionar set de IDs já sugeridos na sessão e excluí-los de futuras recomendações.",
  invalid_card_id:
    "Validar todos os IDs em cards[] contra o catálogo ativo antes de retornar resposta.",
};

// ── Severity ──────────────────────────────────────────────────────────────────

export function computeSeverity(
  failures: FailureType[],
  status:   "PASS" | "FAIL" | "ERROR",
): Severity {
  if (status === "ERROR") return "critical";
  if (failures.includes("checkout_not_reached") || failures.includes("order_not_confirmed")) return "critical";
  if (failures.includes("response_contract_error") || failures.includes("timeout")) return "high";
  if (failures.length >= 3) return "high";
  if (failures.length >= 1) return "medium";
  return "low";
}

// ── Root cause / fix derivation ───────────────────────────────────────────────

export function computeProbableRootCause(failures: FailureType[]): string {
  if (failures.length === 0) return "Nenhuma falha detectada.";
  const primary = failures[0];
  return primary ? (ROOT_CAUSE_MAP[primary] ?? "Causa desconhecida.") : "Causa desconhecida.";
}

export function computeRecommendedFix(failures: FailureType[]): string {
  if (failures.length === 0) return "Nenhuma ação necessária.";
  const primary = failures[0];
  return primary ? (RECOMMENDED_FIX_MAP[primary] ?? "Investigar logs.") : "Investigar logs.";
}

// ── Area scores ───────────────────────────────────────────────────────────────

const AREA_FAILURES: Record<keyof Omit<AreaScores, "overallScore">, FailureType[]> = {
  intentScore:         ["wrong_intent_detection"],
  productFitScore:     ["missing_cards", "bad_product_fit", "product_mismatch", "invisible_product_mention"],
  visualSyncScore:     ["extra_buttons_after_cards", "ui_invasion_after_click", "invalid_card_id"],
  salesCopyScore:      ["weak_sales_response"],
  userControlScore:    ["missing_options", "repeated_suggestion"],
  checkoutSafetyScore: ["checkout_interference", "cart_not_updated", "checkout_not_reached", "order_not_confirmed"],
};

export function computeAreaScores(results: ScenarioResult[]): AreaScores {
  if (results.length === 0) {
    return {
      intentScore: 0, productFitScore: 0, visualSyncScore: 0,
      salesCopyScore: 0, userControlScore: 0, checkoutSafetyScore: 0, overallScore: 0,
    };
  }

  const scores: Partial<AreaScores> = {};
  const areaKeys = Object.keys(AREA_FAILURES) as (keyof Omit<AreaScores, "overallScore">)[];

  for (const area of areaKeys) {
    const relevant = AREA_FAILURES[area];
    let penalty = 0;
    for (const r of results) {
      penalty += r.failures.filter((f) => relevant.includes(f)).length * 15;
    }
    scores[area] = Math.max(0, 100 - penalty);
  }

  const values = areaKeys.map((k) => scores[k] ?? 100);
  scores.overallScore = Math.round(values.reduce((a, b) => a + b, 0) / values.length);

  return scores as AreaScores;
}

// ── Top 5 fix recommendations ─────────────────────────────────────────────────

export function generateTopFixes(results: ScenarioResult[]): FixRecommendation[] {
  const failureMap = new Map<FailureType, Set<string>>();
  for (const r of results) {
    for (const ft of r.failures) {
      if (!failureMap.has(ft)) failureMap.set(ft, new Set());
      failureMap.get(ft)!.add(r.profileName);
    }
  }

  return [...failureMap.entries()]
    .sort(([, a], [, b]) => b.size - a.size)
    .slice(0, 5)
    .map(([ft, scenarios], idx) => ({
      priority:           idx + 1,
      failureType:        ft,
      affectedScenarios:  [...scenarios],
      reason:             ROOT_CAUSE_MAP[ft]          ?? "Causa desconhecida.",
      implementationArea: FAILURE_TO_FIX_AREA[ft]    ?? "indefinido",
      expectedImpact:     RECOMMENDED_FIX_MAP[ft]    ?? "Investigar logs.",
    }));
}

// ── Validation ────────────────────────────────────────────────────────────────

const VALID_MODES  = ["BROWSE", "SUGGESTION", "INTERVENTION", "CHECKOUT_SUPPORT"];
const WEAK_PHRASES = /^(ok|beleza|ótimo|certo|perfeito|entendi|claro)[.!]?$/i;

export function validateStep(
  event:        string,
  response:     WaiterResponse | null,
  catalogIds:   Set<string>,
  requireCards: boolean,
): { assertions: StepAssertion[]; failureTypes: FailureType[]; passed: boolean } {
  const assertions:   StepAssertion[] = [];
  const failureTypes: FailureType[]   = [];

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
    if (response.options.length === 0) {
      failureTypes.push("missing_cards");
    } else {
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

  const failureTypes: Partial<Record<FailureType, number>> = {};
  for (const r of results) {
    for (const ft of r.failures) {
      failureTypes[ft] = (failureTypes[ft] ?? 0) + 1;
    }
  }

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
    scenarioResults:  results,
    areaScores:       computeAreaScores(results),
    topFixes:         generateTopFixes(results),
  };
}

// ── Export helpers ────────────────────────────────────────────────────────────

export function toCsv(report: AutoPilotReport): string {
  const header = [
    "Cenário",
    "Objetivo",
    "Status",
    "Severidade",
    "Turnos",
    "Cards mostrados",
    "Checkout",
    "Intenção Esperada",
    "Intenção Detectada",
    "Ação Esperada",
    "Ação Real",
    "Causa Provável",
    "Correção Recomendada",
    "Falhas",
    "Área de Correção",
  ].join(",");

  const rows = report.scenarioResults.map((r) => {
    const fixAreas = r.failures.map((f) => FAILURE_TO_FIX_AREA[f] ?? "").filter(Boolean).join("; ");
    return [
      `"${r.profileName}"`,
      `"${r.goal}"`,
      r.status,
      r.severity,
      r.stepsRun,
      r.cardsShown.length,
      r.checkoutReached ? "Sim" : "Não",
      `"${r.expectedIntent}"`,
      `"${r.detectedIntent}"`,
      `"${r.expectedAction.replace(/"/g, "'")}"`,
      `"${r.actualAction.replace(/"/g, "'")}"`,
      `"${r.probableRootCause.replace(/"/g, "'")}"`,
      `"${r.recommendedFix.replace(/"/g, "'")}"`,
      `"${r.failures.join("; ")}"`,
      `"${fixAreas}"`,
    ].join(",");
  });

  return [header, ...rows].join("\n");
}

export function toSummaryText(report: AutoPilotReport): string {
  const date = new Date(report.runAt).toLocaleString("pt-BR");
  const { areaScores: a } = report;

  const lines: string[] = [
    "=== WAITER LAB AUTOPILOT REPORT ===",
    `Data:         ${date}`,
    `Restaurante:  ${report.restaurantName} (${report.slug})`,
    "",
    "=== SCORES POR ÁREA ===",
    `  Intenção:       ${a.intentScore}/100`,
    `  Produto:        ${a.productFitScore}/100`,
    `  Sinc. Visual:   ${a.visualSyncScore}/100`,
    `  Copy Comercial: ${a.salesCopyScore}/100`,
    `  Controle UI:    ${a.userControlScore}/100`,
    `  Checkout:       ${a.checkoutSafetyScore}/100`,
    `  GERAL:          ${a.overallScore}/100`,
    "",
    `Score (PASS/total): ${report.score}/100`,
    `Passou:       ${report.passed}/${report.totalScenarios}`,
    `Falhou:       ${report.failed}/${report.totalScenarios}`,
    `Erro:         ${report.errored}/${report.totalScenarios}`,
    `Conversão:    ${report.conversionRate}% (chegou ao checkout)`,
    `Média turnos: ${report.avgTurns}`,
    `Média cards:  ${report.avgCardsReturned}`,
    "",
    "=== TOP 5 CORREÇÕES PRIORITÁRIAS ===",
    ...report.topFixes.map((fix) => [
      `  #${fix.priority} [${fix.failureType}]`,
      `      Cenários afetados: ${fix.affectedScenarios.join(", ")}`,
      `      Área: ${fix.implementationArea}`,
      `      Causa: ${fix.reason}`,
      `      Correção: ${fix.expectedImpact}`,
    ].join("\n")),
    ...(report.topFixes.length === 0 ? ["  Nenhuma correção necessária."] : []),
    "",
    "=== PRINCIPAIS FALHAS ===",
    ...Object.entries(report.failureTypes)
      .sort(([, a], [, b]) => b - a)
      .map(([k, v]) => `  ${k}: ${v}x → ${FAILURE_TO_FIX_AREA[k as FailureType] ?? ""}`),
    ...(Object.keys(report.failureTypes).length === 0 ? ["  Nenhuma falha registrada."] : []),
    "",
    "=== CENÁRIOS ===",
    ...report.scenarioResults.map((r) =>
      [
        `  [${r.status}] ${r.profileName} — Severidade: ${r.severity.toUpperCase()}`,
        `          Objetivo:           ${r.goal}`,
        `          Intenção esperada:  ${r.expectedIntent}`,
        `          Intenção detectada: ${r.detectedIntent}`,
        `          Ação esperada:      ${r.expectedAction}`,
        `          Ação real:          ${r.actualAction}`,
        `          Turnos: ${r.stepsRun} | Cards: ${r.cardsShown.length} | Checkout: ${r.checkoutReached ? "Sim" : "Não"}`,
        r.failures.length > 0 ? `          Falhas: ${r.failures.join(", ")}` : "",
        r.probableRootCause !== "Nenhuma falha detectada."
          ? `          Causa: ${r.probableRootCause}` : "",
        r.recommendedFix !== "Nenhuma ação necessária."
          ? `          Correção: ${r.recommendedFix}` : "",
        r.waiterMessage
          ? `          Última msg: "${r.waiterMessage.slice(0, 120)}${r.waiterMessage.length > 120 ? "…" : ""}"` : "",
      ].filter(Boolean).join("\n")
    ),
  ];
  return lines.join("\n");
}
