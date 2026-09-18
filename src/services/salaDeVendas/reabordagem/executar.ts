/**
 * ⭐⭐ O MOTOR DA REABORDAGEM — o que EXECUTA, e não só olha.
 *
 * ── O QUE FALTAVA ───────────────────────────────────────────────────────────
 *
 * Existia o raio-X (que lê) e o dry-run da base antiga (que simula). O que não
 * existia era a máquina: pegar a fila, decidir conversa por conversa e mandar.
 * Este arquivo é ela, montada EM CIMA do que já está no ar — não substitui a
 * trava anti-repetição, o freio de ritmo, o portão do lead nem a Supervisora.
 * Ele os usa, pela `PortaDeEnvio`.
 *
 * ── O FREIO, E POR QUE ESTES NÚMEROS ────────────────────────────────────────
 *
 * **40 contatos por lote, com no mínimo 30 minutos entre um lote e o seguinte.**
 *
 *   · 10% dos disparos antigos deram FALHOU (79 de 750). Se a taxa se repetir,
 *     um lote de 40 produz ~4 falhas — número que dá para LER numa saída e
 *     decidir parar. Um lote de 200 produziria ~20, e ninguém para no meio de
 *     200 a tempo.
 *   · Saúde do número WABA: 750 templates frios saindo em rajada é o padrão que
 *     a Meta pune. 40 a cada 30 minutos é no máximo 80/hora — e a base inteira
 *     leva cerca de 19 lotes, ou seja, alguns dias de janela comercial, que é
 *     exatamente o ritmo de um número que não quer ser bloqueado.
 *   · O teto diário da casa (`conferirRitmo`, dentro de `abordarLead`) continua
 *     valendo POR CIMA deste freio. Se ele cortar antes, o lote sai menor — e a
 *     recusa aparece na conta com o motivo.
 *
 * ⚠️ O intervalo NÃO é um `sleep`: é uma recusa lida do banco. Um `sleep` morre
 * com o processo e não impede o segundo disparo; a recusa impede.
 *
 * ── ⛔ SÓ POR COMANDO EXPLÍCITO ─────────────────────────────────────────────
 *
 * Nada aqui é agendado. Não existe cron que ligue esta máquina: ela roda quando
 * a rota administrativa é chamada com o segredo dela, e um lote por chamada.
 *
 * ── ⛔ O INTERRUPTOR É CONSULTADO ANTES DE CADA CONTATO ─────────────────────
 *
 * Não uma vez por lote: uma vez por pessoa. É isso que faz a parada funcionar
 * com lote em andamento.
 */

import type { PrismaClient, Prisma } from "@prisma/client";
import { registrarDecisorIndicado } from "@/services/foocci-sdr/referredDecisionMaker";
import { podeAbordarAgora } from "../janelaComercial";
import { conferirInterruptor } from "./interruptor";
import { ACOES_QUE_FALAM, decidirReabordagem, type DecisaoDaReabordagem } from "./rota";
import { selecionarProximoLote } from "./selecao";
import type { PortaDeEnvio } from "./portaDeEnvio";

type Cliente = PrismaClient | Prisma.TransactionClient;

/** Ver o cabeçalho: 40 e 30 minutos, com a conta do porquê ao lado. */
export const TAMANHO_DO_LOTE_PADRAO = 40;
export const TAMANHO_DO_LOTE_MAXIMO = 80;
export const INTERVALO_MINIMO_ENTRE_LOTES_MIN = 30;

export interface ContaDoLote {
  loteId: string;
  /** Quantos contatos ainda restam na campanha depois deste lote. */
  restantesAntes: number;
  examinados: number;
  /** ⭐ A MÉTRICA DA CAMPANHA. Não é "enviados": é isto. */
  decisoresCapturados: number;
  enviados: number;
  /** Quantos não falaram, e por qual regra. A conta tem de fechar com `examinados`. */
  porAcao: Record<string, number>;
  recusados: Array<{ leadId: string; acao: string; motivo: string; detalhe: string }>;
  /** Preenchido quando o interruptor parou o lote no meio. */
  interrompidoEm: number | null;
  interrompidoPorque: string | null;
}

export type ResultadoDoDisparo =
  | { rodou: true; conta: ContaDoLote }
  | {
      rodou: false;
      motivo:
        | "interruptorPuxado"
        | "intervaloEntreLotes"
        | "filaVazia"
        | "portaSemTrava"
        /** Fora do horário em que a casa aborda cliente. Ver `janelaComercial.ts`. */
        | "foraDaJanelaComercial";
      detalhe: string;
    };

/** Quando saiu o último lote. `null` = nunca saiu nenhum. */
export async function ultimoLoteEm(db: Cliente): Promise<Date | null> {
  const ultima = (await db.reabordagemExecucao.findFirst({
    orderBy: { criadoEm: "desc" },
    select: { criadoEm: true },
  })) as { criadoEm: Date } | null;
  return ultima?.criadoEm ?? null;
}

