/**
 * intentClassifier — pure, keyword-based mapping of a customer message to a Waiter
 * scenario type + short intent label. No LLM, no DB. Used to classify sanitized
 * real conversations into reusable examples.
 */

export interface ClassifiedIntent {
  intent: string;
  scenarioType: string;
}

const RULES: Array<{ re: RegExp; scenarioType: string; intent: string }> = [
  // Reclamação/elogio primeiro: são sinais fortes que não devem ser engolidos
  // por palavras genéricas (ex.: "demorou a entrega" é reclamação, não entrega).
  { re: /\breclam|p[ée]ssim|horr[íi]vel|demorou|frio chegou|errad[oa]|absurdo|decepcion\b/i, scenarioType: "COMPLAINT", intent: "reclamação" },
  { re: /\bobrigad|parab[ée]ns|excelente|maravilh|adorei|amei|muito bom|top demais|atendimento [óo]timo\b/i, scenarioType: "PRAISE", intent: "elogio" },
  { re: /\bdesist|deixa pra l[áa]|n[ãa]o quero mais|cancela|esquece\b/i, scenarioType: "ABANDONMENT", intent: "desistência" },
  { re: /\bentrega|frete|delivery|chega em quanto|tempo de entrega|taxa de entrega\b/i, scenarioType: "DELIVERY_QUESTION", intent: "pergunta sobre entrega" },
  { re: /\bquero (?:um|uma|dois|duas|\d+)\s|me v[êe]\s|manda (?:um|uma)\s|vou querer\b/i, scenarioType: "ORDER_BY_TEXT", intent: "tenta pedir por texto" },
  { re: /\bvegan|vegetarian|sem carne|sem peixe|sem lactose|al[ée]rgic|gluten|sem gl[úu]ten\b/i, scenarioType: "DIETARY_RESTRICTION", intent: "restrição alimentar" },
  { re: /\bbarat|em conta|custo|n[ãa]o quero gastar|mais em conta|econ[ôo]mic\b/i, scenarioType: "BUDGET_CUSTOMER", intent: "preço/orçamento" },
  { re: /\brecomenda|indica|sugest|melhor prato|carro-?chefe|o que (?:[ée]|tem de) bom\b/i, scenarioType: "RECOMMENDATION_REQUEST", intent: "pede recomendação" },
  { re: /\bgrupo|pessoas|fam[íi]lia|galera|compartilh|para \d+|somos \d+\b/i, scenarioType: "GROUP_CUSTOMER", intent: "pedido em grupo" },
  { re: /\bleve|saud[áa]vel|menos pesad|fit\b/i, scenarioType: "LIGHT_HEALTHY", intent: "opção leve" },
  { re: /\bfome|grande|comer bem|famint|ench\b/i, scenarioType: "HUNGRY_BIG", intent: "quer algo grande" },
  { re: /\bn[ãa]o quero bebida|sem bebida|bebida n[ãa]o|tira a bebida\b/i, scenarioType: "REFUSING_DRINK", intent: "recusa bebida" },
  { re: /\baceito (?:a |o )?(?:bebida|sobremesa|sugest)|pode adicionar|bora|adiciona a[íi]\b/i, scenarioType: "UPSELL_ACCEPTED", intent: "upsell aceito" },
  { re: /\bfinaliz|fechar (?:o )?pedido|fecha a[íi]|fechar a conta\b/i, scenarioType: "WANTS_CHECKOUT", intent: "quer finalizar" },
  { re: /\bpagar|pix|cart[ãa]o|dinheiro|forma de pagamento\b/i, scenarioType: "PAYMENT_QUESTION", intent: "pergunta pagamento" },
  { re: /\bn[ãa]o sei|d[úu]vida|me ajuda|ajudar?|sem ideia|o que pedir\b/i, scenarioType: "INDECISIVE_CUSTOMER", intent: "indeciso" },
];

export function classifyIntent(message: string): ClassifiedIntent {
  const text = message ?? "";
  for (const rule of RULES) {
    if (rule.re.test(text)) return { intent: rule.intent, scenarioType: rule.scenarioType };
  }
  return { intent: "atendimento geral", scenarioType: "INDECISIVE_CUSTOMER" };
}
