/**
 * ScenarioGenerator
 *
 * Produces a fresh, non-repetitive set of customer scenarios for every
 * simulator run. Each scenario is built by randomly combining four
 * independent dimensions:
 *
 *   intent    — fome | curioso | direto | indeciso
 *   budget    — baixo | médio | alto
 *   groupSize — solo | dupla | família
 *   behavior  — aceita_upsell | recusa_upsell | ignora | muda_de_ideia
 *
 * An optional dietary restriction is added to ~30 % of scenarios.
 *
 * The full combination space is 864 unique dimension sets.  Each call
 * shuffles that space and takes the first `count` entries, so no two
 * runs share the same ordering.  Message pools (4-5 variants per slot)
 * add a second layer of variation: even if the same dimension combo
 * reappears across runs, the customer text will differ.
 *
 * Nothing here touches AIOrderService, UpsellEngine or production logic.
 */

import type { CheckType, ScenarioDef } from "./AISimulatorService";

// ─── dimension types ──────────────────────────────────────────

type Intent    = "fome" | "curioso" | "direto" | "indeciso";
type Budget    = "baixo" | "médio" | "alto";
type GroupSize = "solo" | "dupla" | "família";
type Behavior  = "aceita_upsell" | "recusa_upsell" | "ignora" | "muda_de_ideia";

interface DietaryConfig {
  label:     string;   // human-readable, used as display name
  dietary:   string[]; // stored in CustomerPreference.dietary
  allergies: string[]; // stored in CustomerPreference.allergies
}

interface Dimensions {
  intent:    Intent;
  budget:    Budget;
  groupSize: GroupSize;
  dietary:   DietaryConfig | null;
  behavior:  Behavior;
}

// ─── message pools ────────────────────────────────────────────

const INTENT_OPENERS: Record<Intent, string[]> = {
  fome: [
    "Tô com muita fome aqui",
    "Minha barriga tá roncando",
    "Preciso comer alguma coisa boa já",
    "Tô faminto, me ajuda a escolher",
    "Tô com uma fome danada hoje",
  ],
  curioso: [
    "Tô dando uma olhada no cardápio",
    "Vi que vocês têm opções bem interessantes",
    "Me conta o que tem de bom aí",
    "Achei vocês por indicação, o que vocês têm?",
    "Curiosando aqui, o que você recomenda?",
  ],
  direto: [
    "Quero fazer um pedido",
    "Pode anotar o meu pedido?",
    "Vou pedir agora, tô pronto",
    "Quero encomendar alguma coisa",
    "Vamos logo, tô com pressa",
  ],
  indeciso: [
    "Não sei o que pedir, me ajuda?",
    "Tô em dúvida aqui",
    "Tem muita opção, fica difícil escolher",
    "Me ajuda a decidir, tô perdido",
    "Não consigo me decidir no cardápio",
  ],
};

const BUDGET_MODIFIERS: Record<Budget, string[]> = {
  baixo: [
    "mas quero gastar pouco",
    "com o orçamento bem apertado hoje",
    "tem algo mais em conta?",
    "quero economizar",
  ],
  médio: [
    "por um preço razoável",
    "nada muito caro nem muito barato",
    "algo pelo preço justo",
    "sem exagerar no gasto",
  ],
  alto: [
    "pode ser o mais completo, sem me preocupar com preço",
    "quero o melhor de vocês",
    "não precisa economizar nada",
    "pode ser o top do cardápio",
  ],
};

const GROUP_MODIFIERS: Record<GroupSize, string[]> = {
  solo: [
    "é só pra mim mesmo",
    "sou eu sozinho",
    "pedido individual",
    "é pra uma pessoa só",
  ],
  dupla: [
    "somos dois",
    "é pra mim e mais uma pessoa",
    "pra dividir com alguém",
    "pra um casal",
  ],
  família: [
    "somos uma família",
    "tem criança junto",
    "somos quatro pessoas",
    "pra família toda",
  ],
};

const DIETARY_CONFIGS: DietaryConfig[] = [
  { label: "vegetariano",       dietary: ["vegetariano"],  allergies: [] },
  { label: "vegano",            dietary: ["vegano"],       allergies: [] },
  { label: "sem glúten",        dietary: ["sem_gluten"],   allergies: ["glúten", "trigo"] },
  { label: "sem lactose",       dietary: ["sem_lactose"],  allergies: ["lactose", "leite"] },
  { label: "sem frutos do mar", dietary: [],               allergies: ["camarão", "frutos do mar", "mariscos"] },
];

