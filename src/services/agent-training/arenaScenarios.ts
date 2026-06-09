export interface ArenaScenarioDef {
  key:         string;
  title:       string;
  persona:     string;
  description: string;
  riskTags:    string[];
  goal:        string;
}

export const ARENA_SCENARIOS: ArenaScenarioDef[] = [
  {
    key:         "priceBeforeOrder",
    title:       "Pergunta preço antes de pedir",
    persona:     "cliente que pergunta preço",
    description: "Pergunta o preço do yakisoba antes de fazer o pedido",
    riskTags:    ["price_lookup", "order_completion"],
    goal:        "ASK_MENU_THEN_ORDER",
  },
  {
    key:         "directOrder",
    title:       "Pedido direto",
    persona:     "cliente direto",
    description: "Pede yakisoba diretamente sem perguntas",
    riskTags:    ["order_completion"],
    goal:        "COMPLETE_ORDER",
  },
  {
    key:         "addItemMidFlow",
    title:       "Adicionar item no meio do pedido",
    persona:     "cliente que muda pedido",
    description: "Adiciona item extra durante a coleta de endereço",
    riskTags:    ["interrupt", "mid_flow_add"],
    goal:        "ADD_ITEM_MID_FLOW",
  },
  {
    key:         "cancelPendingItem",
    title:       "Cancelar item pendente",
    persona:     "cliente indeciso",
    description: "Cancela item antes de resolver ambiguidade",
    riskTags:    ["cancel_item", "ambiguity"],
    goal:        "REMOVE_PENDING_ITEM",
  },
  {
    key:         "requestAgent",
    title:       "Pedir atendente humano",
    persona:     "cliente bravo",
    description: "Solicita atendente humano durante a conversa",
    riskTags:    ["handoff"],
    goal:        "ASK_ATTENDANT",
  },
  {
    key:         "cocaAmbiguity",
    title:       "Ambiguidade Coca-Cola",
    persona:     "cliente confuso",
    description: "Pede 'uma coca' sem especificar tamanho — força resolução de ambiguidade",
    riskTags:    ["ambiguity", "order_completion"],
    goal:        "ORDER_AMBIGUOUS",
  },
];
