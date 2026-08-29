/**
 * activeOrderGuard — "esta pessoa está no meio de um pedido AGORA?"
 *
 * Módulo puro: sem prisma, sem rede. Quem consulta o banco é
 * `ContactSafetyService.assertSendable`; quem filtra o público é
 * `resolveAudience`. Aqui mora só a REGRA, num lugar só, para que as duas
 * pontas não possam divergir.
 *
 * ── Por que isto existe ──────────────────────────────────────────────────────
 * Em 29/08/2026 um cliente confirmou um pedido de R$ 74,00 às 18:51 e, às
 * 18:52 — um minuto depois —, recebeu uma campanha de captação perguntando se
 * ele "já tinha dado uma olhadinha no cardápio" e oferecendo 10% de desconto.
 * O cardápio de onde ele acabara de pedir; o desconto sobre um preço cheio que
 * ele acabara de pagar.
 *
 * Três estragos de uma vez:
 *   1. o restaurante parece não saber quem é o próprio cliente;
 *   2. margem entregue de graça, e o cliente aprende a esperar desconto;
 *   3. pior de todos — o envio de CRM carimba a conversa como CRM_CAMPAIGN, e
 *      `shouldAiRespond` cala a IA nessas conversas (motivo CRM_CONTEXT). O
 *      cliente escreveu "Boa noite fiz um pedido" / "Mas é entrega" e ninguém
 *      respondeu, com o pedido em preparo.
 *
 * A causa não foi uma regra errada: era a AUSÊNCIA de regra. Nenhum caminho do
 * CRM — nem `resolveAudience`, nem `ContactSafetyService` — olhava para os
 * pedidos do cliente. Não havia o que afrouxar; havia o que criar.
 *
 * ── A regra, e o porquê de cada número ───────────────────────────────────────
 * Um cliente está OCUPADO para efeito de CRM quando:
 *
 *   (a) tem pedido EM VOO — confirmado, em preparo, pronto ou saiu para
 *       entrega. Enquanto a comida dele está na mão do restaurante, a casa tem
 *       um assunto em aberto com ele, e esse assunto é o pedido. Qualquer
 *       campanha aqui compete com a própria operação e sequestra o canal de
 *       atendimento; ou
 *
 *   (b) fez um pedido nas últimas SILENCE_HOURS horas. A janela é de 6 horas
 *       porque é a duração de uma refeição do começo ao fim: pedir, esperar,
 *       receber, comer. Dentro dela o cliente ainda está *dentro daquela
 *       refeição* — falar "vem conhecer nosso cardápio" é falar com quem acabou
 *       de comer. Seis horas também deixam o almoço e o jantar do mesmo dia
 *       como eventos separados: quem pediu ao meio-dia volta a ser abordável no
 *       fim da tarde, o que 24 horas apagariam.
 *
 * A trava é INCONDICIONAL de propósito. Não é regra de frequência (`isBirthday`
 * e `enforceFrequency` não a desligam) nem de custo: é sobre a casa não
 * atropelar o próprio cliente no meio de um pedido. Aniversário pode esperar
 * uma hora; pedido em preparo, não.
 *
 * Custo aceito, dito por extenso: a campanha "Pedir avaliação" também espera o
 * pedido sair de voo. Ela dispara dois dias depois do pedido, então na prática
 * a janela nunca a alcança — e, se alcançar, pedir avaliação de um pedido
 * enquanto outro está no forno era ruído de qualquer jeito.
 */

/**
 * Pedido AINDA VIVO na operação: a comida está com o restaurante.
 * Espelha `CONFIRMED_STATUSES` de `crm-countable.ts` menos DELIVERED —
 * entregue já não é voo, é histórico.
 */
export const ACTIVE_ORDER_STATUSES = [
  "CONFIRMED",
  "PREPARING",
  "READY",
  "OUT_FOR_DELIVERY",
] as const;

/**
 * Pedido que REALMENTE aconteceu — os em voo mais o entregue. PENDING e
 * AWAITING_PAYMENT ficam de fora porque ainda não são pedido (carrinho parado
 * não silencia o CRM), e CANCELLED fica de fora porque deixou de ser.
 */
export const REAL_ORDER_STATUSES = [
  ...ACTIVE_ORDER_STATUSES,
  "DELIVERED",
] as const;

/** A janela de silêncio depois de um pedido. Ver o bilhete longo acima. */
export const RECENT_ORDER_SILENCE_HOURS = 6;

/** Início da janela de silêncio, contado para trás a partir de `now`. */
export function recentOrderCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - RECENT_ORDER_SILENCE_HOURS * 60 * 60 * 1000);
}

