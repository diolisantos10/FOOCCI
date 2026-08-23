/**
 * SdrService — a entrevista com memória, do jeito que ela roda de verdade.
 *
 * Junta as três peças: lê a entrevista guardada, passa o turno pelo
 * Entrevistador, grava de volta e devolve o roteiro do próximo bloco. É o
 * único ponto onde as três se encontram, de propósito: se cada caller
 * montasse esse encadeamento por conta própria, um deles esqueceria de gravar
 * — e uma entrevista que não persiste é uma entrevista que recomeça em branco.
 *
 * A ordem aqui é lei: grava ANTES de responder. Se a gravação falhar, quem
 * chamou recebe o erro em vez de um "anotei" mentiroso.
 */

import {
  avaliarSondagem,
  type AvaliacaoDaSondagem,
  type EstadoDaSondagem,
  type Pendencia,
} from "../oficina/Sondagem";
import { ouvir, roteiroDoTurno, type ResultadoDoTurno } from "./Entrevistador";
import { chaveDaEntrevista, resolverMemoriaDaEntrevista } from "./MemoriaDaEntrevista";
import { registrarTurno } from "./DiarioDoSdr";
import { gerarPlano, renderizarPlano, type Plano } from "./PlanoDeMidia";

export interface PedidoDeTurno {
  agenciaId: string;
  clienteId: string;
  /** O que o cliente respondeu. Vazio no primeiro contato. */
  resposta?: string;
  /** As chaves perguntadas no bloco anterior. Registradas mesmo sem resposta. */
  perguntadasAgora?: string[];
  /** Quantas perguntas devolver para o próximo bloco. Padrão 3. */
  quantas?: number;
  agentId?: string;
}

export interface RespostaDoTurno {
  chave: string;
  /** O estado depois deste turno — já gravado. */
  estado: EstadoDaSondagem;
  entendido: ResultadoDoTurno["entendido"];
  servicosDetectados: string[];
  semResposta: string[];
  /** O que perguntar agora, já redigido. */
  perguntar: Pendencia[];
  /** As chaves correspondentes — devolver no próximo turno. */
  chavesPerguntadas: string[];
  podePropor: boolean;
  cobertura: number;
  veredito: string;
  semIA: boolean;
  /** Por que a IA não respondeu, quando não respondeu. */
  motivoSemIA?: RespostaDoTurnoMotivo;
}

type RespostaDoTurnoMotivo = NonNullable<ResultadoDoTurno["motivoSemIA"]>;

/** Um turno da entrevista, com a memória cuidada. */
export async function conduzirTurno(pedido: PedidoDeTurno): Promise<RespostaDoTurno> {
  const chave   = chaveDaEntrevista(pedido.agenciaId, pedido.clienteId);
  const memoria = await resolverMemoriaDaEntrevista();
  const antes   = (await memoria.ler(chave)) ?? {};

  const turno = await ouvir({
    estado: antes,
    resposta: pedido.resposta ?? "",
    ...(pedido.perguntadasAgora !== undefined ? { perguntadasAgora: pedido.perguntadasAgora } : {}),
    ...(pedido.agentId !== undefined ? { agentId: pedido.agentId } : {}),
  });

  // Grava antes de responder. Um "anotei" que não persistiu é o pior resultado.
  await memoria.gravar(chave, turno.estado);

  const avaliacao = avaliarSondagem(turno.estado);
  const roteiro   = roteiroDoTurno(turno.estado, pedido.quantas ?? 3);

  /* O diário é anotado DEPOIS da gravação e nunca antes: um turno anotado que
   * não persistiu contaria uma entrevista que não existe. E o `registrarTurno`
   * não lança — observar não pode derrubar o observado. */
  await registrarTurno({
    chave,
    iaRespondeu: !turno.semIA,
    motivoSemIA: turno.motivoSemIA,
    entendido: turno.entendido.map((e) => ({ chave: e.chave, origem: e.origem })),
    perguntasNoAr: (pedido.perguntadasAgora ?? []).length,
    seguemSemResposta: turno.semResposta.length,
    travou: turno.travou,
    cobertura: avaliacao.cobertura,
    podePropor: avaliacao.podePropor,
  });

  return {
    chave,
    estado: turno.estado,
    entendido: turno.entendido,
    servicosDetectados: turno.servicosDetectados,
    semResposta: turno.semResposta,
    perguntar: roteiro.perguntas,
    chavesPerguntadas: roteiro.chaves,
    podePropor: avaliacao.podePropor,
    cobertura: avaliacao.cobertura,
    veredito: avaliacao.veredito,
    semIA: turno.semIA,
    ...(turno.motivoSemIA !== undefined ? { motivoSemIA: turno.motivoSemIA } : {}),
  };
}

export interface EntrevistaAberta {
  chave: string;
  existe: boolean;
  estado: EstadoDaSondagem;
  avaliacao: AvaliacaoDaSondagem;
  perguntar: Pendencia[];
  chavesPerguntadas: string[];
}

/** Onde a entrevista parou, sem alterar nada. */
export async function abrirEntrevista(
  agenciaId: string,
  clienteId: string,
  quantas = 3,
): Promise<EntrevistaAberta> {
  const chave   = chaveDaEntrevista(agenciaId, clienteId);
  const memoria = await resolverMemoriaDaEntrevista();
  const guardado = await memoria.ler(chave);
  const estado  = guardado ?? {};
  const roteiro = roteiroDoTurno(estado, quantas);
  return {
    chave,
    existe: guardado !== null,
    estado,
    avaliacao: avaliarSondagem(estado),
    perguntar: roteiro.perguntas,
    chavesPerguntadas: roteiro.chaves,
  };
}

export interface PedidoDePlanoDoCliente {
  agenciaId: string;
  clienteId: string;
  semanas?: number;
  inicioEm?: string;
}

/**
 * O plano do cliente, a partir da entrevista guardada.
 *
 * Nunca recebe o estado por fora: o plano tem que sair do que foi realmente
 * perguntado e gravado. Aceitar um estado avulso aqui seria uma porta lateral
 * em volta da trava — e a trava é a coisa toda.
 */
export async function planoDoCliente(pedido: PedidoDePlanoDoCliente): Promise<{ plano: Plano; texto: string }> {
  const memoria = await resolverMemoriaDaEntrevista();
  const estado  = (await memoria.ler(chaveDaEntrevista(pedido.agenciaId, pedido.clienteId))) ?? {};
  const plano = gerarPlano({
    estado,
    ...(pedido.semanas  !== undefined ? { semanas: pedido.semanas }   : {}),
    ...(pedido.inicioEm !== undefined ? { inicioEm: pedido.inicioEm } : {}),
  });
  return { plano, texto: renderizarPlano(plano) };
}
