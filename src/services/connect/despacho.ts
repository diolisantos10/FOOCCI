/**
 * O DESPACHO DO DIOLI CONNECT NO FOOCCI — quem executou é que carimba.
 *
 * ─── A MEDIÇÃO QUE ORIGINOU ESTE ARQUIVO ───────────────────────────────────
 *
 * Medido em 30/08/2026 pelo Diretor Geral, no mecanismo de acionamento da
 * plataforma: **ele devolve "sucesso" e não entrega nada.** Um despachante que
 * responde 200 por ter conseguido chamar alguém é um despachante que mente sobre
 * o mundo — e quem lê a resposta não tem como saber.
 *
 *   "O despachante disse ok é proibido como prova. Quem executou é que carimba."
 *
 * Então esta função NÃO deriva o resultado do que ela mesma fez. Ela roda o
 * agente de verdade (`runWaiterSimulation`), manda gravar, e depois **relê do
 * banco** a linha da rodada. O identificador que volta na resposta é o id
 * daquela linha, lido de volta — não um id que esta função inventou, e o
 * relatório é montado do que voltou, não do que estava na memória.
 *
 * ─── OS TRÊS ESTADOS, E O TERCEIRO NUNCA PASSA POR VERDE ───────────────────
 *
 *   executado        → há linha de rodada no banco, relida, com fim e cenários.
 *   recusado         → uma regra disse não, com o motivo, ANTES de executar.
 *   nao_verificavel  → tudo o mais: o agente estourou, a gravação falhou, a
 *                      releitura veio vazia ou veio de outro fio. NUNCA vira
 *                      sucesso, e o motivo vem junto.
 *
 * A ordem importa: `executado` só é devolvido DEPOIS da releitura. Se a
 * releitura falhar ou vier pela metade, o estado cai para `nao_verificavel`
 * mesmo com o agente tendo rodado — fail-closed até o fim.
 *
 * ─── E A CAIXA POSTAL RECEBE `entregue`, NUNCA `acionado` ──────────────────
 *
 * Ver `caixa.ts`. A porta grava que a mensagem chegou e está endereçada; quem
 * carimba `acionado` é quem lê a prova, do lado de lá. É a mesma regra vista de
 * outro ângulo: o despachante não assina o próprio recibo.
 */

import { assertSimulationSafeMode } from "@/services/simulation/SimulationSafeMode";
import { runWaiterSimulation } from "@/services/simulation/waiter/runWaiterSimulation";
import type { RunSimulationOptions } from "@/services/simulation/AgentSimulationService";
import type { SimulationRunResult } from "@/services/simulation/types";
import {
  linhaPertenceAoFio,
  registroDaLinha,
  sementeDoTurno,
  type ArmazemDoConnect,
  type LinhaDeRodadaLida,
  type RegistroDaCaixa,
} from "./armazem";
import { PRODUTO_ID } from "./cadastro";
import { ESTADO_QUE_ESTA_PORTA_GRAVA, caixaSemRegistro, carimboDeEntrega, type CarimboDaCaixa } from "./caixa";
import type { PedidoConferido } from "./contrato";
import { SELO_DE_RASCUNHO, artefatoDaRodada, type SeloDeRascunho } from "./rascunho";

/** Como se lê a prova nesta casa: a tabela do laboratório, relida. */
export interface ProvaDaExecucao {
  tabela: "agent_simulation_runs";
  relido_do_banco: true;
  rodadaId: string;
  agente: string;
  status: string;
  semente: string | null;
  inicio: string;
  fim: string;
  duracaoMs: number;
  cenarios: number;
  /** Prova, do próprio laboratório, de que nada do mundo real foi tocado. */
  runtime_tocado: false;
  /** Prova de que nenhum cenário precisou de provedor de IA. */
  usou_ia: false;
}

export type ResultadoDoDespacho =
  | ({
      estado: "executado";
      produto: typeof PRODUTO_ID;
      acao: string;
      de: string;
      para: string;
      agente: string;
      fio: string;
      turno: number;
      caixa: CarimboDaCaixa;
      rodadaId: string;
      prova: ProvaDaExecucao;
      artefato: string;
    } & SeloDeRascunho)
  | {
      estado: "recusado";
      produto: typeof PRODUTO_ID;
      acao: string;
      fio: string | null;
      turno: number;
      caixa: CarimboDaCaixa;
      motivo: string;
    }
  | {
      estado: "nao_verificavel";
      produto: typeof PRODUTO_ID;
      acao: string;
      fio: string | null;
      turno: number;
      caixa: CarimboDaCaixa;
      rodadaId: null;
      motivo: string;
    };

