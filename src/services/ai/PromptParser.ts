/**
 * PromptParser
 *
 * Converts a free-text scenario description (pt-BR or EN) into structured
 * simulation parameters consumable by ScenarioGenerator.
 *
 * Pure function — no AI, no DB, no side effects.
 * Safety: only extracts scenario parameters; never controls AI output directly.
 */

import type { BehaviorProfile, VariationLayer } from "./AISimulatorService";

export interface ParsedPrompt {
  intent:            BehaviorProfile["intent"];
  budget:            BehaviorProfile["budget"];
  groupSize:         BehaviorProfile["groupSize"];
  behavior:          BehaviorProfile["behavior"];
  dietary:           string | null;
  upsellOpenness:    VariationLayer["upsellOpenness"];
  patience:          VariationLayer["patience"];
  indecisionLevel:   VariationLayer["indecisionLevel"];
  budgetSensitivity: VariationLayer["budgetSensitivity"];
  /** Human-readable detected signals, for UI display. */
  signals:           string[];
}

// ─── normalizer ───────────────────────────────────────────────

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function anyMatch(text: string, keywords: string[]): boolean {
  return keywords.some((kw) => text.includes(norm(kw)));
}

// ─── keyword tables ───────────────────────────────────────────

const INTENT_SIGNALS: Array<[BehaviorProfile["intent"], string[]]> = [
  ["fome",     ["fome", "faminto", "faminta", "fominha", "com fome", "muita fome", "morrendo de fome", "hungry", "famished"]],
  ["direto",   ["direto", "direta", "objetivo", "objetiva", "quero fechar", "quer fechar", "decidido", "decidida", "sabe o que quer", "já sabe", "já decidiu"]],
  ["curioso",  ["curioso", "curiosa", "primeira vez", "nunca foi", "nunca comeu", "explorar", "conhecer", "olhando", "dando uma olhada"]],
  ["indeciso", ["indeciso", "indecisa", "dúvida", "perdido", "perdida", "sem ideia", "ajuda a escolher", "não sabe o que pedir", "não sabe"]],
];

const BUDGET_SIGNALS: Array<[BehaviorProfile["budget"], string[]]> = [
  ["baixo", ["barato", "baratos", "barata", "econômico", "econômica", "pouco dinheiro", "em conta", "apertado", "sem gastar", "cheap", "budget", "custo baixo", "mais barato", "economizar", "preço baixo", "não pode gastar", "gasta pouco", "não quer gastar", "sem muito dinheiro", "orçamento baixo", "gasto baixo", "algo barato", "algo em conta"]],
  ["alto",  ["premium", "melhor", "top", "luxo", "sofisticado", "não importa preço", "preço não é problema", "high-end", "best", "caro não é problema", "quer o melhor", "mais caro", "sem restrição de preço"]],
];

const GROUP_SIGNALS: Array<[BehaviorProfile["groupSize"], string[]]> = [
  ["família", ["família", "familia", "grupo", "criança", "crianças", "family", "group", "quatro pessoas", "cinco pessoas", "seis pessoas", "várias pessoas"]],
  ["dupla",   ["casal", "dois", "dupla", "couple", "duas pessoas", "somos dois", "para dois", "pra dois", "pra casal"]],
];

const BEHAVIOR_SIGNALS: Array<[BehaviorProfile["behavior"], string[]]> = [
  ["impaciente",           ["com pressa", "sem tempo", "apressado", "apressada", "urgente", "urgência", "muito rápido", "hurry", "quick"]],
  ["pergunta_primeiro",    ["primeira vez", "nunca comeu", "nunca foi", "não conhece", "tem dúvidas antes", "quer entender primeiro", "novato", "novata"]],
  ["recusa_upsell",        ["não quer mais nada", "só o principal", "anti-upsell", "não aceita sugestão", "só o básico", "só pedir", "não quer nada além", "rejeita sugestão"]],
  ["muda_de_ideia",        ["muda de ideia", "indeciso depois", "muda depois", "troca de ideia", "muda o pedido", "não se decide"]],
  ["recusa_depois_aceita", ["recusa depois aceita", "difícil de convencer", "resistente no começo", "resistente no início"]],
  ["aceita_upsell",        ["aceita sugestão", "aberto a sugestões", "quer ser guiado", "aceita recomendação", "quer sugestão", "pode sugerir"]],
];

const DIETARY_SIGNALS: Array<[string, string[]]> = [
  ["sem frutos do mar", ["frutos do mar", "camarão", "mariscos", "seafood", "shellfish", "alergia a camarão"]],
  ["sem glúten",        ["glúten", "celíaco", "celíaca", "sem gluten", "gluten free", "gluten-free"]],
  ["sem lactose",       ["lactose", "intolerante a lactose", "sem leite", "sem lácteo", "lactose intolerant"]],
  ["vegano",            ["vegano", "vegana", "vegan", "sem animal", "100% vegano"]],
  ["vegetariano",       ["vegetariano", "vegetariana", "sem carne", "não come carne", "vegetarian"]],
];

