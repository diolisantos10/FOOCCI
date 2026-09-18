/**
 * A LIMPEZA DAS CONVERSAS — ordem do CEO, 18/09/2026.
 *
 * *"Eu quero toda essa parte de atendimento zerada de conversa. (...) Todas as
 * conversas apagadas. Os contatos continuam lá na lista de contatos frios."*
 *
 * ── O QUE ELA APAGA ─────────────────────────────────────────────────────────
 *   · `lead_mensagens` (e, por cascata do banco, o que pendura nelas: veredito
 *     da Supervisora, revisão retrospectiva da Academia);
 *   · as travas da conversa em curso (`travas_da_conversa`);
 *   · as execuções de reabordagem (`reabordagem_execucao`);
 *   · as reservas da trava anti-repetição — impressão de conteúdo, ritmo e o
 *     livro de recusas (`trava_abordagem_*`);
 *   · e ZERA os contadores que barram a reabordagem por causa do histórico
 *     (`lastContactedAt`, `ultimaMensagemEm`, o espelho da última mensagem,
 *     `naoLidas`, `primeiraRespostaEm`, `slaVenceEm`).
 *
 * `tentativas` não é coluna: é `count(lead_mensagens WHERE direcao = SAIDA)`,
 * lido por `prospeccao/selecao.ts`. Apagar as mensagens zera o contador — não
 * existe outro lugar para zerar, e é por isso que ele não aparece aqui.
 *
 * ── ⛔ O QUE ELA NÃO APAGA, E NÃO É NEGOCIÁVEL ──────────────────────────────
 *   · **O CONTATO** (`site_leads`). Ele fica, na base fria.
 *   · **O OPT-OUT** (`optOutAt`, `optOutCanal`). A conversa da pessoa some; a
 *     marca de "não me mande mais" FICA. Apagar a prova do pedido de silêncio
 *     faz a pessoa voltar a receber mensagem — LGPD e denúncia na Meta, o que
 *     derruba o número da empresa inteira.
 *   · **OS LEADS DE CAMPANHA** (`fonte = CAMPANHA_PAGA` e os códigos listados
 *     em `CODIGOS_PRESERVADOS`) e as conversas deles — são os que vamos
 *     atender agora.
 *
 * ── ⚠️ FAIL-CLOSED: A CÓPIA VEM ANTES ──────────────────────────────────────
 * Cada lote grava em `conversas_arquivadas` e só apaga depois de CONFERIR que
 * o arquivo tem a linha. Se a cópia falhar — ou vier incompleta — o lote para
 * e nada é apagado. Perder o histórico sem cópia é irreversível.
 *
 * ── RETOMÁVEL, POR DESENHO ──────────────────────────────────────────────────
 * Não há transação única: são 7.638 conversas e a conexão já caiu numa operação
 * em massa. Cada lote é fechado em si. O arquivo usa o id original como chave
 * primária, então rodar de novo não duplica nada, e o que já foi apagado
 * simplesmente não aparece mais no alvo.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

type Cliente = PrismaClient;

/** Os três leads de campanha que estamos prestes a atender. Não se toca. */
export const CODIGOS_PRESERVADOS = ["HQ4YF", "337AN", "6G9EV"] as const;

export const TAMANHO_DO_LOTE_PADRAO = 500;

export type OpcoesDaLimpeza = {
  /** `false` (padrão) = ensaio: conta e NÃO escreve nada. */
  apagar?: boolean;
  tamanhoDoLote?: number;
  /** Teto de lotes por chamada, para a rota devolver antes do tempo esgotar. */
  maxLotes?: number;
  /** Identificador desta execução, gravado em cada linha arquivada. */
  loteDaLimpeza?: string;
};

export type RelatorioDaLimpeza = {
  ensaio: boolean;
  loteDaLimpeza: string;
  /** `true` quando ainda sobrou conversa no alvo — chame a rota de novo. */
  faltaRodarDeNovo: boolean;
  conversas: { noAlvo: number; arquivadas: number; apagadas: number };
  preservado: {
    contatos: number;
    optOuts: number;
    leadsDeCampanha: number;
    conversasDeCampanha: number;
  };
  zerados: {
    contadoresDeContato: number;
    travasDaConversa: number;
    execucoesDeReabordagem: number;
    travaImpressaoDeConteudo: number;
    travaDeRitmo: number;
    travaRecusas: number;
  };
  arquivo: {
    tabela: string;
    comoSeLe: string;
    linhasNoArquivo: number;
  };
};

/**
 * Os ids dos leads que NÃO podem ser tocados: campanha paga e os três códigos.
 *
 * Lido do banco, e não fixado no código, porque o casamento código ↔ id é dado,
 * não constante. Na dúvida sobre quem é de campanha, o alvo encolhe — nunca
 * cresce.
 */
