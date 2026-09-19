/**
 * A RECEPÇÃO — quem fala com o lead que chegou SOZINHO.
 *
 * ── O ELO QUE ARREBENTAVA, medido em 18/09/2026 ─────────────────────────────
 *
 * O CEO viu na tela: *"Fantástico Magic — Novo lead · esperando gente"*, há um
 * dia. E 6.273 contatos sem responsável nenhum. A causa, procurada no código e
 * encontrada no mesmo lugar em que esta casa já se machucou três vezes:
 * **peça pronta, ninguém chamando.**
 *
 *   · `atenderComOTA` é chamado por UM caminho só — `FoocciSalesInbound`, o
 *     webhook de mensagem RECEBIDA. Ele responde a quem escreve; ele não
 *     começa conversa nenhuma.
 *   · `abordarLead` (o único caminho de fala da casa) é chamado pela rodada
 *     das 9h — que varre EXCLUSIVAMENTE `ItemDeProspeccao`, ou seja, a lista
 *     fria que nós fomos caçar.
 *   · `iaAssumeSeEstaLivre` só roda DENTRO de `atenderComOTA`.
 *
 * Junte as três: **quem preenche o formulário e não escreve no WhatsApp não é
 * tocado por linha nenhuma de código.** Ele nasce `stage: NOVO`,
 * `atendidoPor: NINGUEM`, e fica ali até alguém abrir a tela e reparar nele.
 * Era literalmente isso que a tela do CEO estava mostrando.
 *
 * Este arquivo é o chamador que faltava, e **só isso**.
 *
 * ── ⚠️ O QUE ELE NÃO FAZ, E É O PONTO INTEIRO ───────────────────────────────
 *
 * Não abre um segundo caminho de fala. Não copia portão nenhum. Não escreve
 * mensagem. Ele **chama `abordarLead`**, que é o único lugar por onde uma
 * abordagem sai, e portanto herda, sem exceção e sem atalho:
 *
 *   1. o portão do lead (`avaliarContatoDeLead` — opt-out, consentimento com
 *      prova, telefone, tentativas, descanso de 48h);
 *   2. o freio de ritmo (teto da hora e do dia);
 *   3. gravar antes de enviar;
 *   4. a Supervisora;
 *   5. a trava de repetição;
 *   6. `canalDeVendasPronto()` — as duas chaves da Meta **e**
 *      `FOOCCI_SDR_SEND_ENABLED`, que é chave do dono.
 *
 * Com a chave do dono desligada, esta rodada percorre a fila, assume os leads
 * em nome da IA e as mensagens ficam PENDENTES. **Nenhum estranho recebe nada
 * até o dono ligar.** É de propósito: fail-closed é a regra, não a exceção.
 *
 * ── E A LISTA FRIA CONTINUA SENDO OUTRA COISA ───────────────────────────────
 *
 * `FONTES_QUE_NOS_PROCURARAM` é uma lista POSITIVA, nunca "tudo menos
 * LISTA_PROSPECCAO". A diferença importa no dia em que alguém criar uma fonte
 * nova e esquecer de classificá-la: o erro tem de ser *"não falamos com ele"*,
 * e nunca *"falamos com um estranho que ninguém autorizou"*. `IMPORTACAO`,
 * `MANUAL` e `OUTRO` ficam de fora exatamente por isso — ninguém sabe dizer se
 * aquela pessoa nos procurou.
 */

import type { Prisma, PrismaClient, SiteLeadSource } from "@prisma/client";
import { abordarLead, type ResultadoDaAbordagem } from "../abordar";
import { iaAssumeSeEstaLivre } from "../responsavel";
import { escolherAgente } from "../quemAtende";
import { marcarPrazoDePrimeiraResposta } from "./prazoDaPrimeiraResposta";
import { FONTES_QUE_NOS_PROCURARAM, VARIAVEL_DA_RECEPCAO, recepcaoLigada } from "./portasDeEntrada";

export { FONTES_QUE_NOS_PROCURARAM, VARIAVEL_DA_RECEPCAO, recepcaoLigada };

type Cliente = PrismaClient | Prisma.TransactionClient;

/** Quantos leads uma rodada encosta, quando ninguém disser outro número. */
export const TETO_PADRAO_DA_RODADA = 25;
/** O teto do teto. Uma rodada não esvazia 6.273 contatos de uma vez. */
export const TETO_MAXIMO_DA_RODADA = 200;

