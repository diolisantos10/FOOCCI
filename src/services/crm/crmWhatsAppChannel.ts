/**
 * crmWhatsAppChannel — a única pergunta que o CRM faz sobre o canal de saída.
 *
 * HISTÓRIA, para ninguém reintroduzir o que saiu: até 04/08/2026 cada caminho de
 * envio do CRM fazia a própria pergunta, e a pergunta era sobre a Evolution
 * (`EvolutionConfigService.getSnapshot` + `EvolutionClient.getInstanceStatus`,
 * "state=open"). A Evolution era uma muleta usada enquanto a homologação da Meta
 * não saía; a homologação saiu e ela foi eliminada. A pergunta equivalente hoje é
 * uma só: **o canal oficial deste restaurante está conectado?**
 *
 * Duas regras moram aqui, e é por isso que este arquivo existe em vez de um
 * `catch(() => false)` repetido em quatro lugares:
 *
 *  1. **Falha fechada.** Se a consulta não puder ser respondida (banco fora,
 *     token ilegível, exceção qualquer), a resposta é `false`. Ausência de
 *     informação não é informação — e aqui o custo de errar para o lado
 *     permissivo é disparo em massa por um canal que talvez nem exista.
 *  2. **Silêncio é proibido.** A falha vai para o log com o restaurante concreto,
 *     porque alerta sem o caso não é investigado por ninguém.
 */

import { WhatsAppMessagingService } from "@/services/whatsapp/WhatsAppMessagingService";

/**
 * `true` somente quando o WhatsApp oficial está configurado E conectado.
 * Nunca lança: qualquer erro vira `false` (fecha o portão) + log com o caso.
 */
export async function isWhatsAppChannelConnected(restaurantId: string): Promise<boolean> {
  try {
    const status = await WhatsAppMessagingService.getConnectionStatus(restaurantId);
    return status?.connected === true;
  } catch (err) {
    console.error("[crmWhatsAppChannel] estado do canal indisponível — tratando como DESCONECTADO", {
      restaurantId,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/**
 * Falha de envio com o código do provedor preservado.
 *
 * Existe porque o `SendResult` do canal não é uma exceção, e os laços de envio
 * precisam que o `catch` continue vendo um código de máquina (`META_190`,
 * `INVALID_PHONE`, `HTTP_500`…). Sem ele o código virava texto livre e a
 * classificação — que decide retentativa e limpeza de número — perdia o pé.
 */
export class SendFailure extends Error {
  constructor(message: string, readonly errorCode: string) {
    super(message);
    this.name = "SendFailure";
  }
}

/** Motivo padrão, em código de máquina, quando o canal não está disponível. */
export const NO_WHATSAPP_CONFIG = "NO_WHATSAPP_CONFIG" as const;

/** Texto para o lojista — o mesmo em toda tela, para não haver dois vocabulários. */
export const NO_WHATSAPP_CONFIG_DETAIL = "WhatsApp (Meta) não conectado";
