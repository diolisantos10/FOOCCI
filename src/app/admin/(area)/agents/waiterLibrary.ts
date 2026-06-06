/**
 * waiterLibrary — static, READ-ONLY curated "Agent Library v0.1" for the Waiter.
 *
 * The Library is the agent's professional FORMATION: it turns external technical
 * sources (books, frameworks, methods) into APPLICABLE techniques scoped to the
 * Waiter — never raw book text. Each entry is a small, curated synthesis:
 *
 *   Fonte → Categoria → Técnica → Princípio → Aplicação no Foocci →
 *   Limite operacional → Teste sugerido → Status
 *
 * IMPORTANT: this is data-only for the Admin UI. It is NOT read by the runtime,
 * does NOT change any prompt, and contains NO long literal excerpts from any
 * copyrighted work — only short operational syntheses. "Planejado / não conectado
 * ao runtime" until a future governed phase.
 */

export interface WaiterLibraryTechnique {
  source: string;
  category: string;
  technique: string;
  principle: string;
  foocciApplication: string;
  operationalLimit: string;
  suggestedTest: string;
  /** Always "planned / not wired to runtime" in v0.1. */
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

const PLANNED = "Planejado · não conectado ao runtime";

/** 6 curated starter techniques (synthetic syntheses — no literal book text). */
export const WAITER_LIBRARY: readonly WaiterLibraryTechnique[] = [
  {
    source: "SPIN Selling",
    category: "Vendas consultivas",
    technique: "Diagnóstico antes da oferta",
    principle: "Entender a intenção antes de recomendar.",
    foocciApplication:
      "Quando o cliente estiver indeciso, fazer UMA pergunta curta sobre fome, ocasião ou orçamento.",
    operationalLimit: "Não transformar um pedido rápido em entrevista longa.",
    suggestedTest: "Se fizer mais de uma pergunta antes de sugerir cards, falha.",
    status: PLANNED,
  },
  {
    source: "Persuasão ética",
    category: "Persuasão ética",
    technique: "Prova social",
    principle: "Pessoas confiam em escolhas populares.",
    foocciApplication: "Sugerir os mais vendidos REAIS quando o cliente pedir recomendação.",
    operationalLimit: "Só usar se houver dado real de vendas (best-seller).",
    suggestedTest: "Se disser “mais vendido” sem best-seller real, falha.",
    status: PLANNED,
  },
  {
    source: "Psicologia de decisão",
    category: "Psicologia de decisão",
    technique: "Redução de escolha",
    principle: "Escolhas demais travam a decisão.",
    foocciApplication: "Mostrar até 3 cards relevantes por vez.",
    operationalLimit: "Não esconder opções obrigatórias do produto.",
    suggestedTest: "Se sugerir mais de 3 cards sem justificativa, falha.",
    status: PLANNED,
  },
  {
    source: "Atendimento ao cliente",
    category: "Atendimento ao cliente",
    technique: "Fechar com próximo passo",
    principle: "Toda interação termina com uma ação clara.",
    foocciApplication: "Encerrar a recomendação com um CTA curto (“posso adicionar?”).",
    operationalLimit: "O texto apoia o card — não vira textão nem pressão.",
    suggestedTest: "Se recomendar sem oferecer um próximo passo, falha.",
    status: PLANNED,
  },
  {
    source: "Upsell & cross-sell",
    category: "Upsell e cross-sell",
    technique: "Venda casada sutil (harmonização)",
    principle: "Complementos no momento certo aumentam o valor sem fricção.",
    foocciApplication: "Após o item principal, sugerir bebida/sobremesa contextual — uma vez.",
    operationalLimit: "Não repetir a mesma oferta após uma recusa.",
    suggestedTest: "Se oferecer upsell em loop após recusa, falha.",
    status: PLANNED,
  },
  {
    source: "Gastronomia japonesa",
    category: "Gastronomia japonesa",
    technique: "Leitura leve vs. intenso",
    principle: "Clientes escolhem melhor quando entendem peso, sabor e textura.",
    foocciApplication:
      "Diferenciar opções leves, completas, fritas, cruas, quentes ou compartilháveis.",
    operationalLimit: "Não inventar ingrediente ou característica não cadastrada.",
    suggestedTest: "Se atribuir ingrediente inexistente, falha.",
    status: PLANNED,
  },
];
