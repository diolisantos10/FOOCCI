/**
 * ScenarioGenerator
 *
 * Holds 12 canonical fixed customer profiles (FIXED_PROFILE_DIMS).
 * generateScenarios(count) slices the pool to exactly `count` scenarios:
 *   count ≤ 12 → first `count` fixed profiles
 *   count >  12 → all 12 fixed + random extras from the 864+ combination pool
 *
 * Fixed profiles (canonical pool, in order):
 *  1.  Cliente Indeciso          — indeciso  · médio · solo    · ignora
 *  2.  Cliente Econômico         — direto    · baixo · solo    · recusa_upsell
 *  3.  Faminto Direto            — fome      · médio · solo    · aceita_upsell
 *  4.  Anti-Upsell               — direto    · alto  · solo    · recusa_upsell
 *  5.  Cliente Premium           — curioso   · alto  · dupla   · aceita_upsell
 *  6.  Pedido em Grupo           — fome      · alto  · família · muda_de_ideia
 *  7.  Restrição Vegana          — indeciso  · médio · solo    · vegano · aceita_upsell
 *  8.  Cliente Impaciente        — direto    · médio · solo    · impaciente
 *  9.  Recusa depois aceita      — curioso   · médio · dupla   · recusa_depois_aceita
 *  10. Perguntas antes de pedir  — indeciso  · baixo · solo    · pergunta_primeiro
 *  11. Sem lactose + direto      — direto    · médio · solo    · sem lactose · aceita_upsell
 *  12. Faminto premium           — fome      · alto  · solo    · muda_de_ideia
 */

import type { BehaviorProfile, CustomerGoal, VariationLayer, CheckType, ScenarioDef } from "./AISimulatorService";

// ─── dimension types ──────────────────────────────────────────

type Intent           = BehaviorProfile["intent"];
type Budget           = BehaviorProfile["budget"];
type GroupSize        = BehaviorProfile["groupSize"];
type Behavior         = BehaviorProfile["behavior"];
type IndecisionLevel  = VariationLayer["indecisionLevel"];
type BudgetSensitivity = VariationLayer["budgetSensitivity"];
type Patience         = VariationLayer["patience"];
type UpsellOpenness   = VariationLayer["upsellOpenness"];

const PATIENCE_MAX_TURNS: Record<Patience, number> = { short: 5, long: 10 };

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
  // When set, variation is fixed; otherwise randomized in buildScenario
  variation?: Partial<VariationLayer>;
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
  recusa_depois_aceita: [
    "hmm deixa eu pensar…",
    "não sei se preciso disso agora",
    "talvez não... me convence",
  ],
  pergunta_primeiro: [
    "antes de decidir, tenho algumas dúvidas",
    "me tira umas dúvidas antes de pedir",
    "posso fazer umas perguntas primeiro?",
  ],
};

// Variation-aware opening modifiers
const INDECISION_SUFFIXES: Record<IndecisionLevel, string[]> = {
  low:    ["", ""],  // no extra text
  medium: [", mas estou em dúvida", ", só não sei exatamente o quê"],
  high:   [", mas tô completamente perdido", ", e realmente não sei nada do que quero", ", me ajuda muito porque não sei por onde começar"],
};

