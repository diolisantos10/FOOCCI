/**
 * WaiterBrain — intent-driven decision layer for the AI waiter.
 *
 * Sits between user input and AI response generation.
 * Extracts customer intent → decides next action → produces a directive string
 * injected into the system prompt sysAddendum.
 *
 * Design contract:
 *   The customer leads the conversation.
 *   The system (WaiterBrain) controls the sale.
 *   The AI executes communication.
 *
 * Pure functions — no DB calls. Works with data already loaded by AIOrderService.
 */

import { isDessertCategory, isMainCategory } from "./ConversationGuardrails";
import type { UpsellSuggestion } from "./UpsellEngine";

// ─── public types ─────────────────────────────────────────────

export type CustomerIntent =
  | "CHECKOUT"
  | "DIRECT_ORDER"
  | "CATEGORY_BROWSING"
  | "NEED_RECOMMENDATION"
  | "PRICE_SENSITIVE"
  | "EXPLORING";

export type NextAction =
  | "ASK_QUESTION"
  | "RECOMMEND_MAIN"
  | "ADD_ITEM"
  | "EXPAND_FOOD"
  | "SUGGEST_UPSELL"
  | "CONFIRM_ORDER";

export interface WaiterState {
  cartItemCount: number;
  upsellStage: "food" | 3 | 4 | "none";
  drinkAttemptsPrior: number;
}

export interface WaiterDecision {
  intent: CustomerIntent;
  action: NextAction;
  directive: string;
}

export interface WaiterBrainInput {
  userMessage: string;
  state: WaiterState;
  /** Pre-scored, pre-filtered candidates from UpsellEngine (or main-item fallback). */
  candidates: UpsellSuggestion[];
}

// ─── intent patterns (pt-BR) ─────────────────────────────────

// Short standalone affirmatives — 1-2 words, no need for full patterns
const AFFIRMATIVE_SHORTS = new Set([
  "sim", "pode", "ok", "isso", "quero", "bora", "👍", "perfeito",
  "ótimo", "boa", "certo", "claro", "vai", "manda", "coloca",
]);

// Short standalone refusals — advance the funnel, no more suggestions
const REFUSAL_SHORTS = new Set([
  "não", "nao", "n", "dispensa", "dispenso", "nope",
]);

const CHECKOUT_PATTERNS = [
  "pode fechar", "pode confirmar", "pode ir", "fechar pedido",
  "finaliza", "finalizar", "confirma", "confirmar",
  "é isso", "só isso", "tá bom", "tá ótimo", "tá boa",
  "pronto", "já tá bom", "já escolhi", "quero fechar", "quero confirmar",
  "manda", "manda já", "fecha o pedido", "fecha aí", "pode mandar",
  "só isso mesmo", "tudo certo", "tá certo", "fechado", "combinado",
  "isso mesmo", "vai assim", "assim tá bom",
];

const DIRECT_ORDER_PATTERNS = [
  "quero o ", "quero a ", "quero um ", "quero uma ",
  "me traz", "coloca o", "coloca a", "coloca um", "coloca uma",
  "adiciona o", "adiciona a", "pode colocar", "pode adicionar",
  "vou querer", "vou pedir", "me coloca", "me adiciona",
  "pode pedir", "vou de ", "me bota", "bota o", "bota a",
  "pede o", "pede a",
];

const RECOMMENDATION_PATTERNS = [
  "me sugere", "me indica", "o que você recomenda", "o que recomenda",
  "qual é o melhor", "qual o melhor", "o que tem de bom", "o que é bom",
  "me ajuda a escolher", "não sei o que pedir", "não sei o que escolher",
  "você escolhe", "pode escolher", "pode sugerir",
  "me dá uma sugestão", "me dá uma dica", "qual você indica",
  "não sei", "indeciso", "me orienta", "o que você sugere",
  "qual a especialidade", "o que é mais pedido",
];

const PRICE_PATTERNS = [
  "mais barato", "mais em conta", "econômico", "mais acessível",
  "quanto custa", "quanto é", "qual o preço", "qual o valor",
  "promoção", "desconto", "oferta", "barato",
  "não quero gastar muito", "opção mais barata", "custo benefício",
];

const BROWSING_PATTERNS = [
  "o que tem", "quais são as opções", "me mostra", "o cardápio",
  "tem algum", "tem alguma", "o que vocês têm",
  "opções de", "tipos de", "o que tem de",
];

// ─── intent classifier ────────────────────────────────────────