export interface LeadNaRecepcao {
  id: string;
  createdAt: Date;
  fonte: SiteLeadSource;
  /** Minutos que esta pessoa esperou até esta rodada olhar para ela. */
  esperandoHaMinutos: number;
}

/**
 * A FILA — quem chegou sozinho e continua sem ninguém.
 *
 * **Mais novo primeiro**, e a ordem é a decisão. Um lead que chegou há dez
 * minutos ainda está com a página aberta; um de seis meses atrás já decidiu a
 * vida dele. Atender a fila do mais velho para o mais novo faria a casa gastar
 * a rodada inteira no arquivo morto e chegar ao lead de hoje amanhã — que é o
 * defeito, e não o conserto dele.
 *
 * ⚠️ **QUEM JÁ FOI TOCADO DE VERDADE não é caso de recepção.** Reabordagem de
 * quem já recebeu é outra frente, com outras regras, e não se mistura com esta
 * por acidente.
 *
 * ── ⭐ MAS "TOCADO" NÃO É "TENTADO" — corrigido em 19/09/2026 ────────────────
 *
 * O filtro era `lastContactedAt: null`, e essa coluna é escrita na TENTATIVA,
 * não na entrega. Resultado medido: dos 4 leads da campanha do Facebook, o mais
 * novo nunca foi abordado. A casa tentou uma vez, a Meta recusou, a mensagem
 * ficou FALHOU — e `lastContactedAt` ficou preenchido. A partir dali ele saía
 * da fila para sempre, por um contato que **não aconteceu**.
 *
 * A regra certa é a que a frase do CEO já dizia: *lead cuja única mensagem
 * nossa falhou continua sendo "ninguém falou com ele" — porque ninguém falou
 * mesmo.* Então o que barra a entrada na fila não é a coluna de data: é a
 * existência de **uma mensagem de saída que não seja FALHOU**.
 *
 * ⚠️ E `PENDENTE` continua barrando, de propósito. Pendente é uma chamada que a
 * Meta ACEITOU e cujo `failed` ainda não chegou (ou nunca vai chegar): tratá-la
 * como "não falamos" faria esta rodada mandar a segunda mensagem para quem
 * acabou de receber a primeira — exatamente o defeito irmão deste. Só `FALHOU`,
 * que é veredito fechado, devolve o lead à recepção.
 *
 * ⚠️ E `atendidoPor` aceita `IA` além de `NINGUEM`, desde D-0E4: a IA passou a
 * assumir o lead **na chegada**, então filtrar só por `NINGUEM` esvaziaria esta
 * fila justamente dos leads novos — que são o caso inteiro. Quem está com
 * `HUMANO` ou `AGUARDANDO_HUMANO` continua de fora: ali alguém já respondeu por
 * ele.
 */
