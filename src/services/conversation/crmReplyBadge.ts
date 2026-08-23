/**
 * "Resposta CRM" — a regra, dita pelo dono do produto:
 *
 *   "Resposta CRM é só quando ela responde DEPOIS de ser abordada por alguma
 *    mensagem de CRM."
 *
 * Antes de 23/08/2026 a etiqueta não perguntava nada disso. Ela saía quando
 * (a) a conversa carregava um `contextType` de CRM — um campo único, gravado no
 * envio e que NUNCA expira (só some quando o cliente compra) — e (b) existia
 * QUALQUER mensagem de entrada na conversa, em qualquer data, inclusive anterior
 * ao envio do CRM. Resultado: quem foi abordado uma vez em julho carregava
 * "Resposta CRM" para sempre, e mexer no cardápio em agosto contava como
 * resposta de campanha. Na tela do CEO, 10 de 10 conversas com a mesma etiqueta
 * — e etiqueta que aparece em tudo não classifica nada.
 *
 * A regra abaixo é o inverso disso: a etiqueta é uma afirmação sobre o ESTADO DE
 * AGORA da conversa, e ela precisa de duas provas, as duas vindas do servidor:
 *
 *   1. houve um envio de CRM REAL para aquele cliente (log de envio, não
 *      `contextType`);
 *   2. a ÚLTIMA mensagem do cliente veio depois desse envio, e dentro da janela
 *      de resposta.
 *
 * A "última" e não "alguma" é de propósito: quando a conversa segue a vida —
 * cardápio, dúvida, pedido —, ela deixa de ser uma resposta de campanha. Se a
 * pergunta fosse "existe alguma resposta depois do envio?", a Larissia (abordada
 * em julho, respondeu em julho, navegou no cardápio em agosto) continuaria
 * etiquetada como resposta de CRM hoje — que é exatamente a reclamação.
 *
 * Módulo PURO: sem banco, sem efeito colateral.
 */

/**
 * Quantos dias depois do envio uma mensagem do cliente ainda conta como resposta
 * àquele envio.
 *
 * 7 dias não é número novo: é a MESMA janela que o sistema já usa para atribuir
 * uma resposta a uma campanha em `markCrmReplyIfApplicable`
 * (`AgentRoutingService`). Duas réguas diferentes para a mesma pergunta seria
 * outro jeito de a tela mentir.
 */
export const CRM_REPLY_WINDOW_DAYS = 7;

export interface CrmReplyInput {
  /** Último envio de CRM REAL para este cliente (log de envio). null = nunca abordado. */
  lastCrmSentAt: Date | null;
  /** Última mensagem DE ENTRADA (do cliente) nesta conversa. null = ela nunca escreveu. */
  lastInboundAt: Date | null;
  /** Janela de resposta em dias. Default: CRM_REPLY_WINDOW_DAYS. */
  windowDays?: number;
}

/**
 * A conversa está, AGORA, no estado "o cliente respondeu a uma abordagem do CRM"?
 *
 * Devolve a data da resposta quando sim, e `null` quando não — assim quem chama
 * mostra a etiqueta E tem a evidência dela (guardrail 6).
 */
export function crmReplyAt(input: CrmReplyInput): Date | null {
  const { lastCrmSentAt, lastInboundAt } = input;
  // Nunca abordado pelo CRM → nada que o cliente escreva é resposta de CRM.
  if (!lastCrmSentAt) return null;
  // Nunca escreveu → não respondeu.
  if (!lastInboundAt) return null;
  // Escreveu ANTES da abordagem → é conversa dela, não resposta à campanha.
  if (lastInboundAt.getTime() <= lastCrmSentAt.getTime()) return null;
  // Escreveu tarde demais depois da abordagem → a conversa seguiu a vida.
  const windowMs = (input.windowDays ?? CRM_REPLY_WINDOW_DAYS) * 86_400_000;
  if (lastInboundAt.getTime() - lastCrmSentAt.getTime() > windowMs) return null;
  return lastInboundAt;
}

/** Açúcar booleano de `crmReplyAt`. */
export function isCrmReply(input: CrmReplyInput): boolean {
  return crmReplyAt(input) !== null;
}
