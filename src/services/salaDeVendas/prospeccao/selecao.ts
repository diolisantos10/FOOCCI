/**
 * A SELEÇÃO DA PROSPECÇÃO — quem seria abordado hoje, e por que só esses.
 *
 * ── ⚠️ ESTE ARQUIVO NÃO ESCREVE NADA. LEIA ISTO ANTES DE MUDÁ-LO ────────────
 *
 * A primeira versão criava o lead e marcava o item como usado **enquanto
 * montava a lista**. Parecia inofensivo e destruía a base: cada abertura da
 * tela consumia um pedaço da lista, tirava os itens de PENDENTE para sempre e
 * criava leads — inclusive dos BARRADOS, inclusive com o canal desligado, sem
 * falar com ninguém. Cinco recarregamentos queimavam cem contatos.
 *
 * Pior: o commit que a introduziu vendia esse modo — prospecção ligada, envio
 * desligado — como "o estado certo para conferir a lista antes da estreia".
 * A tela de conferência era a que mais estragava.
 *
 * A regra que ficou: **montar a fila é LEITURA.** Materializar o lead é outro
 * ato, com nome próprio (`materializarLead`), chamado por quem vai de fato
 * abordar — nunca por quem só está olhando.
 *
 * ── E QUEM ENVIA? ───────────────────────────────────────────────────────────
 *
 * Ninguém, aqui. A entrega continua em `salaDeVendas/entrega.ts`, atrás de
 * `FOOCCI_SDR_SEND_ENABLED`, que é chave do dono.
 */

import type { PrismaClient, Prisma } from "@prisma/client";
import {
  avaliarAbordagemDeProspeccao,
  type LeadSafetyDecision,
} from "@/services/foocci-sdr/LeadContactSafety";

type Cliente = PrismaClient | Prisma.TransactionClient;

export interface CandidatoAAbordagem {
  itemId: string;
  loteId: string;
  /** `null` enquanto o item ainda não foi materializado — e isso é normal. */
  leadId: string | null;
  nome: string | null;
  whatsapp: string;
  decisao: LeadSafetyDecision;
}

export interface FilaDeProspeccao {
  liberados: CandidatoAAbordagem[];
  barrados: CandidatoAAbordagem[];
  motivoDaFilaVazia: string | null;
  usadosHoje: number;
  tetoDoDia: number;
}

/**
 * Monta a fila do dia. **Somente leitura.**
 *
 * ── POR QUE O TETO É CONTADO NO BANCO ───────────────────────────────────────
 *
 * Duas instâncias do app com um contador em memória cada uma entregariam o
 * dobro do teto sem ninguém perceber — e o dobro do teto num canal de WhatsApp
 * é como se perde um número. O teto só é teto se todo mundo ler do mesmo lugar.
 */
