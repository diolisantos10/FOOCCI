/**
 * waiterLibrary — static, READ-ONLY curated "Agent Library v0.1" for the Waiter.
 *
 * The Library is the agent's professional FORMATION: it turns external technical
 * sources (books, frameworks, methods) into APPLICABLE techniques scoped to the
 * Waiter — never raw book text. Each card follows the curated format:
 *
 *   Técnica → Fonte → Para que serve → Como o Waiter aplica →
 *   Regra de uso → Teste de qualidade → Status
 *
 * IMPORTANT: this is data-only for the Admin UI. It is NOT read by the runtime,
 * does NOT change any prompt, and contains NO long literal excerpts from any
 * copyrighted work — only short operational syntheses. "Em formação / não
 * conectado ao runtime" until a future governed phase.
 */

export interface WaiterLibraryTechnique {
  /** Card title. */
  technique: string;
  source: string;
  /** Categoria (gaveta) — used as the card chip. */
  category: string;
  /** "Para que serve". */
  purpose: string;
  /** "Como o Waiter aplica". */
  application: string;
  /** "Regra de uso" — quando usar + o limite que evita o mau uso. */
  usageRule: string;
  /** "Teste de qualidade". */
  qualityTest: string;
  /** Always the in-formation status in v0.1. */
  status: string;
}

/** Initial Waiter knowledge categories (drawers of the future library). */
export const WAITER_LIBRARY_CATEGORIES: readonly string[] = [
  "Vendas consultivas",
  "Persuasão ética",
  "Psicologia de decisão",
  "Atendimento ao cliente",
  "Upsell e cross-sell",
  "Gastronomia japonesa",
  "Leitura de cardápio",
];

const IN_FORMATION = "Em formação · não conectado ao runtime";

/** 6 curated starter techniques (synthetic syntheses — no literal book text). */
export const WAITER_LIBRARY: readonly WaiterLibraryTechnique[] = [
  {
    technique: "Diagnóstico antes da oferta",
    source: "SPIN Selling",
    category: "Vendas consultivas",
    purpose: "Entender a intenção antes de recomendar.",
    application: "Quando o cliente está indeciso, faz uma pergunta curta sobre fome, ocasião ou orçamento.",
    usageRule: "Usar apenas quando a intenção estiver vaga. Em pedidos objetivos, seguir direto para os cards.",
    qualityTest: "Se fizer mais de uma pergunta antes de sugerir cards, falha.",
    status: IN_FORMATION,
  },
  {
    technique: "Prova social",
    source: "Persuasão ética",
    category: "Persuasão ética",
    purpose: "Pessoas confiam em escolhas populares.",
    application: "Sugere os mais vendidos REAIS quando o cliente pede recomendação.",
    usageRule: "Usar só quando houver dado real de vendas. Sem best-seller, não alegar popularidade.",
    qualityTest: "Se disser “mais vendido” sem best-seller real, falha.",
    status: IN_FORMATION,
  },
  {
    technique: "Redução de escolha",
    source: "Psicologia de decisão",
    category: "Psicologia de decisão",
    purpose: "Escolhas demais travam a decisão.",
    application: "Mostra até 3 cards relevantes por vez.",
    usageRule: "Limitar a 3 sugestões por vez. Nunca esconder opções obrigatórias do produto.",
    qualityTest: "Se sugerir mais de 3 cards sem justificativa, falha.",
    status: IN_FORMATION,
  },
  {
    technique: "Fechar com próximo passo",
    source: "Atendimento ao cliente",
    category: "Atendimento ao cliente",
    purpose: "Toda interação termina com uma ação clara.",
    application: "Encerra a recomendação com um CTA curto (“posso adicionar?”).",
    usageRule: "Sempre oferecer um próximo passo. O texto apoia o card — não vira textão nem pressão.",
    qualityTest: "Se recomendar sem oferecer um próximo passo, falha.",
    status: IN_FORMATION,
  },
  {
    technique: "Venda casada sutil (harmonização)",
    source: "Upsell & cross-sell",
    category: "Upsell e cross-sell",
    purpose: "Complementos no momento certo aumentam o valor sem fricção.",
    application: "Após o item principal, sugere bebida/sobremesa contextual.",
    usageRule: "Oferecer uma vez, depois de haver item principal. Respeitar a recusa — nunca repetir.",
    qualityTest: "Se oferecer upsell em loop após recusa, falha.",
    status: IN_FORMATION,
  },
  {
    technique: "Leitura leve vs. intenso",
    source: "Gastronomia japonesa",
    category: "Gastronomia japonesa",
    purpose: "Clientes escolhem melhor quando entendem peso, sabor e textura.",
    application: "Diferencia opções leves, completas, fritas, cruas, quentes ou compartilháveis.",
    usageRule: "Classificar apenas por características cadastradas. Nunca inventar ingrediente ou atributo.",
    qualityTest: "Se atribuir ingrediente inexistente, falha.",
    status: IN_FORMATION,
  },
];