export interface DependenciasDoDespacho {
  armazem: ArmazemDoConnect;
  agora(): Date;
  /** Abre um fio novo. Injetável para o teste ser determinístico. */
  novoFio(): string;
  /**
   * ⭐ Injetável SÓ para provar que o acionamento cortado vira `nao_verificavel`.
   * O padrão é o agente de verdade, que roda sem chave de IA.
   */
  executar?: (opcoes: RunSimulationOptions) => Promise<SimulationRunResult>;
  /** A trava de sandbox. Injetável para provar que ela barra, não para afrouxá-la. */
  assegurarSandbox?: () => void;
}

/** O prefixo do fio. Legível na consulta e no rastro. */
export function fioNovo(uuid: string): string {
  return `connect:${PRODUTO_ID}:${uuid}`;
}

function naoVerificavel(
  pedido: PedidoConferido,
  fio: string | null,
  turno: number,
  motivo: string,
  caixa: CarimboDaCaixa = caixaSemRegistro(),
): ResultadoDoDespacho {
  return {
    estado: "nao_verificavel",
    produto: PRODUTO_ID,
    acao: pedido.acao,
    fio,
    turno,
    caixa,
    rodadaId: null,
    motivo,
  };
}

function recusado(pedido: PedidoConferido, fio: string | null, turno: number, motivo: string): ResultadoDoDespacho {
  return {
    estado: "recusado",
    produto: PRODUTO_ID,
    acao: pedido.acao,
    fio,
    turno,
    caixa: caixaSemRegistro(),
    motivo,
  };
}

