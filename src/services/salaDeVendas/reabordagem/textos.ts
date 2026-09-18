/**
 * OS TEXTOS DA REABORDAGEM — escritos por extenso, e medidos pela rubrica.
 *
 * ── O QUE PRECISA MORRER ────────────────────────────────────────────────────
 *
 * A mensagem antiga é um panfleto de 9 linhas, com emoji e quatro check verdes,
 * terminando em *"Posso te mostrar como funciona?"*. Ela foi para 750 contatos,
 * 147 responderam — quase todos ROBÔ de restaurante — e capturou **zero**
 * decisores. O defeito não é de volume: é de forma.
 *
 * ── A REGRA QUE VALE PARA TODO TEXTO DAQUI ──────────────────────────────────
 *
 * Cada um destes textos é submetido a `supervisora/rubrica.ts` em
 * `textos.rubrica.test.ts`, e só entra se o veredito for **VERDE**. Se a
 * Supervisora reprovar, o texto está errado — não a rubrica.
 *
 * Isso obriga, sozinho: no máximo 6 linhas, no máximo 2 emojis, no máximo 2
 * itens de lista e **UMA pergunta por mensagem**. A última é a que mais dói e a
 * que mais importa: a copy antiga da descoberta fria
 * (`sales/coldContactDiscovery.ts`, `COLD_DISCOVERY_COPY`) tem DUAS perguntas
 * na mesma mensagem ("Tudo bem? … É com você?") e sai AMARELO pela régua. Ela
 * continua onde está, intocada; a campanha usa estas.
 *
 * ── O OBJETIVO É UM SÓ ──────────────────────────────────────────────────────
 *
 * Capturar o telefone/contato do responsável comercial ou administrativo. Não é
 * vender nesta rodada. Nenhum texto daqui fala de preço, de funcionalidade nem
 * de resultado — e é por isso que nenhum deles precisa de verdade de produto.
 *
 * ── ⛔ E A MENTIRA PROIBIDA ─────────────────────────────────────────────────
 *
 * Nenhum texto se passa por cliente. Já está escrito em
 * `foocci-sdr/gatekeeper/objetivo.ts` e continua valendo: furar o porteiro
 * mentindo queima a marca no primeiro que descobrir. A navegação de menu daqui
 * só usa a opção que o próprio menu OFERECEU para falar com gente.
 */

/**
 * A apresentação, na primeira fala com humano.
 *
 * Ordem do CEO: representante do Foocci, veio apresentar um negócio novo. É
 * identificação, não pitch — o que vem depois continua sendo uma pergunta só.
 */
export const APRESENTACAO = "Olá! Falo em nome do Foocci e vim apresentar um negócio novo para o restaurante.";

export const TEXTOS = {
  /**
   * Humano do outro lado, cargo desconhecido, dentro da janela de 24h.
   * Apresentação + a única pergunta que interessa.
   */
  perguntaSeResponsavel:
    `${APRESENTACAO} Preciso falar com quem cuida da parte comercial ou administrativa daqui, e queria saber se é com você.`,

  /**
   * A pessoa disse que não é ela. Não se insiste: pede-se o caminho.
   */
  pedeContatoCerto:
    "Entendi, obrigado pelo retorno. Você consegue me passar o nome e o telefone de quem responde pela parte comercial ou administrativa do restaurante?",

  /**
   * Porteiro humano identificado (recepção, atendimento, caixa, SAC).
   * Mesma coisa que acima, mas já sabendo que esta pessoa não decide.
   */
  pedeContatoAoPorteiro:
    `${APRESENTACAO} Não é assunto de pedido, e por isso não quero tomar seu tempo: você consegue me passar o contato de quem cuida da parte comercial ou administrativa?`,

  /**
   * O decisor foi indicado e o contato novo foi aberto. Esta é a despedida
   * educada no número antigo — ela NÃO pede nada, e por isso não tem pergunta.
   */
  agradeceIndicacao:
    "Perfeito, obrigado pela indicação. Vou falar diretamente com essa pessoa e não incomodo mais por aqui.",
} as const;

export type ChaveDeTexto = keyof typeof TEXTOS;

/**
 * A mensagem que navega o menu do bot.
 *
 * ⚠️ Ela é a opção LITERAL que o próprio menu ofereceu para falar com gente —
 * "3", "atendente", o que estiver escrito lá. A casa não inventa opção, não
 * chuta número e não finge pedido para atravessar o robô: se o menu não
 * oferecer caminho para humano, a conversa vai para revisão e ninguém digita
 * nada. Ver `rota.ts`.
 */
export function textoDaOpcaoDoMenu(opcao: string): string {
  return opcao.trim();
}
