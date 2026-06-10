/**
 * WaiterRealCaseTrainingBuilder — turns a sanitized real case into a clear,
 * operator-facing TRAINING PROPOSAL: the problem, the IDEAL response/behavior,
 * the training rule the Waiter would learn, and the expected impact.
 *
 * Deterministic and rule-based by `scenarioType` (no LLM, no DB, no PII): safe to
 * run inside the daily cron. The ideal responses never invent menu items, prices,
 * payment methods or promotions — they describe SAFE behavior ("use only what the
 * restaurant configured", "show real options", "ask to confirm").
 */

export type SuggestedActionType =
  | "RESPONSE_PATTERN"
  | "PAYMENT_RULE"
  | "MENU_GUIDANCE"
  | "UPSELL_BEHAVIOR"
  | "OBJECTION_HANDLING"
  | "RESTRICTION_HANDLING"
  | "CHECKOUT_GUIDANCE"
  | "TONE_ADJUSTMENT";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export interface TrainingProposal {
  title: string;
  situationSummary: string;
  problemDetected: string;
  idealResponse: string;
  trainingRule: string;
  expectedImpact: string;
  suggestedActionType: SuggestedActionType;
  riskLevel: RiskLevel;
}

export interface BuildTrainingInput {
  scenarioType: string;
  customerIntent: string;
  /** First sanitized customer message (no PII). */
  customerExcerpt?: string | null;
  /** Sanitized Waiter reply if available (no PII). */
  waiterExcerpt?: string | null;
}

type Template = Omit<TrainingProposal, "situationSummary">;