const BUDGET_PRESSURE_SUFFIXES: Record<BudgetSensitivity, string[]> = {
  low:    [""],
  medium: [" (tentando não gastar demais)", " sem exagerar no valor"],
  high:   [" — preciso que seja bem em conta", " — orçamento muito apertado hoje", " — sem poder gastar nada a mais"],
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

function buildFirstTurn(dims: Dimensions, variation: VariationLayer): string {
  const budget = pick(BUDGET_MODIFIERS[dims.budget]);
  const group  = pick(GROUP_MODIFIERS[dims.groupSize]);

  // Variation suffixes add texture without changing core intent
  const indecisionSuffix   = pick(INDECISION_SUFFIXES[variation.indecisionLevel]);
  const budgetPressureSufx = pick(BUDGET_PRESSURE_SUFFIXES[variation.budgetSensitivity]);

  // Impatient opener is always direct
  if (dims.behavior === "impaciente") {
    const openers = [
      `Quero pedir agora, ${budget}, ${group}. Pode ser rápido?`,
      `Vamos logo — ${budget}, ${group}. Tô sem tempo.`,
      `Pedido rápido: ${budget}, ${group}. Me ajuda?`,
    ];
    return pick(openers);
  }

  // Pre-order questioner starts with a question
  if (dims.behavior === "pergunta_primeiro") {
    const opener = pick(INTENT_OPENERS[dims.intent]);
    return `${opener}, ${budget}, ${group}. Antes de pedir, posso te fazer uma pergunta?`;
  }

  const suffix =
    dims.budget === "médio" && Math.random() < 0.4 ? group : `${budget}, ${group}`;

  if (dims.dietary) {
    const openers = DIETARY_OPENERS[dims.dietary.label];
    const dietaryLine = openers ? pick(openers) : `Tenho restrição: ${dims.dietary.label}`;

    if (dims.intent === "indeciso") {
      const blend = pick(["e não sei bem o que escolher", "mas tô em dúvida no que pedir", "e tô indeciso"]);
      return `${dietaryLine} ${blend}${indecisionSuffix}. ${suffix}${budgetPressureSufx}.`;
    }
    if (dims.intent === "fome") {
      const hunger = pick(["e tô com muita fome", "— tô faminto"]);
      return `${dietaryLine} ${hunger}. ${suffix}${budgetPressureSufx}.`;
    }
    return `${dietaryLine}. ${suffix}${budgetPressureSufx}.`;
  }

  const opener = pick(INTENT_OPENERS[dims.intent]);
  return `${opener}${indecisionSuffix}, ${suffix}${budgetPressureSufx}.`;
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
    checks.add("post_checkout_completed");
  }

  if (["recusa_upsell", "muda_de_ideia", "recusa_depois_aceita"].includes(dims.behavior)) {
    checks.add("no_repeat_suggestion");
    checks.add("no_loop");
  }

  if (dims.behavior === "impaciente") {
    checks.add("checkout_transition");
    checks.add("no_loop");
    checks.add("post_checkout_completed");
  }

  if (dims.intent === "direto") {
    checks.add("checkout_transition");
    checks.add("post_checkout_completed");
  }

  if (dims.intent === "fome") {
    checks.add("post_checkout_completed");
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
  aceita_upsell:        "aceita sugestão",
  recusa_upsell:        "recusa sugestão",
  ignora:               "ignora e muda assunto",
  muda_de_ideia:        "muda de ideia",
  impaciente:           "impaciente / com pressa",
  recusa_depois_aceita: "recusa primeiro, aceita depois",
  pergunta_primeiro:    "pergunta antes de comprar",
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
    case "aceita_upsell":        parts.push("Confirmar upsell aceito sem pressionar"); break;
    case "recusa_upsell":        parts.push("Aceitar recusa sem insistir nem repetir produto"); break;
    case "ignora":               parts.push("Responder desvio e retomar o pedido"); break;
    case "muda_de_ideia":        parts.push("Adaptar pedido sem repetir itens anteriores"); break;
    case "impaciente":           parts.push("Fechar pedido rapidamente sem enrolação"); break;
    case "recusa_depois_aceita": parts.push("Persistir com segunda sugestão após recusa inicial"); break;
    case "pergunta_primeiro":    parts.push("Responder perguntas antes de iniciar o pedido"); break;
  }

  return parts.join(". ");
}

// ─── customer goal builder ────────────────────────────────────

const BUDGET_MAX: Record<Budget, number> = { baixo: 60, médio: 120, alto: 210 };

// Archetype context labels derived from budget × intent × groupSize
function buildContext(dims: Dimensions): string {
  if (dims.groupSize === "família") {
    return dims.budget === "alto" ? "Família Premium" : "Família Econômica";
  }
  if (dims.groupSize === "dupla") {
    return dims.budget === "alto" ? "Casal Premium" : "Casal Moderado";
  }
  if (dims.behavior === "impaciente") return "Decisor Rápido";
  if (dims.behavior === "pergunta_primeiro") return "Comprador Analítico";
  if (dims.intent === "fome" && dims.budget === "alto") return "Faminto Premium";
  if (dims.intent === "fome") return "Faminto Direto";
  if (dims.intent === "curioso" && dims.budget === "alto") return "Explorador Premium";
  if (dims.intent === "curioso") return "Explorador Moderado";
  if (dims.intent === "direto" && dims.budget === "baixo") return "Comprador Econômico";
  if (dims.intent === "direto" && dims.budget === "alto") return "Comprador High Ticket";
  if (dims.intent === "indeciso" && dims.budget === "baixo") return "Indeciso com Orçamento";
  if (dims.intent === "indeciso") return "Cliente Indeciso";
  return "Cliente Padrão";
}

