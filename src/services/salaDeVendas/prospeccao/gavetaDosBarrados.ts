/**
 * A GAVETA DOS BARRADOS — quem a fila recusou, com o motivo legível, e o
 * descarte do que é inútil de verdade.
 *
 * ── DE ONDE VEIO ESTA ORDEM ─────────────────────────────────────────────────
 *
 * CEO, 19/09/2026: *"esses cinquenta precisam ir para alguma gaveta para ser
 * detectado. Ou se foi barrado, deleta. Por que foi barrado? Se o número não é
 * WhatsApp, já deleta de vez. Tem que ter o WhatsApp ou o e-mail. Se não tiver
 * nenhum desses dois, deleta. Não tem que ficar guardando coisa."*
 *
 * ── ⛔ O QUE ESTE ARQUIVO NÃO FAZ, E POR QUÊ ────────────────────────────────
 *
 * Ele **não apaga nada sozinho** e **não arquiva nada ao montar tela**. O
 * cabeçalho de `selecao.ts` conta o incidente que custou a lista: um código que
 * escrevia enquanto "só olhava" tirou contatos de PENDENTE para sempre, cinco
 * recarregamentos queimaram cem contatos. A gaveta repete a lição por fora:
 *
 *   · `raioXDaGaveta`  — SOMENTE LEITURA. Conta por motivo. Nada muda.
 *   · `arquivarBarradosTerminais` — escreve, mas só quando chamada de propósito,
 *     e só sobre motivos que NUNCA passam sozinhos.
 *   · `descartarSemWhatsappNemEmail` — apaga, e só com `confirmar: true`. Sem
 *     ele, devolve a contagem do que APAGARIA e não toca em nada.
 *
 * ── ⛔⛔ A TRAVA QUE ESTÁ ACIMA DA ORDEM DO CEO ─────────────────────────────
 *
 * **Quem pediu para não receber mais (opt-out) nunca é apagado** — nem sem
 * e-mail, nem sem WhatsApp válido, nem por engano. Decisão do Diretor Geral,
 * 19/09/2026, e ela é mais restritiva que a ordem acima de propósito:
 *
 * apagar o registro de um opt-out **não** apaga a pessoa — apaga a nossa
 * memória de que ela mandou parar. Na próxima planilha ela volta como contato
 * novo, é abordada de novo, e aí são duas contas: a da LGPD (art. 18, direito
 * de oposição registrado e respeitado) e a da Meta, onde a denúncia de quem já
 * tinha pedido silêncio é exatamente a que derruba a nota do número.
 *
 * Por isso a trava é **código e teste**, e não um parágrafo: o filtro do
 * descarte protege o opt-out, e `gavetaDosBarrados.test.ts` prova que um item
 * sem telefone válido e sem e-mail, cujo dono pediu silêncio, SOBREVIVE ao
 * descarte.
 */

import type { PrismaClient, Prisma } from "@prisma/client";
import {
  avaliarAbordagemDeProspeccao,
  bloqueioPassaSozinho,
  telefonePlausivel,
  REGRA,
  type LeadBlockReason,
} from "@/services/foocci-sdr/LeadContactSafety";
import { acharLeadPeloTelefone } from "./casamento";

type Cliente = PrismaClient | Prisma.TransactionClient;

/** Quantos itens PENDENTE o raio-x lê por página. Mesmo tamanho da conferência. */
const TAMANHO_DA_PAGINA = 500;

/** Teto de varredura do raio-x, para uma base de 70 mil não virar uma consulta eterna. */
export const TETO_DE_VARREDURA_DO_RAIO_X = 5_000;

/**
 * A frase que o CEO lê na tela para cada motivo. O `detail` do portão descreve
 * o caso concreto ("falamos há 3h"); estas descrevem a CLASSE, que é o que uma
 * contagem precisa.
 */
