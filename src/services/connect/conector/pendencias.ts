/**
 * ⭐ O LIVRO DE PENDÊNCIAS — o que faz a resposta achar a conversa certa.
 *
 * ─── O BURACO QUE ISTO TAPA ─────────────────────────────────────────────────
 *
 * O PR #178 mandava a pergunta ao gerente e escrevia `respostaDoGerente: null`.
 * Não era modéstia: **não havia onde a resposta pousar.** Quando ela chegasse, o
 * produto não teria como saber de qual cliente ela era.
 *
 * Este arquivo é esse "onde". Uma linha por consulta aberta, ligando
 * `protocolo` ↔ `conversa`, com estado. É o mínimo que o produto precisa
 * guardar — e é deliberadamente o mínimo: **nenhuma política, nenhuma decisão,
 * nenhum conteúdo de deliberação interna mora aqui.** Isso é do núcleo.
 *
 * ─── O QUE ESTA CAMADA É, E ONDE ELA VIRA LOCAL ─────────────────────────────
 *
 * `ArmazemDePendencias` é **contrato comum**: os quatro produtos usam esta
 * interface. A implementação é **ligação local** — no Foocci é uma tabela
 * Prisma; num produto que não tenha banco, pode ser outra coisa, desde que
 * responda estas quatro perguntas e sobreviva a um restart.
 *
 * ⚠️ Sobreviver a restart não é detalhe: é o corte "o produto perde conexão com
 * o Connect e depois volta". Uma pendência em memória some no deploy, e o
 * cliente que estava esperando vira órfão sem ninguém perceber.
 */

import { lerProtocolo, type DecisaoDoGerente } from "./contrato";

/**
 * ⭐ OS QUATRO ESTADOS — e `AGUARDANDO_ENVIO` é o que separa receber de entregar.
 *
 *   PENDENTE         → a consulta subiu; ninguém decidiu ainda.
 *   AGUARDANDO_ENVIO → ⭐ a decisão CHEGOU e está gravada na conversa, e o canal
 *                      **não** a entregou ao cliente. Fila humana pronta para
 *                      envio. NÃO é "entregue", e não vira verde sozinho.
 *   RESPONDIDA       → o cliente recebeu.
 *   ENCERRADA        → acabou sem resposta ao cliente (recusada/encerrada).
 *
 * ─── ⚠️ POR QUE `AGUARDANDO_ENVIO` EXISTE (decisões C4 e C5) ───────────────
 *
 * *"Não existe 'entregue' que signifique 'alguém vai entregar depois'."*
 *
 * No Foocci a entrega tem chave própria (`FOOCCI_SDR_SEND_ENABLED`): a mensagem
 * é gravada e fica PENDENTE até o dono ligar o envio. Sem este estado, o
 * conector teria que escolher entre duas mentiras — marcar RESPONDIDA (o
 * cliente não recebeu nada) ou deixar PENDENTE (e o núcleo reentregaria, e a
 * mesma decisão entraria três vezes na conversa). É a terceira coisa, e é a
 * verdadeira: **chegou, está gravado, falta sair.**
 */
export const ESTADOS_DA_PENDENCIA = [
  "PENDENTE",
  "AGUARDANDO_ENVIO",
  "RESPONDIDA",
  "ENCERRADA",
] as const;
export type EstadoDaPendencia = (typeof ESTADOS_DA_PENDENCIA)[number];

/** Ainda é assunto do cliente: ou ninguém decidiu, ou ninguém entregou. */
export const ESTADOS_NAO_RESOLVIDOS: readonly EstadoDaPendencia[] = ["PENDENTE", "AGUARDANDO_ENVIO"];

export interface Pendencia {
  protocolo: string;
  produto: string;
  /** O identificador da conversa DENTRO do produto. No Foocci, o `leadId`. */
  conversa: string;
  /** Qual canal/tela do produto. Ligação local — `sala-de-vendas`, `suporte`… */
  canal: string;
  /** Qual agente do produto abriu a consulta. Ligação local. */
  agente: string;
  /** O fio da conversa interna com o gerente, quando a consulta saiu. */
  fio: string | null;
  assunto: string;
  estado: EstadoDaPendencia;
  /** Quando o cliente foi avisado de que a decisão está pendente. */
  avisadoEm: Date | null;
  respondidaEm: Date | null;
  criadaEm: Date;
}

export interface PendenciaNova {
  protocolo: string;
  produto: string;
  conversa: string;
  canal: string;
  agente: string;
  fio: string | null;
  assunto: string;
  criadaEm: Date;
  avisadoEm: Date | null;
}

/**
 * ⭐ O CONTRATO DO ARMAZÉM. Quatro perguntas, e nenhuma delas sobre política.
 */