// Human-readable buying purpose
function buildGoalLabel(desiredMealType: CustomerGoal["desiredMealType"], groupSize: CustomerGoal["groupSize"]): string {
  const numericGroup = groupSize === "family" ? 4 : groupSize;
  switch (desiredMealType) {
    case "quick":
      return "Refeição rápida e prática";
    case "cheap":
      return "Refeição econômica dentro do orçamento";
    case "premium":
      return numericGroup >= 2 ? "Experiência gastronômica premium para o grupo" : "Experiência gastronômica premium";
    case "sharing":
      return numericGroup >= 4 ? "Refeição completa para a família" : "Refeição para dividir a dois";
    case "complete":
      return numericGroup >= 2 ? `Refeição completa para ${numericGroup} pessoas` : "Refeição completa e satisfatória";
  }
}

// Decision style from intent + behavior
function buildDecisionStyle(dims: Dimensions): CustomerGoal["decisionStyle"] {
  if (dims.behavior === "impaciente") return "quick";
  if (dims.behavior === "pergunta_primeiro") return "analytical";
  if (dims.intent === "fome") return "impulsive";
  if (dims.intent === "direto") return "quick";
  if (dims.intent === "curioso") return "analytical";
  if (dims.intent === "indeciso") return "deliberate";
  return "deliberate";
}

// Human-readable finalization condition
function buildFinalizationCondition(
  desiredMealType: CustomerGoal["desiredMealType"],
  groupSize: CustomerGoal["groupSize"],
  budgetMax: number,
): string {
  const numericGroup = groupSize === "family" ? 4 : groupSize;
  const minItems = numericGroup >= 4 ? 3 : numericGroup >= 2 ? 2 : 1;
  switch (desiredMealType) {
    case "quick":
    case "cheap":
      return `1 item dentro do orçamento de R$ ${budgetMax.toFixed(0)}`;
    case "complete":
      return `Mínimo ${minItems} item(ns) e ticket ≥ R$ ${(budgetMax * 0.45).toFixed(0)}`;
    case "sharing":
      return `Mínimo ${Math.max(minItems, 2)} itens e ticket ≥ R$ ${(budgetMax * 0.45).toFixed(0)}`;
    case "premium":
      return `Mínimo ${minItems} item(ns) e ticket ≥ R$ ${(budgetMax * 0.60).toFixed(0)}`;
  }
}

function buildCustomerGoal(dims: Dimensions, variation: VariationLayer): CustomerGoal {
  const groupSize: CustomerGoal["groupSize"] =
    dims.groupSize === "família" ? "family"
    : dims.groupSize === "dupla" ? 2 : 1;

  const budgetMax = BUDGET_MAX[dims.budget];

  const desiredMealType: CustomerGoal["desiredMealType"] =
    dims.groupSize === "família"             ? "sharing"
    : dims.budget === "alto"                 ? "premium"
    : dims.budget === "baixo"                ? "cheap"
    : dims.intent === "fome"                 ? "complete"
    : dims.behavior === "impaciente"         ? "quick"
    : "complete";

  const deliveryIntent: CustomerGoal["deliveryIntent"] =
    Math.random() < 0.6 ? "delivery" : "pickup";

  const payRoll = Math.random();
  const paymentPreference: CustomerGoal["paymentPreference"] =
    payRoll < 0.5 ? "pix" : payRoll < 0.8 ? "card" : "cash";

  const opennessToUpsell: CustomerGoal["opennessToUpsell"] =
    dims.behavior === "aceita_upsell" || variation.upsellOpenness === "open"  ? "high"
    : dims.behavior === "recusa_upsell" || variation.upsellOpenness === "closed" ? "low"
    : "medium";

  const decisionStyle     = buildDecisionStyle(dims);
  const context           = buildContext(dims);
  const goal              = buildGoalLabel(desiredMealType, groupSize);
  const finalizationCondition = buildFinalizationCondition(desiredMealType, groupSize, budgetMax);

  return {
    groupSize, budgetMax, desiredMealType, deliveryIntent, paymentPreference,
    opennessToUpsell, decisionStyle, context, goal, finalizationCondition,
  };
}

