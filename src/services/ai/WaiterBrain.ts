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
  | "SUGGEST_UPSELL"
  | "CONFIRM_ORDER";

export interface WaiterState {
  cartItemCount: number;
  upsellStage: 3 | 4 | "none";
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

  if (CHECKOUT_PATTERNS.some((p) => msg.includes(p)))          return "CHECKOUT";
  if (PRICE_PATTERNS.some((p) => msg.includes(p)))              return "PRICE_SENSITIVE";
  if (RECOMMENDATION_PATTERNS.some((p) => msg.includes(p)))    return "NEED_RECOMMENDATION";
  if (DIRECT_ORDER_PATTERNS.some((p) => msg.includes(p)))      return "DIRECT_ORDER";
  if (BROWSING_PATTERNS.some((p) => msg.includes(p)))          return "CATEGORY_BROWSING";
  return "EXPLORING";
}

// ─── decision layer ───────────────────────────────────────────

export function decideNextAction(
  state: WaiterState,
  intent: CustomerIntent,
  hasCandidates: boolean,
): NextAction {
  // These intents override the funnel
  if (intent === "CHECKOUT")     return "CONFIRM_ORDER";
  if (intent === "DIRECT_ORDER") return "ADD_ITEM";

  // Empty cart — focus on getting the main item
  if (state.cartItemCount === 0) {
    if (intent === "NEED_RECOMMENDATION" || intent === "PRICE_SENSITIVE") {
      return hasCandidates ? "RECOMMEND_MAIN" : "ASK_QUESTION";
    }
    return "ASK_QUESTION";
  }

  // Cart has items — CATEGORY_BROWSING doesn't force upsell
  if (intent === "CATEGORY_BROWSING") return "ASK_QUESTION";

  // All other intents follow the funnel
  if (state.upsellStage === 3 || state.upsellStage === 4) {
    return hasCandidates ? "SUGGEST_UPSELL" : "CONFIRM_ORDER";
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
        "→ Execute confirm_order AGORA.",
        "→ Se DRINK GATE bloquear: ofereça 1 bebida rápida → depois confirm_order.",
        "→ PROIBIDO: nova sugestão, nova pergunta, novo produto.",
      );
      break;

    case "ADD_ITEM":
      lines.push(
        "→ Cliente pediu item específico.",
        "→ Localize o ID exato no CARDÁPIO e execute add_item imediatamente.",
        "→ Após success:true: confirme brevemente e avance para próxima etapa do funil.",
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
          "→ Recomende com 1 frase natural e confiante. Execute suggest_upsell com este ID.",
          "→ NÃO liste alternativas. NÃO pergunte — RECOMENDE com convicção.",
        );
      } else {
        lines.push(
          "→ Sem candidato disponível. Faça 1 pergunta de qualificação:",
          "  'Prefere algo mais leve ou mais completo?'",
        );
      }
      break;
    }

    case "SUGGEST_UPSELL": {
      const isDrinkStage = state.upsellStage === 3;
      const pool = isDrinkStage
        ? (drinkCandidates.length > 0 ? drinkCandidates : candidates)
        : (dessertCandidates.length > 0 ? dessertCandidates : candidates);
      const pick = priceSensitive
        ? [...pool].sort((a, b) => a.price - b.price)[0]
        : pool[0];
      if (pick) {
        lines.push(
          `PRODUTO (${isDrinkStage ? "bebida" : "sobremesa"}):`,
          `  • [ID: ${pick.menuItemId}] ${pick.name} — R$ ${pick.price.toFixed(2)}`,
          "→ Introduza com 1 frase natural. Execute suggest_upsell com este ID.",
          "→ Se recusar: aceite imediatamente e avance. Não repita a categoria.",
        );
      } else {
        lines.push("→ Sem candidato para sugestão. Execute confirm_order.");
      }
      break;
    }

    case "ASK_QUESTION":
      if (state.cartItemCount === 0) {
        lines.push(
          "→ Faça UMA pergunta de qualificação (escolha a mais relevante):",
          "  'Prefere algo mais leve ou mais completo?'",
          "  'É só pra você ou vai dividir?'",
          "  'Está com mais fome ou quer algo rápido?'",
          "→ 1 pergunta apenas. Não liste produtos. Aguarde resposta.",
        );
      } else {
        lines.push(
          "→ Responda contextualmente. Não pressione.",
          "→ Se o cliente mostrar interesse: recomende com convicção.",
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
  const action         = decideNextAction(state, intent, candidates.length > 0);
  const directive      = buildWaiterDirective(intent, action, state, candidates, priceSensitive);
  return { intent, action, directive };
}
