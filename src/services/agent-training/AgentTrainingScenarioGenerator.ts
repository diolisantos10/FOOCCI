/**
 * AgentTrainingScenarioGenerator
 *
 * Generates synthetic customer conversation scenarios for AI agent training.
 * No live WhatsApp, no real orders, no real customers.
 */

import type { CustomerPersona, GeneratedScenario, ScenarioGoal } from "./types";

// ── Persona message style tables ──────────────────────────────────────────────

const PERSONA_STYLES: Record<CustomerPersona, string[]> = {
  DIRECT:           ["quero", "me manda", "preciso de", "quero pedir"],
  CONFUSED:         ["não entendi", "como funciona", "o que é isso", "pode explicar"],
  IMPATIENT:        ["rápido", "urgente", "logo por favor", "demora muito?"],
  POLITE:           ["por favor", "obrigado", "tudo bem?", "seria possível"],
  ANGRY:            ["não funciona", "absurdo", "isso é um erro", "péssimo"],
  RECURRING:        ["de novo o mesmo", "igual da última vez", "o de sempre"],
  TYPO_HEAVY:       ["qero", "manda um yakisba", "kero pedi"],
  CHANGING_MIND:    ["na verdade", "pode trocar", "muda pra", "esquece"],
  PRICE_ASKER:      ["quanto custa", "qual o valor", "preço do"],
  DELIVERY_ASKER:   ["entrega", "frete", "quanto fica a entrega", "tem motoboy"],
  HUMAN_ASKER:      ["falar com atendente", "quero um humano", "chama alguém"],
  ABANDONING:       ["tá bom", "deixa", "não vou mais", "depois"],
  UNAVAILABLE_ITEM: ["tem", "vocês vendem", "quero um item que provavelmente não tem"],
  PAYMENT_FIRST:    ["aceita pix", "como pago", "qual forma de pagamento"],
  ADDRESS_FIRST:    ["moro na rua", "endereço", "entrega para"],
};

// ── Scenario templates ────────────────────────────────────────────────────────

interface ScenarioTemplate {
  title:           string;
  persona:         CustomerPersona;
  goal:            ScenarioGoal;
  messageSequence: string[];
  expectedOutcome: Record<string, unknown>;
  riskTags:        string[];
}