export async function montarFilaDeProspeccao(
  db: Cliente,
  opcoes: { canalPronto: boolean; agora?: Date; limite?: number } = {
    canalPronto: false,
  },
): Promise<FilaDeProspeccao> {
  const agora = opcoes.agora ?? new Date();

  const config = await db.prospeccaoConfig.findUnique({
    where: { id: "singleton" },
  });

  // Sem configuração nenhuma a resposta é "desligada" — e não "sem limite".
  const ligada = Boolean(config?.outboundLigado) && !config?.pausadoEm;
  const tetoDoDia = config?.limiteDiario ?? 0;
  const descansoHoras = config?.horasEntreAbordagens;

  const usadosHoje = await contarAbordagensDeHoje(db, agora);
  const cabeNoTeto = Math.max(0, tetoDoDia - usadosHoje);

  const vazia = (motivo: string): FilaDeProspeccao => ({
    liberados: [],
    barrados: [],
    motivoDaFilaVazia: motivo,
    usadosHoje,
    tetoDoDia,
  });

  if (!ligada) {
    return vazia(
      config?.pausadoEm
        ? `Prospecção pausada${config.motivo ? `: ${config.motivo}` : "."}`
        : "Prospecção desligada.",
    );
  }
  if (cabeNoTeto <= 0) {
    return vazia(`Teto do dia atingido (${usadosHoje}/${tetoDoDia}).`);
  }

  const quantos = Math.min(cabeNoTeto, opcoes.limite ?? cabeNoTeto);

  const itens = await db.itemDeProspeccao.findMany({
    where: { situacao: "PENDENTE", lote: { situacao: "LIBERADO" } },
    orderBy: { criadoEm: "asc" },
    take: quantos,
    include: {
      lote: { select: { id: true, proveniencia: true, limiteDiario: true } },
    },
  });

  const liberados: CandidatoAAbordagem[] = [];
  const barrados: CandidatoAAbordagem[] = [];

  /** Quantos já entraram na fila por lote, para o teto do lote também valer. */
  const porLote = new Map<string, number>();

  for (const item of itens) {
    // Leitura, nunca criação: se o contato já é lead, aproveitamos o histórico
    // dele; se não é, avaliamos com histórico zero — que é a verdade.
    const lead = await lerLeadDoItem(db, item);

    const tetoDoLote = item.lote.limiteDiario ?? 0;
    const jaNoLote = porLote.get(item.loteId) ?? 0;

    const decisao =
      tetoDoLote > 0 && jaNoLote >= tetoDoLote
        ? {
            sendable: false as const,
            reason: "PROSPECCAO_DESLIGADA" as const,
            detail: `Teto do lote atingido (${jaNoLote}/${tetoDoLote}).`,
          }
        : avaliarAbordagemDeProspeccao({
            telefone: item.whatsapp,
            optOutAt: lead?.optOutAt ?? null,
            tentativas: lead?.tentativas ?? 0,
            ultimoContatoEm: lead?.lastContactedAt ?? null,
            // Verdadeiro porque os três campos acima saíram do banco agora: ou
            // o lead existe e foi lido, ou ele não existe e o histórico é
            // genuinamente zero.
            historicoConhecido: true,
            canalPronto: opcoes.canalPronto,
            prospeccaoLiberada: true,
            baseLegalDeclarada: item.lote.proveniencia,
            descansoHoras,
            agora,
          });

    const candidato: CandidatoAAbordagem = {
      itemId: item.id,
      loteId: item.loteId,
      leadId: lead?.id ?? null,
      nome: item.nome,
      whatsapp: item.whatsapp,
      decisao,
    };

    if (decisao.sendable) {
      liberados.push(candidato);
      porLote.set(item.loteId, jaNoLote + 1);
    } else {
      barrados.push(candidato);
    }
  }

  return {
    liberados,
    barrados,
    motivoDaFilaVazia:
      liberados.length === 0 && barrados.length === 0
        ? "Nenhum item pendente em lote liberado."
        : null,
    usadosHoje,
    tetoDoDia,
  };
}

interface LeadDoItem {
  id: string;
  optOutAt: Date | null;
  lastContactedAt: Date | null;
  tentativas: number;
}

/** Lê o lead do item, se ele já existir. Não cria nada. */
async function lerLeadDoItem(
  db: Cliente,
  item: { leadId: string | null; whatsappDigits: string },
): Promise<LeadDoItem | null> {
  const achado = item.leadId
    ? await db.siteLead.findUnique({
        where: { id: item.leadId },
        select: { id: true, optOutAt: true, lastContactedAt: true },
      })
    : await db.siteLead.findFirst({
        where: { whatsappDigits: item.whatsappDigits },
        select: { id: true, optOutAt: true, lastContactedAt: true },
      });

  if (!achado) return null;
  return { ...achado, tentativas: await contarTentativas(db, achado.id) };
}

/**
 * MATERIALIZA o item: cria (ou encontra) o lead e tira o item de PENDENTE.
 *
 * ── ⚠️ SÓ CHAME ISTO QUANDO FOR REALMENTE ABORDAR ───────────────────────────
 *
 * Este é o ato que consome a lista. Chamá-lo para montar tela, para prévia, ou
 * "só para já deixar pronto" é o defeito que esta refatoração existe para
 * matar: item que sai de PENDENTE sem ninguém ter falado com a pessoa é um
 * contato perdido em silêncio.
 *
 * ── E O QUE ELE DELIBERADAMENTE NÃO GRAVA ───────────────────────────────────
 *
 * `consentAt`. Nunca. Quem está numa lista de prospecção não consentiu com
 * nada, e gravar a data de hoje ali faria o sistema afirmar, para sempre e para
 * qualquer auditor, que esta pessoa nos procurou. O lead nasce com
 * `fonte: LISTA_PROSPECCAO`, que é a verdade: nós fomos atrás dele.
 */
