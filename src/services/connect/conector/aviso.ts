/**
 * ⚠️ O CLIENTE NUNCA FICA NO ESCURO — a exigência do CEO, em texto.
 *
 * ─── O QUE ESTE AVISO É, E O QUE ELE SE PROÍBE ──────────────────────────────
 *
 * O Marcos esperou quatro dias sem saber se alguém tinha lido. O silêncio depois
 * de uma pergunta é a pior resposta possível — pior que um "não".
 *
 * Três coisas que este texto **não** faz, cada uma por um motivo já pago:
 *
 *   1. ⛔ **Não promete prazo.** "Volto ainda hoje" é um SLA que não existe em
 *      lugar nenhum do sistema, e a mensagem de um agente é o pior lugar do
 *      mundo para uma promessa que ninguém confere.
 *   2. ⛔ **Não conta como a empresa decide por dentro.** Nada de "mandei para o
 *      gerente de produto", nada de nome de cargo, nada de protocolo. Isso é
 *      comunicação interna, e o cliente externo não a acessa — nem de relance,
 *      nem como cortesia. Ver `barreira.ts`.
 *   3. ⛔ **Não tenta uma última venda.** Quem pediu uma condição que a empresa
 *      não decidiu não quer um contorno; quer saber que alguém vai responder.
 *
 * ─── ⚠️ E POR QUE ELE É COMUM, E NÃO DE CADA PRODUTO ────────────────────────
 *
 * Porque as três proibições acima valem igual nos quatro produtos, e um texto
 * por produto viraria quatro textos que divergem — um deles prometendo prazo.
 * A voz do produto entra na assinatura da mensagem, que é ligação local; o que
 * o aviso **diz** é comum.
 */

/** O aviso enquanto a decisão está pendente. */
export const AVISO_DE_DECISAO_PENDENTE =
  "Já registrei o que você precisa e levei pra quem decide isso aqui. " +
  "Assim que tiver a resposta, eu te falo por aqui mesmo — você não precisa cobrar.";

/**
 * ⭐ Avisa UMA vez por consulta aberta, e não a cada turno.
 *
 * Uma pendência que reavisa a cada mensagem do cliente vira a mesma frase três
 * vezes seguidas na tela dele, e a terceira soa como robô travado. Quem tem
 * pendência aberta e já foi avisado não é avisado de novo — mas uma consulta
 * NOVA avisa de novo, porque é outra pergunta esperando.
 */
export function deveAvisar(p: { avisadoEm: Date | null }): boolean {
  return p.avisadoEm === null;
}