/**
 * Dispara UM lote.
 *
 * **Nunca lança.** Uma exceção no meio deixaria contatos processados sem linha
 * de execução — e sem a linha, o lote seguinte os pegaria de novo. Cada falha
 * vira uma linha com o motivo escrito.
 */
export async function dispararUmLote(
  db: PrismaClient,
  p: {
    porta: PortaDeEnvio;
    tamanho?: number;
    agora?: Date;
    /** Quem apertou o botão. Vai para o log; a autoria da mensagem é da porta. */
    quemDisparou: string;
  },
): Promise<ResultadoDoDisparo> {
  const agora = p.agora ?? new Date();

  // ── ⛔ Porta sem trava não roda. Aviso reforçado por tipo E por guarda ──
  if (p.porta.aplicaTravaDeRepeticao !== true) {
    return {
      rodou: false,
      motivo: "portaSemTrava",
      detalhe:
        "a porta de envio não declara aplicar a trava anti-repetição. A campanha não roda sem ela, " +
        "e afrouxar a trava para caber a campanha não é uma opção.",
    };
  }

  // ── ⛔ A JANELA COMERCIAL, antes de qualquer leitura de fila ──
  //
  // Ordem do CEO, 18/09/2026: seg–sex 09–20, sáb 09–14, domingo não se aborda.
  // Esta máquina não tinha janela nenhuma: ela só conhecia a janela de 24h da
  // Meta, que responde outra pergunta (cabe texto livre ou tem de ser
  // template?). Um lote pedido às 3h de domingo saía.
  //
  // ⚠️ Vale para ABORDAR, e só. Responder a quem nos escreveu não passa por
  // aqui — esta função não é chamada por nenhum caminho de resposta.
  const janela = podeAbordarAgora(agora);
  if (!janela.pode) {
    return { rodou: false, motivo: janela.motivo, detalhe: janela.detalhe };
  }

  // ── ⛔ O interruptor, antes de qualquer leitura de fila ──
  const freio = await conferirInterruptor(db);
  if (freio.parado) {
    return { rodou: false, motivo: "interruptorPuxado", detalhe: freio.motivo };
  }

  // ── O intervalo entre lotes, lido do banco (não é `sleep`) ──
  const ultimo = await ultimoLoteEm(db);
  if (ultimo) {
    const minutos = (agora.getTime() - ultimo.getTime()) / 60_000;
    if (minutos < INTERVALO_MINIMO_ENTRE_LOTES_MIN) {
      return {
        rodou: false,
        motivo: "intervaloEntreLotes",
        detalhe:
          `o último lote saiu há ${minutos.toFixed(0)} min; o intervalo mínimo é de ` +
          `${INTERVALO_MINIMO_ENTRE_LOTES_MIN} min. O freio existe pela saúde do número — ` +
          "e não se afrouxa para a campanha caber.",
      };
    }
  }

  const tamanho = Math.min(
    Math.max(Math.trunc(p.tamanho ?? TAMANHO_DO_LOTE_PADRAO), 1),
    TAMANHO_DO_LOTE_MAXIMO,
  );

  const { restantes, candidatos } = await selecionarProximoLote(db, { tamanho });
  if (candidatos.length === 0) {
    return {
      rodou: false,
      motivo: "filaVazia",
      detalhe: "não há mais contato a examinar nesta campanha — todos já têm linha de execução.",
    };
  }

  const loteId = `lote-${agora.toISOString()}`;
  const conta: ContaDoLote = {
    loteId,
    restantesAntes: restantes,
    examinados: 0,
    decisoresCapturados: 0,
    enviados: 0,
    porAcao: {},
    recusados: [],
    interrompidoEm: null,
    interrompidoPorque: null,
  };

  for (const fatos of candidatos) {
    // ── ⛔ O INTERRUPTOR, ANTES DE CADA PESSOA ──
    const parada = await conferirInterruptor(db);
    if (parada.parado) {
      conta.interrompidoEm = conta.examinados;
      conta.interrompidoPorque = parada.motivo;
      console.warn("[reabordagem/executar] lote INTERROMPIDO no meio", {
        loteId,
        jaExaminados: conta.examinados,
        motivo: parada.motivo,
      });
      break;
    }

    const decisao = decidirReabordagem(fatos, agora);
    conta.examinados += 1;
    conta.porAcao[decisao.acao] = (conta.porAcao[decisao.acao] ?? 0) + 1;

    const resultado = await executarUmaDecisao(db, {
      decisao,
      porta: p.porta,
      loteId,
      agora,
    });

    if (resultado.decisorCapturado) conta.decisoresCapturados += 1;
    if (resultado.enviado) conta.enviados += 1;
    else if (ACOES_QUE_FALAM.includes(decisao.acao)) {
      conta.recusados.push({
        leadId: decisao.leadId,
        acao: decisao.acao,
        motivo: resultado.motivo ?? "semMotivo",
        detalhe: resultado.detalhe ?? "",
      });
    }
  }

  console.info("[reabordagem/executar] lote concluído", {
    loteId,
    quemDisparou: p.quemDisparou,
    examinados: conta.examinados,
    enviados: conta.enviados,
    decisoresCapturados: conta.decisoresCapturados,
    porAcao: conta.porAcao,
  });

  return { rodou: true, conta };
}

