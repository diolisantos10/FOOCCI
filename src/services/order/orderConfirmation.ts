/**
 * orderConfirmation — o que SEMPRE tem que acontecer quando um pedido vira
 * CONFIRMED, num lugar só.
 *
 * Nasceu de um defeito real, achado no raio-x do caminho do dinheiro de
 * 13/08/2026: existiam OITO lugares no repositório que escreviam
 * `status: "CONFIRMED"` num pedido, e QUATRO deles não mandavam a comanda para
 * a impressora nem emitiam a NFC-e:
 *
 *   • /api/orders/[id]/confirm-manual-payment      (socorro do lojista)
 *   • /api/payments/mercadopago/[orderId]/mark-paid (socorro do lojista)
 *   • /api/payments/stone/[orderId]/mark-paid       (socorro do lojista)
 *   • /api/payments/stone/webhook                   (caminho NORMAL da Stone)
 *
 * O resultado era o pior tipo de falha: o cliente pagava, o lojista clicava em
 * "confirmar pagamento", o pedido sumia da fila de pendentes — e a cozinha
 * nunca ficava sabendo. Sem erro, sem log, sem nada. Quem descobria era o
 * cliente, com fome. E o caminho da Stone é o caminho NORMAL de quem não tem
 * Mercado Pago configurado (`finalize` cai na Stone quando não há token do MP).
 *
 * ── Por que um ponto único, e não `maybeEnqueueOrder` colado nas quatro rotas ──
 *
 * Foi exatamente colando o efeito em cada chamador que as quatro nasceram: os
 * blocos estavam duplicados em cinco arquivos, e quem escreveu o sexto copiou
 * a parte que sabia que existia. Um efeito obrigatório espalhado por N
 * chamadores é uma dívida com juros: cada rota nova é uma chance nova de
 * esquecer. Aqui existe UMA função, e existe um portão estrutural
 * (`orderConfirmedEffects.test.ts`) que reprova o build se um arquivo novo
 * escrever CONFIRMED sem passar por ela.
 *
 * ── O que ENTRA aqui e o que NÃO entra ──
 *
 * ENTRA o que é obrigação de TODO pedido confirmado, venha de onde vier:
 *   1. a comanda na fila de impressão (`PrintQueueService`, idempotente pelo
 *      carimbo `printQueuedAt`);
 *   2. a NFC-e (`FiscalEmissionService`, auto-guardada: no-op se o lojista não
 *      ligou emissão).
 *
 * NÃO entra o envio ao Saipos. Ele hoje só dispara em `OrderService.updateStatus`
 * e nunca disparou no `finalize` nem nos webhooks. Trazê-lo para cá mandaria
 * pedido para um sistema externo por um caminho que nunca mandou — mudança de
 * comportamento com terceiro, que não é o conserto pedido. Fica onde está,
 * registrado como lacuna conhecida, não ampliada.
 *
 * ── Nunca lança ──
 *
 * As duas chamadas são disparo-e-segue com `catch` que REGISTRA (guardrail 6: o
 * alerta carrega a própria evidência — restaurantId, orderId e a origem que
 * chamou). Uma falha de impressora jamais pode derrubar a confirmação de um
 * pagamento que já entrou.
 */

import { PrintQueueService } from "@/services/print/PrintQueueService";
import { FiscalEmissionService } from "@/services/fiscal/FiscalEmissionService";

/**
 * De onde veio a confirmação. Vai para o log — quando uma comanda não sair,
 * a primeira pergunta é "por qual porta esse pedido entrou?".
 */
export type OrderConfirmedSource =
  | "finalize"
  | "manual_order"
  | "update_status"
  | "mp_webhook"
  | "sumup_confirm"
  | "stone_webhook";

/**
 * Os efeitos obrigatórios de um pedido que acabou de virar CONFIRMED.
 *
 * Chame SEMPRE que um pedido entrar em CONFIRMED, por qualquer porta. É seguro
 * chamar de novo: a fila de impressão é idempotente pelo carimbo `printQueuedAt`
 * e a emissão fiscal se recusa a reemitir uma nota AUTORIZADA/PROCESSANDO/CANCELADA.
 *
 * Não lança e não devolve promessa que precise ser aguardada para o pedido
 * existir — mas devolva/aguarde quando puder, para que o teste consiga observar.
 */
export async function runOrderConfirmedEffects(
  restaurantId: string,
  orderId: string,
  source: OrderConfirmedSource,
): Promise<void> {
  await Promise.all([
    PrintQueueService.maybeEnqueueOrder(restaurantId, orderId).catch((e) =>
      console.error("[order-confirmed] falha ao enfileirar a comanda", {
        restaurantId, orderId, source,
        err: e instanceof Error ? e.message : String(e),
      }),
    ),
    FiscalEmissionService.maybeEmitForOrder(restaurantId, orderId).catch((e) =>
      console.error("[order-confirmed] falha ao emitir a NFC-e", {
        restaurantId, orderId, source,
        err: e instanceof Error ? e.message : String(e),
      }),
    ),
  ]);
}
