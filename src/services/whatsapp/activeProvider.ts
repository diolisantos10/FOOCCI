/**
 * activeProvider — envia WhatsApp pela Meta Cloud API. É o único provedor.
 *
 * HISTÓRIA, para ninguém reintroduzir o que saiu: até 04/08/2026 este módulo
 * escolhia entre Meta e Evolution conforme `Restaurant.whatsappProvider`, com a
 * Evolution como PADRÃO e como reserva em caso de falha de banco. A Evolution
 * era uma muleta do começo, usada enquanto a homologação da Meta não saía. A
 * homologação saiu, o CEO confirmou que NENHUM restaurante depende mais dela, e
 * ela foi eliminada do sistema.
 *
 * A regra agora é absoluta: **toda mensagem sai pelo aplicativo homologado.**
 * Não existe caminho alternativo, nem em erro — um caminho alternativo não
 * homologado é exatamente o risco de banimento que a homologação eliminou. Se a
 * Meta não puder enviar, o certo é falhar e avisar, nunca sair por outro lugar.
 */

import type { WhatsAppProvider, SendResult } from "./providers/types";
import { MetaWhatsAppCloudProvider } from "./providers/MetaWhatsAppCloudProvider";

/**
 * O provedor do restaurante — sempre a Meta.
 * Continua async e recebendo o restaurantId por compatibilidade com as dezenas
 * de chamadas que já a aguardam; não há mais consulta a banco para decidir.
 */
export async function activeWhatsAppProvider(_restaurantId: string): Promise<WhatsAppProvider> {
  return new MetaWhatsAppCloudProvider();
}

/** One-call text send through the active provider. */
export async function sendWhatsAppText(
  restaurantId: string,
  to: string,
  text: string,
): Promise<SendResult> {
  const provider = await activeWhatsAppProvider(restaurantId);
  return provider.sendText({ restaurantId, to, text });
}
