/**
 * order-revenue — o que conta como VENDA no Foocci. Um lugar só.
 *
 * ── Por que este arquivo existe ──
 *
 * O raio-x do caminho do dinheiro (13/08/2026) achou CINCO cópias da lista de
 * status que definem faturamento, e elas NÃO eram iguais:
 *
 *   • DashboardCockpitService.ts:273  → incluía AWAITING_PAYMENT
 *   • RevenueAttributionService.ts:30 → não incluía
 *   • api/dashboard/route.ts:28       → não incluía
 *   • api/v1/vendas/route.ts:39       → não incluía
 *   • api/v1/financeiro/route.ts:20   → não incluía
 *
 * Cada uma estava defensável sozinha. Juntas, produziam um painel em que o
 * mesmo dia valia dois números diferentes, e em que Pix abandonado — dinheiro
 * que NUNCA entrou — engordava a saúde de vendas do lojista.
 *
 * É o mesmo remédio que `src/lib/billing/pricing.ts` aplicou em 04/08 às quatro
 * tabelas de preço: uma constante exportada, um arquivo dono, e um portão que
 * reprova a segunda cópia (`order-revenue.test.ts`).
 *
 * ── A DECISÃO: AWAITING_PAYMENT NÃO É VENDA ──
 *
 * Decidido em 13/08/2026 (proposto pelo especialista de operação, confirmado
 * pelo Diretor). Três razões, na ordem em que pesam:
 *
 * 1. **Dinheiro que não entrou não é receita.** `AWAITING_PAYMENT` quer dizer
 *    "geramos um Pix e ninguém pagou ainda". A maior parte nunca é paga — é o
 *    equivalente ao carrinho abandonado, só que depois do botão. Contar isso
 *    como faturamento é contar intenção como caixa.
 *
 * 2. **Um número que infla é um número que o lojista aprende a ignorar.** Ele
 *    fecha o caixa no fim do dia, compara com o painel e vê a mais. Da segunda
 *    vez, ele para de olhar o painel. Uma tela de dinheiro que erra para cima
 *    destrói a confiança em todas as outras.
 *
 * 3. **O pedido não vence nunca.** Nada, hoje, tira um pedido de
 *    `AWAITING_PAYMENT` por vencimento (só o `Payment` vira EXPIRED). Então
 *    cada Pix abandonado ficaria somando no histórico PARA SEMPRE, e a média
 *    dos 7 dias — que é a régua de "hoje está fraco?" — subiria sozinha.
 *
 * O pagamento pendente continua **visível e acionável** como o que ele é: um
 * alerta de "N pagamentos pendentes", com o caminho para a tela onde esses
 * pedidos aparecem. Ele não some — ele só para de ser chamado de venda.
 */

import type { OrderStatus } from "@prisma/client";

/**
 * A ÚNICA definição de venda realizada do produto.
 *
 * Vale para o dashboard do lojista, a atribuição por origem, o cockpit e as
 * APIs públicas `/v1/vendas` e `/v1/financeiro` — para que o número externo
 * reconcilie linha a linha com o que o lojista vê por dentro.
 *
 * NÃO inclui: PENDING (não confirmado), AWAITING_PAYMENT (ver acima),
 * CANCELLED (não houve venda).
 */
export const REVENUE_ORDER_STATUSES = [
  "CONFIRMED",
  "PREPARING",
  "READY",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
] as const satisfies readonly OrderStatus[];

/** A mesma lista, no tipo que o Prisma espera no `where`. */
export const REVENUE_STATUS_LIST: OrderStatus[] = [...REVENUE_ORDER_STATUSES];

/** Um status conta como venda realizada? */
export function isRevenueStatus(status: OrderStatus | string): boolean {
  return (REVENUE_ORDER_STATUSES as readonly string[]).includes(status);
}

/**
 * O pedido que gerou cobrança online e ainda não foi pago.
 *
 * Está aqui, ao lado da definição de venda, de propósito: quem for mexer no que
 * conta como faturamento tem que ler, no mesmo arquivo, o que acontece com o
 * que NÃO conta. Ele é excluído da lista operacional de pedidos
 * (`OrderService.list`) porque não é trabalho de cozinha — mas é acessível sob
 * pedido explícito (`?status=AWAITING_PAYMENT`), que é para onde o alerta de
 * "pagamentos pendentes" leva o lojista.
 */
export const AWAITING_PAYMENT_STATUS = "AWAITING_PAYMENT" as const;

/** O destino do alerta de pagamentos pendentes — a tela onde eles APARECEM. */
export const PENDING_PAYMENTS_HREF = "/orders?status=AWAITING_PAYMENT";
