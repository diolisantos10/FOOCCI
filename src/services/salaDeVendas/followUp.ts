/**
 * TAREFAS, FOLLOW-UP E CADÊNCIA.
 *
 * ── A FRASE DO COMANDO QUE É O CRITÉRIO INTEIRO ─────────────────────────────
 *
 * Item 11: *"Nenhum lead em aberto deve ficar sem responsável e sem próxima
 * ação."*
 *
 * Um lead sem próxima ação não aparece em fila nenhuma. Ele não está atrasado,
 * não está vencido, não está esperando — ele simplesmente sumiu, e some de um
 * jeito que a tela chama de "tudo em dia". `semProximaAcao()` existe para essa
 * fila ser visível, e é a consulta mais importante deste arquivo.
 *
 * ── O QUE ESTE ARQUIVO NÃO FAZ, DE PROPÓSITO ────────────────────────────────
 *
 * Não decide se PODE falar com a pessoa. Quem responde isso é
 * `foocci-sdr/LeadContactSafety.ts`, que já trata opt-out, janela de horário,
 * telefone implausível e limite de toques — e é o mesmo portão que o SDR usa.
 * Duplicar essa regra aqui criaria dois lugares para consertar no dia em que a
 * LGPD apertar, e um deles ficaria para trás.
 *
 * Aqui só se agenda o QUE fazer e QUANDO. Se o toque pode sair é pergunta do
 * portão, feita no momento de sair — não no momento de agendar, porque entre os
 * dois a pessoa pode ter pedido silêncio.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import type { TipoDeTarefa, AutorDaMensagem } from "@prisma/client";

type Cliente = PrismaClient | Prisma.TransactionClient;

// ── Tarefas ──────────────────────────────────────────────────────────────────

export interface NovaTarefa {
  leadId: string;
  titulo: string;
  venceEm: Date;
  tipo?: TipoDeTarefa;
  nota?: string | null;
  responsavelId?: string | null;
  criadaPor?: AutorDaMensagem;
  cadenciaId?: string | null;
}

export interface RecusaDeTarefa {
  campo: string;
  motivo: string;
}

export function validarTarefa(t: NovaTarefa, agora: Date): RecusaDeTarefa[] {
  const recusas: RecusaDeTarefa[] = [];

  if (!t.titulo?.trim()) {
    recusas.push({ campo: "titulo", motivo: "sem título ninguém sabe o que fazer quando ela vencer" });
  }

  if (!(t.venceEm instanceof Date) || Number.isNaN(t.venceEm.getTime())) {
    recusas.push({ campo: "venceEm", motivo: "toda tarefa tem prazo — sem prazo ela nunca aparece em fila nenhuma" });
    return recusas;
  }

  // Tarefa criada já vencida é aceita de propósito: "ligar hoje de manhã",
  // registrada à tarde, é um atraso real que precisa aparecer como atraso. O que
  // se recusa é o absurdo — prazo no ano passado é erro de digitação.
  const umAnoAtras = new Date(agora.getTime() - 365 * 86_400_000);
  if (t.venceEm < umAnoAtras) {
    recusas.push({ campo: "venceEm", motivo: "prazo há mais de um ano é engano de digitação" });
  }

  return recusas;
}

export type ResultadoDeCriar =
  | { ok: true; tarefaId: string }
  | { ok: false; recusas: RecusaDeTarefa[] };

/**
 * Cria a tarefa E atualiza a próxima ação do lead, na mesma transação.
 *
 * As duas juntas porque é o espelho que faz a fila funcionar: `proximaAcaoEm` na
 * linha do lead é o que a lista de conversas e o painel do gerente consultam. Se
 * a tarefa fosse criada sem atualizar o espelho, a fila de "sem próxima ação"
 * continuaria acusando um lead que acabou de ganhar uma.
 */
