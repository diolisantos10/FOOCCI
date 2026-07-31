/**
 * respostaDeQueda — o que o agente diz quando não entendeu, SEM apagar a conversa.
 *
 * O incidente que originou este arquivo:
 *
 *   cliente : Um Poke
 *   agente  : Ótima escolha! Qual tipo de Poke você gostaria?
 *   cliente : Tomate cebola roxa manga pepino
 *   agente  : Olá! Tudo bem? 😊 O que você deseja?      ← aqui
 *
 * A cliente recebeu a tela de entrada CINCO vezes no meio de um pedido. Do
 * ponto de vista dela, o robô teve amnésia cinco vezes.
 *
 * A causa era uma linha só. Todo portão do Cérebro que reprovava delegava ao
 * recepcionista determinístico, e o recepcionista, sem intenção que casasse,
 * caía em `templateReply ?? welcomeMessage`. A saudação é a resposta certa para
 * quem acabou de chegar — e a pior possível para quem está no meio de um pedido.
 *
 * A regra que ficou: **proteção que dispara não pode ser mais destrutiva que o
 * problema que ela evita.** "Não peguei essa, pode repetir?" é queda. A tela de
 * entrada não é queda: é apagar a memória na frente do cliente.
 *
 * Módulo puro de propósito — sem banco, sem rede. Quem sabe se a conversa já
 * começou é o chamador; aqui só mora a decisão e o texto.
 */

/**
 * As formas de dizer "não entendi" sem mandar o cliente para o começo.
 *
 * Variadas porque repetir a MESMA frase de queda duas vezes seguidas produz o
 * mesmo efeito que a saudação repetida: parece robô travado. A escolha é
 * determinística (ver `escolherSemRepetir`) para dar teste e replay.
 */
export const FRASES_DE_QUEDA: readonly string[] = [
  "Desculpa, não peguei essa 😅 Pode escrever de outro jeito?",
  "Hmm, não entendi direito. Pode me explicar com outras palavras?",
  "Foi mal, me perdi aqui 😅 Como posso te ajudar?",
  "Não consegui entender essa. Pode repetir de outro jeito?",
];

/** Fallback duro: se alguém esvaziar a lista, ainda existe uma frase. */
const FRASE_MINIMA = "Desculpa, não entendi. Pode repetir?";

export interface ContextoDaQueda {
  /**
   * O agente JÁ falou nesta conversa (dentro da janela de sessão)?
   * `false` = primeiro contato de verdade → a saudação é a resposta certa.
   * `true`  = conversa em andamento → a saudação seria amnésia.
   */
  conversaEmAndamento: boolean;
  /** A saudação configurada pelo restaurante, usada só no primeiro contato. */
  saudacao: string;
  /** A última coisa que o agente disse — para não repetir a mesma queda. */
  ultimaFalaDoAgente?: string | null;
}

/**
 * Escolhe uma frase de queda diferente da última que o agente disse.
 *
 * Determinístico: percorre a lista na ordem e devolve a primeira que não é a
 * última fala. Sem sorteio — mesma entrada, mesma saída, testável e replayável.
 */
export function escolherSemRepetir(
  frases: readonly string[],
  ultimaFala?: string | null,
): string {
  const disponiveis = frases.filter((f) => f.trim().length > 0);
  if (disponiveis.length === 0) return FRASE_MINIMA;

  const ultima = (ultimaFala ?? "").trim();
  if (!ultima) return disponiveis[0]!;

  const diferente = disponiveis.find((f) => !ultima.includes(f.trim()));
  // Todas já foram ditas na última fala (só acontece se ela contiver o texto
  // inteiro da lista): devolve a primeira em vez de ficar sem resposta.
  return diferente ?? disponiveis[0]!;
}

/**
 * A resposta quando o agente não entendeu.
 *
 * Primeiro contato → a saudação configurada (é o comportamento certo: o cliente
 * acabou de chegar e precisa ver o menu).
 * Conversa em andamento → uma frase de queda que PRESERVA o contexto.
 */
export function respostaQuandoNaoEntendeu(ctx: ContextoDaQueda): string {
  if (!ctx.conversaEmAndamento) return ctx.saudacao;
  return escolherSemRepetir(FRASES_DE_QUEDA, ctx.ultimaFalaDoAgente);
}

/**
 * A saudação foi emitida no meio de uma conversa?
 *
 * Existe para o teste de regressão: é exatamente a condição que produziu o
 * incidente, e nenhuma mudança futura pode fazê-la voltar a ser verdadeira.
 */
export function ehAmnesia(input: { resposta: string; saudacao: string; conversaEmAndamento: boolean }): boolean {
  const saudacao = input.saudacao.trim();
  if (!saudacao) return false;
  return input.conversaEmAndamento && input.resposta.includes(saudacao);
}
