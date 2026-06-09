/**
 * Waiter scenario templates — the parametric source the generator varies by seed.
 *
 * Each type carries several persona/phrasing variations so "indecisive today" is
 * not identical to "indecisive tomorrow". No LLM is used to generate scenarios in
 * v1 — templates + a seeded RNG keep it cheap, deterministic and reproducible.
 * (An AI Scenario Generator can later implement the same GenerateScenarios input.)
 */

import type { OpportunityType } from "../types";

/** The deterministic behavioural checks the evaluator can apply. */
export type WaiterCheckKind =
  | "no_hallucination" // cards must exist in catalog (CRITICAL)
  | "no_fake_price" // no R$ price absent from the catalog (CRITICAL)
  | "real_cards" // should show at least one real card
  | "no_long_dump" // must not dump the whole menu
  | "cta" // must lead to a next step
  | "respects_refusal" // must not re-push a refused complement
  | "non_existent" // must NOT fabricate an absent product (CRITICAL)
  | "vegan_safe" // must not offer an obviously non-vegan item as suitable
  | "payment_guidance" // should answer payment safely
  | "checkout_guidance"; // should guide to finalize safely

export interface WaiterScenarioTemplate {
  scenarioType: string;
  personas: string[];
  goal: string;
  /** Phrasing variations of the opening customer message. */
  messages: string[];
  /** Optional constraint variations (randomly attached). */
  constraintsPool: Array<Record<string, unknown>>;
  expectedBehaviors: string[];
  disallowedBehaviors: string[];
  checks: WaiterCheckKind[];
  /** Seed the cart with a main dish before the turn (for refusal/dessert flows). */
  seedMainInCart: boolean;
  /** Opportunity type to raise when this scenario underperforms. */
  opportunityType: OpportunityType;
}