export const ROTULO_DO_MOTIVO: Record<LeadBlockReason, string> = {
  LEAD_OPT_OUT: "Pediu para não receber mais",
  LEAD_SEM_TELEFONE: "Sem telefone nenhum",
  LEAD_TELEFONE_INVALIDO: "Telefone com formato improvável",
  HISTORICO_DESCONHECIDO: "Não foi possível apurar o histórico",
  CONSENTIMENTO_VENCIDO: "Consentimento vencido",
  CONSENTIMENTO_DESCONHECIDO: "Sem registro de consentimento",
  FORA_DA_JANELA: "Fora do horário de abordagem",
  TETO_DE_TENTATIVAS: "Já insistimos o máximo permitido",
  DESCANSO_ATIVO: "Em descanso entre abordagens",
  CANAL_INDISPONIVEL: "O canal de envio está desligado",
  PROSPECCAO_SEM_BASE_LEGAL: "O lote não declara de onde veio o contato",
  PROSPECCAO_DESLIGADA: "A prospecção está desligada ou pausada",
};

/**
 * Os motivos que NUNCA passam sozinhos e não dependem de ninguém consertar
 * nada — o contato em si acabou. Só estes podem ir para `RECUSADO`.
 *
 * ⚠️ `PROSPECCAO_SEM_BASE_LEGAL` está deliberadamente FORA: ele se resolve
 * escrevendo a procedência do lote, e arquivar por causa dele jogaria a lista
 * inteira fora por um campo em branco.
 */
export const MOTIVOS_TERMINAIS: readonly LeadBlockReason[] = [
  "LEAD_OPT_OUT",
  "LEAD_SEM_TELEFONE",
  "LEAD_TELEFONE_INVALIDO",
  "TETO_DE_TENTATIVAS",
] as const;

export function motivoEhTerminal(motivo: LeadBlockReason): boolean {
  return MOTIVOS_TERMINAIS.includes(motivo);
}

/** Um e-mail que dá para tentar. Não valida caixa: valida que existe endereço. */
export function emailPlausivel(v: string | null | undefined): boolean {
  if (!v) return false;
  const t = v.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t);
}

export interface MotivoNaGaveta {
  motivo: LeadBlockReason;
  rotulo: string;
  quantidade: number;
  /** `true` quando o bloqueio se resolve sozinho com o tempo (horário, descanso, canal). */
  passaSozinho: boolean;
  /** `true` quando o contato acabou e ele pode ir para `RECUSADO`. */
  terminal: boolean;
}

export interface RaioXDaGaveta {
  /** Quantos itens estão PENDENTE na Base fria agora. Contagem exata. */
  pendentes: number;
  /** Quantos itens o raio-x realmente leu e avaliou. */
  avaliados: number;
  liberados: number;
  barrados: number;
  /** `true` quando a varredura esgotou os PENDENTE antes do teto. */
  varreuTudo: boolean;
  /** Os motivos, do mais frequente para o menos. */
  porMotivo: MotivoNaGaveta[];
  /** Dos avaliados: sem WhatsApp plausível E sem e-mail — os candidatos ao descarte. */
  semWhatsappNemEmail: number;
  /** Destes, quantos são protegidos pela trava de opt-out e NÃO seriam apagados. */
  protegidosPorOptOut: number;
}

/**
 * O RAIO-X — quantos barrados de cada motivo, sem tocar em nada.
 *
 * As duas travas operacionais entram forçadas como LIGADAS (`canalPronto`,
 * `prospeccaoLiberada`), pela mesma razão de `conferirElegibilidadeReal`: senão
 * o raio-x mostraria 100% dos contatos barrados por `CANAL_INDISPONIVEL` e
 * esconderia todos os motivos que são DO CONTATO — que é justamente o que a
 * gaveta existe para mostrar.
 *
 * ⚠️ E é por isso que o raio-x não responde "por que a fila da tela está
 * vazia": a fila usa o estado real do canal, e o raio-x usa a hipótese. As duas
 * perguntas são diferentes e as duas têm resposta própria.
 */