export interface ArmazemDePendencias {
  abrir(nova: PendenciaNova): Promise<Pendencia>;
  porProtocolo(protocolo: string): Promise<Pendencia | null>;
  /**
   * ⚠️ Registra que o cliente já foi avisado. Sem isto o aviso de pendência
   * sairia a cada turno e o cliente leria a mesma frase três vezes seguidas.
   */
  marcarAvisado(protocolo: string, em: Date): Promise<void>;
  /**
   * ⭐ A decisão chegou. Idempotente: registrar duas vezes é o mesmo que uma.
   *
   * ⚠️ `entregueAoCliente` decide o estado, e é a decisão C4 em código:
   * entregue → RESPONDIDA/ENCERRADA; **não** entregue → `AGUARDANDO_ENVIO`, que
   * é fila humana pronta para envio e **não** conta como respondido.
   */
  registrarResposta(
    protocolo: string,
    dados: { decisao: DecisaoDoGerente; entregueAoCliente: boolean; em: Date },
  ): Promise<void>;
  /** As que continuam sendo assunto do cliente — pendentes ou por entregar. */
  abertasDaConversa(conversa: string): Promise<Pendencia[]>;
}

// ═══════════════════════════════════════════════════════════════════════════
// O CASAMENTO DO RETORNO — puro, e é aqui que dois clientes não se misturam.
// ═══════════════════════════════════════════════════════════════════════════

export const CAUSAS_DE_NAO_CASAR = [
  /** O protocolo não tem a forma de um protocolo. */
  "protocoloIlegivel",
  /** Não existe pendência com este protocolo neste produto. */
  "protocoloDesconhecido",
  /** ⭐ O protocolo é de outro produto. */
  "produtoErrado",
  /** ⭐ O protocolo diz uma conversa e a pendência gravada diz outra. */
  "conversaDivergente",
  /** Já foi respondida. Retorno repetido é ignorado, não é erro. */
  "jaRespondida",
] as const;
export type CausaDeNaoCasar = (typeof CAUSAS_DE_NAO_CASAR)[number];

export type Casamento =
  | { ok: true; pendencia: Pendencia }
  | { ok: false; causa: CausaDeNaoCasar; motivo: string };

/**
 * ⭐ O RETORNO ENCONTRA A CONVERSA — ou é recusado, nomeadamente.
 *
 * ─── ⚠️ POR QUE A CONFERÊNCIA É DUPLA ──────────────────────────────────────
 *
 * O protocolo **carrega dentro dele** a conversa (`produto:conversa:sufixo`), e
 * a pendência gravada **também** diz a conversa. Conferir os dois é redundante
 * enquanto ninguém erra — e deixa de ser no dia em que o núcleo remonta um
 * protocolo a partir de pedaços, ou em que alguém de fora manda um protocolo
 * bem-formado com a conversa de outro cliente. Nesse dia, o que decide qual
 * cliente lê aquela resposta é esta comparação.
 *
 * **A que vale é a gravada.** O texto que chegou de fora nunca escolhe a
 * conversa; ele só é aceito se disser a mesma coisa que o produto já sabia.
 */
export function casarRetorno(
  produtoEsperado: string,
  protocoloRecebido: unknown,
  pendencia: Pendencia | null,
): Casamento {
  const lido = lerProtocolo(protocoloRecebido);
  if (!lido.ok) return { ok: false, causa: "protocoloIlegivel", motivo: lido.motivo };

  if (lido.produto !== produtoEsperado) {
    return {
      ok: false,
      causa: "produtoErrado",
      motivo: `o protocolo é do produto "${lido.produto}" e esta porta é do "${produtoEsperado}"`,
    };
  }

  if (!pendencia) {
    return {
      ok: false,
      causa: "protocoloDesconhecido",
      motivo:
        "não existe consulta aberta com este protocolo neste produto. Nada é entregue a cliente nenhum: " +
        "escolher uma conversa 'parecida' para não perder a resposta é como uma resposta chega ao cliente " +
        "errado.",
    };
  }

  if (pendencia.conversa !== lido.conversa) {
    return {
      ok: false,
      causa: "conversaDivergente",
      motivo:
        "o protocolo aponta uma conversa e a pendência gravada aponta outra. A gravada é a que vale, e na " +
        "dúvida não se entrega nada — duas conversas abertas ao mesmo tempo não podem trocar de resposta.",
    };
  }

  if (pendencia.estado !== "PENDENTE") {
    return {
      ok: false,
      causa: "jaRespondida",
      motivo:
        `esta consulta já está ${pendencia.estado}` +
        (pendencia.estado === "AGUARDANDO_ENVIO"
          ? " — a decisão já está gravada na conversa e esperando o envio; reentregá-la poria a mesma " +
            "resposta duas vezes na frente do cliente"
          : "") +
        `. O retorno repetido é ignorado de propósito: o núcleo ` +
        "pode reentregar o que ele não teve certeza de ter entregue, e o cliente não pode receber a mesma " +
        "resposta duas vezes por causa disso.",
    };
  }

  return { ok: true, pendencia };
}
