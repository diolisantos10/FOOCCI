/**
 * O ARTEFATO DO DIOLI CONNECT — e ele se declara RASCUNHO em toda linha.
 *
 * ─── POR QUE ISTO NÃO PODE PARECER A FALA DO GERENTE ────────────────────────
 *
 * Esta porta roda o agente **sem provedor de IA**: sem chave configurada, o
 * roteador de motores da casa devolve `MOCK` com "fallback determinístico
 * seguro", e o laboratório executa `WaiterBrainV2.decide`, que é função pura.
 * Isso é ótimo — é o que torna o acionamento grátis e reproduzível — mas tem um
 * preço que precisa estar escrito: **a saída é um relatório de regras, não a
 * comunicação inteligente de um gerente**.
 *
 * Lei da casa: IA dá pensamento, não poder — sem provedor, DEGRADA para o
 * rascunho, e **o rascunho diz o que é**. Por isso a declaração aparece em dois
 * lugares independentes: no primeiro nível da resposta HTTP (para quem lê a
 * resposta) e nas três primeiras chaves do artefato (para quem abre o JSON).
 * Redundante de propósito: quem lê só um dos dois ainda fica sabendo.
 *
 * ─── ⭐ E O ARTEFATO É MONTADO DO QUE VOLTOU DO BANCO ───────────────────────
 *
 * O relatório abaixo não é montado do que a porta tinha na memória: ele é
 * montado da linha **relida**. Se a releitura vier pela metade, não existe
 * artefato para montar — e o despacho cai em `nao_verificavel`, nunca em verde.
 */

import { GERENTE_DO_PRODUTO, PRODUTO_ID } from "./cadastro";
import type { LinhaDeRodadaLida } from "./armazem";
import type { PedidoConferido } from "./contrato";

/** ⚠️ O que a Control Room lê para saber que isto não é o gerente falando. */
export interface SeloDeRascunho {
  /** Para a máquina: nunca `false` enquanto não houver provedor de IA. */
  rascunho: true;
  /** Para a tela: uma palavra, em caixa alta, que não dá para ler como outra coisa. */
  natureza: "RASCUNHO";
  /** Para quem lê: o que isto é e o que isto não é. */
  aviso: string;
}

export const SELO_DE_RASCUNHO: SeloDeRascunho = {
  rascunho: true,
  natureza: "RASCUNHO",
  aviso:
    "RASCUNHO — relatório de um ensaio determinístico do agente, sem provedor de IA e sem credencial, " +
    "rodado contra catálogo sintético. NÃO é a comunicação final e inteligente do gerente, não descreve o " +
    "comportamento do agente em produção e não deve ser mostrado a restaurante nenhum. Serve para provar o " +
    "acionamento e o rastro; a redação sobe quando o dono configurar um provedor.",
};

/**
 * ⭐ O SELO DE PRODUÇÃO — e o que ele afirma, que é MENOS do que parece.
 *
 * ─── A LINHA QUE ESTE SELO NÃO PODE ATRAVESSAR ─────────────────────────────
 *
 * Em `producao` a **entrega é real**: a consulta foi gravada na caixa do gerente
 * como operação que vale, com o caso do lead junto, e a linha foi relida do
 * banco. Isso é verdade e o selo diz.
 *
 * O que o selo **não** diz, porque não é verdade: que o gerente respondeu. Esta
 * porta não tem canal de resposta — ela carimba `entregue`, e nunca `acionado`
 * nem `respondido` (ver `caixa.ts`). Quem quiser ler nela uma resposta do
 * gerente está lendo o que não está escrito.
 *
 * E o ensaio determinístico que roda junto continua sendo ensaio: ele existe
 * para produzir a linha auditável que serve de prova da entrega, e **não** vira
 * a fala do gerente por o modo ter mudado de nome. É por isso que este selo
 * carrega `resposta_do_gerente: null` no primeiro nível, em vez de simplesmente
 * omitir o assunto: ausência de informação não é informação.
 */
export interface SeloDeProducao {
  rascunho: false;
  natureza: "OPERACAO_REAL";
  aviso: string;
  /** `null`, sempre. Esta porta entrega; ela não colhe resposta. */
  resposta_do_gerente: null;
}

export const SELO_DE_PRODUCAO: SeloDeProducao = {
  rascunho: false,
  natureza: "OPERACAO_REAL",
  aviso:
    "OPERAÇÃO REAL — a consulta foi gravada na caixa do gerente como operação que vale, com o caso do lead " +
    "junto, e a linha foi relida do banco. ⚠️ O que isto NÃO é: a resposta do gerente. Esta porta carimba " +
    "'entregue' e não tem canal de resposta — quem responde é o gerente, do lado dele, e o retorno ao cliente " +
    "continua saindo pela fila humana. O ensaio determinístico anexo serve de âncora de auditoria da entrega; " +
    "ele não é, e nunca foi, a fala do gerente.",
  resposta_do_gerente: null,
};

export type SeloDoDespacho = SeloDeRascunho | SeloDeProducao;

/** O selo que o modo do pedido manda usar. Um lugar só, para não divergirem. */
export function seloDoModo(modo: string): SeloDoDespacho {
  return modo === "producao" ? SELO_DE_PRODUCAO : SELO_DE_RASCUNHO;
}