export async function criarTarefa(
  db: PrismaClient,
  t: NovaTarefa,
  agora: Date = new Date(),
): Promise<ResultadoDeCriar> {
  const recusas = validarTarefa(t, agora);
  if (recusas.length) return { ok: false, recusas };

  const id = await db.$transaction(async (tx) => {
    const criada = await tx.leadTarefa.create({
      data: {
        leadId: t.leadId,
        titulo: t.titulo.trim(),
        tipo: t.tipo ?? "FOLLOW_UP",
        nota: t.nota?.trim() || null,
        venceEm: t.venceEm,
        responsavelId: t.responsavelId ?? null,
        criadaPor: t.criadaPor ?? "HUMANO",
        cadenciaId: t.cadenciaId ?? null,
      },
      select: { id: true },
    });

    // O espelho aponta para a tarefa MAIS PRÓXIMA que ainda está aberta — não
    // para a última criada. Criar uma tarefa para daqui a 90 dias não pode
    // apagar da fila um follow-up que vence amanhã.
    const maisProxima = await tx.leadTarefa.findFirst({
      where: { leadId: t.leadId, situacao: "ABERTA" },
      orderBy: { venceEm: "asc" },
      select: { venceEm: true, titulo: true },
    });

    if (maisProxima) {
      await tx.siteLead.update({
        where: { id: t.leadId },
        data: {
          proximaAcaoEm: maisProxima.venceEm,
          proximaAcaoNota: maisProxima.titulo,
        },
      });
    }

    return criada.id;
  });

  return { ok: true, tarefaId: id };
}

export type ResultadoDeConcluir =
  | { ok: true; tarefaId: string }
  | { ok: false; causa: "naoExiste" | "jaFechada" };

/**
 * Conclui a tarefa e recalcula a próxima ação.
 *
 * A escrita é condicional em `situacao: "ABERTA"`: dois cliques no botão
 * "concluir" — o duplo-clique acidental é o gesto mais comum de todos — não
 * podem produzir duas conclusões, nem sobrescrever a data da primeira.
 */
export async function concluirTarefa(
  db: PrismaClient,
  params: { tarefaId: string; agora?: Date },
): Promise<ResultadoDeConcluir> {
  const agora = params.agora ?? new Date();

  const tarefa = await db.leadTarefa.findUnique({
    where: { id: params.tarefaId },
    select: { id: true, leadId: true, situacao: true },
  });
  if (!tarefa) return { ok: false, causa: "naoExiste" };

  const fechadas = await db.leadTarefa.updateMany({
    where: { id: params.tarefaId, situacao: "ABERTA" },
    data: { situacao: "CONCLUIDA", concluidaEm: agora },
  });

  if (fechadas.count !== 1) return { ok: false, causa: "jaFechada" };

  await recalcularProximaAcao(db, tarefa.leadId);
  return { ok: true, tarefaId: params.tarefaId };
}

/**
 * Reaponta `proximaAcaoEm` para a tarefa aberta mais próxima — ou limpa.
 *
 * Limpar é o caso perigoso, e é por isso que ele é explícito: um lead que perde
 * a última tarefa aberta SAI de todas as filas de cobrança. Ele passa a ser
 * exatamente o lead esquecido que o item 11 manda evitar — e é `semProximaAcao()`
 * que o traz de volta à superfície.
 */
export async function recalcularProximaAcao(db: Cliente, leadId: string): Promise<void> {
  const proxima = await db.leadTarefa.findFirst({
    where: { leadId, situacao: "ABERTA" },
    orderBy: { venceEm: "asc" },
    select: { venceEm: true, titulo: true },
  });

  await db.siteLead.update({
    where: { id: leadId },
    data: {
      proximaAcaoEm: proxima?.venceEm ?? null,
      proximaAcaoNota: proxima?.titulo ?? null,
    },
  });
}

// ── As filas de cobrança ─────────────────────────────────────────────────────

export interface LeadEmAtraso {
  leadId: string;
  nome: string;
  venceuEm: Date;
  minutosDeAtraso: number;
  titulo: string | null;
  responsavelId: string | null;
}

/** Leads cuja próxima ação já venceu. */
export async function followUpsVencidos(
  db: Cliente,
  agora: Date,
  escopo: Prisma.SiteLeadWhereInput = {},
): Promise<LeadEmAtraso[]> {
  const linhas = await db.siteLead.findMany({
    where: {
      AND: [
        escopo,
        {
          proximaAcaoEm: { not: null, lt: agora },
          stage: { notIn: ["GANHO", "PERDIDO"] },
        },
      ],
    },
    orderBy: { proximaAcaoEm: "asc" },
    take: 200,
    select: {
      id: true, nome: true, proximaAcaoEm: true,
      proximaAcaoNota: true, atendenteUserId: true,
    },
  });

  return linhas.map((l) => ({
    leadId: l.id,
    nome: l.nome,
    venceuEm: l.proximaAcaoEm!,
    minutosDeAtraso: Math.floor((agora.getTime() - l.proximaAcaoEm!.getTime()) / 60_000),
    titulo: l.proximaAcaoNota,
    responsavelId: l.atendenteUserId,
  }));
}

