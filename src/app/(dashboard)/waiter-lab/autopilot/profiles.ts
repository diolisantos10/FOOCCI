import type { CustomerProfile } from "./types";

export const CUSTOMER_PROFILES: CustomerProfile[] = [
  // ── A: Cliente Leve Individual ───────────────────────────────────────────────
  {
    id:      "leve-individual",
    name:    "Cliente Leve Individual",
    goal:    "Comprar algo leve até R$ 80",
    budget:  80,
    behavior: "guided",
    intentMessages: [
      "quero algo leve",
      "tem alguma opção mais suave?",
      "prefiro algo mais leve mesmo",
    ],
    requiresCart:     true,
    requiresCheckout: false,
    expectedOutcome:
      "Waiter deve sugerir pratos leves via cards sem listar nomes no texto",
  },

  // ── B: Cliente Grupo ─────────────────────────────────────────────────────────
  {
    id:        "grupo",
    name:      "Cliente Grupo",
    goal:      "Comprar comida para 4 pessoas",
    groupSize: 4,
    behavior:  "direct",
    intentMessages: [
      "somos 4 pessoas",
      "o que vocês recomendam para um grupo?",
      "quero sugestão para dividir entre 4",
    ],
    requiresCart:     true,
    requiresCheckout: false,
    expectedOutcome:
      "Waiter deve sugerir itens adequados para grupo com cards",
  },

  // ── C: Cliente Sobremesa ─────────────────────────────────────────────────────
  {
    id:       "sobremesa",
    name:     "Cliente Sobremesa",
    goal:     "Encontrar e comprar uma sobremesa",
    behavior: "direct",
    intentMessages: [
      "quero uma sobremesa",
      "tem sobremesa boa?",
    ],
    requiresCart:     true,
    requiresCheckout: false,
    expectedOutcome:
      "Waiter deve sugerir sobremesas via cards; nenhum nome no texto sem card",
  },

  // ── D: Cliente Bebida ────────────────────────────────────────────────────────
  {
    id:       "bebida",
    name:     "Cliente Bebida",
    goal:     "Adicionar uma bebida ao pedido",
    behavior: "direct",
    intentMessages: [
      "quero uma bebida",
      "tem alguma bebida refrescante?",
    ],
    requiresCart:     true,
    requiresCheckout: false,
    expectedOutcome:
      "Waiter deve sugerir bebidas via cards",
  },

  // ── E: Cliente Indeciso ──────────────────────────────────────────────────────
  {
    id:       "indeciso",
    name:     "Cliente Indeciso",
    goal:     "Pedir ajuda para escolher um prato",
    behavior: "indecisive",
    intentMessages: [
      "não sei o que pedir",
      "o que você recomenda?",
      "estou em dúvida",
      "pode me ajudar a escolher?",
    ],
    requiresCart:     false,
    requiresCheckout: false,
    expectedOutcome:
      "Waiter deve oferecer botões de qualificação via options[] e depois cards",
  },

  // ── F: Cliente Direto (completo: produto → checkout) ─────────────────────────
  {
    id:       "direto",
    name:     "Cliente Direto",
    goal:     "Escolher produto, adicionar ao carrinho e finalizar pedido",
    behavior: "direct",
    intentMessages: [
      "quero uma sugestão completa",
    ],
    requiresCart:     true,
    requiresCheckout: true,
    expectedOutcome:
      "Waiter sugere produto, aceita adição ao cart e entra em CHECKOUT_SUPPORT sem cards",
  },

  // ── G: Cliente Econômico ─────────────────────────────────────────────────────
  {
    id:       "economico",
    name:     "Cliente Econômico",
    goal:     "Comprar algo bom sem passar de R$ 100",
    budget:   100,
    behavior: "budget",
    intentMessages: [
      "quero algo bom mas econômico",
      "tem opção mais em conta?",
      "prefiro algo mais barato",
    ],
    requiresCart:     true,
    requiresCheckout: false,
    expectedOutcome:
      "Waiter deve sugerir itens de custo-benefício via cards",
  },

  // ── H: Cliente Premium ───────────────────────────────────────────────────────
  {
    id:       "premium",
    name:     "Cliente Premium",
    goal:     "Encontrar uma opção especial ou mais completa",
    behavior: "premium",
    intentMessages: [
      "quero algo especial",
      "qual a opção mais completa?",
      "quero o melhor que vocês têm",
    ],
    requiresCart:     true,
    requiresCheckout: false,
    expectedOutcome:
      "Waiter deve sugerir itens premium ou mais completos via cards",
  },
];