// ─── scenario builder ─────────────────────────────────────────

const ALL_INDECISION:   IndecisionLevel[]   = ["low", "medium", "high"];
const ALL_BUDGET_SENS:  BudgetSensitivity[] = ["low", "medium", "high"];
const ALL_PATIENCE:     Patience[]          = ["short", "long"];
const ALL_UPSELL_OPEN:  UpsellOpenness[]    = ["closed", "neutral", "open"];

function randomVariation(overrides?: Partial<VariationLayer>): VariationLayer {
  return {
    indecisionLevel:   overrides?.indecisionLevel   ?? pick(ALL_INDECISION),
    budgetSensitivity: overrides?.budgetSensitivity ?? pick(ALL_BUDGET_SENS),
    patience:          overrides?.patience          ?? pick(ALL_PATIENCE),
    upsellOpenness:    overrides?.upsellOpenness    ?? pick(ALL_UPSELL_OPEN),
  };
}

function buildScenario(dims: Dimensions, idx: number, tag: string): ScenarioDef {
  const variation  = randomVariation(dims.variation);
  const runTag     = Date.now().toString(36).slice(-4);
  const dietaryTag = dims.dietary ? `_${dims.dietary.label.replace(/ /g, "")}` : "";
  const id = `${dims.intent}_${dims.budget}_${dims.groupSize}${dietaryTag}_${dims.behavior}_${tag}${runTag}${idx}`;

  return {
    id,
    name:             buildName(dims),
    description:      `${buildDescription(dims)} · paciência:${variation.patience} · upsell:${variation.upsellOpenness}`,
    expectedBehavior: buildExpectedBehavior(dims),
    openingMessage:   buildFirstTurn(dims, variation),
    behaviorProfile: {
      intent:    dims.intent,
      budget:    dims.budget,
      groupSize: dims.groupSize,
      behavior:  dims.behavior,
      variation,
    },
    dietary:      dims.dietary?.dietary.length   ? dims.dietary.dietary   : undefined,
    allergies:    dims.dietary?.allergies.length ? dims.dietary.allergies : undefined,
    checks:       selectChecks(dims),
    maxTurns:     PATIENCE_MAX_TURNS[variation.patience],
    customerGoal: buildCustomerGoal(dims, variation),
  };
}

// ─── 12 fixed profiles (canonical pool) ──────────────────────

const VEGAN_CONFIG = DIETARY_CONFIGS.find((d) => d.label === "vegano") ?? DIETARY_CONFIGS[1]!;

const FIXED_PROFILE_DIMS: Dimensions[] = [
  // 1. Indecisive customer
  { intent: "indeciso", budget: "médio",  groupSize: "solo",    dietary: null,        behavior: "ignora",               variation: { patience: "long",  upsellOpenness: "neutral" } },
  // 2. Price-sensitive customer
  { intent: "direto",   budget: "baixo",  groupSize: "solo",    dietary: null,        behavior: "recusa_upsell",        variation: { patience: "short", upsellOpenness: "closed",  budgetSensitivity: "high" } },
  // 3. Hungry direct buyer
  { intent: "fome",     budget: "médio",  groupSize: "solo",    dietary: null,        behavior: "aceita_upsell",        variation: { patience: "long",  upsellOpenness: "open" } },
  // 4. Upsell-resistant premium
  { intent: "direto",   budget: "alto",   groupSize: "solo",    dietary: null,        behavior: "recusa_upsell",        variation: { patience: "short", upsellOpenness: "closed" } },
  // 5. High-ticket couple
  { intent: "curioso",  budget: "alto",   groupSize: "dupla",   dietary: null,        behavior: "aceita_upsell",        variation: { patience: "long",  upsellOpenness: "open" } },
  // 6. Group order (family)
  { intent: "fome",     budget: "alto",   groupSize: "família", dietary: null,        behavior: "muda_de_ideia",        variation: { patience: "long",  indecisionLevel: "high" } },
  // 7. Dietary restriction (vegan)
  { intent: "indeciso", budget: "médio",  groupSize: "solo",    dietary: VEGAN_CONFIG, behavior: "aceita_upsell",       variation: { patience: "long",  upsellOpenness: "open" } },
  // 8. Impatient customer
  { intent: "direto",   budget: "médio",  groupSize: "solo",    dietary: null,        behavior: "impaciente",           variation: { patience: "short" } },
  // 9. Rejects first, warms up (tests upsell persistence)
  { intent: "curioso",  budget: "médio",  groupSize: "dupla",   dietary: null,        behavior: "recusa_depois_aceita", variation: { patience: "long",  upsellOpenness: "neutral" } },
  // 10. Questions before ordering (tests AI's ability to handle pre-order doubts)
  { intent: "indeciso", budget: "baixo",  groupSize: "solo",    dietary: null,        behavior: "pergunta_primeiro",    variation: { patience: "long",  indecisionLevel: "high",  budgetSensitivity: "high" } },
  // 11. Dietary (sem lactose) + direct + short patience
  { intent: "direto",   budget: "médio",  groupSize: "solo",    dietary: DIETARY_CONFIGS.find((d) => d.label === "sem lactose") ?? null, behavior: "aceita_upsell", variation: { patience: "short", upsellOpenness: "neutral" } },
  // 12. Hungry premium + changes mind (tests re-selection without repeat)
  { intent: "fome",     budget: "alto",   groupSize: "solo",    dietary: null,        behavior: "muda_de_ideia",        variation: { patience: "long",  indecisionLevel: "medium", upsellOpenness: "open" } },
];