// Openers keyed by DietaryConfig.label
const DIETARY_OPENERS: Record<string, string[]> = {
  "vegetariano": [
    "Sou vegetariano — tem opção pra mim?",
    "Não como carne, tem algo vegetariano?",
    "Quero opção vegetariana",
  ],
  "vegano": [
    "Sou vegano, o que vocês têm pra mim?",
    "Tem opção vegana no cardápio?",
    "Preciso de algo 100 % vegano",
  ],
  "sem glúten": [
    "Sou celíaco, tem opção sem glúten?",
    "Não posso comer glúten, tem algo adequado?",
    "Preciso de opção sem glúten",
  ],
  "sem lactose": [
    "Sou intolerante a lactose, me ajuda?",
    "Tem algo sem lactose no cardápio?",
    "Preciso evitar leite e derivados",
  ],
  "sem frutos do mar": [
    "Tenho alergia a frutos do mar, tem opção?",
    "Não posso comer camarão nem mariscos",
    "Preciso evitar frutos do mar",
  ],
};

// Second-turn messages per behavior
const BEHAVIOR_TURN2: Record<Behavior, string[]> = {
  aceita_upsell: [
    "Ok, pode adicionar isso sim",
    "Boa sugestão, pode colocar",
    "Vou querer esse também então",
    "Pode incluir, gostei",
    "Sim, quero esse também",
  ],
  recusa_upsell: [
    "Não, obrigado, acho que tá bom assim",
    "Tô bem assim mesmo, valeu",
    "Não preciso de mais nada, obrigado",
    "Dispensa, tô satisfeito com o que escolhi",
    "Não, pode deixar como tá",
  ],
  ignora: [
    "Aliás, vocês aceitam cartão de crédito?",
    "Quanto tempo leva a entrega normalmente?",
    "Tem alguma promoção hoje?",
    "Vocês têm embalagem própria pra viagem?",
    "Tem desconto pra pedido grande?",
  ],
  muda_de_ideia: [
    "Na verdade espera, quero mudar o pedido",
    "Esquece o que eu disse, vou pedir diferente",
    "Muda tudo, quero outra opção",
    "Me dá uma segunda opinião, quero repensar",
    "Espera, tô mudando de ideia agora",
  ],
};

// ─── random helpers ───────────────────────────────────────────

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

// ─── message composers ────────────────────────────────────────

function buildFirstTurn(dims: Dimensions): string {
  const budget = pick(BUDGET_MODIFIERS[dims.budget]);
  const group  = pick(GROUP_MODIFIERS[dims.groupSize]);

  // Skip explicit budget mention ~40 % of the time for "médio"
  const suffix =
    dims.budget === "médio" && Math.random() < 0.4 ? group : `${budget}, ${group}`;

  if (dims.dietary) {
    const openers = DIETARY_OPENERS[dims.dietary.label];
    const dietaryLine = openers ? pick(openers) : `Tenho restrição: ${dims.dietary.label}`;

    // Blend dietary with intent for a more natural message
    if (dims.intent === "indeciso") {
      const blend = pick(["e não sei bem o que escolher", "mas tô em dúvida no que pedir", "e tô indeciso"]);
      return `${dietaryLine} ${blend}. ${suffix}.`;
    }
    if (dims.intent === "fome") {
      const hunger = pick(["e tô com muita fome", "— tô faminto"]);
      return `${dietaryLine} ${hunger}. ${suffix}.`;
    }
    return `${dietaryLine}. ${suffix}.`;
  }

  const opener = pick(INTENT_OPENERS[dims.intent]);
  return `${opener}, ${suffix}.`;
}

function buildSecondTurn(dims: Dimensions): string | null {
  // "direto" + "aceita" flows to checkout naturally — no extra customer turn needed
  if (dims.intent === "direto" && dims.behavior === "aceita_upsell") return null;
  return pick(BEHAVIOR_TURN2[dims.behavior]);
}

// ─── check selection ──────────────────────────────────────────

function selectChecks(dims: Dimensions, hasTwoTurns: boolean): CheckType[] {
  const checks = new Set<CheckType>(["no_hallucination"]);

  // Intents that expect a proactive suggestion from the AI
  if (["fome", "indeciso", "curioso"].includes(dims.intent)) {
    checks.add("relevant_suggestion");
    checks.add("natural_tone");
  }

  // Dietary restriction must be respected in every suggestion
  if (dims.dietary) {
    checks.add("dietary_respected");
    checks.add("relevant_suggestion"); // something valid must be suggested
  }

  // Accept behavior expects a good suggestion to have been made first
  if (dims.behavior === "aceita_upsell") {
    checks.add("relevant_suggestion");
  }

  // Rejection or change-of-mind verifies AI doesn't loop or repeat
  if (dims.behavior === "recusa_upsell" || dims.behavior === "muda_de_ideia") {
    checks.add("no_repeat_suggestion");
    checks.add("no_loop");
  }

  // "direto" + second turn implies customer said they were done → expect checkout
  if (dims.intent === "direto" && hasTwoTurns) {
    checks.add("checkout_transition");
  }

  // Indeciso who then ignores the AI → AI should ask a clarifying question
  if (dims.behavior === "ignora" && dims.intent === "indeciso") {
    checks.add("clarification_asked");
  }

  return [...checks];
}

// ─── display fields ───────────────────────────────────────────