const OPENNESS_SIGNALS: Array<[VariationLayer["upsellOpenness"], string[]]> = [
  ["closed", ["não quer sugestão", "só o pedido", "sem sugestão", "anti-upsell", "não aceita nada", "não quer nada além", "quer fechar logo", "só o básico"]],
  ["open",   ["aberto a sugestões", "quer sugestão", "aceita recomendação", "quer ser guiado", "pode sugerir"]],
];

// ─── public API ───────────────────────────────────────────────

export function parseTestPrompt(input: string): ParsedPrompt {
  const text    = norm(input);
  const signals: string[] = [];

  // ── intent ─────────────────────────────────────────────────
  let intent: BehaviorProfile["intent"] = "indeciso";
  for (const [candidate, keywords] of INTENT_SIGNALS) {
    if (anyMatch(text, keywords)) {
      intent = candidate;
      signals.push(`intenção: ${intent}`);
      break;
    }
  }

  // ── budget ─────────────────────────────────────────────────
  let budget: BehaviorProfile["budget"] = "médio";
  for (const [candidate, keywords] of BUDGET_SIGNALS) {
    if (anyMatch(text, keywords)) {
      budget = candidate;
      signals.push(`orçamento: ${budget}`);
      break;
    }
  }

  // ── group size ──────────────────────────────────────────────
  let groupSize: BehaviorProfile["groupSize"] = "solo";
  for (const [candidate, keywords] of GROUP_SIGNALS) {
    if (anyMatch(text, keywords)) {
      groupSize = candidate;
      signals.push(`grupo: ${groupSize}`);
      break;
    }
  }

  // ── dietary ────────────────────────────────────────────────
  let dietary: string | null = null;
  for (const [label, keywords] of DIETARY_SIGNALS) {
    if (anyMatch(text, keywords)) {
      dietary = label;
      signals.push(`restrição: ${dietary}`);
      break;
    }
  }

  // ── urgency (affects patience and may force impaciente) ────
  const hasUrgency = anyMatch(text, ["pressa", "urgente", "urgência", "rápido", "rápida", "logo", "sem tempo", "apressado", "apressada"]);
  const patience: VariationLayer["patience"] = hasUrgency ? "short" : "long";
  if (hasUrgency) signals.push("paciência: curta (urgência detectada)");

  // ── behavior ───────────────────────────────────────────────
  let behavior: BehaviorProfile["behavior"] | null = null;
  for (const [candidate, keywords] of BEHAVIOR_SIGNALS) {
    if (anyMatch(text, keywords)) {
      behavior = candidate;
      signals.push(`comportamento: ${behavior}`);
      break;
    }
  }

  // Fallbacks: derive behavior from intent + context signals
  if (!behavior) {
    if (hasUrgency)          { behavior = "impaciente"; }
    else if (anyMatch(text, ["primeira vez", "nunca comeu", "nunca foi", "novato", "novata"])) {
      behavior = "pergunta_primeiro";
    }
    else if (budget === "baixo") { behavior = "recusa_upsell"; }
    else if (intent === "indeciso") { behavior = "ignora"; }
    else                         { behavior = "aceita_upsell"; }
    signals.push(`comportamento inferido: ${behavior}`);
  }

  // ── upsell openness ────────────────────────────────────────
  let upsellOpenness: VariationLayer["upsellOpenness"] = "neutral";
  for (const [candidate, keywords] of OPENNESS_SIGNALS) {
    if (anyMatch(text, keywords)) {
      upsellOpenness = candidate;
      signals.push(`abertura a sugestões: ${upsellOpenness}`);
      break;
    }
  }
  // Sync from behavior if not explicitly detected
  if (upsellOpenness === "neutral") {
    if (behavior === "recusa_upsell" || behavior === "impaciente") upsellOpenness = "closed";
    else if (behavior === "aceita_upsell")                         upsellOpenness = "open";
  }

  // ── derived variation quality fields ───────────────────────
  const indecisionLevel: VariationLayer["indecisionLevel"] =
    intent === "indeciso"
      ? "high"
      : behavior === "muda_de_ideia" || behavior === "recusa_depois_aceita"
        ? "medium"
        : "low";

  const budgetSensitivity: VariationLayer["budgetSensitivity"] =
    budget === "baixo" ? "high" : budget === "alto" ? "low" : "medium";

  if (signals.length === 0) {
    signals.push("nenhum sinal detectado — usando perfil padrão (indeciso, médio, solo)");
  }

  return {
    intent,
    budget,
    groupSize,
    behavior,
    dietary,
    upsellOpenness,
    patience,
    indecisionLevel,
    budgetSensitivity,
    signals,
  };
}