/** One conservative, safe proposal per known situation. */
const TEMPLATES: Record<string, Template> = {
  PAYMENT_QUESTION: {
    title: "Ensinar resposta clara sobre formas de pagamento",
    problemDetected:
      "O cliente perguntou sobre pagamento e o Waiter precisa responder de forma objetiva, sem inventar condições.",
    idealResponse:
      "Aceitamos as formas de pagamento configuradas pelo restaurante. Posso te mostrar as opções disponíveis no fechamento do pedido.",
    trainingRule:
      "Quando o cliente perguntar sobre pagamento, o Waiter deve responder com segurança usando apenas as formas de pagamento configuradas no Foocci, sem inventar taxas, descontos ou métodos não cadastrados.",
    expectedImpact: "Reduz dúvida antes do checkout e evita perda por insegurança no pagamento.",
    suggestedActionType: "PAYMENT_RULE",
    riskLevel: "MEDIUM",
  },
  HUNGRY_BIG: {
    title: "Recomendar opções mais completas para cliente com muita fome",
    problemDetected:
      "O cliente indicou fome alta, mas o Waiter precisa conduzir para opções que sustentam mais.",
    idealResponse:
      "Se você está com bastante fome, eu te indicaria uma opção mais completa. Posso te mostrar os combinados que mais sustentam?",
    trainingRule:
      "Quando o cliente demonstrar fome alta, o Waiter deve reduzir a escolha e recomendar itens mais completos, com próximo passo claro.",
    expectedImpact: "Aumentar conversão e ticket médio em clientes indecisos.",
    suggestedActionType: "UPSELL_BEHAVIOR",
    riskLevel: "LOW",
  },
  ORDER_BY_TEXT: {
    title: "Transformar pedido por texto em carrinho guiado",
    problemDetected:
      "Cliente tentou pedir escrevendo livremente. O Waiter precisa interpretar, confirmar e conduzir para o carrinho.",
    idealResponse:
      "Perfeito, entendi seu pedido. Vou te mostrar as opções correspondentes para confirmar e fechar certinho.",
    trainingRule:
      "Quando o cliente pedir por texto livre, o Waiter deve interpretar intenção, mostrar opções reais do cardápio e pedir confirmação antes de finalizar.",
    expectedImpact: "Reduz fricção e aumenta pedidos concluídos.",
    suggestedActionType: "CHECKOUT_GUIDANCE",
    riskLevel: "LOW",
  },
  DIETARY_RESTRICTION: {
    title: "Conduzir com segurança clientes com restrição alimentar",
    problemDetected:
      "O cliente indicou uma restrição alimentar e o Waiter precisa respeitar sem prometer o que não existe.",
    idealResponse:
      "Entendi sua restrição. Vou te mostrar apenas as opções do cardápio que combinam com ela — me confirma se alguma te atende?",
    trainingRule:
      "Quando houver restrição alimentar, o Waiter deve filtrar e recomendar somente itens reais compatíveis, nunca afirmar que um prato é seguro sem base no cardápio.",
    expectedImpact: "Protege o cliente, aumenta confiança e evita problemas de segurança alimentar.",
    suggestedActionType: "RESTRICTION_HANDLING",
    riskLevel: "HIGH",
  },
  BUDGET_CUSTOMER: {
    title: "Atender bem clientes preocupados com preço",
    problemDetected:
      "O cliente demonstrou preocupação com preço e o Waiter precisa ajudar sem inventar promoções.",
    idealResponse:
      "Posso te mostrar as opções com melhor custo-benefício do cardápio. Quer que eu comece pelas mais econômicas?",
    trainingRule:
      "Quando o cliente falar de orçamento, o Waiter deve priorizar opções reais de menor preço e só citar promoções que existem de fato.",
    expectedImpact: "Aumenta conversão de clientes sensíveis a preço sem prometer o que não existe.",
    suggestedActionType: "OBJECTION_HANDLING",
    riskLevel: "MEDIUM",
  },
  INDECISIVE_CUSTOMER: {
    title: "Ajudar clientes indecisos com uma recomendação clara",
    problemDetected:
      "O cliente está indeciso e o Waiter precisa reduzir as opções e sugerir um caminho.",
    idealResponse:
      "Sem problema! Pra facilitar, posso te recomendar os mais pedidos. Prefere algo mais leve ou mais reforçado?",
    trainingRule:
      "Quando o cliente estiver indeciso, o Waiter deve fazer no máximo uma pergunta de qualificação e recomendar opções reais com um próximo passo claro.",
    expectedImpact: "Reduz abandono por indecisão e aumenta a taxa de conclusão do pedido.",
    suggestedActionType: "RESPONSE_PATTERN",
    riskLevel: "LOW",
  },
  GROUP_CUSTOMER: {
    title: "Conduzir pedidos para grupos",
    problemDetected:
      "O cliente está pedindo para várias pessoas e o Waiter precisa sugerir porções/combos adequados.",
    idealResponse:
      "Pra grupo, posso te sugerir opções que rendem bem e agradam todo mundo. Quantas pessoas são?",
    trainingRule:
      "Quando o pedido for para um grupo, o Waiter deve sugerir itens compartilháveis/combos reais e ajudar a dimensionar a quantidade.",
    expectedImpact: "Aumenta o ticket médio em pedidos de grupo com boa experiência.",
    suggestedActionType: "UPSELL_BEHAVIOR",
    riskLevel: "LOW",
  },
  WANTS_CHECKOUT: {
    title: "Conduzir o cliente para a finalização com clareza",
    problemDetected:
      "O cliente quer finalizar e o Waiter precisa conduzir ao checkout sem fricção.",
    idealResponse:
      "Perfeito! Vou revisar seu pedido e te levar para a finalização. Quer adicionar uma bebida antes de fechar?",
    trainingRule:
      "Quando o cliente quiser finalizar, o Waiter deve revisar o pedido, oferecer no máximo um complemento contextual e conduzir ao checkout.",
    expectedImpact: "Acelera a conclusão e captura um upsell leve sem atrito.",
    suggestedActionType: "CHECKOUT_GUIDANCE",
    riskLevel: "LOW",
  },
  REFUSING_DRINK: {
    title: "Respeitar a recusa de bebida sem insistir",
    problemDetected:
      "O cliente recusou a bebida e o Waiter precisa respeitar sem insistir.",
    idealResponse: "Sem problema! Seguimos então. Quer que eu finalize seu pedido?",
    trainingRule:
      "Quando o cliente recusar um complemento, o Waiter deve aceitar de imediato e seguir para o próximo passo, sem repetir a oferta.",
    expectedImpact: "Melhora a experiência e evita irritação por insistência.",
    suggestedActionType: "TONE_ADJUSTMENT",
    riskLevel: "LOW",
  },
  COMPLAINT: {
    title: "Acolher reclamações com empatia e encaminhamento",
    problemDetected:
      "O cliente reclamou e o Waiter precisa acolher e encaminhar, sem prometer o que não pode cumprir.",
    idealResponse:
      "Sinto muito por isso! Vou registrar e encaminhar para a equipe do restaurante resolver o mais rápido possível.",
    trainingRule:
      "Diante de reclamação, o Waiter deve demonstrar empatia, não prometer reembolso/brinde por conta própria e encaminhar para o restaurante.",
    expectedImpact: "Preserva o relacionamento e reduz avaliações negativas.",
    suggestedActionType: "OBJECTION_HANDLING",
    riskLevel: "MEDIUM",
  },
  DELIVERY_QUESTION: {
    title: "Responder dúvidas de entrega com base nas regras do restaurante",
    problemDetected:
      "O cliente perguntou sobre entrega e o Waiter precisa responder sem inventar prazos ou taxas.",
    idealResponse:
      "A entrega e a taxa aparecem no fechamento, de acordo com seu endereço. Quer que eu siga montando seu pedido?",
    trainingRule:
      "Sobre entrega, o Waiter deve usar apenas as regras/taxas configuradas e direcionar o cálculo para o fechamento, sem inventar prazos.",
    expectedImpact: "Evita expectativa errada e perda por insegurança na entrega.",
    suggestedActionType: "RESPONSE_PATTERN",
    riskLevel: "MEDIUM",
  },
};

const FALLBACK: Template = {
  title: "Melhorar a condução neste tipo de atendimento",
  problemDetected: "O Waiter pode conduzir melhor esta situação para aumentar a chance de pedido.",
  idealResponse:
    "Posso te ajudar com as opções reais do cardápio e te levar até a finalização com um próximo passo claro.",
  trainingRule:
    "Nesta situação, o Waiter deve recomendar apenas itens reais, fazer no máximo uma pergunta e conduzir ao próximo passo.",
  expectedImpact: "Reduz fricção e melhora a conversão.",
  suggestedActionType: "RESPONSE_PATTERN",
  riskLevel: "LOW",
};

export function buildTrainingProposal(input: BuildTrainingInput): TrainingProposal {
  const tpl = TEMPLATES[input.scenarioType] ?? FALLBACK;
  const said = input.customerExcerpt?.trim();
  const situationSummary = said
    ? `Cliente: “${said}” — situação de ${input.customerIntent}.`
    : `Situação de ${input.customerIntent}.`;
  return { ...tpl, situationSummary };
}
