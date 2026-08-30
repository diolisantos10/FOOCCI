/**
 * ⭐⭐ A COSTURA — onde o contrato comum acaba e o produto começa.
 *
 * ─── A PERGUNTA QUE ESTE ARQUIVO RESPONDE ───────────────────────────────────
 *
 * *"Conectar o próximo produto é LIGAR ou REESCREVER?"*
 *
 * É ligar, e esta interface é a medida disso: **tudo o que o Foocci tem de
 * próprio cabe aqui dentro.** Quem for conectar o CityJobs, o Dioli Digital ou
 * o FOOCCI Manager copia a pasta `conector/` inteira sem editar uma linha, e
 * escreve **um** arquivo: a implementação de `LigacaoLocal` do produto dele.
 *
 * ─── O QUE É COMUM (não se toca) ────────────────────────────────────────────
 *
 *   · `contrato.ts`    — os caminhos, os tipos, o protocolo
 *   · `politicas.ts`   — a consulta do passo 2 e os dois cortes de validade
 *   · `barreira.ts`    — cliente externo nunca lê comunicação interna
 *   · `pendencias.ts`  — o casamento do retorno com a conversa certa
 *   · `retorno.ts`     — o passo 8, em código puro
 *   · `aviso.ts`       — o cliente não fica no escuro
 *
 * ─── O QUE É LOCAL (é isto, e só isto) ──────────────────────────────────────
 *
 *   · **qual agente atende** → `agente`
 *   · **qual canal/tela**    → `canal`
 *   · **qual conversa**      → o `conversa` que o produto usa como id
 *   · **como se fala com o cliente** → `falarComOCliente`
 *   · **onde a pendência é gravada** → `armazem`
 *   · **qual fila humana é o chão** → fora daqui, no chamador do produto
 *
 * ⚠️ Repare no que a interface **não** deixa o produto decidir: se a política
 * vale, se a exceção se estende, o que atravessa a barreira, e como o retorno
 * casa com a conversa. Isso é comum de propósito — são as regras que, soltas em
 * quatro produtos, virariam quatro respostas diferentes para a mesma pergunta.
 */

import type { ArmazemDePendencias } from "./pendencias";

/** O resultado de falar com o cliente, do jeito que o conector precisa saber. */
export interface FalaAoCliente {
  /** A fala foi REGISTRADA na conversa. É o que o conector exige. */
  registrada: boolean;
  /** E ela chegou a SAIR? Depende da chave de entrega do produto. */
  entregue: boolean;
  /** O id da mensagem no produto, quando houver. */
  mensagemId?: string;
  /** Nomeado, quando não deu. Sem segredo dentro. */
  causa?: string;
}

/**
 * ⭐ A LIGAÇÃO LOCAL. Um arquivo por produto, e é o único que se escreve.
 */
export interface LigacaoLocal {
  /** `foocci`, `foocci-manager`, `cityjobs`, `dioli-digital`. */
  readonly produto: string;
  /** Qual tela/canal do produto está falando. Entra no rastro da pendência. */
  readonly canal: string;
  /** Qual agente atende neste canal. Entra na pergunta e no rastro. */
  readonly agente: string;

  /** Onde as pendências deste produto são gravadas, de forma que sobreviva a restart. */
  readonly armazem: ArmazemDePendencias;

  /**
   * ⭐ Falar com o cliente na conversa dele.
   *
   * **Nunca lança** — quem chama está num turno de webhook, e uma exceção aqui
   * vira reentrega e resposta duplicada. O que não deu volta em `causa`.
   *
   * ⚠️ O texto que chega aqui **já passou pela barreira**. Esta função não
   * decide o que pode ser dito: ela transporta.
   */
  falarComOCliente(conversa: string, texto: string, ctx: { agora: Date }): Promise<FalaAoCliente>;
}