/**
 * O que o portão precisa saber sobre os pedidos de UM cliente.
 *
 * `known` é obrigatório e não tem default otimista, pelo mesmo motivo de
 * `contactHistoryKnown` no `ContactSafetyService`: guardrail 1 — ausência de
 * informação não é informação. Se ninguém apurou os pedidos deste cliente,
 * `hasActiveOrder: false` seria ignorância disfarçada de "está livre".
 */
export interface CustomerOrderState {
  /** Os dois campos abaixo foram realmente apurados? */
  known: boolean;
  /** Tem pedido em voo (ver ACTIVE_ORDER_STATUSES). */
  hasActiveOrder: boolean;
  /** Quando foi o último pedido REAL, ou null se nunca houve. */
  lastRealOrderAt: Date | null;
}

export type ActiveOrderBlock =
  | "CUSTOMER_HAS_ACTIVE_ORDER"
  | "CUSTOMER_ORDERED_RECENTLY"
  | "UNKNOWN_ORDER_STATE";

export interface ActiveOrderVerdict {
  /** true → o CRM pode falar com esta pessoa agora. */
  free: boolean;
  reason: ActiveOrderBlock | null;
  detail?: string;
}

const FREE: ActiveOrderVerdict = { free: true, reason: null };

/**
 * Decide se o CRM pode abordar este cliente agora. Puro.
 *
 * Um `state.known === false` REPROVA (guardrail 2: sem portão = reprovado).
 * O único caso legítimo de "não sei" é o contato sem cliente cadastrado — um
 * lead do site, por exemplo —, e esse não chega aqui: quem não tem `customerId`
 * não tem pedido, e o chamador passa `known: true` com os campos vazios.
 */
export interface ActiveOrderGuardOptions {
  /**
   * A janela de silêncio pós-pedido vale para este envio?
   *
   * `true` (padrão) para ABORDAGEM: campanha, automação, qualquer mensagem em
   * que a casa decide falar com alguém que não pediu nada agora. É o caso do
   * Wellington, e é para isso que a janela existe.
   *
   * `false` para RESPOSTA a um ato do próprio cliente — recuperação de carrinho
   * é o caso vivo: quem acabou de montar um carrinho novo está pedindo de novo,
   * e calar isso porque ele comprou às 13h seria a proteção mais destrutiva que
   * o problema (guardrail 5). Espelha, e anda junto com, o `enforceFrequency`
   * do `ContactSafetyService` — mesma fronteira, mesma razão.
   *
   * O bloqueio por pedido EM VOO não tem interruptor e não é afetado por isto:
   * enquanto a comida está com o restaurante, nada do CRM fala.
   */
  enforceRecentSilence?: boolean;
}

export function evaluateActiveOrderGuard(
  state: CustomerOrderState,
  now: Date = new Date(),
  opts: ActiveOrderGuardOptions = {},
): ActiveOrderVerdict {
  if (!state.known) {
    return {
      free: false,
      reason: "UNKNOWN_ORDER_STATE",
      detail:
        "Não foi possível apurar se este cliente tem pedido em andamento — " +
        "envio reprovado por precaução",
    };
  }

  if (state.hasActiveOrder) {
    return {
      free: false,
      reason: "CUSTOMER_HAS_ACTIVE_ORDER",
      detail: "Cliente tem pedido em andamento — o CRM não fala por cima da operação",
    };
  }

  if (
    (opts.enforceRecentSilence ?? true) &&
    state.lastRealOrderAt &&
    state.lastRealOrderAt >= recentOrderCutoff(now)
  ) {
    return {
      free: false,
      reason: "CUSTOMER_ORDERED_RECENTLY",
      detail:
        `Cliente pediu nas últimas ${RECENT_ORDER_SILENCE_HOURS}h — ` +
        "campanha de captação não vai para quem acabou de comprar",
    };
  }

  return FREE;
}

/**
 * O `where` de Prisma que exclui, na própria consulta, quem está ocupado.
 *
 * Vai dentro de `customer.findMany({ where: { ...aqui } })` como
 * `orders: { none: ... }`. Precisa ser na CONSULTA, não num filtro depois:
 * `resolveAudience` corta o resultado em `MAX_AUDIENCE`, e filtrar depois
 * encolheria o público em silêncio.
 */
export function busyCustomerOrderFilter(now: Date = new Date()) {
  return {
    OR: [
      // (a) pedido em voo, de qualquer idade
      { status: { in: [...ACTIVE_ORDER_STATUSES] } },
      // (b) pedido real dentro da janela de silêncio
      {
        status: { in: [...REAL_ORDER_STATUSES] },
        createdAt: { gte: recentOrderCutoff(now) },
      },
    ],
  };
}
