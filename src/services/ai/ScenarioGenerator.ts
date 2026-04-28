/**
 * ScenarioGenerator
 *
 * Always generates the 8 fixed customer profiles required by the stress-test
 * engine, then fills remaining slots with random combinations from the 864+
 * entry pool so no two runs are identical.
 *
 * Fixed profiles (always run):
 *  1. Cliente Indeciso      — indeciso  · médio · solo    · ignora
 *  2. Cliente Econômico     — direto    · baixo · solo    · recusa_upsell
 *  3. Faminto Direto        — fome      · médio · solo    · aceita_upsell
 *  4. Anti-Upsell           — direto    · alto  · solo    · recusa_upsell
 *  5. Cliente Premium       — curioso   · alto  · dupla   · aceita_upsell
 *  6. Pedido em Grupo       — fome      · alto  · família · muda_de_ideia
 *  7. Restrição Vegana      — indeciso  · médio · solo    · vegano · aceita_upsell
 *  8. Cliente Impaciente    — direto    · médio · solo    · impaciente
 */

import type { BehaviorProfile, CheckType, ScenarioDef } from "./AISimulatorService";

// ─── dimension types ──────────────────────────────────────────

type Intent    = BehaviorProfile["intent"];
type Budget    = BehaviorProfile["budget"];
type GroupSize = BehaviorProfile["groupSize"];
type Behavior  = BehaviorProfile["behavior"];

interface DietaryConfig {
  label:     string;
  dietary:   string[];
  allergies: string[];
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
    "Minha barriga tá roncando, preciso comer",
    "Preciso comer alguma coisa boa já",
    "Tô faminto, me ajuda a escolher",
    "Tô com uma fome danada hoje",
    "Morrendo de fome, o que você sugere?",
    "Tô precisando de comida urgente",
  ],
  curioso: [
    "Tô dando uma olhada no cardápio",
    "Vi que vocês têm opções bem interessantes",
    "Me conta o que tem de bom aí",
    "Achei vocês por indicação, o que vocês têm?",
    "Curiosando aqui, o que você recomenda?",
    "Quero conhecer o cardápio de vocês",
    "Me apresenta as opções mais populares",
  ],
  direto: [
    "Quero fazer um pedido",
    "Pode anotar o meu pedido?",
    "Vou pedir agora, tô pronto",
    "Quero encomendar alguma coisa",
    "Vamos logo, tô com pressa",
    "Me ajuda a fazer o pedido rápido",
    "Quero pedir agora mesmo",
  ],
  indeciso: [
    "Não sei o que pedir, me ajuda?",
    "Tô em dúvida aqui",
    "Tem muita opção, fica difícil escolher",
    "Me ajuda a decidir, tô perdido",
    "Não consigo me decidir no cardápio",
    "Tantas opções, não sei nem por onde começar",
    "Me orienta, não faço ideia do que quero",
  ],
};

const BUDGET_MODIFIERS: Record<Budget, string[]> = {
  baixo: [
    "mas quero gastar pouco",
    "com o orçamento bem apertado hoje",
    "tem algo mais em conta?",
    "quero economizar",
    "preciso de algo barato mesmo",
    "sem gastar muito",
  ],
  médio: [
    "por um preço razoável",
    "nada muito caro nem muito barato",
    "algo pelo preço justo",
    "sem exagerar no gasto",
    "quero um custo-benefício bom",
  ],
  alto: [
    "pode ser o mais completo, sem me preocupar com preço",
    "quero o melhor de vocês",
    "não precisa economizar nada",
    "pode ser o top do cardápio",
    "quero a melhor experiência disponível",
    "preço não é problema, quero qualidade",
  ],
};

const GROUP_MODIFIERS: Record<GroupSize, string[]> = {
  solo: [
    "é só pra mim mesmo",
    "sou eu sozinho",
    "pedido individual",
    "é pra uma pessoa só",
    "é pra mim",
  ],
  dupla: [
    "somos dois",
    "é pra mim e mais uma pessoa",
    "pra dividir com alguém",
    "pra um casal",
    "somos dois aqui",
  ],
  família: [
    "somos uma família",
    "tem criança junto",
    "somos quatro pessoas",
    "pra família toda",
    "somos um grupo de pessoas",
    "é pra várias pessoas",
  ],
};

const DIETARY_CONFIGS: DietaryConfig[] = [
  { label: "vegetariano",       dietary: ["vegetariano"],  allergies: [] },
  { label: "vegano",            dietary: ["vegano"],       allergies: [] },
  { label: "sem glúten",        dietary: ["sem_gluten"],   allergies: ["glúten", "trigo"] },
  { label: "sem lactose",       dietary: ["sem_lactose"],  allergies: ["lactose", "leite"] },
  { label: "sem frutos do mar", dietary: [],               allergies: ["camarão", "frutos do mar", "mariscos"] },
];

