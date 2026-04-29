/**
 * InsightGenerator
 *
 * Pure function: FailurePattern → human-readable insight + ready-to-copy prompt suggestion.
 * No DB, no side effects.
 */

import type { FailurePattern, FailureType } from "./FailureAnalyzer";

export interface RunInsight {
  insight:         string;
  suggestedPrompt: string;
}

type InsightFn = (p: FailurePattern) => RunInsight;

const INSIGHTS: Record<FailureType, InsightFn> = {
  low_conversion: (p) => ({
    insight: `A taxa de conversão está em ${p.frequency} — a IA não está conduzindo as conversas até o checkout. Clientes com itens no carrinho estão abandonando antes de confirmar o pedido.`,
    suggestedPrompt: `MELHORIA SUGERIDA — CONVERSÃO BAIXA\n\nAdicione ao MOTOR DE VENDAS após REGRA 7:\n\n━━━ REGRA 7.1 — GATILHO DE CHECKOUT POR TURNOS ━━━\n  SE carrinho tem ≥1 item E turnCount ≥ 5:\n    → Execute confirm_order após qualquer resposta positiva do cliente.\n    → Não espere mais itens se o cliente não sinalizou interesse em continuar.\n    → Prefira fechar cedo a perder o pedido por excesso de sugestões.`,
  }),

  upsell_not_happening: (p) => ({
    insight: `Em ${p.frequency} dos cenários, a IA fechou o pedido sem tentar nenhum upsell. A fase de expansão do pedido (FOOD EXPANSION) está sendo ignorada após o prato principal.`,
    suggestedPrompt: `MELHORIA SUGERIDA — UPSELL NÃO ACONTECENDO\n\nReforce a REGRA 5 (FOOD EXPANSION) com exemplo concreto:\n\nEXEMPLO OBRIGATÓRIO (fase de expansão):\n  Cliente pede [Prato X] → IA adiciona → imediatamente sugere:\n  "Perfeito! Nossa [Porção Y] combina muito bem com isso. Que tal incluir?"\n  → suggest_upsell([ID_Y])\n  NUNCA confirme o pedido diretamente após o primeiro item sem antes passar pela fase de expansão.`,
  }),

  early_checkout_drop: (p) => ({
    insight: `${p.frequency} dos pedidos tiveram itens no carrinho mas nunca foram confirmados. A IA está se perdendo no fluxo de conversa e não chega ao checkout.`,
    suggestedPrompt: `MELHORIA SUGERIDA — PEDIDOS NÃO CONFIRMADOS\n\nAdicione ao REGRA 10 (FINAL INTENT LOCK):\n\nGATILHO AUTOMÁTICO DE FECHAMENTO:\n  SE selectedItems ≥ 1 E turnCount ≥ 6:\n    → Encaminhe para checkout independente do estágio do funil.\n    → Mensagem: "Tudo certo com seu pedido? Posso confirmar?"\n    → Execute confirm_order na próxima resposta positiva do cliente.`,
  }),

  too_many_questions: (p) => ({
    insight: `Em ${p.frequency} dos cenários, a IA fez múltiplas perguntas antes de sugerir itens, o que gerou abandono. Clientes querem decisão, não questionários.`,
    suggestedPrompt: `MELHORIA SUGERIDA — EXCESSO DE PERGUNTAS\n\nAdicione à REGRA 4 (MAIN ITEM):\n\nLIMITE DE QUALIFICAÇÃO:\n  Máximo 1 pergunta de qualificação por conversa antes de sugerir o primeiro item.\n  SE o cliente respondeu qualquer pergunta anterior → AÇÃO OBRIGATÓRIA: sugira 1 item concreto agora.\n  PROIBIDO: fazer segunda pergunta sem ter sugerido pelo menos 1 item entre elas.`,
  }),

  repetition: (p) => ({
    insight: `A IA repetiu sugestões já feitas em ${p.frequency} dos cenários, gerando má experiência. O controle de itens já sugeridos não está sendo respeitado.`,
    suggestedPrompt: `MELHORIA SUGERIDA — REPETIÇÃO DE SUGESTÕES\n\nReforce a REGRA 8 (SEM REPETIÇÃO):\n\nVERIFICAÇÃO OBRIGATÓRIA antes de suggest_upsell:\n  1. Leia o bloco ITENS JÁ SUGERIDOS no contexto.\n  2. O ID que você vai sugerir está nessa lista? → NÃO chame suggest_upsell.\n  3. Não há item novo disponível na categoria? → PULE a categoria inteira e avance o funil.\n  REGRA: chamar suggest_upsell com ID já sugerido é tratado como erro de tool.`,
  }),

  tool_errors: (p) => ({
    insight: `Alto número de erros de ferramenta (${p.frequency} dos cenários afetados). A IA está chamando tools com IDs inválidos ou em sequência incorreta.`,
    suggestedPrompt: `MELHORIA SUGERIDA — ERROS DE FERRAMENTA\n\nReforce a REGRA 2 (VALIDAÇÃO OBRIGATÓRIA):\n\nPRÉ-VALIDAÇÃO (checklist antes de add_item / suggest_upsell):\n  □ O ID existe EXATAMENTE no bloco CARDÁPIO acima?\n  □ O nome no CARDÁPIO corresponde ao que o cliente pediu?\n  □ Esta é a primeira chamada para este item neste turno?\n  SE qualquer resposta for NÃO → NÃO chame a tool. Informe o cliente.`,
  }),

  drink_not_offered: (p) => ({
    insight: `Bebida não foi sugerida em ${p.frequency} dos cenários após o sinal de fechamento. A fase de complemento (drink + dessert) não está sendo executada corretamente.`,
    suggestedPrompt: `MELHORIA SUGERIDA — BEBIDA NÃO OFERECIDA\n\nReforce a REGRA 6 (COMPLEMENTOS PÓS-FECHAMENTO):\n\nATIVAÇÃO GARANTIDA DA FASE DE COMPLEMENTO:\n  Quando o cliente disser "é isso", "fecha", "confirma" ou similar:\n    PASSO 1 OBRIGATÓRIO: bebida já foi tentada? (upsellAttempts de bebidas = 0?)\n    SE NÃO → ANTES de confirm_order → sugira 1 bebida: "Que tal [bebida] para acompanhar?"\n    SE JÁ → confirm_order imediato.\n  NUNCA pule esta verificação ao receber sinal de fechamento.`,
  }),

  dessert_not_offered: (p) => ({
    insight: `Sobremesa não foi sugerida na maioria dos cenários. A fase de complemento está sendo encerrada antes de tentar sobremesas.`,
    suggestedPrompt: `MELHORIA SUGERIDA — SOBREMESA NÃO OFERECIDA\n\nReforce a REGRA 6 (COMPLEMENTOS):\n\nSEQUÊNCIA COMPLETA DE COMPLEMENTO:\n  Após bebida tentada (aceita ou recusada):\n    → Sobremesa foi tentada? (upsellAttempts de sobremesas = 0?)\n    → SE NÃO → sugira 1 sobremesa antes do confirm_order.\n    → SE JÁ → confirm_order imediato.\n  Bebida recusada NÃO pula a sobremesa — são categorias independentes.`,
  }),

  dietary_violation: (p) => ({
    insight: `Em ${p.frequency} dos cenários, itens incompatíveis com restrições alimentares foram sugeridos. Este é um problema crítico de segurança e experiência do cliente.`,
    suggestedPrompt: `MELHORIA SUGERIDA — VIOLAÇÃO DE RESTRIÇÕES ALIMENTARES\n\nReforce a REGRA 9 (RESTRIÇÕES ALIMENTARES):\n\nFILTRO OBRIGATÓRIO (execute antes de cada sugestão):\n  1. Leia o PERFIL DO CLIENTE → campos RESTRIÇÃO ALIMENTAR e ALERGIA.\n  2. O item que você vai sugerir contém algum ingrediente da lista de restrições?\n     (verifique o campo "Ingredientes" no CARDÁPIO)\n  3. SE SIM → elimine este item. Procure alternativa compatível.\n  4. SE não houver alternativa → diga "Não temos opções compatíveis com sua restrição nesta categoria".\n  NUNCA sugira item sem completar este checklist.`,
  }),

  none: () => ({
    insight: "Nenhum padrão de falha dominante detectado. O desempenho da IA está dentro do esperado para esta rodada.",
    suggestedPrompt: "Nenhuma alteração de prompt sugerida para esta rodada. Continue monitorando as métricas nas próximas execuções.",
  }),
};

export function generateInsight(pattern: FailurePattern): RunInsight {
  const fn = INSIGHTS[pattern.type];
  return fn ? fn(pattern) : INSIGHTS.none(pattern);
}