export const ORIGEM_DO_RASCUNHO =
  "motor determinístico do Foocci (WaiterBrainV2.decide, função pura) rodado pelo laboratório de simulação " +
  "em modo sandbox — homologação com catálogo sintético, sem provedor de IA e sem credencial. Rascunho " +
  "estruturado que se declara rascunho: o que este piloto prova é o acionamento e o rastro, não a eloquência.";

export const AVISO_NO_TEXTO =
  "⚠️ RASCUNHO — NÃO É A COMUNICAÇÃO FINAL DO GERENTE. Este texto saiu de um ensaio determinístico contra " +
  "catálogo sintético, sem provedor de IA. Não envie a cliente, não trate como resposta pronta e não leia " +
  "como medição de produção: ele prova que o acionamento aconteceu e ficou com rastro, e mais nada.";

/**
 * A situação, derivada dos contadores RELIDOS — e nunca de adjetivo.
 *
 * Repare no caso de tudo passar: a frase diz o que foi medido e diz o que NÃO
 * foi. Escrever "está tudo bem" ali seria concluir uma afirmação sobre produção
 * a partir de um ensaio sintético, que é ausência de informação virando
 * informação.
 */
export function situacaoDaRodada(linha: LinhaDeRodadaLida): string {
  if (linha.scenariosTotal === 0) {
    return "NÃO APURADO — nenhum cenário foi avaliado nesta rodada";
  }
  if (linha.scenariosFailed > 0) {
    return (
      `REPROVOU em ${linha.scenariosFailed} de ${linha.scenariosTotal} cenários sintéticos` +
      (linha.p0Count > 0 ? `, com ${linha.p0Count} achado(s) P0` : "")
    );
  }
  if (linha.scenariosWarning > 0) {
    return `PASSOU COM ALERTA — ${linha.scenariosWarning} de ${linha.scenariosTotal} cenários sintéticos saíram com ressalva`;
  }
  return (
    `PASSOU nos ${linha.scenariosTotal} cenários sintéticos desta rodada — o que NÃO é afirmação sobre ` +
    "produção: o ensaio roda contra catálogo sintético e não mede atendimento real"
  );
}

/** O relatório do agente, montado da linha relida. */
export function artefatoDaRodada(
  pedido: PedidoConferido,
  fio: string,
  turno: number,
  linha: LinhaDeRodadaLida,
  antecedentes: LinhaDeRodadaLida[],
): string {
  const oQueFalta: string[] = [];
  if (linha.opportunityCount === 0) oQueFalta.push("nenhuma oportunidade foi levantada nesta rodada");
  if (!pedido.mensagem && pedido.acao !== "iniciar") oQueFalta.push("a mensagem não chegou ao artefato");
  if (linha.scenariosTotal < pedido.cenarios) {
    oQueFalta.push(
      `foram pedidos ${pedido.cenarios} cenários e a linha relida tem ${linha.scenariosTotal} — a diferença não foi apurada`,
    );
  }

  const proximaAcao =
    linha.scenariosFailed > 0 || linha.p0Count > 0
      ? `${GERENTE_DO_PRODUTO} assume os ${linha.scenariosFailed} cenário(s) reprovado(s) e devolve, por escrito, o conserto ou o impedimento.`
      : `${GERENTE_DO_PRODUTO} registra a rodada e mantém o fio ${fio} aberto para o próximo turno.`;

  return JSON.stringify(
    {
      // As três primeiras chaves existem só para este texto não poder ser
      // confundido com a fala final do gerente — nem por máquina, nem por tela,
      // nem por gente.
      rascunho: true,
      natureza: "RASCUNHO",
      aviso: AVISO_NO_TEXTO,
      origem: ORIGEM_DO_RASCUNHO,
      produto: PRODUTO_ID,
      modo: pedido.modo,
      sintetico: pedido.sintetico,
      acao: pedido.acao,
      de: pedido.de,
      para: pedido.para,
      agente: linha.agentSlug,
      fio,
      turno,
      mensagem_recebida: pedido.mensagem,
      assunto: pedido.assunto,
      situacao: situacaoDaRodada(linha),
      o_que_o_agente_fez: {
        rodada: linha.id,
        status: linha.status,
        cenarios: linha.scenariosTotal,
        passaram: linha.scenariosPassed,
        com_alerta: linha.scenariosWarning,
        reprovaram: linha.scenariosFailed,
        p0: linha.p0Count,
        oportunidades: linha.opportunityCount,
        duracao_ms: linha.durationMs,
      },
      achados: linha.cenarios.map((c) => ({
        cenario: c.scenarioKey,
        status: c.status,
        severidade: c.severity,
        nota: c.score,
        resumo: c.summary,
      })),
      oportunidades: linha.oportunidades.map((o) => ({
        tipo: o.type,
        severidade: o.severity,
        titulo: o.title,
        recomendacao: o.recommendation,
      })),
      proxima_acao: proximaAcao,
      o_que_falta: oQueFalta.length > 0 ? oQueFalta : ["nada declarado"],
      fio_anterior: {
        turnos_anteriores: antecedentes.length,
        rodadas: antecedentes.map((a) => a.id),
      },
      entrega_para: GERENTE_DO_PRODUTO,
    },
    null,
    2,
  );
}