// ─── combination pool (for random extras) ────────────────────

const ALL_INTENTS:   Intent[]    = ["fome", "curioso", "direto", "indeciso"];
const ALL_BUDGETS:   Budget[]    = ["baixo", "médio", "alto"];
const ALL_GROUPS:    GroupSize[] = ["solo", "dupla", "família"];
const ALL_BEHAVIORS: Behavior[]  = ["aceita_upsell", "recusa_upsell", "ignora", "muda_de_ideia", "impaciente", "recusa_depois_aceita", "pergunta_primeiro"];

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
 * FIXED_PROFILE_DIMS holds 12 canonical profiles that cover the core
 * customer archetypes. `count` controls how many actually run:
 *   - count ≤ 12 → first `count` fixed profiles (deterministic subset)
 *   - count >  12 → all 12 fixed + (count-12) random extras from the pool
 *
 * This ensures Rápido=5, Padrão=10, Completo=20 all run exactly that many.
 */
export function generateScenarios(count: number = 10): ScenarioDef[] {
  const fixed = FIXED_PROFILE_DIMS.map((dims, idx) => buildScenario(dims, idx, "fix"));

  if (count <= fixed.length) {
    return fixed.slice(0, count);
  }

  const extras = count - fixed.length;
  const random = shuffle(buildCombinationPool())
    .slice(0, extras)
    .map((dims, idx) => buildScenario(dims, fixed.length + idx, "rnd"));

  return [...fixed, ...random];
}

// ─── public API: prompt-lab entry point ───────────────────────

/**
 * Public dimension descriptor used by Prompt Lab.
 * Decoupled from the internal Dimensions type so callers
 * don't need to know about DietaryConfig internals.
 */
export interface ScenarioDimensions {
  intent:       BehaviorProfile["intent"];
  budget:       BehaviorProfile["budget"];
  groupSize:    BehaviorProfile["groupSize"];
  behavior:     BehaviorProfile["behavior"];
  /** Dietary label matching DIETARY_CONFIGS — e.g. "vegano", "sem glúten". */
  dietaryLabel?: string;
  /** Variation overrides — unspecified fields are randomised per scenario. */
  variation?:   Partial<VariationLayer>;
}

/**
 * Build `count` ScenarioDefs from a fixed dimension set.
 * Each call to buildScenario re-randomises the unspecified VariationLayer
 * fields, so multiple scenarios from the same dims naturally differ in
 * opening message texture and patience level.
 */
export function generateScenariosFromDims(
  dims: ScenarioDimensions,
  count: number,
): ScenarioDef[] {
  const dietaryConfig = dims.dietaryLabel
    ? (DIETARY_CONFIGS.find((d) => d.label === dims.dietaryLabel) ?? null)
    : null;

  const privateDims: Dimensions = {
    intent:    dims.intent,
    budget:    dims.budget,
    groupSize: dims.groupSize,
    behavior:  dims.behavior,
    dietary:   dietaryConfig,
    variation: dims.variation,
  };

  return Array.from({ length: count }, (_, idx) =>
    buildScenario(privateDims, idx, "lab"),
  );
}
