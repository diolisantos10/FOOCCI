/**
 * Identidade do cliente no fechamento do pedido.
 *
 * Nasceu de um bug ao vivo na padaria de demonstração (05/08, 23:49): a frase
 * "Pra fechar o pedido preciso do seu WhatsApp" apareceu em balões repetidos —
 * o cliente já tinha informado o WhatsApp e sido cumprimentado pelo nome.
 *
 * A causa não era mensagem duplicada, era LAÇO: quem se identifica durante a
 * navegação não passava a "ter telefone" para o resto do app.
 *
 *   1. `POST /api/qr/[slug]/identify` **nunca** devolve `customerId` — decisão
 *      de segurança documentada na própria rota (o id deixou de ser credencial
 *      portadora de PII). Então o `customerId` do cliente segue indefinido.
 *   2. O telefone vinha de um `useState` que lê o `sessionStorage` **uma única
 *      vez, no mount**. A tela de identificação grava lá DEPOIS do mount — logo,
 *      naquela carga da página, o app continuava achando que ninguém se
 *      identificou.
 *
 * Com as duas coisas falsas ao mesmo tempo, o portão de fechamento voltava a
 * pedir o WhatsApp para sempre, e o pedido que conseguia passar (loja com
 * identificação obrigatória) saía com `customerPhone: undefined`.
 *
 * A regra mora aqui, fora do componente, porque ela precisa ser testável no
 * runner do repositório — e porque o telefone informado agora é um dado de
 * primeira classe, não um efeito colateral do sessionStorage.
 */

export interface IdentidadeCliente {
  /** Telefone resolvido no servidor (link verificado do WhatsApp). */
  knownPhone?: string | null;
  /** Telefone lido do sessionStorage **no mount** — visita anterior desta aba. */
  storedPhone?: string | null;
  /** Telefone informado **nesta carga da página**, na tela de identificação. */
  sessionPhone?: string | null;
  /** Id do cliente, quando o servidor o entrega (hoje: só via link do WhatsApp). */
  customerId?: string | null;
}

/**
 * O telefone que vale para tudo que precisa de contato: fechar o pedido, falar
 * com o Garçom, guardar o carrinho abandonado.
 *
 * A ordem é de confiança decrescente: o servidor (token do WhatsApp) vence a
 * sessão anterior, que vence o que foi digitado agora. Mas **o digitado agora
 * conta** — é exatamente o elo que faltava.
 */
export function telefoneEfetivoDoCliente(id: IdentidadeCliente): string | null {
  return id.knownPhone ?? id.storedPhone ?? id.sessionPhone ?? null;
}

/**
 * O portão do fechamento: preciso pedir o WhatsApp antes de deixar fechar?
 *
 * Só existe onde a identificação de entrada pode ser pulada (vitrine de
 * demonstração). Em loja de cliente a tela de entrada já é obrigatória, então o
 * portão nunca dispara — e não pode disparar, sob pena de pedir duas vezes.
 *
 * Responde `false` assim que houver **qualquer** prova de contato: telefone de
 * qualquer origem ou um customerId. Pedir de novo o que a pessoa acabou de
 * informar é o laço que este arquivo existe para impedir.
 */
export function precisaPedirWhatsAppParaFechar(
  args: { identificacaoOpcional: boolean } & IdentidadeCliente,
): boolean {
  if (!args.identificacaoOpcional) return false;
  if (args.customerId) return false;
  return telefoneEfetivoDoCliente(args) === null;
}