const DIETARY_OPENERS: Record<string, string[]> = {
  "vegetariano": [
    "Sou vegetariano — tem opção pra mim?",
    "Não como carne, tem algo vegetariano?",
    "Quero opção vegetariana",
    "Preciso de algo sem carne",
  ],
  "vegano": [
    "Sou vegano, o que vocês têm pra mim?",
    "Tem opção vegana no cardápio?",
    "Preciso de algo 100% vegano",
    "Não consumo nenhum produto animal",
  ],
  "sem glúten": [
    "Sou celíaco, tem opção sem glúten?",
    "Não posso comer glúten, tem algo adequado?",
    "Preciso de opção sem glúten",
    "Alergia a glúten, me ajuda a escolher?",
  ],
  "sem lactose": [
    "Sou intolerante a lactose, me ajuda?",
    "Tem algo sem lactose no cardápio?",
    "Preciso evitar leite e derivados",
    "Intolerante a lactose, o que posso pedir?",
  ],
  "sem frutos do mar": [
    "Tenho alergia a frutos do mar, tem opção?",
    "Não posso comer camarão nem mariscos",
    "Preciso evitar frutos do mar",
    "Alergia grave a frutos do mar, me orienta",
  ],
};

// Second-turn messages per behavior (used in fallback message building)
const BEHAVIOR_TURN2: Record<Behavior, string[]> = {
  aceita_upsell: [
    "Ok, pode adicionar isso sim",
    "Boa sugestão, pode colocar",
    "Vou querer esse também então",
    "Pode incluir, gostei",
    "Sim, quero esse também",
    "Adorei a ideia, bota aí",
  ],
  recusa_upsell: [
    "Não, obrigado, acho que tá bom assim",
    "Tô bem assim mesmo, valeu",
    "Não preciso de mais nada, obrigado",
    "Dispensa, tô satisfeito com o que escolhi",
    "Não, pode deixar como tá",
    "Já tá ótimo assim, obrigado",
  ],
  ignora: [
    "Aliás, vocês aceitam cartão de crédito?",
    "Quanto tempo leva a entrega normalmente?",
    "Tem alguma promoção hoje?",
    "Vocês têm embalagem própria pra viagem?",
    "Tem desconto pra pedido grande?",
    "Entregam no meu bairro?",
  ],
  muda_de_ideia: [
    "Na verdade espera, quero mudar o pedido",
    "Esquece o que eu disse, vou pedir diferente",
    "Muda tudo, quero outra opção",
    "Me dá uma segunda opinião, quero repensar",
    "Espera, tô mudando de ideia agora",
    "Afinal me mostra outras opções",
  ],
  impaciente: [
    "Pode ir logo por favor?",
    "Tô com pressa, fecha logo",
    "Rápido, preciso confirmar agora",
    "Sem demora, pode confirmar?",
    "Agiliza aí, tô sem tempo",
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

  // Impatient opener is always direct
  if (dims.behavior === "impaciente") {
    const openers = [
      `Quero pedir agora, ${budget}, ${group}. Pode ser rápido?`,
      `Vamos logo — ${budget}, ${group}. Tô sem tempo.`,
      `Pedido rápido: ${budget}, ${group}. Me ajuda?`,
    ];
    return pick(openers);
  }

  const suffix =
    dims.budget === "médio" && Math.random() < 0.4 ? group : `${budget}, ${group}`;

  if (dims.dietary) {
    const openers = DIETARY_OPENERS[dims.dietary.label];
    const dietaryLine = openers ? pick(openers) : `Tenho restrição: ${dims.dietary.label}`;

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

// ─── check selection ──────────────────────────────────────────

function selectChecks(dims: Dimensions): CheckType[] {
  const checks = new Set<CheckType>(["no_hallucination"]);

  if (["fome", "indeciso", "curioso"].includes(dims.intent)) {
    checks.add("relevant_suggestion");
    checks.add("natural_tone");
  }

  if (dims.dietary) {
    checks.add("dietary_respected");
    checks.add("relevant_suggestion");
  }

  if (dims.behavior === "aceita_upsell") {
    checks.add("relevant_suggestion");
    checks.add("checkout_transition");
  }

  if (dims.behavior === "recusa_upsell" || dims.behavior === "muda_de_ideia") {
    checks.add("no_repeat_suggestion");
    checks.add("no_loop");
  }

  if (dims.behavior === "impaciente") {
    checks.add("checkout_transition");
    checks.add("no_loop");
  }

  if (dims.intent === "direto") {
    checks.add("checkout_transition");
  }

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
  impaciente:    "impaciente / com pressa",
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
    case "impaciente":     parts.push("Fechar pedido rapidamente sem enrolação"); break;
  }

  return parts.join(". ");
}

// ─── scenario builder ─────────────────────────────────────────

function buildScenario(dims: Dimensions, idx: number, tag: string): ScenarioDef {
  const runTag    = Date.now().toString(36).slice(-4);
  const dietaryTag = dims.dietary ? `_${dims.dietary.label.replace(/ /g, "")}` : "";
  const id = `${dims.intent}_${dims.budget}_${dims.groupSize}${dietaryTag}_${dims.behavior}_${tag}${runTag}${idx}`;

  return {
    id,
    name:             buildName(dims),
    description:      buildDescription(dims),
    expectedBehavior: buildExpectedBehavior(dims),
    openingMessage:   buildFirstTurn(dims),
    behaviorProfile: {
      intent:    dims.intent,
      budget:    dims.budget,
      groupSize: dims.groupSize,
      behavior:  dims.behavior,
    },
    dietary:   dims.dietary?.dietary.length   ? dims.dietary.dietary   : undefined,
    allergies: dims.dietary?.allergies.length ? dims.dietary.allergies : undefined,
    checks:    selectChecks(dims),
  };
}

// ─── 8 fixed profiles ─────────────────────────────────────────

const VEGAN_CONFIG = DIETARY_CONFIGS.find((d) => d.label === "vegano") ?? DIETARY_CONFIGS[1]!;

const FIXED_PROFILE_DIMS: Dimensions[] = [
  // 1. Indecisive customer
  { intent: "indeciso", budget: "médio",  groupSize: "solo",    dietary: null,        behavior: "ignora"        },
  // 2. Price-sensitive customer
  { intent: "direto",   budget: "baixo",  groupSize: "solo",    dietary: null,        behavior: "recusa_upsell" },
  // 3. Hungry direct buyer
  { intent: "fome",     budget: "médio",  groupSize: "solo",    dietary: null,        behavior: "aceita_upsell" },
  // 4. Upsell-resistant customer
  { intent: "direto",   budget: "alto",   groupSize: "solo",    dietary: null,        behavior: "recusa_upsell" },
  // 5. High-ticket customer
  { intent: "curioso",  budget: "alto",   groupSize: "dupla",   dietary: null,        behavior: "aceita_upsell" },
  // 6. Group order (family)
  { intent: "fome",     budget: "alto",   groupSize: "família", dietary: null,        behavior: "muda_de_ideia" },
  // 7. Dietary restriction (vegan)
  { intent: "indeciso", budget: "médio",  groupSize: "solo",    dietary: VEGAN_CONFIG, behavior: "aceita_upsell" },
  // 8. Impatient customer
  { intent: "direto",   budget: "médio",  groupSize: "solo",    dietary: null,        behavior: "impaciente"    },
];

// ─── combination pool (for random extras) ────────────────────

const ALL_INTENTS:   Intent[]    = ["fome", "curioso", "direto", "indeciso"];
const ALL_BUDGETS:   Budget[]    = ["baixo", "médio", "alto"];
const ALL_GROUPS:    GroupSize[] = ["solo", "dupla", "família"];
const ALL_BEHAVIORS: Behavior[]  = ["aceita_upsell", "recusa_upsell", "ignora", "muda_de_ideia", "impaciente"];

function buildCombinationPool(): Dimensions[] {
  const pool: Dimensions[] = [];
  const fixedKeys = new Set(
    FIXED_PROFILE_DIMS.map((d) => `${d.intent}|${d.budget}|${d.groupSize}|${d.behavior}|${d.dietary?.label ?? ""}`)
  );

  for (const intent of ALL_INTENTS) {
    for (const budget of ALL_BUDGETS) {
      for (const groupSize of ALL_GROUPS) {
        for (const behavior of ALL_BEHAVIORS) {
          const key = `${intent}|${budget}|${groupSize}|${behavior}|`;
          if (!fixedKeys.has(key)) {
            pool.push({ intent, budget, groupSize, dietary: null, behavior });
          }
          for (const d of DIETARY_CONFIGS) {
            const dKey = `${intent}|${budget}|${groupSize}|${behavior}|${d.label}`;
            if (!fixedKeys.has(dKey)) {
              pool.push({ intent, budget, groupSize, dietary: d, behavior });
            }
          }
        }
      }
    }
  }
  return pool;
}

// ─── public API ───────────────────────────────────────────────

/**
 * Generate scenarios for one simulator run.
 *
 * Always includes the 8 fixed customer profiles (indecisive, price-sensitive,
 * hungry direct buyer, upsell-resistant, high-ticket, group order, dietary
 * restriction, impatient). If `count` > 8, fills the remainder with random
 * combinations from the pool so no two runs are identical.
 */
export function generateScenarios(count: number = 10): ScenarioDef[] {
  const fixed  = FIXED_PROFILE_DIMS.map((dims, idx) => buildScenario(dims, idx, "fix"));
  const extras = Math.max(0, count - fixed.length);

  if (extras === 0) return fixed;

  const random = shuffle(buildCombinationPool())
    .slice(0, extras)
    .map((dims, idx) => buildScenario(dims, fixed.length + idx, "rnd"));

  return [...fixed, ...random];
}