export function classifyIntent(userMessage: string): CustomerIntent {
  const msg = userMessage.toLowerCase().trim();
  if (!msg) return "EXPLORING";

  // Short standalone messages (≤2 words): check affirmatives/refusals before patterns.
  // Avoids misclassifying "sim" as EXPLORING when the customer is accepting a suggestion.
  const wordCount = msg.split(/\s+/).length;
  if (wordCount <= 2) {
    const clean = msg.replace(/[!?.,'"]/g, "").trim();
    if (AFFIRMATIVE_SHORTS.has(clean)) return "DIRECT_ORDER";
    if (REFUSAL_SHORTS.has(clean))     return "CHECKOUT";
  }

  if (CHECKOUT_PATTERNS.some((p) => msg.includes(p)))          return "CHECKOUT";
  if (PRICE_PATTERNS.some((p) => msg.includes(p)))             return "PRICE_SENSITIVE";
  if (RECOMMENDATION_PATTERNS.some((p) => msg.includes(p)))   return "NEED_RECOMMENDATION";
  if (DIRECT_ORDER_PATTERNS.some((p) => msg.includes(p)))     return "DIRECT_ORDER";
  if (BROWSING_PATTERNS.some((p) => msg.includes(p)))         return "CATEGORY_BROWSING";
  return "EXPLORING";
}

// ─── decision layer ───────────────────────────────────────────

export function decideNextAction(
  state: WaiterState,
  intent: CustomerIntent,
  candidates: UpsellSuggestion[],
): NextAction {
  const foodCandidates    = candidates.filter((c) => isMainCategory(c.categoryName));
  const drinkCandidates   = candidates.filter(
    (c) => !isMainCategory(c.categoryName) && !isDessertCategory(c.categoryName),
  );
  const dessertCandidates = candidates.filter((c) => isDessertCategory(c.categoryName));

  // Priority 1 — CHECKOUT intent: skip food expansion → complement phase (drink → dessert → confirm)
  if (intent === "CHECKOUT") {
    if (state.cartItemCount === 0) return "ASK_QUESTION";
    // Offer drink once if not yet attempted (complement phase entry)
    if (drinkCandidates.length > 0 && state.drinkAttemptsPrior === 0) {
      return "SUGGEST_UPSELL";
    }
    // Offer dessert if drink already done and dessert available
    if (state.upsellStage === 4 && dessertCandidates.length > 0) {
      return "SUGGEST_UPSELL";
    }
    return "CONFIRM_ORDER";
  }

  // Priority 2 — DIRECT ORDER (customer named or accepted a specific item)
  if (intent === "DIRECT_ORDER") return "ADD_ITEM";

  // Priority 3 — Empty cart: must get main item before anything else
  if (state.cartItemCount === 0) {
    if (intent === "NEED_RECOMMENDATION" || intent === "PRICE_SENSITIVE") {
      return candidates.length > 0 ? "RECOMMEND_MAIN" : "ASK_QUESTION";
    }
    return "ASK_QUESTION";
  }

  // Priority 4 — Browsing/exploring: answer contextually, don't push
  if (intent === "CATEGORY_BROWSING") return "ASK_QUESTION";

  // Priority 5 — Upsell funnel: food expansion first, drink/dessert only via CHECKOUT path
  if (state.upsellStage === "food") {
    return foodCandidates.length > 0 ? "EXPAND_FOOD" : "CONFIRM_ORDER";
  }
  // Stages 3/4 reached without CHECKOUT signal means food candidates exhausted — just confirm
  if (state.upsellStage === 3 || state.upsellStage === 4) {
    return "CONFIRM_ORDER";
  }

  return "CONFIRM_ORDER";
}

// ─── directive builder ────────────────────────────────────────

export function buildWaiterDirective(
  intent: CustomerIntent,
  action: NextAction,
  state: WaiterState,
  candidates: UpsellSuggestion[],
  priceSensitive: boolean,
): string {
  const drinkCandidates   = candidates.filter(
    (c) => !isMainCategory(c.categoryName) && !isDessertCategory(c.categoryName),
  );
  const dessertCandidates = candidates.filter((c) => isDessertCategory(c.categoryName));
  const mainCandidates    = candidates.filter((c) => isMainCategory(c.categoryName));

  const lines: string[] = [
    "",
    "━━━ WAITER DECISION (prioridade máxima neste turno) ━━━",
    `INTENÇÃO: ${intent}  |  AÇÃO: ${action}`,
    "",
  ];

  switch (action) {
    case "CONFIRM_ORDER":
      lines.push(
        "→ Execute confirm_order AGORA. confirm_order gera o resumo — não repita os itens.",
        "→ confirm_order aceita qualquer carrinho não-vazio — upsell é opcional, não bloqueia.",
        "→ PROIBIDO: nova sugestão, nova pergunta, novo produto, qualquer texto além do fechamento.",
        "→ Resposta máxima: 1 frase de fechamento + confirm_order.",
      );
      break;

    case "ADD_ITEM":
      lines.push(
        "→ Cliente pediu item ou aceitou sugestão ('sim'/'ok'/'pode'/'isso').",
        "→ Se a mensagem foi curta: identifique o item da última sugestão no histórico.",
        "→ Localize o ID exato no CARDÁPIO → execute add_item.",
        "→ Após success:true: 1 frase curta de confirmação → avance o funil sem pausar.",
      );
      break;

    case "RECOMMEND_MAIN": {
      const pool = mainCandidates.length > 0 ? mainCandidates : candidates;
      const pick = priceSensitive
        ? [...pool].sort((a, b) => a.price - b.price)[0]
        : pool[0];
      if (pick) {
        lines.push(
          "PRODUTO RECOMENDADO:",
          `  • [ID: ${pick.menuItemId}] ${pick.name} — R$ ${pick.price.toFixed(2)}`,
          "→ Formato obrigatório: [nome] + [1 benefício curto] + [pergunta de confirmação].",
          "→ Exemplo: 'O [Prato X] é perfeito pra você. Mando?'",
          "→ Execute suggest_upsell com o ID acima. NUNCA liste mais de 1 produto.",
          "→ SEMPRE termine com a pergunta de confirmação — sem ela o cliente não confirma.",
        );
      } else {
        lines.push(
          "→ Sem candidato disponível. Faça 1 pergunta de qualificação:",
          "  'Prefere algo mais leve ou mais completo?'",
        );
      }
      break;
    }

    case "EXPAND_FOOD": {
      const foodCandidates = candidates.filter((c) => isMainCategory(c.categoryName));
      const pick = priceSensitive
        ? [...foodCandidates].sort((a, b) => a.price - b.price)[0]
        : foodCandidates[0];
      if (pick) {
        lines.push(
          "FASE: EXPANSÃO DO PEDIDO — sugira mais comida antes de oferecer complementos.",
          "PRODUTO SUGERIDO (complementar ao que já foi pedido):",
          `  • [ID: ${pick.menuItemId}] ${pick.name} — R$ ${pick.price.toFixed(2)}`,
          "→ Formato: [nome] + [1 benefício curto] + [pergunta de confirmação].",
          "→ Execute suggest_upsell com o ID acima.",
          "→ PROIBIDO nesta fase: oferecer bebida, sobremesa ou qualquer complemento líquido/doce.",
          "→ Bebida e sobremesa são oferecidos SOMENTE após sinal de fechamento do cliente.",
        );
      } else {
        lines.push("→ Sem itens de comida disponíveis para expansão. Execute confirm_order imediatamente.");
      }
      break;
    }

    case "SUGGEST_UPSELL": {
      // isDrinkStage: explicit stage 3, OR food stage bypassed by CHECKOUT intent (complement phase)
      const isDrinkStage = state.upsellStage === 3 ||
        (state.upsellStage === "food" && drinkCandidates.length > 0);
      const pool = isDrinkStage
        ? (drinkCandidates.length > 0 ? drinkCandidates : candidates)
        : (dessertCandidates.length > 0 ? dessertCandidates : candidates);
      const pick = priceSensitive
        ? [...pool].sort((a, b) => a.price - b.price)[0]
        : pool[0];

      const drinkAttemptsNote = isDrinkStage && state.drinkAttemptsPrior >= 1
        ? "  ⚠️ Esta é a 2ª tentativa de bebida. Se recusar → avance para sobremesa e nunca mais tente bebida."
        : "";

      if (pick) {
        lines.push(
          `PRODUTO (${isDrinkStage ? "bebida" : "sobremesa"}):`,
          `  • [ID: ${pick.menuItemId}] ${pick.name} — R$ ${pick.price.toFixed(2)}`,
          "→ 1 frase curta de introdução + suggest_upsell. Sem explicação longa.",
          `→ Limite: ${isDrinkStage ? "máx 2 tentativas de bebida" : "máx 1 tentativa de sobremesa"}.`,
          "→ Recusa: aceite imediatamente, troque de categoria. NUNCA insista.",
          "→ 2ª recusa em qualquer categoria → execute confirm_order direto.",
          ...(drinkAttemptsNote ? [drinkAttemptsNote] : []),
        );
      } else {
        lines.push("→ Sem candidato para sugestão. Execute confirm_order imediatamente.");
      }
      break;
    }

    case "ASK_QUESTION":
      if (state.cartItemCount === 0) {
        lines.push(
          "→ Faça UMA única pergunta de qualificação — a mais relevante para o contexto:",
          "  'Prefere algo mais leve ou mais completo?'",
          "  'Tá com fome ou quer algo rápido?'",
          "  'É só pra você ou vai dividir?'",
          "→ UMA pergunta. Zero produtos listados. Zero explicações. Aguarde resposta.",
        );
      } else {
        lines.push(
          "→ Responda diretamente ao que o cliente pediu. Sem pressão.",
          "→ Se mostrar interesse → recomende 1 item com convicção e pergunta de confirmação.",
        );
      }
      break;
  }

  lines.push("━━━");
  return lines.join("\n");
}

// ─── public API ───────────────────────────────────────────────

export function decide(input: WaiterBrainInput): WaiterDecision {
  const { userMessage, state, candidates } = input;
  const intent         = classifyIntent(userMessage);
  const priceSensitive = intent === "PRICE_SENSITIVE";
  const action         = decideNextAction(state, intent, candidates);
  const directive      = buildWaiterDirective(intent, action, state, candidates, priceSensitive);
  return { intent, action, directive };
}