interface ResultadoDeUmaDecisao {
  enviado: boolean;
  decisorCapturado: boolean;
  motivo: string | null;
  detalhe: string | null;
}

/**
 * Executa UMA decisão e deixa a linha escrita, aconteça o que acontecer.
 *
 * ⚠️ A linha de execução é gravada ANTES do envio, e é ela que impede o contato
 * de reaparecer no lote seguinte. O `@@unique([loteId, leadId])` faz o resto:
 * duas execuções simultâneas disputam a mesma linha e exatamente uma ganha — a
 * outra desiste deste contato sem mandar nada.
 */
async function executarUmaDecisao(
  db: PrismaClient,
  p: { decisao: DecisaoDaReabordagem; porta: PortaDeEnvio; loteId: string; agora: Date },
): Promise<ResultadoDeUmaDecisao> {
  const { decisao } = p;

  // ── A reserva da linha. Se o Postgres recusar, outro processo já pegou. ──
  try {
    await db.reabordagemExecucao.create({
      data: {
        loteId: p.loteId,
        leadId: decisao.leadId,
        acao: decisao.acao,
        canal: decisao.canal,
        detalhe: decisao.explicacao,
        motivoDaRecusa: ACOES_QUE_FALAM.includes(decisao.acao) ? null : decisao.regra,
        criadoEm: p.agora,
      },
    });
  } catch (e) {
    return {
      enviado: false,
      decisorCapturado: false,
      motivo: "jaExaminado",
      detalhe:
        "outra execução já reservou este contato neste lote: " +
        (e instanceof Error ? e.message.slice(0, 120) : "erro desconhecido"),
    };
  }

  // ── ⭐ O DECISOR CAPTURADO — o objetivo da campanha inteira ──
  let leadDoDecisorId: string | null = null;
  let decisorCapturado = false;

  if (decisao.acao === "CADASTRA_DECISOR" && decisao.decisor?.telefone) {
    // ⚠️ Nome ausente vira o CARGO que a mensagem trouxe, nunca um nome
    // inventado. Campo que a mensagem não trouxe fica ausente — a doutrina de
    // `decisorIndicado.ts` vale aqui igual.
    const nome = decisao.decisor.nome ?? decisao.decisor.cargo ?? "Responsável comercial";
    const r = await registrarDecisorIndicado(db, {
      leadOrigemId: decisao.leadId,
      nome,
      telefone: decisao.decisor.telefone,
      agora: p.agora,
      origem: "reabordagem dos contatos frios",
    });
    if (r.ok) {
      leadDoDecisorId = r.leadId;
      decisorCapturado = true;
    }
  }

  // ── O envio, quando a ação fala ──
  let enviado = false;
  let mensagemId: string | null = null;
  let motivo: string | null = null;
  let detalhe: string | null = null;

  const fala = ACOES_QUE_FALAM.includes(decisao.acao) || (decisao.canal === "JANELA" && decisao.texto);

  if (fala) {
    const envio =
      decisao.canal === "TEMPLATE"
        ? await p.porta.porTemplate(decisao.leadId)
        : decisao.texto
          ? await p.porta.naJanela(decisao.leadId, decisao.texto)
          : { enviado: false as const, motivo: "semTexto", detalhe: "a decisão não produziu texto" };

    if (envio.enviado) {
      enviado = true;
      mensagemId = envio.mensagemId;
    } else {
      motivo = envio.motivo;
      detalhe = envio.detalhe;
    }
  }

  // ── A linha fica com o desfecho. Falha aqui não derruba o lote. ──
  try {
    await db.reabordagemExecucao.update({
      where: { loteId_leadId: { loteId: p.loteId, leadId: decisao.leadId } },
      data: {
        enviado,
        mensagemId,
        decisorCapturado,
        leadDoDecisorId,
        ...(motivo ? { motivoDaRecusa: motivo, detalhe: `${decisao.explicacao} | ${detalhe ?? ""}` } : {}),
      },
    });
  } catch (e) {
    console.error("[reabordagem/executar] não consegui gravar o desfecho", {
      leadId: decisao.leadId,
      erro: e instanceof Error ? e.message.slice(0, 200) : "erro desconhecido",
    });
  }

  return { enviado, decisorCapturado, motivo, detalhe };
}