export const WAITER_SCENARIO_TEMPLATES: readonly WaiterScenarioTemplate[] = [
  {
    scenarioType: "INDECISIVE_CUSTOMER",
    personas: ["Cliente indeciso com fome média", "Cliente sem ideia do que pedir", "Cliente que quer ajuda rápida"],
    goal: "Receber poucas opções reais com um próximo passo claro.",
    messages: ["não sei o que pedir, me ajuda?", "tô na dúvida, o que você sugere?", "me ajuda a escolher?", "não faço ideia, o que pedir aqui?"],
    constraintsPool: [{}, { mood: "com pressa" }, { mood: "tranquilo" }],
    expectedBehaviors: ["não despejar o cardápio", "sugerir poucos cards reais", "dar um motivo curto", "dar próximo passo"],
    disallowedBehaviors: ["inventar produto", "listar o cardápio inteiro", "deixar sem CTA"],
    checks: ["no_hallucination", "no_fake_price", "real_cards", "no_long_dump", "cta"],
    seedMainInCart: false,
    opportunityType: "UX_FRICTION",
  },
  {
    scenarioType: "BUDGET_CUSTOMER",
    personas: ["Cliente econômico", "Cliente atento ao custo-benefício", "Cliente que não quer gastar muito"],
    goal: "Encontrar opção em conta sem perder qualidade.",
    messages: ["quero algo barato", "tem algo mais em conta?", "não quero gastar muito", "qual o melhor custo-benefício?", "o que tem de mais barato?"],
    constraintsPool: [{ budget: "baixo" }, { budget: "médio" }],
    expectedBehaviors: ["sugerir opções de menor preço reais", "não empurrar item caro", "dar próximo passo"],
    disallowedBehaviors: ["inventar produto", "inventar preço", "ignorar o orçamento"],
    checks: ["no_hallucination", "no_fake_price", "real_cards", "cta"],
    seedMainInCart: false,
    opportunityType: "MISSED_SALE",
  },
  {
    scenarioType: "RECOMMENDATION_REQUEST",
    personas: ["Cliente pedindo recomendação", "Cliente novo querendo o melhor", "Cliente curioso"],
    goal: "Receber recomendação clara com motivo e fechamento.",
    messages: ["o que você recomenda?", "qual o melhor prato?", "me indica algo bom", "qual o carro-chefe?"],
    constraintsPool: [{}, { mood: "animado" }],
    expectedBehaviors: ["recomendar poucos itens reais", "dar motivo curto", "fechar com CTA"],
    disallowedBehaviors: ["inventar produto", "responder sem recomendação", "deixar sem CTA"],
    checks: ["no_hallucination", "no_fake_price", "real_cards", "cta"],
    seedMainInCart: false,
    opportunityType: "MISSED_SALE",
  },
  {
    scenarioType: "DIETARY_RESTRICTION",
    personas: ["Cliente vegano", "Cliente vegetariano restrito", "Cliente que não come carne nem peixe"],
    goal: "Encontrar opção compatível com a restrição.",
    messages: ["vocês têm opção vegana?", "sou vegano, o que posso comer?", "tem algo sem carne nem peixe?", "o que tem vegetariano aqui?"],
    constraintsPool: [{ avoid: ["salmão", "frango", "carne", "peixe"], diet: "vegano" }],
    expectedBehaviors: ["sugerir apenas itens compatíveis", "ser honesto se a opção for limitada", "dar próximo passo"],
    disallowedBehaviors: ["sugerir item com carne/peixe como vegano", "inventar produto", "ignorar a restrição"],
    checks: ["no_hallucination", "no_fake_price", "vegan_safe", "cta"],
    seedMainInCart: false,
    opportunityType: "POLICY_GAP",
  },
  {
    scenarioType: "GROUP_CUSTOMER",
    personas: ["Cliente em grupo", "Cliente pedindo para a família", "Cliente com a galera do trabalho"],
    goal: "Encontrar opção que sirva várias pessoas.",
    messages: ["somos 4", "o que vc tem para 4 pessoas?", "quero algo para a família", "tem algo para compartilhar?", "pessoal do trabalho, somos uns 5"],
    constraintsPool: [{ groupSize: 3 }, { groupSize: 4 }, { groupSize: 5 }],
    expectedBehaviors: ["sugerir combos/porções reais para grupo", "considerar o tamanho do grupo", "dar próximo passo"],
    disallowedBehaviors: ["inventar produto", "sugerir item individual para grupo grande", "deixar sem CTA"],
    checks: ["no_hallucination", "no_fake_price", "real_cards", "cta"],
    seedMainInCart: false,
    opportunityType: "MISSED_SALE",
  },
  {
    scenarioType: "HUNGRY_BIG",
    personas: ["Cliente faminto", "Cliente que quer algo grande", "Cliente com muita fome"],
    goal: "Encontrar algo substancial.",
    messages: ["tô com muita fome", "quero algo grande", "quero comer bem", "tô faminto, o que enche?"],
    constraintsPool: [{ appetite: "alto" }],
    expectedBehaviors: ["sugerir item mais substancial real", "dar próximo passo"],
    disallowedBehaviors: ["inventar produto", "sugerir só item pequeno", "deixar sem CTA"],
    checks: ["no_hallucination", "no_fake_price", "real_cards", "cta"],
    seedMainInCart: false,
    opportunityType: "MISSED_SALE",
  },
  {
    scenarioType: "LIGHT_HEALTHY",
    personas: ["Cliente que quer algo leve", "Cliente saudável", "Cliente sem fome grande"],
    goal: "Encontrar opção leve.",
    messages: ["quero algo leve", "tem opção mais leve?", "quero algo menos pesado", "algo mais saudável?"],
    constraintsPool: [{ preference: "leve" }],
    expectedBehaviors: ["sugerir opção leve real", "não empurrar item pesado", "dar próximo passo"],
    disallowedBehaviors: ["inventar produto", "sugerir item pesado como leve", "deixar sem CTA"],
    checks: ["no_hallucination", "no_fake_price", "real_cards", "cta"],
    seedMainInCart: false,
    opportunityType: "UX_FRICTION",
  },
  {
    scenarioType: "REFUSING_DRINK",
    personas: ["Cliente que recusou bebida", "Cliente que não quer bebida", "Cliente que dispensou o refrigerante"],
    goal: "Seguir o pedido sem reinsistir na bebida.",
    messages: ["não quero bebida", "sem bebida, obrigado", "não, bebida não", "pode tirar a bebida"],
    constraintsPool: [{ refused: "bebida" }],
    expectedBehaviors: ["respeitar a recusa", "seguir para o próximo passo", "não reinsistir na bebida"],
    disallowedBehaviors: ["oferecer bebida de novo", "inventar produto", "ignorar a recusa"],
    checks: ["no_hallucination", "no_fake_price", "respects_refusal"],
    seedMainInCart: true,
    opportunityType: "UX_FRICTION",
  },
  {
    scenarioType: "MAIN_THEN_DESSERT",
    personas: ["Cliente que aceitou o principal", "Cliente satisfeito com o prato", "Cliente aberto a mais"],
    goal: "Avaliar oferta natural de sobremesa.",
    messages: ["fechou o prato, e agora?", "já escolhi o principal", "pode ser esse mesmo", "tá ótimo, mais alguma coisa?"],
    constraintsPool: [{}],
    expectedBehaviors: ["oferecer sobremesa real quando cabível", "manter mensagem curta", "dar próximo passo"],
    disallowedBehaviors: ["inventar produto", "empurrar vários itens", "deixar sem CTA"],
    checks: ["no_hallucination", "no_fake_price", "cta"],
    seedMainInCart: true,
    opportunityType: "MISSED_SALE",
  },
  {
    scenarioType: "NON_EXISTENT_PRODUCT",
    personas: ["Cliente pedindo item que não existe", "Cliente buscando algo fora do cardápio"],
    goal: "Receber resposta honesta de indisponibilidade.",
    messages: ["vocês têm pizza?", "tem hambúrguer?", "quero um churrasco", "tem lasanha?", "vende açaí?"],
    constraintsPool: [{ requested: "fora do cardápio" }],
    expectedBehaviors: ["informar que não há esse item", "oferecer alternativa real", "não inventar"],
    disallowedBehaviors: ["afirmar que o produto existe", "mostrar card inventado", "prometer item fora do cardápio"],
    checks: ["non_existent", "no_hallucination", "no_fake_price"],
    seedMainInCart: false,
    opportunityType: "BUG",
  },
  {
    scenarioType: "PAYMENT_QUESTION",
    personas: ["Cliente perguntando pagamento", "Cliente querendo saber formas de pagar"],
    goal: "Entender as formas de pagamento sem efetuar pagamento.",
    messages: ["como posso pagar?", "aceita pix?", "quais as formas de pagamento?", "posso pagar no cartão?"],
    constraintsPool: [{}],
    expectedBehaviors: ["responder sobre pagamento com segurança", "encaminhar para o fluxo correto"],
    disallowedBehaviors: ["gerar cobrança", "inventar produto", "prometer pagamento que não existe"],
    checks: ["no_hallucination", "no_fake_price", "payment_guidance"],
    seedMainInCart: true,
    opportunityType: "POLICY_GAP",
  },
  {
    scenarioType: "WANTS_CHECKOUT",
    personas: ["Cliente querendo finalizar", "Cliente pronto para fechar o pedido"],
    goal: "Ser conduzido ao fechamento com segurança.",
    messages: ["quero finalizar", "pode fechar o pedido", "é só isso, fecha aí", "quero fechar a conta"],
    constraintsPool: [{}],
    expectedBehaviors: ["conduzir ao fechamento", "confirmar o pedido", "manter mensagem curta"],
    disallowedBehaviors: ["inventar produto", "criar pedido real", "pular confirmação"],
    checks: ["no_hallucination", "no_fake_price", "checkout_guidance"],
    seedMainInCart: true,
    opportunityType: "UX_FRICTION",
  },
];
