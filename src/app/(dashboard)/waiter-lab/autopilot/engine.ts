import type {
  FailureType,
  StepAssertion,
  WaiterResponse,
  ScenarioResult,
  AutoPilotReport,
  AreaScores,
  FixRecommendation,
  Severity,
  SilentMetrics,
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
  // ── Silent customer failures ─────────────────────────────────────────────────
  missed_final_upsell:
    "Upsell final não foi oferecido. No ON_CHECKOUT_STARTED (silent), retornar options com 'Ver opções' e 'Não, finalizar'.",
  premature_intervention:
    "Waiter interrompeu navegação silenciosa sem sinal claro de intenção. Aguardar checkout intent para agir.",
  repeated_prompt:
    "Prompt de permissão foi repetido no mesmo cenário. Implementar cooldown de sessão após aceite ou recusa.",
  ignored_decline:
    "Após recusa de ajuda, Waiter voltou a oferecer opções. Implementar estado de silêncio após ON_PERMISSION_DECLINED.",
  wrong_cart_context:
    "Sugestão ignorou contexto do carrinho. Usar cart[] para determinar o que falta (bebida, sobremesa).",
  missed_drink_opportunity:
    "Carrinho sem bebida mas Waiter não ofereceu. No checkout intent, verificar ausência de bebida antes de sugerir.",
  missed_dessert_opportunity:
    "Carrinho sem sobremesa mas Waiter não ofereceu. No checkout intent, verificar ausência de sobremesa.",
  invasive_after_item_add:
    "ON_ITEM_ADDED retornou cards ou options. Rule 7 deve garantir cards=[], options=[] após click.",
  checkout_prompt_repeated:
    "Prompt de checkout foi repetido. Verificar deduplicação no fluxo de ON_CHECKOUT_STARTED.",
  silent_customer_not_supported:
    "Comportamento silencioso não é suportado. Implementar detecção de intenção behavioral além de mensagens de texto.",
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
  invalid_card_id:              "catalog validation / ID sync",
  missed_final_upsell:          "checkout upsell flow / ON_CHECKOUT_STARTED handler",
  premature_intervention:       "silent detection / ON_IDLE timing",
  repeated_prompt:              "session state / cooldown management",
  ignored_decline:              "session state / ON_PERMISSION_DECLINED handler",
  wrong_cart_context:           "cart context awareness / product ranking",
  missed_drink_opportunity:     "cart gap detection / checkout upsell",
  missed_dessert_opportunity:   "cart gap detection / checkout upsell",
  invasive_after_item_add:      "event routing / ON_ITEM_ADDED handler (Rule 7)",
  checkout_prompt_repeated:     "session state / checkout flow deduplication",
  silent_customer_not_supported: "behavioral intent detection / silent customer handling",
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
  missed_final_upsell:
    "ON_CHECKOUT_STARTED não ofereceu permission gate via options[] para upsell final.",
  premature_intervention:
    "Waiter interrompeu antes do sinal de checkout, perturbando a navegação silenciosa.",
  repeated_prompt:
    "Estado de sessão não registrou o aceite/recusa anterior, causando repetição de prompt.",
  ignored_decline:
    "Handler ON_PERMISSION_DECLINED não alterou o modo de sessão para silêncio.",
  wrong_cart_context:
    "Waiter sugeriu produto sem considerar o conteúdo atual do carrinho.",
  missed_drink_opportunity:
    "Waiter não detectou ausência de bebida no carrinho durante intent de checkout.",
  missed_dessert_opportunity:
    "Waiter não detectou ausência de sobremesa no carrinho durante intent de checkout.",
  invasive_after_item_add:
    "Handler ON_ITEM_ADDED retornou cards[] ou options[], violando Rule 7.",
  checkout_prompt_repeated:
    "Lógica de checkout não verifica se prompt já foi exibido na sessão.",
  silent_customer_not_supported:
    "WaiterBrain não possui lógica específica para clientes silenciosos/behavioral.",
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
  missed_final_upsell:
    "No ON_CHECKOUT_STARTED, retornar options=['Ver opções', 'Não, finalizar'] para permission gate de upsell.",
  premature_intervention:
    "Restringir intervenção ativa ao evento ON_CHECKOUT_STARTED para clientes sem mensagem de texto.",
  repeated_prompt:
    "Salvar estado 'permission_resolved' na sessão após aceite ou recusa e não repetir prompt.",
  ignored_decline:
    "Ao receber ON_PERMISSION_DECLINED, salvar 'silent_mode=true' e retornar reply neutro sem options ou cards.",
  wrong_cart_context:
    "Passar cart[] para o ranqueador de produtos e excluir categorias já presentes no pedido.",
  missed_drink_opportunity:
    "Verificar se cart[] contém bebida antes de finalizar; se não, incluir na sugestão de upsell.",
  missed_dessert_opportunity:
    "Verificar se cart[] contém sobremesa antes de finalizar; se não, incluir na sugestão de upsell.",
  invasive_after_item_add:
    "No handler ON_ITEM_ADDED, sempre retornar cards=[], options=[] (Rule 7 já define isso).",
  checkout_prompt_repeated:
    "Adicionar flag 'checkout_upsell_shown' na sessão e verificar antes de exibir novamente.",
  silent_customer_not_supported:
    "Implementar módulo de detecção comportamental baseado em eventos (ON_ITEM_ADDED, ON_IDLE, ON_CHECKOUT_STARTED) sem necessidade de mensagem de texto.",
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
  intentScore:         ["wrong_intent_detection", "premature_intervention", "silent_customer_not_supported"],
  productFitScore:     ["missing_cards", "bad_product_fit", "product_mismatch", "invisible_product_mention", "wrong_cart_context"],
  visualSyncScore:     ["extra_buttons_after_cards", "ui_invasion_after_click", "invalid_card_id", "invasive_after_item_add"],
  salesCopyScore:      ["weak_sales_response", "missed_final_upsell", "missed_drink_opportunity", "missed_dessert_opportunity"],
  userControlScore:    ["missing_options", "repeated_suggestion", "repeated_prompt", "ignored_decline", "checkout_prompt_repeated"],
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

// ── Silent metrics ────────────────────────────────────────────────────────────

export function computeSilentMetrics(results: ScenarioResult[]): SilentMetrics {
  const silent = results.filter((r) => r.isSilent);
  const total  = silent.length;

  if (total === 0) {
    return {
      silentScenarioCount: 0, silentPassed: 0, silentFailed: 0,
      silentConversionRate: 0, finalUpsellOfferedRate: 0, finalUpsellAcceptedRate: 0,
      invasionFailures: 0, missedUpsellOpportunities: 0,
    };
  }

  const passed   = silent.filter((r) => r.status === "PASS").length;
  const reached  = silent.filter((r) => r.checkoutReached).length;

  const upsellOffered = silent.filter((r) =>
    r.steps.some(
      (s) => s.event === "ON_CHECKOUT_STARTED" && s.response && s.response.options.length > 0,
    )
  ).length;

  const upsellAccepted = silent.filter((r) =>
    r.steps.some(
      (s) => s.event === "ON_PERMISSION_ACCEPTED" && s.response && s.response.cards.length > 0,
    )
  ).length;

  const INVASION_TYPES: FailureType[] = ["invasive_after_item_add", "ui_invasion_after_click"];
  const invasionCount = silent.reduce(
    (sum, r) => sum + r.failures.filter((f) => INVASION_TYPES.includes(f)).length, 0,
  );

  const MISSED_UPSELL: FailureType[] = [
    "missed_final_upsell", "missed_drink_opportunity", "missed_dessert_opportunity",
  ];
  const missedCount = silent.reduce(
    (sum, r) => sum + r.failures.filter((f) => MISSED_UPSELL.includes(f)).length, 0,
  );

  return {
    silentScenarioCount:       total,
    silentPassed:              passed,
    silentFailed:              total - passed,
    silentConversionRate:      Math.round((reached       / total)         * 100),
    finalUpsellOfferedRate:    Math.round((upsellOffered / total)         * 100),
    finalUpsellAcceptedRate:   upsellOffered > 0
                                 ? Math.round((upsellAccepted / upsellOffered) * 100)
                                 : 0,
    invasionFailures:          invasionCount,
    missedUpsellOpportunities: missedCount,
  };
}

// ── Evaluator version ─────────────────────────────────────────────────────────
// Bump this string any time the evaluation rules change so stale Railway builds
// are immediately visible in the UI.
export const EVALUATOR_VERSION = "2026-05-01-fix-checkout-gate-v2";

// ── Validation ────────────────────────────────────────────────────────────────

const VALID_MODES  = ["BROWSE", "SUGGESTION", "INTERVENTION", "CHECKOUT_SUPPORT"];
const WEAK_PHRASES = /^(ok|beleza|ótimo|certo|perfeito|entendi|claro)[.!]?$/i;

// Sales language that must NOT appear during checkout events (AFTER_CHECKOUT or
// CHECKOUT_SUPPORT mode). Does NOT apply to the final-upsell permission gate —
// see isFinalUpsellGate() below.
const CHECKOUT_SALES_PHRASES = /\b(vou sugerir|que tal|combina|tente|experimente|aproveite|bebida|drink|sobremesa|acompanhe?|complementa?|adicional|quer experimentar|posso sugerir|sugiro)\b/i;

/**
 * Returns true when the response is the expected final-upsell permission gate
 * emitted by handleCheckoutStarted() in WaiterBrainV2.
 *
 * A valid gate MUST have:
 *   - mode: "INTERVENTION"  (not CHECKOUT_SUPPORT — checkout hasn't started yet)
 *   - cards: []             (no products before permission)
 *   - options: includes "see_final_suggestions" AND "continue_checkout"
 *
 * This gate intentionally mentions "bebida"/"sobremesa" in its reply and must
 * NEVER be flagged as checkout_interference.
 */
export function isFinalUpsellGate(response: WaiterResponse): boolean {
  return (
    response.mode === "INTERVENTION" &&
    response.cards.length === 0 &&
    response.options.some((o) => o.value === "see_final_suggestions") &&
    response.options.some((o) => o.value === "continue_checkout")
  );
}

// Clear premium-intent patterns where qualification without cards signals wrong detection
const PREMIUM_PHRASES = /\b(melhor|especial|mais completo|premium|exclusiv[ao]|o que voc[êe]s t[êe]m)\b/i;

export function validateStep(
  event:        string,
  message:      string,
  response:     WaiterResponse | null,
  catalogIds:   Set<string>,
  requireCards: boolean,
  seenCardIds:  Set<string>,
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
  if (!lineOk) failureTypes.push("response_contract_error");

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

  // Duplicate card detection across turns
  if (response.cards.length > 0 && seenCardIds.size > 0) {
    const dups = response.cards.filter((id) => seenCardIds.has(id));
    if (dups.length > 0) {
      assertions.push({
        label:  "Sem cards repetidos entre turnos",
        pass:   false,
        detail: `IDs repetidos: ${dups.join(", ")}`,
      });
      failureTypes.push("repeated_suggestion");
    }
  }

  // Cards expected for last intent message
  if (requireCards && event === "ON_USER_MESSAGE" && response.cards.length === 0 && catalogIds.size > 0) {
    if (response.options.length === 0) {
      // No cards AND no options — clear missing_cards failure
      assertions.push({
        label:  "Cards esperados para intenção de produto",
        pass:   false,
        detail: `mode=${response.mode}, options=0`,
      });
      failureTypes.push("missing_cards");
    } else if (message && PREMIUM_PHRASES.test(message)) {
      // Clear premium intent but Waiter returned qualification buttons — wrong detection
      assertions.push({
        label:  "Intenção premium clara: Waiter deve retornar cards, não qualificação",
        pass:   false,
        detail: `options=${response.options.length}, cards=0`,
      });
      failureTypes.push("wrong_intent_detection");
    } else {
      // Options present on ambiguous message — acceptable qualifying question
      assertions.push({ label: "Options presentes (qualificando intenção)", pass: true });
    }
  }

  // Checkout sales guard — no selling language during checkout flow.
  // Exception: ON_CHECKOUT_STARTED may return a final-upsell permission gate
  // (mode=INTERVENTION, options=[see_final_suggestions, continue_checkout]).
  // That gate intentionally mentions "bebida"/"sobremesa" and is NOT interference.
  if (event === "ON_CHECKOUT_STARTED" || event === "AFTER_CHECKOUT") {
    const gateExempt = event === "ON_CHECKOUT_STARTED" && isFinalUpsellGate(response);
    if (!gateExempt) {
      assertions.push({ label: "Checkout: resposta é gate de upsell legítimo ou CHECKOUT_SUPPORT", pass: true });
    }
    if (!gateExempt && response.reply && CHECKOUT_SALES_PHRASES.test(response.reply)) {
      assertions.push({
        label:  "Sem pitch de vendas durante checkout",
        pass:   false,
        detail: "Linguagem de vendas detectada na mensagem de checkout",
      });
      failureTypes.push("checkout_interference");
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

  // Belt-and-suspenders: "pronto para piloto" only when no assertions failed anywhere
  const anyAssertionFailed = results.some((r) =>
    r.steps.some((s) => s.assertions.some((a) => !a.pass)),
  );
  if (passed === total && total > 0 && !anyAssertionFailed) {
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
    silentMetrics:    computeSilentMetrics(results),
  };
}

// ── Export helpers ────────────────────────────────────────────────────────────

export function toCsv(report: AutoPilotReport): string {
  const header = [
    "Tipo",
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
      r.isSilent ? "Silent" : "Typed",
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

  const sm     = report.silentMetrics;
  const typed  = report.scenarioResults.filter((r) => !r.isSilent);
  const silent = report.scenarioResults.filter((r) =>  r.isSilent);
  const typedPassed  = typed.filter((r)  => r.status === "PASS").length;
  const silentPassed = silent.filter((r) => r.status === "PASS").length;

  const lines: string[] = [
    "=== WAITER LAB AUTOPILOT REPORT ===",
    `Data:         ${date}`,
    `Restaurante:  ${report.restaurantName} (${report.slug})`,
    "",
    "=== SCORES GERAIS ===",
    `  Score total:    ${report.score}/100  (${report.passed}/${report.totalScenarios} passou)`,
    `  Typed:          ${typedPassed}/${typed.length} passou`,
    `  Silent:         ${silentPassed}/${silent.length} passou`,
    `  Conversão:      ${report.conversionRate}% checkout | avg ${report.avgTurns} turnos | avg ${report.avgCardsReturned} cards`,
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
    ...(sm.silentScenarioCount > 0 ? [
      "=== MÉTRICAS SILENT ===",
      `  Cenários silent:        ${sm.silentScenarioCount} (${sm.silentPassed} passou, ${sm.silentFailed} falhou)`,
      `  Conversão silent:       ${sm.silentConversionRate}%`,
      `  Upsell oferecido:       ${sm.finalUpsellOfferedRate}%`,
      `  Upsell aceito:          ${sm.finalUpsellAcceptedRate}%`,
      `  Invasões detectadas:    ${sm.invasionFailures}`,
      `  Upsells perdidos:       ${sm.missedUpsellOpportunities}`,
      "",
    ] : []),
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
        `  [${r.status}] [${r.isSilent ? "SILENT" : "TYPED "}] ${r.profileName} — Severidade: ${r.severity.toUpperCase()}`,
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

// ── Internal self-tests ───────────────────────────────────────────────────────
// Run at module load in development to catch evaluator regressions early.

/** Asserts that the final-upsell permission gate is never flagged as checkout_interference. */
export function runEvaluatorSelfTests(): { pass: boolean; failures: string[] } {
  const errors: string[] = [];

  // Test: final upsell gate from handleCheckoutStarted must NOT be checkout_interference
  const gateResponse: WaiterResponse = {
    reply:   "Antes de finalizar, quer ver uma bebida ou sobremesa pra acompanhar?",
    cards:   [],
    options: [
      { label: "Ver opções",      value: "see_final_suggestions" },
      { label: "Não, finalizar",  value: "continue_checkout"     },
    ],
    mode: "INTERVENTION",
  };
  const gateResult = validateStep(
    "ON_CHECKOUT_STARTED", "", gateResponse,
    new Set(["_test_id"]), false, new Set(),
  );
  if (gateResult.failureTypes.includes("checkout_interference")) {
    errors.push(
      `isFinalUpsellGate incorrectly flagged as checkout_interference ` +
      `(failureTypes=${gateResult.failureTypes.join(",")})`,
    );
  }

  // Test: actual CHECKOUT_SUPPORT sales content IS flagged
  const salesResponse: WaiterResponse = {
    reply:   "Que tal adicionar uma bebida para acompanhar?",
    cards:   [],
    options: [],
    mode:    "CHECKOUT_SUPPORT",
  };
  const salesResult = validateStep(
    "AFTER_CHECKOUT", "", salesResponse,
    new Set(["_test_id"]), false, new Set(),
  );
  if (!salesResult.failureTypes.includes("checkout_interference")) {
    errors.push(
      "AFTER_CHECKOUT with sales language was NOT flagged as checkout_interference",
    );
  }

  return { pass: errors.length === 0, failures: errors };
}