export async function materializarLead(
  db: Cliente,
  itemId: string,
): Promise<{ ok: boolean; leadId?: string; motivo?: string }> {
  const item = await db.itemDeProspeccao.findUnique({
    where: { id: itemId },
    include: { lote: { select: { situacao: true } } },
  });

  if (!item) return { ok: false, motivo: "Item não encontrado." };
  if (item.lote.situacao !== "LIBERADO") {
    return { ok: false, motivo: "O lote deste contato não está liberado." };
  }
  if (item.situacao !== "PENDENTE") {
    // Idempotente: materializar duas vezes devolve o mesmo lead, não cria outro.
    return item.leadId
      ? { ok: true, leadId: item.leadId }
      : { ok: false, motivo: `Item em situação ${item.situacao}.` };
  }

  // ── ⚠️ RESERVAR ANTES DE CRIAR — A CORRIDA DOS DOIS SDRs ──────────────────
  //
  // Ler "está PENDENTE" e só depois criar o lead deixa uma janela entre as duas
  // operações. Dois SDRs clicando ao mesmo tempo (ou um clique duplo, ou duas
  // instâncias do app) passam os dois pela leitura, não encontram lead nenhum, e
  // criam **dois leads para o mesmo telefone** — dois donos para a mesma pessoa,
  // que é exatamente o que este desenho inteiro existe para impedir. E
  // `SiteLead.whatsappDigits` é índice, não único: o banco não segura.
  //
  // `updateMany` com o estado no `where` é comparar-e-trocar: **um** dos dois
  // recebe `count: 1` e segue; o outro recebe `count: 0` e lê o resultado de
  // quem ganhou. Trava de banco, não boa intenção de código.
  const reserva = await db.itemDeProspeccao.updateMany({
    where: { id: item.id, situacao: "PENDENTE" },
    data: { situacao: "VIROU_LEAD", processadoEm: new Date() },
  });

  if (reserva.count === 0) {
    const jaFeito = await db.itemDeProspeccao.findUnique({
      where: { id: item.id },
      select: { leadId: true },
    });
    return jaFeito?.leadId
      ? { ok: true, leadId: jaFeito.leadId }
      : { ok: false, motivo: "Outro atendimento está materializando este contato." };
  }

  try {
    const existente = await db.siteLead.findFirst({
      where: { whatsappDigits: item.whatsappDigits },
      select: { id: true },
    });

    if (existente) {
      await db.itemDeProspeccao.update({
        where: { id: item.id },
        data: {
          situacao: "DUPLICADO",
          leadId: existente.id,
          motivo: "Já existe como lead na base.",
        },
      });
      return { ok: true, leadId: existente.id };
    }

    const criado = await db.siteLead.create({
      data: {
        nome: item.nome ?? item.empresa ?? "Contato de prospecção",
        whatsapp: item.whatsapp,
        whatsappDigits: item.whatsappDigits,
        restaurante: item.empresa,
        cidade: item.cidade,
        tipo: item.tipo,
        fonte: "LISTA_PROSPECCAO",
        origem: "prospeccao",
        stage: "NOVO",
        atendidoPor: "NINGUEM",
        // consentAt fica NULO de propósito — ver o comentário acima.
      },
      select: { id: true },
    });

    await db.itemDeProspeccao.update({
      where: { id: item.id },
      data: { leadId: criado.id },
    });

    return { ok: true, leadId: criado.id };
  } catch (erro) {
    // ── DEVOLVER A RESERVA ──
    //
    // Sem isto, uma falha aqui deixaria o item marcado como VIROU_LEAD sem lead
    // nenhum: um contato que sai da fila para sempre e nunca é abordado — some
    // em silêncio, que é a pior forma de perder alguém da lista.
    await db.itemDeProspeccao.updateMany({
      where: { id: item.id, leadId: null },
      data: { situacao: "PENDENTE", processadoEm: null },
    });
    throw erro;
  }
}

/** Mensagens que a casa mandou para este lead. Saída, não entrada. */
async function contarTentativas(db: Cliente, leadId: string): Promise<number> {
  return db.leadMensagem.count({ where: { leadId, direcao: "SAIDA" } });
}

/** Abordagens de prospecção já feitas hoje, lidas do banco. */
async function contarAbordagensDeHoje(db: Cliente, agora: Date): Promise<number> {
  const inicioDoDia = new Date(agora);
  inicioDoDia.setHours(0, 0, 0, 0);

  return db.siteLead.count({
    where: { fonte: "LISTA_PROSPECCAO", lastContactedAt: { gte: inicioDoDia } },
  });
}