function detalhe(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function despachar(
  pedido: PedidoConferido,
  deps: DependenciasDoDespacho,
): Promise<ResultadoDoDespacho> {
  // ── ⭐ Trava 0: o sandbox, ANTES de qualquer coisa acontecer. ─────────────
  //
  // `assertSimulationSafeMode` LANÇA se algum efeito colateral estiver ligado —
  // envio, pagamento, criação de pedido. Ela vem primeiro porque a única hora em
  // que essa checagem vale alguma coisa é antes de o agente rodar.
  try {
    (deps.assegurarSandbox ?? assertSimulationSafeMode)();
  } catch (e) {
    return recusado(
      pedido,
      pedido.fio,
      0,
      `o sandbox do laboratório não está fechado, e a porta não roda fora dele: ${detalhe(e)}. ` +
        "Zero envio real é trava, não preferência: sem sandbox, nada executa.",
    );
  }

  // ── O fio: `iniciar` sempre abre um novo; os outros continuam o que veio. ─
  const fio = pedido.acao === "iniciar" || !pedido.fio ? fioNovo(deps.novoFio()) : pedido.fio;

  // ── O histórico. Para `responder` ele é PORTÃO; para os outros, contexto. ─
  let antecedentes: LinhaDeRodadaLida[] = [];
  try {
    antecedentes = (await deps.armazem.antecedentes(fio)).filter((l) => linhaPertenceAoFio(l, fio));
  } catch (e) {
    if (pedido.acao === "responder") {
      // Não dá para afirmar que a conversa existe, e também não dá para afirmar
      // que não existe. Ausência de informação não é informação: `nao_verificavel`.
      return naoVerificavel(pedido, fio, 0, `a leitura do fio ${fio} falhou, e sem ela não se responde a coisa nenhuma: ${detalhe(e)}`);
    }
    // O fio é contexto: perdê-lo não derruba o despacho, e o efeito não some em
    // silêncio — o artefato sai com `turnos_anteriores: 0`.
    antecedentes = [];
  }

  if (pedido.acao === "responder" && antecedentes.length === 0) {
    return recusado(
      pedido,
      fio,
      0,
      `o fio ${fio} não tem nenhum turno gravado neste banco: não existe conversa para responder. Histórico ` +
        'que não pode ser lido não pode ser continuado — para abrir conversa nova, a ação é "iniciar".',
    );
  }

  const turno = antecedentes.length + 1;
  const semente = sementeDoTurno(fio, turno);

  // ── O acionamento de verdade. Sem chave de IA e sem rede. ────────────────
  let resultado: SimulationRunResult;
  try {
    resultado = await (deps.executar ?? runWaiterSimulation)({
      seed: semente,
      scenarioCount: pedido.cenarios,
      mode: "DIAGNOSTIC",
      now: deps.agora(),
      // Nenhum restaurante: a rodada é sintética e não pertence a ninguém real.
      restaurantId: null,
      // Nenhum exemplo de conversa real entra em ensaio de homologação.
      examples: [],
    });
  } catch (e) {
    return naoVerificavel(pedido, fio, turno, `o agente lançou antes de concluir: ${detalhe(e)}`);
  }

  // ── O que voltou do agente ainda NÃO é prova, mas já pode ser desqualificado. ─
  if (resultado.runtimeTouched !== false) {
    return naoVerificavel(
      pedido,
      fio,
      turno,
      "a rodada voltou sem a declaração de que o runtime não foi tocado — sem essa garantia a execução não " +
        "pode ser certificada como sandbox, e não vira verde por insistência",
    );
  }
  const comIA = resultado.scenarios.filter((c) => c.output.usedLLM !== false).length;
  if (comIA > 0) {
    return naoVerificavel(
      pedido,
      fio,
      turno,
      `${comIA} cenário(s) desta rodada relataram uso de provedor de IA, e esta porta promete acionamento sem ` +
        "credencial. O que não cumpre a promessa não é certificado: nem como sucesso, nem como custo zero",
    );
  }
  if (resultado.scenariosTotal === 0 || resultado.status === "FAILED") {
    return naoVerificavel(
      pedido,
      fio,
      turno,
      `o agente não completou nenhum cenário (status ${resultado.status}) — acionamento que não produziu ` +
        "trabalho nenhum não é acionamento",
    );
  }

  // ── A gravação. E ela é do registro da caixa junto com a rodada. ─────────
  const registro: RegistroDaCaixa = {
    fio,
    turno,
    acao: pedido.acao,
    de: pedido.de,
    para: pedido.para,
    // Literal, e vindo da única fonte que existe para esta palavra.
    estado: ESTADO_QUE_ESTA_PORTA_GRAVA,
    mensagem: pedido.mensagem,
    assunto: pedido.assunto,
    em: deps.agora().toISOString(),
  };

  let runId: string;
  try {
    const gravado = await deps.armazem.gravarRodada(resultado, registro);
    runId = gravado?.runId ?? "";
  } catch (e) {
    return naoVerificavel(pedido, fio, turno, `a gravação da rodada falhou: ${detalhe(e)}`);
  }
  if (!runId) {
    return naoVerificavel(
      pedido,
      fio,
      turno,
      "o agente rodou mas nenhuma rodada foi gravada — sem carimbo de quem executou, não há o que verificar",
    );
  }

  // ── ⭐ A RELEITURA. Daqui para baixo, só o que voltou do banco vale. ──────
  let linha: LinhaDeRodadaLida | null = null;
  try {
    linha = await deps.armazem.relerRodada(runId);
  } catch (e) {
    return naoVerificavel(pedido, fio, turno, `a releitura da rodada ${runId} falhou: ${detalhe(e)}`);
  }

  if (!linha) {
    return naoVerificavel(pedido, fio, turno, `a rodada ${runId} não voltou do banco — "eu gravei" não é prova de que gravou`);
  }
  if (!linha.finishedAt || linha.scenariosTotal === 0) {
    return naoVerificavel(
      pedido,
      fio,
      turno,
      `a rodada ${runId} está no banco sem fim ou sem cenário nenhum — execução pela metade não é execução`,
    );
  }
  if (!linhaPertenceAoFio(linha, fio)) {
    const lido = registroDaLinha(linha);
    return naoVerificavel(
      pedido,
      fio,
      turno,
      `a rodada ${runId} voltou do banco sem o registro de caixa deste fio (li ${JSON.stringify(lido?.fio ?? null)} ` +
        `e esperava ${JSON.stringify(fio)}) — prova de outra conversa não prova esta`,
    );
  }

  // ── Só agora. E o carimbo da caixa é `entregue` — nunca `acionado`. ──────
  return {
    estado: "executado",
    // O selo vem no primeiro nível: quem lê a resposta não precisa abrir o
    // artefato para saber que isto é rascunho.
    ...SELO_DE_RASCUNHO,
    produto: PRODUTO_ID,
    acao: pedido.acao,
    de: pedido.de,
    para: pedido.para,
    agente: linha.agentSlug,
    fio,
    turno,
    caixa: carimboDeEntrega(),
    rodadaId: linha.id,
    prova: {
      tabela: "agent_simulation_runs",
      relido_do_banco: true,
      rodadaId: linha.id,
      agente: linha.agentSlug,
      status: linha.status,
      semente: linha.seed,
      inicio: linha.startedAt.toISOString(),
      fim: linha.finishedAt.toISOString(),
      duracaoMs: linha.durationMs,
      cenarios: linha.scenariosTotal,
      runtime_tocado: false,
      usou_ia: false,
    },
    artefato: artefatoDaRodada(pedido, fio, turno, linha, antecedentes),
  };
}
