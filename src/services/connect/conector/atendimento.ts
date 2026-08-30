/**
 * ⭐⭐ O CONECTOR, EM UMA FUNÇÃO — os passos 1→3 e a abertura do 4.
 *
 * ─── O QUE ELA FAZ, NA ORDEM ────────────────────────────────────────────────
 *
 *   1. o agente recebeu uma pergunta que ele não pode decidir sozinho
 *   2. ⭐ CONSULTA as políticas e decisões já existentes (`politicas.ts`)
 *   3. ⭐ havendo política válida, RESPONDE AGORA e **não escala**
 *   4. não havendo, escala pelo caminho do produto e ABRE a pendência
 *      ⚠️ e AVISA o cliente de que a decisão está pendente
 *
 * ─── ⚠️ A ORDEM DO 3 E DO 4 É O TRABALHO INTEIRO ────────────────────────────
 *
 * Antes disto, o agente escalava **sempre**. Toda pergunta fora da alçada virava
 * uma consulta ao gerente, mesmo quando a empresa já tinha decidido aquilo. Era
 * o CEO virando pombo-correio da própria decisão, uma vez por cliente.
 *
 * ─── ⚠️ E O CHÃO NÃO SAI DO LUGAR ───────────────────────────────────────────
 *
 * Quando não há política **e** a escalada falha, esta função devolve
 * `escalou: false` com causa nomeada — e o produto segue para a fila humana
 * exatamente como seguia antes. Um canal novo que deixasse o cliente esperando
 * em silêncio seria pior que o defeito que ele conserta.
 *
 * **Nunca lança.** Quem chama está no turno de um cliente.
 */

import { randomUUID } from "crypto";
import { protocolo as montarProtocolo, type AssuntoForaDaAlcada } from "./contrato";
import { consultarPolitica, type CausaDeNaoResponder } from "./politicas";
import { AVISO_DE_DECISAO_PENDENTE, deveAvisar } from "./aviso";
import { VERSAO_DO_CONTRATO } from "./versao";
import type { LigacaoLocal } from "./ligacaoLocal";

export interface PedidoDeAtendimento {
  /** O identificador da conversa dentro do produto. No Foocci, o `leadId`. */
  conversa: string;
  /** O identificador do cliente dentro do produto. Nunca nome ou telefone. */
  referenciaDoCliente: string;
  /** O que trava, já classificado em código pelo produto. */
  assuntos: AssuntoForaDaAlcada[];
  /** A pergunta, em português. */
  pergunta: string;
  agora?: Date;
}

/**
 * ⭐ A ESCALADA É DO PRODUTO — e é a única coisa que este orquestrador delega.
 *
 * No Foocci ela é `consultarGerente` (POST /api/connect/despacho). Em outro
 * produto pode ser outra porta. O que o conector exige de volta é a única coisa
 * que ele precisa saber: **abriu?** e **qual fio?**.
 */
export type Escalar = (ctx: {
  protocolo: string;
  assuntos: AssuntoForaDaAlcada[];
  /** ⚠️ Preenchido quando existia política e ela FOI RECUSADA (revogada, exceção
   *  de outro cliente…). Quem vai decidir precisa saber que houve decisão antes. */
  politicaRecusada: string | null;
}) => Promise<{ aberta: boolean; fio: string | null; detalhe: string }>;

export type ResultadoDoConector =
  | {
      /** ⭐ Passo 3: havia política válida. O cliente já foi respondido. */
      respondeu: true;
      escalou: false;
      texto: string;
      politicaId: string;
      /** O id da mensagem no produto, quando a ligação local souber dizer. */
      mensagemId: string | null;
      entregue: boolean;
      paraORastro: string;
    }
  | {
      /** Passo 4: não havia; a consulta subiu e o cliente foi avisado. */
      respondeu: false;
      escalou: true;
      protocolo: string;
      fio: string | null;
      avisouOCliente: boolean;
      causaDaPolitica: CausaDeNaoResponder;
      paraORastro: string;
    }
  | {
      /** Nem política, nem escalada. A fila humana é o chão, e ela continua lá. */
      respondeu: false;
      escalou: false;
      causaDaPolitica: CausaDeNaoResponder;
      detalhe: string;
      paraORastro: string;
    };

export interface DependenciasDoConector {
  buscar?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  /** Injetável para o teste. O sufixo do protocolo. */
  novoSufixo?: () => string;
}

