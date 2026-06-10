/**
 * waiterReasoningFallback — deterministic, intent-correct reasoning used when the
 * LLM is unavailable (no OPENAI_API_KEY or a failure). It is NOT a generic
 * template: it answers the ACTUAL intent using only safe, configured context and
 * never invents a payment method/product/price. Guardrails already fixed the
 * intent; this turns it into a correct ideal response + training rule.
 */

import type { AgentReasoningContext, AgentReasoningIntent } from "./AgentReasoningTypes";

export interface FallbackReasoningCore {
  primaryIntent: AgentReasoningIntent;
  customerNeed: string;
  directAnswerStrategy: string;
  idealResponse: string;
  trainingRule: string;
  expectedImpact: string;
  safetyNotes: string[];
  shouldEscalate: boolean;
  escalationReason?: string;
}

function paymentLine(ctx: AgentReasoningContext): string {
  if (ctx.paymentMethods.length > 0) return ctx.paymentMethods.join(", ");
  return "";
}

export function fallbackReasoning(intent: AgentReasoningIntent, ctx: AgentReasoningContext): FallbackReasoningCore {
  switch (intent) {
    case "PAYMENT_BENEFIT_QUESTION": {
      // Meal voucher (Alelo/VR/Sodexo). The system has no meal-voucher config →
      // never claim acceptance; confirm safely and keep the order moving.
      const known = paymentLine(ctx);
      const ideal = ctx.knowsMealVoucher
        ? "Sim, aceitamos essa forma. Você pode escolhê-la no fechamento do pedido. Quer seguir com delivery ou retirada?"
        : `Boa pergunta! Preciso confirmar essa forma de pagamento para não te passar informação errada.${known ? ` Hoje aceitamos ${known}.` : ""} Enquanto isso, posso te ajudar a montar o pedido?`;
      return {
        primaryIntent: intent,
        customerNeed: "Saber se uma forma de pagamento / benefício refeição específico é aceita.",
        directAnswerStrategy: "Responder sobre pagamento usando só o que está cadastrado; se não souber, confirmar sem inventar.",
        idealResponse: ideal,
        trainingRule:
          "Quando o cliente perguntar sobre uma forma de pagamento específica (ex.: Alelo, VR, Sodexo), o Waiter deve usar apenas as formas cadastradas no Foocci. Se não houver essa informação cadastrada, deve dizer que precisa confirmar — sem inventar — e manter o cliente no fluxo do pedido.",
        expectedImpact: "Reduz abandono por dúvida de pagamento e evita passar informação falsa.",
        safetyNotes: ["Não inventar método de pagamento não cadastrado."],
        shouldEscalate: false,
      };
    }
    case "PAYMENT_QUESTION": {
      const known = paymentLine(ctx);
      const ideal = known
        ? `Aceitamos ${known}. Você escolhe a forma no fechamento do pedido. Quer seguir com delivery ou retirada?`
        : "Posso confirmar as formas de pagamento disponíveis no fechamento do pedido. Quer que eu te ajude a montar o pedido enquanto isso?";
      return {
        primaryIntent: intent,
        customerNeed: "Saber como pode pagar.",
        directAnswerStrategy: "Responder com as formas cadastradas e conduzir ao fechamento.",
        idealResponse: ideal,
        trainingRule:
          "Quando o cliente perguntar sobre pagamento, o Waiter deve responder com as formas cadastradas no Foocci, sem inventar taxas/descontos/métodos, e conduzir o pedido para o fechamento.",
        expectedImpact: "Reduz dúvida antes do checkout e evita perda por insegurança no pagamento.",
        safetyNotes: ["Usar apenas formas de pagamento cadastradas."],
        shouldEscalate: false,
      };
    }
    case "DELIVERY_QUESTION":
    case "PICKUP_QUESTION":
      return {
        primaryIntent: intent,
        customerNeed: "Saber sobre entrega/retirada, prazo ou taxa.",
        directAnswerStrategy: "Responder com as regras configuradas e direcionar o cálculo ao fechamento.",
        idealResponse:
          "A entrega e a taxa aparecem no fechamento, de acordo com o seu endereço. Quer que eu siga montando o seu pedido?",
        trainingRule:
          "Sobre entrega/retirada, o Waiter deve usar apenas as regras/taxas configuradas e direcionar o cálculo para o fechamento, sem inventar prazos.",
        expectedImpact: "Evita expectativa errada e perda por insegurança na entrega.",
        safetyNotes: ["Não inventar prazo ou taxa de entrega."],
        shouldEscalate: false,
      };
    case "DIETARY_RESTRICTION":
      return {
        primaryIntent: intent,
        customerNeed: "Encontrar opções seguras para a sua restrição alimentar.",
        directAnswerStrategy: "Filtrar e recomendar apenas itens reais compatíveis; nunca afirmar segurança sem base.",
        idealResponse:
          "Entendi a sua restrição. Vou te mostrar apenas as opções do cardápio que combinam com ela — me confirma se alguma te atende?",
        trainingRule:
          "Com restrição alimentar, o Waiter deve recomendar somente itens reais compatíveis e nunca afirmar que um prato é seguro sem base no cardápio.",
        expectedImpact: "Protege o cliente, aumenta a confiança e evita problema de segurança alimentar.",
        safetyNotes: ["Nunca afirmar que um item é seguro sem base no cardápio."],
        shouldEscalate: false,
      };
    case "ORDER_BY_TEXT":
      return {
        primaryIntent: intent,
        customerNeed: "Fazer o pedido escrevendo livremente.",
        directAnswerStrategy: "Interpretar a intenção, mostrar opções reais e pedir confirmação antes de finalizar.",
        idealResponse:
          "Perfeito, entendi o seu pedido. Vou te mostrar as opções correspondentes para confirmar e fechar certinho.",
        trainingRule:
          "Quando o cliente pedir por texto livre, o Waiter deve interpretar a intenção, mostrar opções reais do cardápio e pedir confirmação antes de finalizar.",
        expectedImpact: "Reduz fricção e aumenta pedidos concluídos.",
        safetyNotes: ["Confirmar itens reais antes de finalizar."],
        shouldEscalate: false,
      };
    case "HUNGRY_CUSTOMER":
      return {
        primaryIntent: intent,
        customerNeed: "Comer algo que satisfaça bastante.",
        directAnswerStrategy: "Recomendar opções mais completas com próximo passo claro.",
        idealResponse:
          "Se você está com bastante fome, eu te indicaria uma opção mais completa. Posso te mostrar os combinados que mais sustentam?",
        trainingRule:
          "Quando o cliente demonstrar fome alta, o Waiter deve recomendar itens mais completos com um próximo passo claro.",
        expectedImpact: "Aumenta conversão e ticket médio.",
        safetyNotes: [],
        shouldEscalate: false,
      };
    case "GROUP_ORDER":
      return {
        primaryIntent: intent,
        customerNeed: "Pedir para várias pessoas.",
        directAnswerStrategy: "Sugerir itens compartilháveis/combos reais e dimensionar a quantidade.",
        idealResponse: "Pra grupo, posso te sugerir opções que rendem bem e agradam todo mundo. Quantas pessoas são?",
        trainingRule: "Em pedido de grupo, o Waiter deve sugerir itens compartilháveis reais e ajudar a dimensionar.",
        expectedImpact: "Aumenta o ticket médio em pedidos de grupo.",
        safetyNotes: [],
        shouldEscalate: false,
      };
    case "COMPLAINT":
      return {
        primaryIntent: intent,
        customerNeed: "Ser ouvido e ter o problema encaminhado.",
        directAnswerStrategy: "Acolher com empatia e encaminhar ao restaurante, sem prometer por conta própria.",
        idealResponse:
          "Sinto muito por isso! Vou registrar e encaminhar para a equipe do restaurante resolver o mais rápido possível.",
        trainingRule:
          "Diante de reclamação, o Waiter deve demonstrar empatia, não prometer reembolso/brinde por conta própria e encaminhar ao restaurante.",
        expectedImpact: "Preserva o relacionamento e reduz avaliações negativas.",
        safetyNotes: ["Não prometer reembolso/brinde sem autorização."],
        shouldEscalate: true,
        escalationReason: "Reclamação pode exigir ação humana do restaurante.",
      };
    case "PRAISE":
      return {
        primaryIntent: intent,
        customerNeed: "Demonstrar satisfação.",
        directAnswerStrategy: "Agradecer e convidar para seguir/repetir o pedido.",
        idealResponse: "Que bom que você gostou! 💛 Quer que eu te ajude a montar o próximo pedido?",
        trainingRule: "Diante de elogio, o Waiter deve agradecer com simpatia e convidar para seguir/repetir o pedido.",
        expectedImpact: "Fortalece o relacionamento e abre nova venda.",
        safetyNotes: [],
        shouldEscalate: false,
      };
    case "PRICE_QUESTION":
      return {
        primaryIntent: intent,
        customerNeed: "Saber o preço de um item.",
        directAnswerStrategy: "Informar o preço real do cardápio; nunca inventar valor.",
        idealResponse: "Posso te mostrar o item com o preço certinho do cardápio. Qual deles você quer ver?",
        trainingRule: "Sobre preço, o Waiter deve usar apenas os valores oficiais do cardápio, nunca inventar.",
        expectedImpact: "Evita informação errada e dá segurança para fechar.",
        safetyNotes: ["Usar apenas preços oficiais do cardápio."],
        shouldEscalate: false,
      };
    case "INDECISIVE_CUSTOMER":
    default:
      return {
        primaryIntent: intent === "INDECISIVE_CUSTOMER" ? intent : "INDECISIVE_CUSTOMER",
        customerNeed: "Receber ajuda para decidir o pedido.",
        directAnswerStrategy: "Fazer no máximo uma pergunta e recomendar opções reais com próximo passo.",
        idealResponse: "Sem problema! Pra facilitar, posso te recomendar os mais pedidos. Prefere algo mais leve ou mais reforçado?",
        trainingRule:
          "Com cliente indeciso, o Waiter deve fazer no máximo uma pergunta de qualificação e recomendar opções reais com um próximo passo claro.",
        expectedImpact: "Reduz abandono por indecisão e aumenta a conclusão do pedido.",
        safetyNotes: [],
        shouldEscalate: false,
      };
  }
}