export async function idsPreservados(db: Cliente): Promise<string[]> {
  const leads = await db.siteLead.findMany({
    where: {
      OR: [
        { fonte: "CAMPANHA_PAGA" },
        { codigo: { in: [...CODIGOS_PRESERVADOS] } },
      ],
    },
    select: { id: true },
  });
  return leads.map((l) => l.id);
}

/** O filtro do alvo: tudo que NÃO é lead preservado. */
function alvoDeMensagens(preservados: string[]): Prisma.LeadMensagemWhereInput {
  return preservados.length ? { leadId: { notIn: preservados } } : {};
}

export async function limparConversas(
  db: Cliente,
  opcoes: OpcoesDaLimpeza = {},
): Promise<RelatorioDaLimpeza> {
  const apagar = opcoes.apagar === true;
  const tamanhoDoLote = Math.max(1, Math.min(opcoes.tamanhoDoLote ?? TAMANHO_DO_LOTE_PADRAO, 2000));
  const maxLotes = Math.max(1, opcoes.maxLotes ?? 40);
  const loteDaLimpeza = opcoes.loteDaLimpeza ?? `limpeza-${new Date().toISOString()}`;

  const preservados = await idsPreservados(db);
  const alvo = alvoDeMensagens(preservados);

  const [noAlvo, contatos, optOuts, conversasDeCampanha] = await Promise.all([
    db.leadMensagem.count({ where: alvo }),
    db.siteLead.count(),
    db.siteLead.count({ where: { optOutAt: { not: null } } }),
    preservados.length
      ? db.leadMensagem.count({ where: { leadId: { in: preservados } } })
      : Promise.resolve(0),
  ]);

  const relatorio: RelatorioDaLimpeza = {
    ensaio: !apagar,
    loteDaLimpeza,
    faltaRodarDeNovo: false,
    conversas: { noAlvo, arquivadas: 0, apagadas: 0 },
    preservado: {
      contatos,
      optOuts,
      leadsDeCampanha: preservados.length,
      conversasDeCampanha,
    },
    zerados: {
      contadoresDeContato: 0,
      travasDaConversa: 0,
      execucoesDeReabordagem: 0,
      travaImpressaoDeConteudo: 0,
      travaDeRitmo: 0,
      travaRecusas: 0,
    },
    arquivo: {
      tabela: "conversas_arquivadas",
      comoSeLe:
        'SELECT "ocorreuEm", direcao, autor, texto FROM conversas_arquivadas ' +
        'WHERE "leadWhatsappDigits" = \'55...\' ORDER BY "ocorreuEm";',
      linhasNoArquivo: 0,
    },
  };

  if (!apagar) {
    // ENSAIO: só conta o que APAGARIA. Nada é escrito — nem o arquivo.
    const [travas, reabordagens, impressoes, ritmos, recusas, jaArquivadas] = await Promise.all([
      db.travaDaConversa.count(contarFora(preservados)),
      db.reabordagemExecucao.count(contarFora(preservados)),
      db.travaDeAbordagemEnviada.count(),
      db.travaDeAbordagemRitmo.count(),
      db.travaDeAbordagemRecusa.count(),
      db.conversaArquivada.count(),
    ]);
    relatorio.zerados = {
      contadoresDeContato: preservados.length ? contatos - preservados.length : contatos,
      travasDaConversa: travas,
      execucoesDeReabordagem: reabordagens,
      travaImpressaoDeConteudo: impressoes,
      travaDeRitmo: ritmos,
      travaRecusas: recusas,
    };
    relatorio.arquivo.linhasNoArquivo = jaArquivadas;
    return relatorio;
  }

  // ── APAGANDO. Lote a lote, cópia antes, e a conferência entre as duas. ────
  for (let volta = 0; volta < maxLotes; volta += 1) {
    const mensagens = await db.leadMensagem.findMany({
      where: alvo,
      orderBy: { id: "asc" },
      take: tamanhoDoLote,
      select: {
        id: true,
        leadId: true,
        direcao: true,
        tipo: true,
        status: true,
        autor: true,
        autorUserId: true,
        waMessageId: true,
        templateNome: true,
        texto: true,
        legenda: true,
        turnoId: true,
        papelDoAgente: true,
        origemDaFala: true,
        ocorreuEm: true,
        createdAt: true,
        lead: {
          select: { nome: true, whatsapp: true, whatsappDigits: true, codigo: true },
        },
      },
    });
    if (mensagens.length === 0) break;

    // 1. A CÓPIA. Se isto lançar, a exceção sobe e NADA foi apagado.
    await db.conversaArquivada.createMany({
      data: mensagens.map((m) => ({
        id: m.id,
        leadId: m.leadId,
        leadNome: m.lead?.nome ?? null,
        leadWhatsapp: m.lead?.whatsapp ?? null,
        leadWhatsappDigits: m.lead?.whatsappDigits ?? null,
        leadCodigo: m.lead?.codigo ?? null,
        direcao: String(m.direcao),
        tipo: String(m.tipo),
        status: String(m.status),
        autor: m.autor ? String(m.autor) : null,
        autorUserId: m.autorUserId ?? null,
        waMessageId: m.waMessageId ?? null,
        templateNome: m.templateNome ?? null,
        texto: m.texto ?? null,
        legenda: m.legenda ?? null,
        turnoId: m.turnoId ?? null,
        papelDoAgente: m.papelDoAgente ?? null,
        origemDaFala: m.origemDaFala ?? null,
        ocorreuEm: m.ocorreuEm,
        criadaEm: m.createdAt,
        loteDaLimpeza,
      })),
      skipDuplicates: true,
    });

    // 2. A CONFERÊNCIA. Não se confia no retorno do createMany: pergunta-se ao
    //    arquivo se cada linha está lá. Faltando uma, o lote para e não apaga.
    const ids = mensagens.map((m) => m.id);
    const conferidas = await db.conversaArquivada.count({ where: { id: { in: ids } } });
    if (conferidas !== ids.length) {
      throw new Error(
        `cópia incompleta: ${conferidas} de ${ids.length} conversas no arquivo — ` +
          "nada foi apagado neste lote (fail-closed).",
      );
    }
    relatorio.conversas.arquivadas += ids.length;

    // 3. Só agora se apaga.
    const apagadas = await db.leadMensagem.deleteMany({ where: { id: { in: ids } } });
    relatorio.conversas.apagadas += apagadas.count;
  }

  relatorio.faltaRodarDeNovo = (await db.leadMensagem.count({ where: alvo })) > 0;

  // ── As travas e os contadores só caem quando as conversas já saíram. ──────
  if (!relatorio.faltaRodarDeNovo) {
    const travas = await db.travaDaConversa.deleteMany(contarFora(preservados));
    const reabordagens = await db.reabordagemExecucao.deleteMany(
      contarFora(preservados),
    );

    // As três travas anti-repetição são por TELEFONE, não por lead. Poupa-se o
    // telefone dos leads de campanha; o resto cai, senão 14 de cada 40 seguiriam
    // recusados por um histórico que não existe mais.
    const telefones = await telefonesPreservados(db, preservados);
    const foraDosTelefones: { where: { telefoneDigits?: { notIn: string[] } } } = {
      where: telefones.length ? { telefoneDigits: { notIn: telefones } } : {},
    };

    const impressoes = await db.travaDeAbordagemEnviada.deleteMany(foraDosTelefones);
    const ritmos = await db.travaDeAbordagemRitmo.deleteMany(foraDosTelefones);
    const recusas = await db.travaDeAbordagemRecusa.deleteMany(foraDosTelefones);

    // ⛔ `optOutAt` e `optOutCanal` NÃO estão nesta lista, e é a razão de ela
    // existir escrita campo a campo em vez de um update genérico.
    const contadores = await db.siteLead.updateMany({
      where: preservados.length ? { id: { notIn: preservados } } : {},
      data: {
        lastContactedAt: null,
        lastInteractionAt: null,
        ultimaMensagemEm: null,
        ultimaMensagemTexto: null,
        ultimaMensagemDeQuem: null,
        naoLidas: 0,
        primeiraRespostaEm: null,
        slaVenceEm: null,
      },
    });

    relatorio.zerados = {
      contadoresDeContato: contadores.count,
      travasDaConversa: travas.count,
      execucoesDeReabordagem: reabordagens.count,
      travaImpressaoDeConteudo: impressoes.count,
      travaDeRitmo: ritmos.count,
      travaRecusas: recusas.count,
    };
  }

  relatorio.arquivo.linhasNoArquivo = await db.conversaArquivada.count();
  relatorio.preservado.optOuts = await db.siteLead.count({ where: { optOutAt: { not: null } } });
  relatorio.preservado.contatos = await db.siteLead.count();
  return relatorio;
}

/** `where` que exclui os leads preservados — ou nenhum filtro, quando não há. */
function contarFora(preservados: string[]): { where: { leadId?: { notIn: string[] } } } {
  return { where: preservados.length ? { leadId: { notIn: preservados } } : {} };
}

async function telefonesPreservados(db: Cliente, preservados: string[]): Promise<string[]> {
  if (!preservados.length) return [];
  const leads = await db.siteLead.findMany({
    where: { id: { in: preservados } },
    select: { whatsappDigits: true },
  });
  return leads.map((l) => l.whatsappDigits).filter((t): t is string => !!t && t.length > 0);
}