export interface LeadSemPlano {
  leadId: string;
  nome: string;
  etapa: string;
  paradoDesde: Date | null;
  responsavelId: string | null;
}

/**
 * **A consulta mais importante deste arquivo.**
 *
 * Leads em aberto sem nenhuma próxima ação marcada. É a fila que ninguém pensa
 * em olhar porque ela não parece uma fila: não há nada atrasado, nada vencido,
 * nada vermelho. Só gente que a operação parou de trabalhar sem decidir parar.
 *
 * NUTRICAO fica de fora: lá o "sem ação por enquanto" é a decisão, não o
 * descuido — e ele já carrega a data de retomada.
 */
export async function semProximaAcao(
  db: Cliente,
  escopo: Prisma.SiteLeadWhereInput = {},
): Promise<LeadSemPlano[]> {
  const linhas = await db.siteLead.findMany({
    where: {
      AND: [
        escopo,
        {
          proximaAcaoEm: null,
          stage: { notIn: ["GANHO", "PERDIDO", "NUTRICAO"] },
          optOutAt: null,
        },
      ],
    },
    orderBy: { lastInteractionAt: "asc" },
    take: 200,
    select: {
      id: true, nome: true, stage: true,
      lastInteractionAt: true, atendenteUserId: true,
    },
  });

  return linhas.map((l) => ({
    leadId: l.id,
    nome: l.nome,
    etapa: l.stage,
    paradoDesde: l.lastInteractionAt,
    responsavelId: l.atendenteUserId,
  }));
}

// ── Cadências ────────────────────────────────────────────────────────────────

export type ResultadoDeInscrever =
  | { ok: true; leadCadenciaId: string; proximoEm: Date }
  | { ok: false; causa: "jaInscrito" | "cadenciaInativa" | "semPassos" | "leadPediuSilencio" };

/**
 * Inscreve um lead numa cadência.
 *
 * ── AS DUAS RECUSAS QUE IMPORTAM ────────────────────────────────────────────
 *
 * **`leadPediuSilencio`** é verificada aqui, e não só na hora de disparar. O
 * portão de contato pegaria o toque na saída de qualquer jeito — mas inscrever
 * alguém que pediu silêncio deixa a cadência ativa e a fila cheia de toques que
 * nunca vão sair, e a operação passa a olhar um número que não significa nada.
 *
 * **`jaInscrito`** é a restrição UNIQUE do banco. Duas inscrições na mesma
 * cadência mandariam a mesma sequência duas vezes — e a pessoa recebe o mesmo
 * follow-up em duplicata, que é o defeito que faz gente bloquear o número.
 */
export async function inscreverEmCadencia(
  db: PrismaClient,
  params: { leadId: string; cadenciaId: string; agora?: Date },
): Promise<ResultadoDeInscrever> {
  const agora = params.agora ?? new Date();

  const lead = await db.siteLead.findUnique({
    where: { id: params.leadId },
    select: { optOutAt: true },
  });
  if (lead?.optOutAt) return { ok: false, causa: "leadPediuSilencio" };

  const cadencia = await db.cadencia.findUnique({
    where: { id: params.cadenciaId },
    select: {
      ativa: true,
      passos: { orderBy: { ordem: "asc" }, take: 1, select: { esperaHoras: true } },
    },
  });

  if (!cadencia?.ativa) return { ok: false, causa: "cadenciaInativa" };
  if (!cadencia.passos.length) return { ok: false, causa: "semPassos" };

  const proximoEm = new Date(agora.getTime() + cadencia.passos[0]!.esperaHoras * 3_600_000);

  try {
    const criada = await db.leadCadencia.create({
      data: {
        leadId: params.leadId,
        cadenciaId: params.cadenciaId,
        situacao: "ATIVA",
        passoAtual: 0,
        proximoEm,
      },
      select: { id: true },
    });
    return { ok: true, leadCadenciaId: criada.id, proximoEm };
  } catch {
    return { ok: false, causa: "jaInscrito" };
  }
}

/**
 * Encerra a cadência de um lead, com motivo.
 *
 * Motivo obrigatório: cadência que some sem explicação vira lead abandonado com
 * aparência de lead trabalhado — a inscrição saiu da lista de ativas, e ninguém
 * consegue dizer se ela terminou ou se alguém a matou por engano.
 */
