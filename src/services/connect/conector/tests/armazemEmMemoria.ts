/**
 * O armazém de pendências em memória — **para teste, e só para teste**.
 *
 * ⚠️ Ele NÃO é uma implementação alternativa aceitável em produção, e está aqui
 * dentro de `tests/` para que isso seja óbvio pela localização e não por um
 * comentário. O contrato de `ArmazemDePendencias` exige sobreviver a restart:
 * uma pendência que some no deploy deixa o cliente órfão sem ninguém perceber,
 * e é exatamente o corte que o conector existe para fechar.
 *
 * O que ele faz é reproduzir, com fidelidade, o comportamento que a tabela tem —
 * inclusive a idempotência de `registrarResposta` e de `marcarAvisado`, que é o
 * que faz a reentrega do núcleo não pôr a mesma resposta duas vezes na frente do
 * cliente.
 */

import type { DecisaoDoGerente } from "../contrato";
import {
  ESTADOS_NAO_RESOLVIDOS,
  type ArmazemDePendencias,
  type EstadoDaPendencia,
  type Pendencia,
  type PendenciaNova,
} from "../pendencias";

function estadoFinal(decisao: DecisaoDoGerente, entregueAoCliente: boolean): EstadoDaPendencia {
  if (!entregueAoCliente) return "AGUARDANDO_ENVIO";
  return decisao === "respondida" ? "RESPONDIDA" : "ENCERRADA";
}

export function armazemEmMemoria(): ArmazemDePendencias & { todas(): Pendencia[] } {
  const linhas = new Map<string, Pendencia>();

  return {
    async abrir(nova: PendenciaNova): Promise<Pendencia> {
      if (linhas.has(nova.protocolo)) {
        // A coluna é `@unique` no banco; aqui o equivalente é recusar.
        throw new Error(`protocolo repetido: ${nova.protocolo}`);
      }
      const p: Pendencia = {
        ...nova,
        estado: "PENDENTE",
        respondidaEm: null,
      };
      linhas.set(p.protocolo, p);
      return p;
    },

    async porProtocolo(protocolo: string): Promise<Pendencia | null> {
      return linhas.get(protocolo) ?? null;
    },

    async marcarAvisado(protocolo: string, em: Date): Promise<void> {
      const p = linhas.get(protocolo);
      if (p && p.avisadoEm === null) linhas.set(protocolo, { ...p, avisadoEm: em });
    },

    async registrarResposta(
      protocolo: string,
      dados: { decisao: DecisaoDoGerente; entregueAoCliente: boolean; em: Date },
    ): Promise<void> {
      const p = linhas.get(protocolo);
      if (!p || p.estado !== "PENDENTE") return;
      linhas.set(protocolo, {
        ...p,
        estado: estadoFinal(dados.decisao, dados.entregueAoCliente),
        respondidaEm: dados.entregueAoCliente ? dados.em : null,
      });
    },

    async abertasDaConversa(conversa: string): Promise<Pendencia[]> {
      return [...linhas.values()]
        .filter((p) => p.conversa === conversa && ESTADOS_NAO_RESOLVIDOS.includes(p.estado))
        .sort((a, b) => a.criadaEm.getTime() - b.criadaEm.getTime());
    },

    todas(): Pendencia[] {
      return [...linhas.values()];
    },
  };
}