export async function raioXDaGaveta(
  db: Cliente,
  opcoes: { agora?: Date; teto?: number } = {},
): Promise<RaioXDaGaveta> {
  const agora = opcoes.agora ?? new Date();
  const teto = opcoes.teto ?? TETO_DE_VARREDURA_DO_RAIO_X;

  const config = await db.prospeccaoConfig.findUnique({ where: { id: "singleton" } });
  const descansoHoras = Math.max(
    REGRA.descansoHoras,
    config?.horasEntreAbordagens ?? REGRA.descansoHoras,
  );

  const pendentes = await db.itemDeProspeccao.count({ where: { situacao: "PENDENTE" } });

  const contagem = new Map<LeadBlockReason, number>();
  let avaliados = 0;
  let liberados = 0;
  let barrados = 0;
  let semWhatsappNemEmail = 0;
  let protegidosPorOptOut = 0;
  let pagina = 0;
  let acabou = false;

  while (!acabou && avaliados < teto) {
    const itens = await db.itemDeProspeccao.findMany({
      where: { situacao: "PENDENTE" },
      orderBy: { criadoEm: "asc" },
      skip: pagina * TAMANHO_DA_PAGINA,
      take: TAMANHO_DA_PAGINA,
      include: { lote: { select: { id: true, proveniencia: true } } },
    });

    if (itens.length === 0) {
      acabou = true;
      break;
    }

    for (const item of itens) {
      if (avaliados >= teto) break;

      const lead = await lerOptOutDoItem(db, item);

      const decisao = avaliarAbordagemDeProspeccao({
        telefone: item.whatsapp,
        optOutAt: lead?.optOutAt ?? null,
        tentativas: 0,
        ultimoContatoEm: lead?.lastContactedAt ?? null,
        historicoConhecido: true,
        canalPronto: true,
        prospeccaoLiberada: true,
        baseLegalDeclarada: item.lote.proveniencia,
        descansoHoras,
        agora,
      });

      avaliados += 1;
      if (decisao.sendable) liberados += 1;
      else {
        barrados += 1;
        if (decisao.reason) {
          contagem.set(decisao.reason, (contagem.get(decisao.reason) ?? 0) + 1);
        }
      }

      if (ehInutil(item)) {
        semWhatsappNemEmail += 1;
        if (lead?.optOutAt) protegidosPorOptOut += 1;
      }
    }

    if (itens.length < TAMANHO_DA_PAGINA) acabou = true;
    pagina += 1;
  }

  const porMotivo: MotivoNaGaveta[] = [...contagem.entries()]
    .map(([motivo, quantidade]) => ({
      motivo,
      rotulo: ROTULO_DO_MOTIVO[motivo],
      quantidade,
      passaSozinho: bloqueioPassaSozinho(motivo),
      terminal: motivoEhTerminal(motivo),
    }))
    .sort((a, b) => b.quantidade - a.quantidade);

  return {
    pendentes,
    avaliados,
    liberados,
    barrados,
    varreuTudo: acabou,
    porMotivo,
    semWhatsappNemEmail,
    protegidosPorOptOut,
  };
}

export interface ResultadoDoArquivamento {
  avaliados: number;
  arquivados: number;
  porMotivo: { motivo: LeadBlockReason; rotulo: string; quantidade: number }[];
}

/**
 * ARQUIVAR os barrados terminais — a gaveta de verdade, com o motivo legível
 * gravado em `ItemDeProspeccao.motivo` e a situação em `RECUSADO`.
 *
 * ── POR QUE NÃO NASCEU TABELA NOVA ──────────────────────────────────────────
 *
 * Porque a gaveta já existia e ninguém estava usando: `SituacaoDoItem.RECUSADO`
 * ("não entra: opt-out anterior, telefone inválido, fora de critério") e a
 * coluna `motivo`, ambas no schema desde o começo. Uma tabela nova de
 * "barrados" seria um segundo lugar dizendo a mesma coisa sobre o mesmo
 * contato — e a que ninguém lembra de atualizar no dia em que a regra mudar.
 *
 * ── ⛔ E POR QUE SÓ OS TERMINAIS ────────────────────────────────────────────
 *
 * Arquivar quem está barrado por horário, descanso ou canal desligado
 * apagaria a base às 8h da manhã e não sobraria ninguém para a rodada das 9h.
 * `bloqueioPassaSozinho` já distingue os dois casos, e a distinção é a mesma
 * usada em todo lugar.
 */