export async function encerrarCadencia(
  db: Cliente,
  params: {
    leadId: string;
    cadenciaId?: string;
    motivo: string;
    situacao?: "PAUSADA" | "CANCELADA" | "CONCLUIDA";
  },
): Promise<{ encerradas: number } | { ok: false; causa: "semMotivo" }> {
  const motivo = params.motivo?.trim();
  if (!motivo) return { ok: false, causa: "semMotivo" };

  const r = await db.leadCadencia.updateMany({
    where: {
      leadId: params.leadId,
      situacao: "ATIVA",
      ...(params.cadenciaId ? { cadenciaId: params.cadenciaId } : {}),
    },
    data: { situacao: params.situacao ?? "CANCELADA", motivoDaSaida: motivo },
  });

  return { encerradas: r.count };
}

export interface PassoVencido {
  leadCadenciaId: string;
  leadId: string;
  passo: number;
  titulo: string;
  tipo: TipoDeTarefa;
  executor: AutorDaMensagem;
  templateNome: string | null;
  roteiro: string | null;
}

/**
 * Os passos de cadência que já deveriam ter acontecido.
 *
 * **Só devolve. Não dispara nada.** Quem transforma isto em tarefa ou em
 * mensagem é o chamador, depois de passar pelo portão de contato — e é lá que
 * opt-out e horário permitido são verificados, no instante de sair, não no
 * instante de agendar.
 */
export async function passosVencidos(
  db: Cliente,
  agora: Date,
  limite = 100,
): Promise<PassoVencido[]> {
  const inscricoes = await db.leadCadencia.findMany({
    where: {
      situacao: "ATIVA",
      proximoEm: { not: null, lte: agora },
      lead: { optOutAt: null },
    },
    orderBy: { proximoEm: "asc" },
    take: limite,
    select: {
      id: true, leadId: true, passoAtual: true,
      cadencia: {
        select: {
          passos: {
            orderBy: { ordem: "asc" },
            select: {
              ordem: true, titulo: true, tipo: true,
              executor: true, templateNome: true, roteiro: true,
            },
          },
        },
      },
    },
  });

  const saida: PassoVencido[] = [];

  for (const i of inscricoes) {
    const passo = i.cadencia.passos[i.passoAtual];
    // Passo além do fim: a cadência acabou e ninguém a fechou. Deixar de fora
    // silenciosamente esconderia inscrições zumbis na contagem de ativas.
    if (!passo) continue;

    saida.push({
      leadCadenciaId: i.id,
      leadId: i.leadId,
      passo: passo.ordem,
      titulo: passo.titulo,
      tipo: passo.tipo,
      executor: passo.executor,
      templateNome: passo.templateNome,
      roteiro: passo.roteiro,
    });
  }

  return saida;
}

/**
 * Marca um passo como executado e agenda o seguinte.
 *
 * Quando não há próximo passo, a inscrição vira CONCLUIDA com motivo — e não
 * fica ATIVA com `proximoEm` nulo, que é o estado que produz as inscrições
 * zumbis: contam como cadência em andamento e nunca mais fazem nada.
 */
export async function avancarCadencia(
  db: Cliente,
  params: { leadCadenciaId: string; agora?: Date },
): Promise<{ ok: true; terminou: boolean; proximoEm: Date | null } | { ok: false }> {
  const agora = params.agora ?? new Date();

  const i = await db.leadCadencia.findUnique({
    where: { id: params.leadCadenciaId },
    select: {
      passoAtual: true,
      situacao: true,
      cadencia: {
        select: { passos: { orderBy: { ordem: "asc" }, select: { esperaHoras: true } } },
      },
    },
  });

  if (!i || i.situacao !== "ATIVA") return { ok: false };

  const proximoIndice = i.passoAtual + 1;
  const proximo = i.cadencia.passos[proximoIndice];

  if (!proximo) {
    await db.leadCadencia.updateMany({
      where: { id: params.leadCadenciaId, situacao: "ATIVA" },
      data: {
        situacao: "CONCLUIDA",
        proximoEm: null,
        motivoDaSaida: "todos os passos foram executados",
      },
    });
    return { ok: true, terminou: true, proximoEm: null };
  }

  const proximoEm = new Date(agora.getTime() + proximo.esperaHoras * 3_600_000);

  await db.leadCadencia.updateMany({
    where: { id: params.leadCadenciaId, situacao: "ATIVA", passoAtual: i.passoAtual },
    data: { passoAtual: proximoIndice, proximoEm },
  });

  return { ok: true, terminou: false, proximoEm };
}