export async function filaDaRecepcao(
  db: Cliente,
  params: { agora: Date; limite: number },
): Promise<LeadNaRecepcao[]> {
  const linhas = await db.siteLead.findMany({
    where: {
      fonte: { in: [...FONTES_QUE_NOS_PROCURARAM] },
      atendidoPor: { in: ["NINGUEM", "IA"] },
      optOutAt: null,
      stage: "NOVO",
      AND: [
        // ⛔ A TRAVA: nenhuma mensagem NOSSA que não tenha falhado. Zero
        // mensagens passa; uma PENDENTE, ENVIADA, ENTREGUE ou LIDA barra.
        { mensagens: { none: { direcao: "SAIDA", status: { not: "FALHOU" } } } },
        // E, entre os que nunca foram tocados de verdade, só entram os dois
        // casos honestos: ninguém tentou, ou tentou-se e falhou. Um lead com
        // `lastContactedAt` preenchido e nenhuma mensagem no banco é história
        // que esta rodada não sabe contar — fica de fora.
        {
          OR: [
            { lastContactedAt: null },
            { mensagens: { some: { direcao: "SAIDA", status: "FALHOU" } } },
          ],
        },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: Math.max(0, Math.min(params.limite, TETO_MAXIMO_DA_RODADA)),
    select: { id: true, createdAt: true, fonte: true },
  });

  return linhas.map((l) => ({
    id: l.id,
    createdAt: l.createdAt,
    fonte: l.fonte,
    esperandoHaMinutos: Math.max(
      0,
      Math.floor((params.agora.getTime() - l.createdAt.getTime()) / 60_000),
    ),
  }));
}

export type MotivoDeNaoReceber =
  /** A chave desta rodada está desligada. */
  | "recepcaoDesligada"
  | "leadNaoExiste"
  /**
   * Não há um único agente comercial ativo no banco. **Fail-closed de
   * propósito:** `abordarLead` exige um responsável com nome, e "o sistema
   * mandou" não é resposta quando alguém perguntar quem falou com aquela
   * pessoa. Sem agente a casa CALA — não fala anônima.
   */
  | "semAgenteResponsavel"
  /** Alguém (ou a própria IA) assumiu entre a fila e aqui. */
  | "jaTemDono"
  /** O motivo veio de `abordarLead`. `detalhe` traz o que ele disse. */
  | "abordagemRecusada";

export type ResultadoDaRecepcao =
  | { recebeu: true; leadId: string; mensagemId: string; agenteUserId: string; prazoMarcado: boolean }
  | { recebeu: false; leadId: string; motivo: MotivoDeNaoReceber; detalhe: string };

/**
 * RECEBER UM LEAD — o ato inteiro, na ordem em que ele tem de acontecer.
 *
 *   1. **Ligar o relógio** (`slaVenceEm`), antes de qualquer coisa. Se tudo o
 *      que vem depois falhar, o lead pelo menos passa a APARECER como atrasado
 *      — e um atraso visível é infinitamente melhor que um lead invisível.
 *   2. **Escolher o agente**, e parar aqui se não houver nenhum.
 *   3. **A IA assume**, com escrita condicional a `NINGUEM` (nunca rouba lead
 *      de quem já pegou).
 *   4. **Abordar**, pelo caminho único, com o agente como responsável.
 *
 * ⚠️ A ordem 3-antes-de-4 é deliberada e é o conserto do sintoma que o CEO viu:
 * enquanto a casa abordasse sem assumir, o lead apareceria como "esperando
 * gente" no exato instante em que estava sendo atendido — e um humano entraria
 * para salvar, dando ao cliente duas vozes na mesma conversa.
 *
 * ⚠️ Se a abordagem for recusada (portão, ritmo, Supervisora, trava, canal
 * desligado), o lead **fica com a IA** e não volta para `NINGUEM`. Devolvê-lo
 * faria a rodada seguinte tentar tudo de novo desde o começo, e a conta de
 * tentativas do portão nunca fecharia. O motivo da recusa é devolvido por
 * escrito, que é o que a porta de leitura mostra.
 */
export async function receberUmLead(
  db: Cliente,
  params: { leadId: string; agora: Date; chegouEm?: Date },
): Promise<ResultadoDaRecepcao> {
  if (!recepcaoLigada()) {
    return {
      recebeu: false,
      leadId: params.leadId,
      motivo: "recepcaoDesligada",
      detalhe: `${VARIAVEL_DA_RECEPCAO} não está em "true" — a recepção automática não fala com ninguém`,
    };
  }

  const lead = await db.siteLead.findUnique({
    where: { id: params.leadId },
    select: { id: true, createdAt: true },
  });
  if (!lead) {
    return { recebeu: false, leadId: params.leadId, motivo: "leadNaoExiste", detalhe: params.leadId };
  }

  const prazo = await marcarPrazoDePrimeiraResposta(db, {
    leadId: lead.id,
    chegouEm: params.chegouEm ?? lead.createdAt,
  });

  const agente = await escolherAgente(db);
  if (!agente) {
    return {
      recebeu: false,
      leadId: lead.id,
      motivo: "semAgenteResponsavel",
      detalhe:
        "nenhum agente comercial ativo no banco — toda mensagem que sai tem um responsável com nome, " +
        "e sem ele a casa não fala",
    };
  }

  // A tomada continua condicional a `NINGUEM`: ela é o cinto para o lead antigo,
  // nascido antes de D-0E4, que ainda está sem dono. Para o lead novo — que já
  // chega com a IA — ela devolve `assumiu: false`, e isso NÃO é recusa.
  const tomada = await iaAssumeSeEstaLivre(db, { leadId: lead.id, agora: params.agora });

  let responsavel = tomada.assumiu ? (tomada.agente?.userId ?? agente.userId) : null;

  if (!tomada.assumiu) {
    // Não assumiu: ou o lead já era da IA (o caso comum agora), ou uma pessoa o
    // pegou entre a fila e aqui. Só o primeiro segue.
    const dono = await db.siteLead.findUnique({
      where: { id: lead.id },
      select: { atendidoPor: true, atendenteUserId: true },
    });
    if (dono?.atendidoPor !== "IA") {
      return {
        recebeu: false,
        leadId: lead.id,
        motivo: "jaTemDono",
        detalhe: `o lead está com ${dono?.atendidoPor ?? "ninguém"} — a recepção não fala por cima de quem assumiu`,
      };
    }
    // Quem já estava com o lead assina. Trocar de agente no meio daria ao
    // cliente duas vozes com nomes diferentes.
    responsavel = dono.atendenteUserId ?? agente.userId;
  }

  if (!responsavel) {
    return {
      recebeu: false,
      leadId: lead.id,
      motivo: "semAgenteResponsavel",
      detalhe: "não foi possível nomear quem responde por esta mensagem",
    };
  }

  const abordagem: ResultadoDaAbordagem = await abordarLead(db, {
    leadId: lead.id,
    autor: "SISTEMA",
    autorUserId: responsavel,
    agora: params.agora,
  });

  if (!abordagem.abordou) {
    return {
      recebeu: false,
      leadId: lead.id,
      motivo: "abordagemRecusada",
      detalhe: `${abordagem.motivo}: ${abordagem.detalhe}`,
    };
  }

  return {
    recebeu: true,
    leadId: lead.id,
    mensagemId: abordagem.mensagemId,
    agenteUserId: responsavel,
    prazoMarcado: prazo.marcou,
  };
}

export interface LinhaDoExtrato {
  leadId: string;
  ok: boolean;
  motivo: string | null;
  detalhe: string | null;
  esperandoHaMinutos: number;
}

export interface ResultadoDaRodadaDeRecepcao {
  ligada: boolean;
  naFila: number;
  tentados: number;
  recebidos: number;
  extrato: LinhaDoExtrato[];
  /** Por que a rodada parou antes de esgotar a fila, quando parou. */
  parouPor: "fimDaFila" | "teto" | "ritmo" | "desligada" | "semAgente";
}

/**
 * A RODADA — a fila inteira, um lead por vez.
 *
 * Para cedo em dois casos, e os dois são economia honesta, não desistência:
 *
 *  · **ritmo** — o freio da casa já disse não. Insistir nos 24 seguintes
 *    produziria 24 recusas idênticas e 24 leads marcados como tentados.
 *  · **semAgente** — não existe agente no banco. É condição da casa, não do
 *    lead; a próxima linha daria exatamente a mesma resposta.
 */
export async function rodadaDaRecepcao(
  db: Cliente,
  params: { agora?: Date; teto?: number } = {},
): Promise<ResultadoDaRodadaDeRecepcao> {
  const agora = params.agora ?? new Date();
  const teto = Math.max(0, Math.min(params.teto ?? TETO_PADRAO_DA_RODADA, TETO_MAXIMO_DA_RODADA));

  if (!recepcaoLigada()) {
    return { ligada: false, naFila: 0, tentados: 0, recebidos: 0, extrato: [], parouPor: "desligada" };
  }

  const fila = await filaDaRecepcao(db, { agora, limite: teto });
  const extrato: LinhaDoExtrato[] = [];
  let recebidos = 0;
  let parouPor: ResultadoDaRodadaDeRecepcao["parouPor"] = "fimDaFila";

  for (const item of fila) {
    const r = await receberUmLead(db, { leadId: item.id, agora, chegouEm: item.createdAt });

    if (r.recebeu) {
      recebidos += 1;
      extrato.push({ leadId: item.id, ok: true, motivo: null, detalhe: null, esperandoHaMinutos: item.esperandoHaMinutos });
      continue;
    }

    extrato.push({
      leadId: item.id,
      ok: false,
      motivo: r.motivo,
      detalhe: r.detalhe,
      esperandoHaMinutos: item.esperandoHaMinutos,
    });

    if (r.motivo === "semAgenteResponsavel") {
      parouPor = "semAgente";
      break;
    }
    if (r.motivo === "abordagemRecusada" && r.detalhe.startsWith("ritmo:")) {
      parouPor = "ritmo";
      break;
    }
  }

  if (parouPor === "fimDaFila" && fila.length >= teto) parouPor = "teto";

  return { ligada: true, naFila: fila.length, tentados: extrato.length, recebidos, extrato, parouPor };
}
