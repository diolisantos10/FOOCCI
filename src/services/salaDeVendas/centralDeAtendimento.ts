/**
 * ⭐ A CENTRAL DE ATENDIMENTO — a visão DE CIMA das conversas (tela 03).
 *
 * ── O QUE ELA É, E O QUE ELA NÃO É ──────────────────────────────────────────
 *
 * `/comercial/conversas` é onde se ATENDE: uma conversa por vez, com o copiloto
 * ao lado. Esta é onde se COMANDA: quantas filas existem, quem está esperando há
 * mais tempo, quantas conversas estão com a IA e quantas com gente, e como a
 * carga está distribuída entre os atendentes.
 *
 * As duas telas não competem. Quem abre a Central e quer atender clica e cai na
 * conversa — a Central não duplica a caixa de mensagens, nem lê mensagem
 * nenhuma. **Ela não envia nada**: não existe aqui um caminho novo de WhatsApp,
 * nem um velho reaproveitado. É leitura, e só.
 *
 * ── A REGRA QUE GOVERNA CADA NÚMERO DAQUI ───────────────────────────────────
 *
 * Nenhum número nasce nesta pasta. Todos vêm de serviços que já existiam e já
 * eram medidos: `filasDoAgora`, `timeNoPainel` e `esperaPorGente` do painel do
 * gerente, `contarFilaDoSdr` da prospecção. Este arquivo COMPÕE — ele não
 * recalcula, não arredonda e não inventa.
 *
 * E onde o dado não existe, o tipo obriga a dizer isso: `EsperaMedida` já é uma
 * união com `medido: false`, e a espera individual de cada lead também é
 * (`{ medido: false, motivo: "semMensagem" }`). Zero minutos de espera é uma
 * afirmação — "estamos atendendo na hora" — e é indistinguível de "nunca
 * registramos a mensagem dele". Os dois pintariam o mesmo card de verde, e só um
 * merece comemoração.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import {
  filasDoAgora,
  timeNoPainel,
  type FilasDoAgora,
  type TimeNoPainel,
} from "./painel";
import { esperaPorGente, type EsperaMedida } from "./handoff";
import { contarFilaDoSdr, type ContagemDaFila } from "./prospeccao/filaDoSdr";

type Cliente = PrismaClient | Prisma.TransactionClient;

/** Quantos leads por situação de atendimento. Quem é IA, quem é gente, quem é ninguém. */
export interface QuemAtendeAgora {
  ia: number;
  humano: number;
  aguardandoHumano: number;
  ninguem: number;
}

/**
 * Quanto tempo UM lead está esperando.
 *
 * `medido: false` quando não há mensagem dele registrada. Sem última mensagem
 * não há relógio: escrever "0 min" ali seria dizer que ele acabou de chegar, o
 * que é exatamente a leitura oposta da verdade quando o registro falhou.
 */
export type EsperaDoLead =
  | { medido: true; minutos: number }
  | { medido: false; motivo: "semMensagem" };

export interface LeadEsperando {
  leadId: string;
  nome: string;
  restaurante: string | null;
  cidade: string | null;
  atendidoPor: string;
  espera: EsperaDoLead;
  prioritario: boolean;
}

export interface CentralDeAtendimento {
  /** O instante da medição, em ISO. A tela formata para o fuso de quem olha. */
  agora: string;
  filas: FilasDoAgora;
  espera: EsperaMedida;
  time: TimeNoPainel;
  filaDoSdr: ContagemDaFila[];
  quemAtende: QuemAtendeAgora;
  /** Os que esperam há mais tempo, do mais antigo para o mais novo. */
  esperandoHaMaisTempo: LeadEsperando[];
}

/** Teto da lista de espera. A Central é um painel, não uma exportação da base. */
export const TETO_DA_ESPERA = 12;

/** As etapas em que o lead ainda está vivo para o atendimento. */
const FORA_DO_JOGO = ["GANHO", "PERDIDO"] as const;

/**
 * Monta a Central inteira.
 *
 * Tudo em paralelo de propósito: são consultas independentes, e serializá-las
 * faria a tela de comando ser a mais lenta da casa justamente no dia em que a
 * fila está cheia.
 */
export async function montarCentralDeAtendimento(
  db: Cliente,
  agora: Date,
  opcoes: { teto?: number } = {},
): Promise<CentralDeAtendimento> {
  const teto = Math.min(Math.max(opcoes.teto ?? TETO_DA_ESPERA, 1), 50);

  const [filas, espera, time, filaDoSdr, ia, humano, aguardando, ninguem, esperando] =
    await Promise.all([
      filasDoAgora(db, agora),
      esperaPorGente(db, agora),
      timeNoPainel(db),
      contarFilaDoSdr(db, agora),
      db.siteLead.count({ where: { atendidoPor: "IA", stage: { notIn: [...FORA_DO_JOGO] } } }),
      db.siteLead.count({ where: { atendidoPor: "HUMANO", stage: { notIn: [...FORA_DO_JOGO] } } }),
      db.siteLead.count({ where: { atendidoPor: "AGUARDANDO_HUMANO" } }),
      db.siteLead.count({
        where: { atendidoPor: "NINGUEM", stage: { notIn: [...FORA_DO_JOGO] } },
      }),
      // Quem está esperando gente, do mais antigo primeiro. `ultimaMensagemEm`
      // é o relógio certo: é quando ELE falou pela última vez, e portanto desde
      // quando está sem resposta.
      db.siteLead.findMany({
        where: { atendidoPor: "AGUARDANDO_HUMANO" },
        orderBy: { ultimaMensagemEm: "asc" },
        take: teto,
        select: {
          id: true,
          nome: true,
          restaurante: true,
          cidade: true,
          atendidoPor: true,
          prioritario: true,
          ultimaMensagemEm: true,
        },
      }),
    ]);

  return {
    agora: agora.toISOString(),
    filas,
    espera,
    time,
    filaDoSdr,
    quemAtende: { ia, humano, aguardandoHumano: aguardando, ninguem },
    esperandoHaMaisTempo: (
      esperando as unknown as Array<{
        id: string;
        nome: string;
        restaurante: string | null;
        cidade: string | null;
        atendidoPor: string;
        prioritario: boolean;
        ultimaMensagemEm: Date | null;
      }>
    ).map((l) => ({
      leadId: l.id,
      nome: l.nome,
      restaurante: l.restaurante,
      cidade: l.cidade,
      atendidoPor: l.atendidoPor,
      prioritario: l.prioritario,
      espera: esperaDe(l.ultimaMensagemEm, agora),
    })),
  };
}

/**
 * A espera de um lead, ou a recusa de medi-la.
 *
 * Pura e exportada para poder ser medida sozinha: é a única conta deste arquivo,
 * e é justamente onde um zero inventado entraria sem ninguém ver.
 */
export function esperaDe(ultimaMensagemEm: Date | null, agora: Date): EsperaDoLead {
  if (!ultimaMensagemEm) return { medido: false, motivo: "semMensagem" };
  return {
    medido: true,
    minutos: Math.max(0, Math.floor((agora.getTime() - ultimaMensagemEm.getTime()) / 60_000)),
  };
}