export async function arquivarBarradosTerminais(
  db: Cliente,
  opcoes: { agora?: Date; teto?: number } = {},
): Promise<ResultadoDoArquivamento> {
  const agora = opcoes.agora ?? new Date();
  const teto = opcoes.teto ?? TETO_DE_VARREDURA_DO_RAIO_X;

  const config = await db.prospeccaoConfig.findUnique({ where: { id: "singleton" } });
  const descansoHoras = Math.max(
    REGRA.descansoHoras,
    config?.horasEntreAbordagens ?? REGRA.descansoHoras,
  );

  const contagem = new Map<LeadBlockReason, number>();
  const aArquivar: { id: string; motivo: LeadBlockReason; detalhe: string }[] = [];
  let avaliados = 0;
  let pagina = 0;

  // ── PRIMEIRO LÊ TUDO, DEPOIS ESCREVE ──────────────────────────────────────
  //
  // Escrever no meio da paginação move o chão: cada item que sai de `PENDENTE`
  // encurta a lista, e o `skip` da página seguinte passa a pular itens que
  // ninguém olhou. Ler inteiro e só então gravar custa uma passagem a mais e
  // não perde ninguém.
  for (;;) {
    if (avaliados >= teto) break;
    const itens = await db.itemDeProspeccao.findMany({
      where: { situacao: "PENDENTE" },
      orderBy: { criadoEm: "asc" },
      skip: pagina * TAMANHO_DA_PAGINA,
      take: TAMANHO_DA_PAGINA,
      include: { lote: { select: { id: true, proveniencia: true } } },
    });
    if (itens.length === 0) break;

    for (const item of itens) {
      if (avaliados >= teto) break;
      avaliados += 1;

      const lead = await lerOptOutDoItem(db, item);
      const decisao = avaliarAbordagemDeProspeccao({
        telefone: item.whatsapp,
        optOutAt: lead?.optOutAt ?? null,
        tentativas: 0,
        ultimoContatoEm: lead?.lastContactedAt ?? null,
        historicoConhecido: true,
        canalPronto: true,
        prospeccaoLiberada: true,
        baseLegalDeclarada: item.lote.proveniencia,
        descansoHoras,
        agora,
      });

      if (decisao.sendable || !decisao.reason) continue;
      if (!motivoEhTerminal(decisao.reason)) continue;
      aArquivar.push({ id: item.id, motivo: decisao.reason, detalhe: decisao.detail });
    }

    if (itens.length < TAMANHO_DA_PAGINA) break;
    pagina += 1;
  }

  let arquivados = 0;
  for (const alvo of aArquivar) {
    // `updateMany` com a situação no filtro: se uma rodada materializou o item
    // entre a leitura e a escrita, o arquivamento não desfaz o que ela fez —
    // ele simplesmente não acha ninguém para atualizar.
    const r = await db.itemDeProspeccao.updateMany({
      where: { id: alvo.id, situacao: "PENDENTE" },
      data: {
        situacao: "RECUSADO",
        motivo: `${ROTULO_DO_MOTIVO[alvo.motivo]} — ${alvo.detalhe}`,
        processadoEm: agora,
      },
    });
    if (r.count === 0) continue;
    arquivados += 1;
    contagem.set(alvo.motivo, (contagem.get(alvo.motivo) ?? 0) + 1);
  }

  return {
    avaliados,
    arquivados,
    porMotivo: [...contagem.entries()].map(([motivo, quantidade]) => ({
      motivo,
      rotulo: ROTULO_DO_MOTIVO[motivo],
      quantidade,
    })),
  };
}

export interface ContagemDoDescarte {
  /** Quantos itens a varredura leu. */
  avaliados: number;
  /** Sem WhatsApp plausível E sem e-mail. */
  candidatos: number;
  /** Destes, quantos a trava de opt-out protege — nunca são apagados. */
  protegidosPorOptOut: number;
  /** `candidatos - protegidosPorOptOut`. O número que o CEO vê ANTES de mandar apagar. */
  apagaveis: number;
}

