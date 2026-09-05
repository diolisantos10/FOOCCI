/**
 * A SELEÇÃO DA PROSPECÇÃO — quem é abordado hoje, e por que só esses.
 *
 * ── O QUE ESTE ARQUIVO FAZ E O QUE ELE NÃO FAZ ──────────────────────────────
 *
 * Ele ESCOLHE e PREPARA: transforma item de lista em lead com proveniência,
 * aplica o portão de abordagem fria e devolve a fila do dia. Ele **não envia
 * mensagem** — quem entrega é `salaDeVendas/entrega.ts`, atrás da chave
 * `FOOCCI_SDR_SEND_ENABLED`, que continua sendo do dono.
 *
 * A separação é o que permite rodar isto em produção com a prospecção ligada e
 * o envio desligado: dá para ver exatamente quem SERIA abordado, conferir a
 * lista com olho humano, e só então ligar a entrega.
 *
 * ── A REGRA QUE GOVERNA O ARQUIVO INTEIRO ───────────────────────────────────
 *
 * Ausência de resposta nunca vira consentimento, e ausência de trava nunca vira
 * permissão. Toda porta aqui é fechada por padrão: prospecção nasce desligada,
 * teto nasce zero, lote nasce rascunho.
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
  leadId: string;
  nome: string | null;
  whatsapp: string;
  decisao: LeadSafetyDecision;
}

export interface FilaDeProspeccao {
  /** Passaram no portão. Prontos para o operador ou o SDR abordar. */
  liberados: CandidatoAAbordagem[];
  /** Reprovados, com o motivo — aparecem na tela, não somem. */
  barrados: CandidatoAAbordagem[];
  /** Por que a fila veio vazia, quando vier. */
  motivoDaFilaVazia: string | null;
  /** Quantos já foram abordados hoje, contra o teto. */
  usadosHoje: number;
  tetoDoDia: number;
}

/**
 * Monta a fila do dia.
 *
 * ── POR QUE O TETO É CONTADO NO BANCO, E NÃO EM MEMÓRIA ─────────────────────
 *
 * Duas instâncias do app rodando ao mesmo tempo com um contador em memória cada
 * uma entregariam o dobro do teto sem ninguém perceber — e "o dobro do teto" num
 * canal de WhatsApp é exatamente como se perde um número. O teto só é teto se
 * for lido do mesmo lugar por todo mundo.
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
    where: {
      situacao: "PENDENTE",
      lote: { situacao: "LIBERADO" },
    },
    orderBy: { criadoEm: "asc" },
    take: quantos,
    include: {
      lote: {
        select: { id: true, proveniencia: true, limiteDiario: true },
      },
    },
  });

  const liberados: CandidatoAAbordagem[] = [];
  const barrados: CandidatoAAbordagem[] = [];

  for (const item of itens) {
    const lead = await garantirLeadDoItem(db, item);

    const decisao = avaliarAbordagemDeProspeccao({
      telefone: item.whatsapp,
      optOutAt: lead.optOutAt,
      tentativas: lead.tentativas,
      ultimoContatoEm: lead.lastContactedAt,
      // Só é `true` porque acabamos de ler do banco os dois campos acima.
      historicoConhecido: true,
      canalPronto: opcoes.canalPronto,
      prospeccaoLiberada: true,
      baseLegalDeclarada: item.lote.proveniencia,
      agora,
    });

    const candidato: CandidatoAAbordagem = {
      itemId: item.id,
      loteId: item.loteId,
      leadId: lead.id,
      nome: item.nome,
      whatsapp: item.whatsapp,
      decisao,
    };

    if (decisao.sendable) liberados.push(candidato);
    else barrados.push(candidato);
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

/**
 * Encontra ou cria o lead do item, preservando a proveniência.
 *
 * ── ⚠️ O QUE ESTA FUNÇÃO DELIBERADAMENTE NÃO GRAVA ──────────────────────────
 *
 * `consentAt`. Nunca. Quem está numa lista de prospecção não consentiu com
 * nada, e gravar a data de hoje ali faria o sistema afirmar, para sempre e para
 * qualquer auditor, que esta pessoa nos procurou. Seria uma mentira gravada em
 * banco — a pior espécie, porque sobrevive a quem a escreveu.
 *
 * O lead nasce com `fonte: LISTA_PROSPECCAO`, e é essa marca que diz a verdade:
 * nós fomos atrás dele.
 */
async function garantirLeadDoItem(
  db: Cliente,
  item: {
    id: string;
    leadId: string | null;
    nome: string | null;
    whatsapp: string;
    whatsappDigits: string;
    empresa: string | null;
    cidade: string | null;
    tipo: string | null;
  },
): Promise<LeadDoItem> {
  const existentePorId = item.leadId
    ? await db.siteLead.findUnique({
        where: { id: item.leadId },
        select: { id: true, optOutAt: true, lastContactedAt: true },
      })
    : null;

  const existente =
    existentePorId ??
    (await db.siteLead.findFirst({
      where: { whatsappDigits: item.whatsappDigits },
      select: { id: true, optOutAt: true, lastContactedAt: true },
    }));

  if (existente) {
    // Sem esta marcação o item voltaria PENDENTE em toda rodada: a fila do dia
    // gastaria o teto relendo os mesmos contatos e nunca alcançaria o resto da
    // lista. O item já cumpriu seu papel — encontrou a carteira.
    await db.itemDeProspeccao.update({
      where: { id: item.id },
      data: {
        situacao: "VIROU_LEAD",
        leadId: existente.id,
        processadoEm: new Date(),
      },
    });
    return { ...existente, tentativas: await contarTentativas(db, existente.id) };
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
    select: { id: true, optOutAt: true, lastContactedAt: true },
  });

  await db.itemDeProspeccao.update({
    where: { id: item.id },
    data: { situacao: "VIROU_LEAD", leadId: criado.id, processadoEm: new Date() },
  });

  return { ...criado, tentativas: 0 };
}

/** Mensagens que a casa mandou para este lead. Saída, não entrada. */
async function contarTentativas(db: Cliente, leadId: string): Promise<number> {
  return db.leadMensagem.count({
    where: { leadId, direcao: "SAIDA" },
  });
}

/** Abordagens de prospecção já feitas hoje, lidas do banco. */
async function contarAbordagensDeHoje(db: Cliente, agora: Date): Promise<number> {
  const inicioDoDia = new Date(agora);
  inicioDoDia.setHours(0, 0, 0, 0);

  return db.siteLead.count({
    where: {
      fonte: "LISTA_PROSPECCAO",
      lastContactedAt: { gte: inicioDoDia },
    },
  });
}