export async function atenderComOConector(
  ligacao: LigacaoLocal,
  pedido: PedidoDeAtendimento,
  escalar: Escalar,
  deps: DependenciasDoConector = {},
): Promise<ResultadoDoConector> {
  const agora = pedido.agora ?? new Date();
  const sufixo = (deps.novoSufixo ?? randomUUID)();
  const protocolo = montarProtocolo(ligacao.produto, pedido.conversa, sufixo);

  // ── Passo 2: existe política válida para isto? ───────────────────────────
  const politica = await consultarPolitica(
    {
      versaoDoContrato: VERSAO_DO_CONTRATO,
      produto: ligacao.produto,
      agente: ligacao.agente,
      protocolo,
      referenciaDoCliente: pedido.referenciaDoCliente,
      assuntos: pedido.assuntos,
      pergunta: pedido.pergunta,
    },
    { buscar: deps.buscar, env: deps.env, agora },
  );

  // ── Passo 3: há resposta válida → responde IMEDIATAMENTE ─────────────────
  if (politica.podeResponder) {
    const fala = await ligacao.falarComOCliente(pedido.conversa, politica.texto, { agora });
    if (fala.registrada) {
      return {
        respondeu: true,
        escalou: false,
        texto: politica.texto,
        politicaId: politica.politicaId,
        mensagemId: fala.mensagemId ?? null,
        entregue: fala.entregue,
        paraORastro: politica.paraORastro,
      };
    }
    // ⚠️ A política valia e o produto não conseguiu falar. Isso NÃO vira
    // escalada: o gerente não tem o que decidir — a empresa já decidiu. Volta
    // como falha nomeada, e o produto cai na fila humana com o rastro inteiro.
    return {
      respondeu: false,
      escalou: false,
      causaDaPolitica: "semPolitica",
      detalhe: `havia política válida (${politica.politicaId}) e a resposta não foi registrada na conversa: ${
        fala.causa ?? "sem causa declarada"
      }`,
      paraORastro:
        `⚠️ A empresa JÁ TEM decisão para este assunto (política ${politica.politicaId}) e o agente não ` +
        "conseguiu gravar a resposta na conversa. Não há o que consultar: é só entregar a resposta.",
    };
  }

  // ── Passo 4: não há política → escala, e avisa o cliente ─────────────────
  const escalada = await escalar({
    protocolo,
    assuntos: pedido.assuntos,
    politicaRecusada: politica.houvePoliticaRecusada ? politica.paraORastro : null,
  });

  if (!escalada.aberta) {
    return {
      respondeu: false,
      escalou: false,
      causaDaPolitica: politica.causa,
      detalhe: escalada.detalhe,
      paraORastro: `${politica.paraORastro} ${escalada.detalhe}`,
    };
  }

  // A pendência é gravada ANTES do aviso: se o processo morrer entre as duas
  // coisas, o que sobra é uma consulta aberta sem aviso — recuperável. O
  // contrário seria um cliente avisado de uma consulta que o produto esqueceu.
  const pendencia = await ligacao.armazem.abrir({
    protocolo,
    produto: ligacao.produto,
    conversa: pedido.conversa,
    canal: ligacao.canal,
    agente: ligacao.agente,
    fio: escalada.fio,
    assunto: pedido.assuntos.map((a) => a.assunto).join(", ") || "não classificado",
    criadaEm: agora,
    avisadoEm: null,
  });

  // ── ⚠️ O cliente nunca fica no escuro ────────────────────────────────────
  let avisou = false;
  if (deveAvisar(pendencia)) {
    const fala = await ligacao.falarComOCliente(pedido.conversa, AVISO_DE_DECISAO_PENDENTE, { agora });
    avisou = fala.registrada;
    // ⚠️ Só marca se o aviso FOI gravado. Marcar antes deixaria uma pendência
    // dizendo "o cliente sabe" com o cliente sem ter recebido nada — e o
    // próximo turno não tentaria de novo.
    if (avisou) await ligacao.armazem.marcarAvisado(protocolo, agora);
  }

  return {
    respondeu: false,
    escalou: true,
    protocolo,
    fio: escalada.fio,
    avisouOCliente: avisou,
    causaDaPolitica: politica.causa,
    paraORastro: `${politica.paraORastro} ${escalada.detalhe} Protocolo ${protocolo}.`,
  };
}
