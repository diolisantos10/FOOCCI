import type { CustomerProfile } from "./types";

export const CUSTOMER_PROFILES: CustomerProfile[] = [

  // ════════════════════════════════════════════════════════════
  //  TYPED CUSTOMER PROFILES  (A – H)
  // ════════════════════════════════════════════════════════════

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

  // ════════════════════════════════════════════════════════════
  //  SILENT CUSTOMER PROFILES  (I – P)
  // ════════════════════════════════════════════════════════════

  // ── I: Cliente Calado — Temaki ────────────────────────────────────────────────
  {
    id:       "silent-temaki-only",
    name:     "Cliente Calado — Temaki",
    goal:     "Entra, adiciona temaki sem digitar, tenta checkout",
    behavior: "passive",
    isSilent: true,
    intentMessages: [],
    silentCartItems:       [["temaki", "uramaki", "hot roll", "hossomaki"]],
    requiresCart:          true,
    requiresCheckout:      true,
    requiresIdle:          false,
    expectsCheckoutUpsell: true,
    expectedOutcome:
      "ON_ITEM_ADDED → cards=[], options=[]. ON_CHECKOUT_STARTED → bebida cards ativos (INTERVENTION) + opções de skip. AFTER_CHECKOUT → sem pitch de vendas.",
  },

  // ── J: Cliente Calado — Prato sem bebida ─────────────────────────────────────
  {
    id:       "silent-main-no-drink",
    name:     "Cliente Calado — Prato sem bebida",
    goal:     "Adiciona prato principal, checkout sem bebida",
    behavior: "passive",
    isSilent: true,
    intentMessages: [],
    silentCartItems:       [[]],  // catalog[0]
    requiresCart:          true,
    requiresCheckout:      true,
    requiresIdle:          false,
    expectsCheckoutUpsell: true,
    expectedOutcome:
      "ON_ITEM_ADDED limpo. ON_CHECKOUT_STARTED → bebida cards ativos (INTERVENTION). Sem invasão em navegação.",
  },

  // ── K: Cliente Calado — Prato + Bebida, sem sobremesa ────────────────────────
  {
    id:       "silent-main-drink-no-dessert",
    name:     "Cliente Calado — Sem sobremesa",
    goal:     "Adiciona prato e bebida, checkout sem sobremesa",
    behavior: "passive",
    isSilent: true,
    intentMessages: [],
    silentCartItems: [
      [],                                                        // food: catalog[0]
      ["bebida", "suco", "refrigerante", "agua", "cerveja", "limonada"],
    ],
    requiresCart:          true,
    requiresCheckout:      true,
    requiresIdle:          false,
    expectsCheckoutUpsell: true,
    expectedOutcome:
      "Dois ON_ITEM_ADDED limpos. ON_CHECKOUT_STARTED → sobremesa cards ativos (INTERVENTION). Sem invasão.",
  },

  // ── L: Cliente Calado — Montando pedido sozinho ───────────────────────────────
  {
    id:       "silent-multi-item-browser",
    name:     "Cliente Calado — Montando pedido sozinho",
    goal:     "Adiciona 3 itens clicando sem digitar, sem checkout",
    behavior: "passive",
    isSilent: true,
    intentMessages: [],
    silentCartItems: [[], [], []],  // catalog[0], catalog[1], catalog[2]
    requiresCart:     false,
    requiresCheckout: false,
    requiresIdle:     false,
    expectedOutcome:
      "Três ON_ITEM_ADDED retornam cards=[], options=[]. Waiter não interrompe navegação.",
  },

  // ── M: Cliente Calado — Recusa ajuda ─────────────────────────────────────────
  {
    id:       "silent-declines-help",
    name:     "Cliente Calado — Recusa ajuda",
    goal:     "Recebe idle prompt e clica Prefiro continuar",
    behavior: "passive",
    isSilent: true,
    intentMessages: [],
    silentCartItems:     [],
    requiresCart:        false,
    requiresCheckout:    false,
    requiresIdle:        true,
    permissionResponse:  "decline",
    expectedOutcome:
      "ON_IDLE → options com aceite/recusa. ON_PERMISSION_DECLINED → reply neutro, cards=[], options=[]. Sem prompt repetido.",
  },

  // ── N: Cliente Calado — Aceita ajuda ─────────────────────────────────────────
  {
    id:       "silent-accepts-help",
    name:     "Cliente Calado — Aceita ajuda",
    goal:     "Recebe idle prompt e clica Quero sugestão",
    behavior: "passive",
    isSilent: true,
    intentMessages: [],
    silentCartItems:     [],
    requiresCart:        false,
    requiresCheckout:    false,
    requiresIdle:        true,
    permissionResponse:  "accept",
    expectedOutcome:
      "ON_IDLE → options. ON_PERMISSION_ACCEPTED → cards[] com produtos válidos. Sem options simultâneos (Rule 9).",
  },

  // ── O: Cliente Calado — Checkout rápido ──────────────────────────────────────
  {
    id:       "silent-fast-checkout",
    name:     "Cliente Calado — Checkout rápido",
    goal:     "Adiciona item e clica finalizar imediatamente",
    behavior: "passive",
    isSilent: true,
    intentMessages: [],
    silentCartItems:       [[]],
    requiresCart:          true,
    requiresCheckout:      true,
    requiresIdle:          false,
    expectsCheckoutUpsell: true,
    expectedOutcome:
      "ON_ITEM_ADDED limpo. ON_CHECKOUT_STARTED → upsell ativo com cards de bebida (INTERVENTION). AFTER_CHECKOUT sem vendas.",
  },

  // ── P: Cliente Calado — Sensível à invasão ───────────────────────────────────
  {
    id:       "silent-invasion-sensitive",
    name:     "Cliente Calado — Sensível à invasão",
    goal:     "Adiciona produto e continua navegando — testa Rule 7 rigorosamente",
    behavior: "passive",
    isSilent: true,
    intentMessages: [],
    silentCartItems:  [[]],
    requiresCart:     false,
    requiresCheckout: false,
    requiresIdle:     false,
    expectedOutcome:
      "ON_ITEM_ADDED → cards=[], options=[], mode=BROWSE. Qualquer card ou option retornado é invasive_after_item_add.",
  },

  // ════════════════════════════════════════════════════════════
  //  MENU SEARCH & INGREDIENT PROFILES  (Q – R)
  // ════════════════════════════════════════════════════════════

  // ── Q: Busca por Sushi ───────────────────────────────────────────────────────
  {
    id:       "sushi-search",
    name:     "Busca por Sushi",
    goal:     "Perguntar opções de sushi e receber cards diretos — sem qualification question",
    behavior: "direct",
    intentMessages: [
      "quais opções de sushi vocês têm?",
      "me mostra os sushis",
    ],
    requiresCart:        false,
    requiresCheckout:    false,
    requiresSearchCards: true,   // last ON_USER_MESSAGE must return cards (no "Leve/Completo" buttons)
    expectedOutcome:
      "searchMenuByQuery('sushi') confidence=high → cards[] com uramaki/temaki/hot roll. Zero qualification questions. Sunomono/shimeji não aparecem.",
  },

  // ── R: Busca por Frango ───────────────────────────────────────────────────────
  {
    id:       "frango-search",
    name:     "Busca por Frango",
    goal:     "Pedir opções com frango e receber cards por ingrediente — sem qualification question",
    behavior: "direct",
    intentMessages: [
      "quero opções com frango",
      "tem alguma coisa com frango aqui?",
    ],
    requiresCart:        false,
    requiresCheckout:    false,
    requiresSearchCards: true,   // last ON_USER_MESSAGE must return cards
    expectedOutcome:
      "Synonym group frango → cards[] com itens que contêm frango no nome/descrição. Confidence medium→high. Zero qualification questions.",
  },

  // ════════════════════════════════════════════════════════════
  //  CONTEXTUAL ON_ITEM_ADDED PROFILES  (S – T)
  // ════════════════════════════════════════════════════════════

  // ── S: ON_ITEM_ADDED — Item único (elogio contextual) ────────────────────────
  {
    id:       "contextual-item-add-single",
    name:     "Contextual ON_ITEM_ADDED — Item único",
    goal:     "Adiciona 1 item e espera elogio contextual (não 'Escolha certeira' genérico)",
    behavior: "passive",
    isSilent: true,
    intentMessages: [],
    silentCartItems:  [[]],
    requiresCart:     false,
    requiresCheckout: false,
    requiresIdle:     false,
    expectedOutcome:
      "ON_ITEM_ADDED → cards=[], options=[] (Rule 7). reply é contextual ao produto adicionado.",
  },

  // ── T: ON_ITEM_ADDED — Multi-item (confirmação de pedido completo) ────────────
  {
    id:       "contextual-item-add-multi",
    name:     "Contextual ON_ITEM_ADDED — Multi-item",
    goal:     "Adiciona 3 itens e espera acknowledgment de pedido completo na 3ª adição",
    behavior: "passive",
    isSilent: true,
    intentMessages: [],
    silentCartItems:  [[], [], []],
    requiresCart:     false,
    requiresCheckout: false,
    requiresIdle:     false,
    expectedOutcome:
      "Três ON_ITEM_ADDED → todos cards=[], options=[] (Rule 7). 3ª resposta deve mencionar pedido completo.",
  },

  // ════════════════════════════════════════════════════════════
  //  ACTIVE CHECKOUT UPSELL PROFILES  (U – V)
  // ════════════════════════════════════════════════════════════

  // ── U: Upsell de Bebida Ativo — Prato sem bebida ──────────────────────────────
  {
    id:       "active-drink-upsell",
    name:     "Upsell Ativo — Bebida na finalização",
    goal:     "Adiciona prato, tenta checkout, espera bebida cards ativos (sem modal)",
    behavior: "passive",
    isSilent: true,
    intentMessages: [],
    silentCartItems:       [[]],
    requiresCart:          true,
    requiresCheckout:      true,
    requiresIdle:          false,
    expectsCheckoutUpsell: true,
    expectedOutcome:
      "ON_CHECKOUT_STARTED → cards[] de bebida + skip/continue options (INTERVENTION). Sem modal de permissão. Sem tela de checkout operacional.",
  },

  // ── V: Skip bebida → Upsell de Sobremesa ────────────────────────────────────
  {
    id:       "active-dessert-after-skip",
    name:     "Upsell Ativo — Sobremesa após skip de bebida",
    goal:     "Prato + bebida, skip drink upsell, espera cards de sobremesa",
    behavior: "passive",
    isSilent: true,
    intentMessages: [],
    silentCartItems: [
      [],
      ["bebida", "suco", "refrigerante", "agua", "cerveja", "limonada"],
    ],
    requiresCart:          true,
    requiresCheckout:      true,
    requiresIdle:          false,
    expectsCheckoutUpsell: true,
    expectedOutcome:
      "ON_CHECKOUT_STARTED com prato+bebida → sobremesa cards (INTERVENTION) + continue_checkout option. Sem modal.",
  },
];
