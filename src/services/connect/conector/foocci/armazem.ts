/**
 * O LIVRO DE PENDÊNCIAS DO FOOCCI, no banco — a implementação da interface.
 *
 * Ligação local: é aqui, e só aqui, que o conector do Foocci sabe que existe
 * Prisma e que a tabela se chama `connect_pendencias`. Outro produto implementa
 * `ArmazemDePendencias` com o que ele tiver — a única exigência do contrato é
 * **sobreviver a um restart**, porque é isso que impede o cliente de virar órfão
 * quando o produto perde a conexão e volta.
 *
 * ⛔ Nenhum método escreve em pedido, cliente, cobrança ou qualquer tabela de
 * negócio. A forma do contrato é o que garante isso — não a boa intenção.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import {
  ESTADOS_DA_PENDENCIA,
  ESTADOS_NAO_RESOLVIDOS,
  type ArmazemDePendencias,
  type EstadoDaPendencia,
  type Pendencia,
  type PendenciaNova,
} from "../pendencias";
import type { DecisaoDoGerente } from "../contrato";

type Cliente = PrismaClient | Prisma.TransactionClient;

/** A linha do banco vira a pendência do contrato. Um lugar só de tradução. */
function daLinha(l: {
  protocolo: string;
  produto: string;
  conversa: string;
  canal: string;
  agente: string;
  fio: string | null;
  assunto: string;
  estado: string;
  avisadoEm: Date | null;
  respondidaEm: Date | null;
  criadaEm: Date;
}): Pendencia {
  return {
    protocolo: l.protocolo,
    produto: l.produto,
    conversa: l.conversa,
    canal: l.canal,
    agente: l.agente,
    fio: l.fio,
    assunto: l.assunto,
    // ⚠️ A coluna é texto (o Postgres não tem enum aqui), então o valor lido
    // é conferido contra a lista em vez de sofrer um cast: um estado que não
    // existe é tratado como ENCERRADA — nunca como PENDENTE, que abriria a
    // porta para uma entrega a partir de uma linha corrompida.
    estado: normalizarEstado(l.estado),
    avisadoEm: l.avisadoEm,
    respondidaEm: l.respondidaEm,
    criadaEm: l.criadaEm,
  };
}

function normalizarEstado(bruto: string): EstadoDaPendencia {
  return (ESTADOS_DA_PENDENCIA as readonly string[]).includes(bruto)
    ? (bruto as EstadoDaPendencia)
    : "ENCERRADA";
}

/**
 * ⭐ O estado final, e ele depende de o CLIENTE TER RECEBIDO (decisões C4/C5).
 *
 * Sem entrega não há resposta: `AGUARDANDO_ENVIO` é fila humana pronta para
 * envio, e não é verde. É o que impede a consulta de ficar marcada como
 * respondida com o cliente sem ter recebido nada.
 */
function estadoFinal(decisao: DecisaoDoGerente, entregueAoCliente: boolean): EstadoDaPendencia {
  if (!entregueAoCliente) return "AGUARDANDO_ENVIO";
  return decisao === "respondida" ? "RESPONDIDA" : "ENCERRADA";
}

export function armazemDePendenciasNoBanco(db: Cliente): ArmazemDePendencias {
  return {
    async abrir(nova: PendenciaNova): Promise<Pendencia> {
      const linha = await db.connectPendencia.create({
        data: {
          protocolo: nova.protocolo,
          produto: nova.produto,
          conversa: nova.conversa,
          canal: nova.canal,
          agente: nova.agente,
          fio: nova.fio,
          assunto: nova.assunto,
          estado: "PENDENTE",
          avisadoEm: nova.avisadoEm,
          criadaEm: nova.criadaEm,
        },
      });
      return daLinha(linha);
    },

    async porProtocolo(protocolo: string): Promise<Pendencia | null> {
      const linha = await db.connectPendencia.findUnique({ where: { protocolo } });
      return linha ? daLinha(linha) : null;
    },

    async marcarAvisado(protocolo: string, em: Date): Promise<void> {
      // `avisadoEm: null` no `where`: o primeiro aviso é o que conta, e um
      // segundo não reescreve a data do primeiro.
      await db.connectPendencia.updateMany({
        where: { protocolo, avisadoEm: null },
        data: { avisadoEm: em },
      });
    },

    /**
     * Idempotente por construção: o `where` exige `estado: "PENDENTE"`, então
     * um segundo retorno do núcleo não sobrescreve a data do primeiro. O
     * `updateMany` é de propósito — `update` lançaria quando não achasse, e
     * "já estava fechada" não é erro.
     */
    async registrarResposta(
      protocolo: string,
      dados: { decisao: DecisaoDoGerente; entregueAoCliente: boolean; em: Date },
    ): Promise<void> {
      await db.connectPendencia.updateMany({
        where: { protocolo, estado: "PENDENTE" },
        data: {
          estado: estadoFinal(dados.decisao, dados.entregueAoCliente),
          // ⚠️ `respondidaEm` só marca quando o cliente RECEBEU. Carimbar a data
          // no recebimento faria a métrica de "tempo até responder o cliente"
          // medir o tempo até a empresa decidir — que é outra coisa.
          respondidaEm: dados.entregueAoCliente ? dados.em : null,
        },
      });
    },

    async abertasDaConversa(conversa: string): Promise<Pendencia[]> {
      const linhas = await db.connectPendencia.findMany({
        where: { conversa, estado: { in: [...ESTADOS_NAO_RESOLVIDOS] } },
        orderBy: { criadaEm: "asc" },
      });
      return linhas.map(daLinha);
    },
  };
}