const INTENT_LABELS: Record<Intent, string> = {
  fome:     "Faminto",
  curioso:  "Explorador",
  direto:   "Objetivo",
  indeciso: "Indeciso",
};

const BUDGET_LABELS: Record<Budget, string> = {
  baixo: "econômico",
  médio: "moderado",
  alto:  "premium",
};

const GROUP_LABELS: Record<GroupSize, string> = {
  solo:    "individual",
  dupla:   "para 2",
  família: "família",
};

const BEHAVIOR_LABELS: Record<Behavior, string> = {
  aceita_upsell: "aceita sugestão",
  recusa_upsell: "recusa sugestão",
  ignora:        "ignora e muda assunto",
  muda_de_ideia: "muda de ideia",
};

function buildName(dims: Dimensions): string {
  const dietary = dims.dietary ? ` [${dims.dietary.label}]` : "";
  return `${INTENT_LABELS[dims.intent]} ${BUDGET_LABELS[dims.budget]} (${GROUP_LABELS[dims.groupSize]})${dietary}`;
}

function buildDescription(dims: Dimensions): string {
  const parts = [
    `Intenção: ${dims.intent}`,
    `orçamento ${dims.budget}`,
    `grupo ${dims.groupSize}`,
    ...(dims.dietary ? [`restrição: ${dims.dietary.label}`] : []),
    `comportamento: ${BEHAVIOR_LABELS[dims.behavior]}`,
  ];
  return parts.join(" · ");
}

function buildExpectedBehavior(dims: Dimensions): string {
  const parts: string[] = [];

  if (dims.dietary) parts.push(`Respeitar restrição: ${dims.dietary.label}`);

  switch (dims.intent) {
    case "fome":     parts.push("Sugerir produto relevante para a fome"); break;
    case "curioso":  parts.push("Apresentar cardápio de forma atrativa"); break;
    case "direto":   parts.push("Anotar pedido com eficiência"); break;
    case "indeciso": parts.push("Guiar com recomendação clara"); break;
  }

  switch (dims.behavior) {
    case "aceita_upsell":  parts.push("Confirmar upsell aceito sem pressionar"); break;
    case "recusa_upsell":  parts.push("Aceitar recusa sem insistir nem repetir produto"); break;
    case "ignora":         parts.push("Responder desvio e retomar o pedido"); break;
    case "muda_de_ideia":  parts.push("Adaptar pedido sem repetir itens anteriores"); break;
  }

  return parts.join(". ");
}

// ─── combination space ────────────────────────────────────────

const ALL_INTENTS:   Intent[]    = ["fome", "curioso", "direto", "indeciso"];
const ALL_BUDGETS:   Budget[]    = ["baixo", "médio", "alto"];
const ALL_GROUPS:    GroupSize[] = ["solo", "dupla", "família"];
const ALL_BEHAVIORS: Behavior[]  = ["aceita_upsell", "recusa_upsell", "ignora", "muda_de_ideia"];

function buildCombinationPool(): Dimensions[] {
  const pool: Dimensions[] = [];
  for (const intent of ALL_INTENTS) {
    for (const budget of ALL_BUDGETS) {
      for (const groupSize of ALL_GROUPS) {
        for (const behavior of ALL_BEHAVIORS) {
          pool.push({ intent, budget, groupSize, dietary: null, behavior });
          for (const d of DIETARY_CONFIGS) {
            pool.push({ intent, budget, groupSize, dietary: d, behavior });
          }
        }
      }
    }
  }
  return pool; // 864 unique dimension sets
}

// ─── public API ───────────────────────────────────────────────

/**
 * Generate `count` distinct scenarios for one simulator run.
 *
 * The combination pool (864 entries) is shuffled on each call, then the
 * first `count` entries are taken.  Message pools add a second variation
 * layer, so even if the same dimensions appear across runs, the customer
 * text will differ.
 */
export function generateScenarios(count: number = 10): ScenarioDef[] {
  const pool    = shuffle(buildCombinationPool());
  const runTag  = Date.now().toString(36).slice(-4);

  return pool.slice(0, count).map((dims, idx) => {
    const turn1  = buildFirstTurn(dims);
    const turn2  = buildSecondTurn(dims);
    const turns: Array<{ customer: string }> = [{ customer: turn1 }];
    if (turn2) turns.push({ customer: turn2 });

    const checks = selectChecks(dims, turns.length > 1);

    const dietaryTag = dims.dietary ? `_${dims.dietary.label.replace(/ /g, "")}` : "";
    const id = `${dims.intent}_${dims.budget}_${dims.groupSize}${dietaryTag}_${dims.behavior}_${runTag}${idx}`;

    return {
      id,
      name:             buildName(dims),
      description:      buildDescription(dims),
      expectedBehavior: buildExpectedBehavior(dims),
      turns,
      dietary:   dims.dietary?.dietary.length   ? dims.dietary.dietary   : undefined,
      allergies: dims.dietary?.allergies.length ? dims.dietary.allergies : undefined,
      checks,
    };
  });
}