const SCENARIO_TEMPLATES: ScenarioTemplate[] = [
  // COMPLETE_ORDER — happy path
  {
    title:           "Pedido direto: yakisoba",
    persona:         "DIRECT",
    goal:            "COMPLETE_ORDER",
    messageSequence: ["quero 1 yakisoba", "entrega", "Rua das Flores 100", "pix"],
    expectedOutcome: { stage: "PAYMENT_REQUESTED", hasItems: true, deliveryType: "DELIVERY" },
    riskTags:        ["happy_path"],
  },
  // ORDER_AMBIGUOUS
  {
    title:           "Ambiguidade: coca (lata vs 2L)",
    persona:         "CONFUSED",
    goal:            "ORDER_AMBIGUOUS",
    messageSequence: ["quero uma coca", "2", "entrega", "Rua A 1", "pix"],
    expectedOutcome: { stage: "PAYMENT_REQUESTED", resolved: true },
    riskTags:        ["ambiguity", "item_selection"],
  },
  // REMOVE_PENDING_ITEM
  {
    title:           "Cancelar item pendente ambíguo",
    persona:         "CHANGING_MIND",
    goal:            "REMOVE_PENDING_ITEM",
    messageSequence: ["quero uma coca", "não quero mais"],
    expectedOutcome: { itemCancelled: true },
    riskTags:        ["cancel_item", "state_machine"],
  },
  // ADD_ITEM_MID_FLOW
  {
    title:           "Adicionar item durante coleta de endereço",
    persona:         "DIRECT",
    goal:            "ADD_ITEM_MID_FLOW",
    messageSequence: ["quero 1 yakisoba", "entrega", "quero uma coca tb", "Rua B 2", "pix"],
    expectedOutcome: { multipleItems: true },
    riskTags:        ["interrupt", "mid_flow_add"],
  },
  // CANCEL_ORDER
  {
    title:           "Cancelar pedido inteiro",
    persona:         "CHANGING_MIND",
    goal:            "CANCEL_ORDER",
    messageSequence: ["quero 1 yakisoba", "cancela"],
    expectedOutcome: { stage: "IDLE", orderCancelled: true },
    riskTags:        ["cancel_order"],
  },
  // CHOOSE_PICKUP
  {
    title:           "Pedido com retirada",
    persona:         "POLITE",
    goal:            "CHOOSE_PICKUP",
    messageSequence: ["quero 1 yakisoba por favor", "retirada", "pix"],
    expectedOutcome: { deliveryType: "PICKUP" },
    riskTags:        ["pickup"],
  },
  // TEST_GREETING
  {
    title:           "Saudação inicial",
    persona:         "POLITE",
    goal:            "TEST_GREETING",
    messageSequence: ["Olá", "boa tarde"],
    expectedOutcome: { botReplied: true, hasMenu: true },
    riskTags:        ["greeting", "old_agent"],
  },
  // ASK_ATTENDANT
  {
    title:           "Cliente pede atendente",
    persona:         "HUMAN_ASKER",
    goal:            "ASK_ATTENDANT",
    messageSequence: ["quero falar com atendente"],
    expectedOutcome: { handoff: true },
    riskTags:        ["handoff"],
  },
  // PRICE_ASKER — price lookup then order
  {
    title:           "Cliente pergunta preço antes de pedir",
    persona:         "PRICE_ASKER",
    goal:            "ASK_MENU_THEN_ORDER",
    messageSequence: ["quanto custa o yakisoba", "quero 1 yakisoba", "entrega", "Rua C 3", "pix"],
    expectedOutcome: {
      priceAnswered:   true,
      priceListShown:  true,
      realPricesUsed:  true,
      orderCompleted:  true,
      botShouldNotSayNotFound: true,
    },
    riskTags:        ["price_query", "menu_lookup"],
  },
  // PRICE_ASKER — price query for ambiguous item
  {
    title:           "Cliente pergunta preço de item ambíguo",
    persona:         "PRICE_ASKER",
    goal:            "ASK_MENU_THEN_ORDER",
    messageSequence: ["qual o preço da coca", "quero 1", "entrega", "Rua H 8", "pix"],
    expectedOutcome: {
      priceAnswered:   true,
      priceListShown:  true,
      orderCompleted:  true,
    },
    riskTags:        ["price_query", "ambiguity"],
  },
  // UNAVAILABLE_ITEM
  {
    title:           "Pedir item inexistente no cardápio",
    persona:         "UNAVAILABLE_ITEM",
    goal:            "ORDER_AMBIGUOUS",
    messageSequence: ["quero uma coca lata"],
    expectedOutcome: { unavailableVariant: true, suggestionOffered: true },
    riskTags:        ["format_mismatch", "unavailable"],
  },
  // CHANGE_QUANTITY
  {
    title:           "Mudar quantidade após adicionar",
    persona:         "CHANGING_MIND",
    goal:            "CHANGE_QUANTITY",
    messageSequence: ["quero 2 yakisoba", "na verdade só 1", "entrega", "Rua D 4", "pix"],
    expectedOutcome: { quantityChanged: true },
    riskTags:        ["quantity_change"],
  },
  // TYPO_HEAVY
  {
    title:           "Cliente com erros de digitação",
    persona:         "TYPO_HEAVY",
    goal:            "COMPLETE_ORDER",
    messageSequence: ["qero um yakisba", "entrega", "Rua E 5", "pix"],
    expectedOutcome: { itemMatched: true },
    riskTags:        ["typo", "fuzzy_match"],
  },
  // IMPATIENT
  {
    title:           "Cliente impaciente",
    persona:         "IMPATIENT",
    goal:            "COMPLETE_ORDER",
    messageSequence: ["rápido, quero 1 yakisoba", "entrega já", "Rua F 6", "pix"],
    expectedOutcome: { orderCompleted: true },
    riskTags:        ["impatient"],
  },
  // DELIVERY_ASKER
  {
    title:           "Cliente pergunta frete antes de pedir",
    persona:         "DELIVERY_ASKER",
    goal:            "COMPLETE_ORDER",
    messageSequence: ["quanto é o frete?", "quero 1 yakisoba", "entrega", "Rua G 7", "pix"],
    expectedOutcome: { deliveryQuoted: true },
    riskTags:        ["delivery_query"],
  },
  // ABANDONING
  {
    title:           "Cliente abandona após item adicionado",
    persona:         "ABANDONING",
    goal:            "CANCEL_ORDER",
    messageSequence: ["quero 1 yakisoba", "deixa, não vou mais"],
    expectedOutcome: { abandoned: true },
    riskTags:        ["abandonment"],
  },
];

// ── Public API ─────────────────────────────────────────────────────────────────

export function getAvailableTemplates(): ScenarioTemplate[] {
  return SCENARIO_TEMPLATES;
}

export function generateScenario(persona: CustomerPersona, goal: ScenarioGoal): GeneratedScenario | null {
  const template = SCENARIO_TEMPLATES.find((t) => t.persona === persona && t.goal === goal)
    ?? SCENARIO_TEMPLATES.find((t) => t.goal === goal)
    ?? null;
  if (!template) return null;

  return {
    title:           template.title,
    customerPersona: template.persona,
    goal:            template.goal,
    messageSequence: template.messageSequence,
    expectedOutcome: template.expectedOutcome,
    riskTags:        template.riskTags,
  };
}

export function generateBatch(count: number = 10): GeneratedScenario[] {
  const templates = SCENARIO_TEMPLATES.slice(0, count);
  return templates.map((t) => ({
    title:           t.title,
    customerPersona: t.persona,
    goal:            t.goal,
    messageSequence: t.messageSequence,
    expectedOutcome: t.expectedOutcome,
    riskTags:        t.riskTags,
  }));
}

export function getPersonaStyle(persona: CustomerPersona): string[] {
  return PERSONA_STYLES[persona] ?? [];
}
