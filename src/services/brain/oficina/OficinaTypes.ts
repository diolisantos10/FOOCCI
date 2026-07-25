/**
 * Oficina — contratos.
 *
 * A Oficina é a célula do Brain que transforma um pedido cru ("faz um post de
 * dia dos pais") numa FICHA: um formulário preenchido, com a verdade do banco
 * anexada, que substitui o prompt em prosa. O ruído mora na ambiguidade — a
 * ficha não tem ambiguidade.
 *
 * O Brain guarda o MÉTODO (montar ficha, variar, julgar). Cada domínio traz o
 * VOCABULÁRIO dele via HouseManual — é isso que mantém o Brain universal.
 */

export type Medium = "texto" | "imagem";

/** O pedido do jeito que chega — do agente ou do lojista, em linguagem solta. */
export interface Pedido {
  /** Quem pediu: "social", "crm", "waiter", … */
  agentId:   string;
  medium:    Medium;
  /** O que se quer, em linguagem natural. */
  intencao:  string;
  /** Qual manual aplicar: "restaurante", "agencia", … */
  dominio:   string;
}

/**
 * Fatos vindos do banco — NUNCA inventados pela IA. É a diferença entre um
 * prompt genérico e um que só a gente consegue escrever.
 */
export type Verdade = Record<string, string | number | string[]>;

/** A Ficha: o que vai pra IA no lugar do texto solto. */
export interface Ficha {
  objetivo:    string;
  publico:     string;
  verdade:     Verdade;
  tom:         string;
  formato:     string;
  /** O que não pode aparecer. Sempre inclui as proibições padrão do domínio. */
  proibicoes:  string[];
  /** A combinação de câmera/ângulo/abordagem sorteada pelo Variador. */
  eixos:       Record<string, string>;
  /** Identidade da combinação — a memória do anti-mesmice. */
  assinatura:  string;
}

/**
 * A nota do crítico. `motivos` não é relatório: cada motivo é escrito como
 * INSTRUÇÃO, pra servir de ordem de reescrita sem tradução.
 */
export interface Nota {
  score:     number;   // 0..10
  /** Falhas que reprovam sozinhas, por mais alta que fosse a nota. */
  graves:    number;
  aprovado:  boolean;
  motivos:   string[];
}