export interface ResultadoDoDescarte extends ContagemDoDescarte {
  /** Quantos itens existiam na Base fria antes. */
  antes: number;
  /** Quantos foram de fato apagados. `0` quando `confirmar` não veio. */
  apagados: number;
  /** Quantos existem depois. Igual a `antes` quando nada foi confirmado. */
  depois: number;
  /** `false` = isto foi só uma contagem; nada foi apagado. */
  confirmado: boolean;
}

/**
 * O DESCARTE DEFINITIVO — contato sem WhatsApp válido E sem e-mail sai da base.
 *
 * ── ⛔ NUNCA AUTOMÁTICO, NUNCA SILENCIOSO ──────────────────────────────────
 *
 * Sem `confirmar: true` esta função **conta e vai embora**. É a régua da casa
 * para tudo que destrói: o CEO manda rodar, a operação diz quantos vai apagar,
 * e só então apaga. Nenhum agendador chama isto.
 *
 * ── ⛔⛔ E O OPT-OUT SOBREVIVE ─────────────────────────────────────────────
 *
 * Ver o cabeçalho do arquivo: apagar um opt-out é apagar a memória de que ele
 * mandou parar, e o resultado prático é abordá-lo de novo na próxima lista. O
 * filtro está aqui, em código, e tem teste.
 */
export async function descartarSemWhatsappNemEmail(
  db: Cliente,
  opcoes: { confirmar?: boolean; teto?: number } = {},
): Promise<ResultadoDoDescarte> {
  const teto = opcoes.teto ?? TETO_DE_VARREDURA_DO_RAIO_X;
  const confirmar = opcoes.confirmar === true;

  const antes = await db.itemDeProspeccao.count();

  const aApagar: string[] = [];
  let avaliados = 0;
  let candidatos = 0;
  let protegidosPorOptOut = 0;
  let pagina = 0;

  // A varredura é toda a base, não só os PENDENTE: um item já RECUSADO sem
  // telefone e sem e-mail é exatamente o "guardar coisa" que a ordem manda
  // parar de fazer.
  for (;;) {
    if (avaliados >= teto) break;
    const itens = await db.itemDeProspeccao.findMany({
      orderBy: { criadoEm: "asc" },
      skip: pagina * TAMANHO_DA_PAGINA,
      take: TAMANHO_DA_PAGINA,
    });
    if (itens.length === 0) break;

    for (const item of itens) {
      if (avaliados >= teto) break;
      avaliados += 1;
      if (!ehInutil(item)) continue;

      candidatos += 1;
      const lead = await lerOptOutDoItem(db, item);
      if (lead?.optOutAt) {
        protegidosPorOptOut += 1;
        continue;
      }
      aApagar.push(item.id);
    }

    if (itens.length < TAMANHO_DA_PAGINA) break;
    pagina += 1;
  }

  const apagaveis = aApagar.length;

  if (!confirmar || apagaveis === 0) {
    return {
      avaliados,
      candidatos,
      protegidosPorOptOut,
      apagaveis,
      antes,
      apagados: 0,
      depois: antes,
      confirmado: false,
    };
  }

  const r = await db.itemDeProspeccao.deleteMany({ where: { id: { in: aApagar } } });
  const depois = await db.itemDeProspeccao.count();

  return {
    avaliados,
    candidatos,
    protegidosPorOptOut,
    apagaveis,
    antes,
    apagados: r.count,
    depois,
    confirmado: true,
  };
}

/** Sem WhatsApp plausível E sem e-mail = não há como falar com esta pessoa. */
export function ehInutil(item: { whatsapp: string | null; email?: string | null }): boolean {
  return !telefonePlausivel(item.whatsapp) && !emailPlausivel(item.email ?? null);
}

/** Lê o opt-out do item — pelo lead vinculado, ou pela cauda do telefone. */
async function lerOptOutDoItem(
  db: Cliente,
  item: { leadId: string | null; whatsappDigits: string },
): Promise<{ optOutAt: Date | null; lastContactedAt: Date | null } | null> {
  if (item.leadId) {
    return db.siteLead.findUnique({
      where: { id: item.leadId },
      select: { id: true, optOutAt: true, lastContactedAt: true },
    });
  }
  return acharLeadPeloTelefone(db, item.whatsappDigits);
}
