/**
 * O PAINEL DO AGENTE GERENTE COMERCIAL, E OS INDICADORES.
 *
 * ── A EXIGÊNCIA QUE GOVERNA CADA NÚMERO DAQUI ───────────────────────────────
 *
 * Item 15: *"Todos os indicadores devem vir de dados reais. Não entregar cards
 * com números simulados na versão final."*
 *
 * Cumprir isso é fácil. O difícil é o que vem junto: quando não há dado, um
 * painel honesto **não pode escrever zero**. Zero é uma afirmação — "medimos, e
 * deu zero" — e é indistinguível de "ninguém mediu". Os dois pintam o mesmo card
 * de vermelho, e só um merece ação.
 *
 * Por isso quase todo indicador aqui devolve uma união: `{ medido: true, … }` ou
 * `{ medido: false, motivo }`. A tela é obrigada a escrever "sem dados" em vez
 * de estampar um número que ninguém apurou. É a mesma doutrina do `Medida` que
 * o resto da casa já usa, e a mesma trava de amostra mínima do funil.
 *
 * ── O QUE O GERENTE PRECISA VER PRIMEIRO ────────────────────────────────────
 *
 * A ordem do `visaoDoGerente` não é arbitrária: começa pelo que exige ação
 * AGORA (fila sem responsável, esperando gente, SLA estourado) e só depois
 * mostra desempenho. Um painel que abre com "conversão do mês" ensina o gerente
 * a olhar o passado enquanto a fila de hoje esfria.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import type { EstadoDoSdr } from "@prisma/client";
import { esperaPorGente } from "./handoff";
import { leadsComSlaEstourado } from "./distribuicao";
import { followUpsVencidos, semProximaAcao } from "./followUp";
import { taxaDeComparecimento } from "./agenda";
import { desempenhoDe } from "./qa";
import { SEQUENCIA_FUNIL, ROTULO_ETAPA } from "@/services/foocci-crm/foocciCrmFunnel";

type Cliente = PrismaClient | Prisma.TransactionClient;

/** Amostra mínima para uma taxa não ser folclore. Espelha `MIN_LEADS_PARA_TAXA`. */
export const MINIMO_PARA_TAXA = 5;

export type Taxa =
  | { medido: true; valor: number; base: number }
  | { medido: false; motivo: "amostraPequena"; base: number }
  | { medido: false; motivo: "semDados" };

/**
 * Uma taxa, ou a recusa honesta de calculá-la.
 *
 * Duas negativas diferentes de propósito: "não houve nada" e "houve pouco" são
 * situações distintas, e a segunda vira a primeira em uma semana. A tela pode
 * dizer "3 de 5 necessários" em vez de um traço mudo.
 */
export function taxa(numerador: number, denominador: number): Taxa {
  if (denominador === 0) return { medido: false, motivo: "semDados" };
  if (denominador < MINIMO_PARA_TAXA) {
    return { medido: false, motivo: "amostraPequena", base: denominador };
  }
  return { medido: true, valor: numerador / denominador, base: denominador };
}

export type Duracao =
  | { medido: true; minutos: number; base: number }
  | { medido: false; motivo: "semDados" };

// ── O agora ──────────────────────────────────────────────────────────────────

export interface FilasDoAgora {
  semResponsavel: number;
  aguardandoHumano: number;
  comIA: number;
  slaEstourado: number;
  followUpVencido: number;
  semProximaAcao: number;
  /** Chegaram nas últimas 24 horas. */
  entrandoAgora: number;
}

export async function filasDoAgora(db: Cliente, agora: Date): Promise<FilasDoAgora> {
  const ontem = new Date(agora.getTime() - 86_400_000);

  const [semResponsavel, aguardandoHumano, comIA, estourados, vencidos, semPlano, entrando] =
    await Promise.all([
      db.siteLead.count({ where: { atendidoPor: "NINGUEM", stage: { notIn: ["GANHO", "PERDIDO", "NUTRICAO"] } } }),
      db.siteLead.count({ where: { atendidoPor: "AGUARDANDO_HUMANO" } }),
      db.siteLead.count({ where: { atendidoPor: "IA" } }),
      leadsComSlaEstourado(db, agora),
      followUpsVencidos(db, agora),
      semProximaAcao(db),
      db.siteLead.count({ where: { createdAt: { gte: ontem } } }),
    ]);

  return {
    semResponsavel,
    aguardandoHumano,
    comIA,
    slaEstourado: estourados.length,
    followUpVencido: vencidos.length,
    semProximaAcao: semPlano.length,
    entrandoAgora: entrando,
  };
}

// ── O time ───────────────────────────────────────────────────────────────────

export interface SdrNoPainel {
  userId: string;
  nome: string;
  estado: EstadoDoSdr;
  carga: number;
  capacidade: number;
  vistoEm: Date | null;
}

export interface TimeNoPainel {
  sdrs: SdrNoPainel[];
  porEstado: Record<EstadoDoSdr, number>;
  /** Ninguém cadastrou disponibilidade. NÃO é "todo mundo offline". */
  semCadastro: boolean;
}

/**
 * Quem está de pé agora.
 *
 * `semCadastro` existe porque a tela precisa distinguir duas coisas que produzem
 * a mesma imagem: um time inteiro offline (problema de operação) e um time que
 * nunca registrou disponibilidade (problema de cadastro). Mostrar "0 online" nos
 * dois casos mandaria o gerente cobrar presença de gente que está trabalhando.
 */
export async function timeNoPainel(db: Cliente): Promise<TimeNoPainel> {
  const pessoas = await db.internalUser.findMany({
    where: { isActive: true, disponibilidade: { isNot: null } },
    select: {
      id: true, nome: true,
      disponibilidade: { select: { estado: true, capacidade: true, vistoEm: true } },
    },
  });

  const cargas = await db.siteLead.groupBy({
    by: ["atendenteUserId"],
    where: {
      atendidoPor: "HUMANO",
      atendenteUserId: { not: null },
      stage: { notIn: ["GANHO", "PERDIDO", "NUTRICAO"] },
    },
    _count: { _all: true },
  });
  const cargaPor = new Map(cargas.map((c) => [c.atendenteUserId as string, c._count._all]));

  const porEstado: Record<EstadoDoSdr, number> = {
    DISPONIVEL: 0, OCUPADO: 0, PAUSADO: 0, OFFLINE: 0,
  };

  const sdrs = pessoas
    .filter((p) => p.disponibilidade)
    .map((p) => {
      porEstado[p.disponibilidade!.estado] += 1;
      return {
        userId: p.id,
        nome: p.nome,
        estado: p.disponibilidade!.estado,
        carga: cargaPor.get(p.id) ?? 0,
        capacidade: p.disponibilidade!.capacidade,
        vistoEm: p.disponibilidade!.vistoEm,
      };
    })
    .sort((a, b) => b.carga - a.carga);

  return { sdrs, porEstado, semCadastro: sdrs.length === 0 };
}

// ── Tempo ────────────────────────────────────────────────────────────────────

/**
 * Tempo médio até a primeira resposta do lead.
 *
 * ── O QUE ESTE NÚMERO MEDE DE VERDADE, E O QUE ELE NÃO MEDE ─────────────────
 *
 * Mede o intervalo entre o lead entrar e ele RESPONDER pela primeira vez. Leads
 * que nunca responderam ficam de fora do cálculo — e é aí que mora a armadilha:
 * incluí-los como "tempo infinito" tornaria o número inútil, mas excluí-los sem
 * dizer nada faz o indicador melhorar justamente quando a operação piora (quanto
 * menos gente responde, melhor parece a média dos que responderam).
 *
 * Por isso `base` volta junto. A tela mostra "12 min (sobre 34 de 90 leads)", e
 * a fração é tão informativa quanto a média.
 */
export async function tempoDePrimeiraResposta(
  db: Cliente,
  params: { de: Date; ate: Date },
): Promise<Duracao> {
  const leads = await db.siteLead.findMany({
    where: {
      createdAt: { gte: params.de, lt: params.ate },
      primeiraRespostaEm: { not: null },
    },
    select: { createdAt: true, primeiraRespostaEm: true },
  });

  if (leads.length === 0) return { medido: false, motivo: "semDados" };

  const soma = leads.reduce(
    (s, l) => s + (l.primeiraRespostaEm!.getTime() - l.createdAt.getTime()),
    0,
  );

  return {
    medido: true,
    minutos: Math.round(soma / leads.length / 60_000),
    base: leads.length,
  };
}

// ── Funil e conversão ────────────────────────────────────────────────────────

export interface DegrauDoFunil {
  etapa: string;
  rotulo: string;
  total: number;
}

export interface ConversaoDoPeriodo {
  degraus: DegrauDoFunil[];
  /** Da entrada ao ganho. */
  pontaAPonta: Taxa;
  ganhos: number;
  perdidos: number;
  emNutricao: number;
}

export async function conversaoDoPeriodo(
  db: Cliente,
  params: { de: Date; ate: Date },
): Promise<ConversaoDoPeriodo> {
  const contagens = await db.siteLead.groupBy({
    by: ["stage"],
    where: { createdAt: { gte: params.de, lt: params.ate } },
    _count: { _all: true },
  });

  const por = new Map(contagens.map((c) => [c.stage as string, c._count._all]));
  const total = [...por.values()].reduce((s, n) => s + n, 0);
  const ganhos = por.get("GANHO") ?? 0;

  return {
    degraus: SEQUENCIA_FUNIL.map((e) => ({
      etapa: e,
      rotulo: ROTULO_ETAPA[e],
      total: por.get(e) ?? 0,
    })),
    pontaAPonta: taxa(ganhos, total),
    ganhos,
    perdidos: por.get("PERDIDO") ?? 0,
    emNutricao: por.get("NUTRICAO") ?? 0,
  };
}

export interface MotivoDePerdaContado {
  rotulo: string;
  grupo: string | null;
  total: number;
}

/**
 * Por que a gente perde.
 *
 * Leads perdidos SEM motivo cadastrado aparecem numa linha própria, e não são
 * omitidos: se metade das perdas não tem motivo, a leitura correta do relatório
 * é "não sabemos por que perdemos metade", e não um ranking limpo dos 50% que
 * alguém se deu ao trabalho de preencher.
 */
export async function motivosDePerda(
  db: Cliente,
  params: { de: Date; ate: Date },
): Promise<MotivoDePerdaContado[]> {
  const perdidos = await db.siteLead.findMany({
    where: {
      stage: "PERDIDO",
      stageChangedAt: { gte: params.de, lt: params.ate },
    },
    select: { motivoPerda: { select: { rotulo: true, grupo: true } } },
  });

  const por = new Map<string, MotivoDePerdaContado>();
  let semMotivo = 0;

  for (const p of perdidos) {
    if (!p.motivoPerda) {
      semMotivo += 1;
      continue;
    }
    const chave = p.motivoPerda.rotulo;
    const atual = por.get(chave);
    if (atual) atual.total += 1;
    else por.set(chave, { rotulo: chave, grupo: p.motivoPerda.grupo, total: 1 });
  }

  const lista = [...por.values()].sort((a, b) => b.total - a.total);

  if (semMotivo > 0) {
    lista.push({ rotulo: "sem motivo registrado", grupo: null, total: semMotivo });
  }

  return lista;
}

// ── Receita ──────────────────────────────────────────────────────────────────

export type Receita =
  | { medido: true; centavos: number; propostas: number }
  /** Há propostas aceitas, mas nenhuma com valor: não há receita a somar. */
  | { medido: false; motivo: "semValores"; propostas: number }
  | { medido: false; motivo: "semPropostas" };

/**
 * Receita das propostas aceitas.
 *
 * ── POR QUE ISTO PODE DEVOLVER "NÃO MEDIDO" COM PROPOSTAS ACEITAS ───────────
 *
 * O CEO ainda não fechou os valores dos três planos, e `valorMensalCent` nasce
 * nulo de propósito (guardrail 7: não vender como pronto o que está em piloto).
 * Uma proposta aceita sem valor é um fechamento real cujo preço foi combinado
 * fora do sistema.
 *
 * Somar essas como zero produziria o pior card do painel: "Receita: R$ 0" ao
 * lado de "8 propostas aceitas". O gerente lê isso como defeito do sistema — e
 * está certo. `semValores` diz a verdade: fechou, e o valor não está aqui.
 */
export async function receitaGanha(
  db: Cliente,
  params: { de: Date; ate: Date },
): Promise<Receita> {
  const aceitas = await db.leadProposta.findMany({
    where: {
      situacao: "ACEITA",
      respondidaEm: { gte: params.de, lt: params.ate },
    },
    select: { valorMensalCent: true },
  });

  if (aceitas.length === 0) return { medido: false, motivo: "semPropostas" };

  const comValor = aceitas.filter((p) => typeof p.valorMensalCent === "number");
  if (comValor.length === 0) {
    return { medido: false, motivo: "semValores", propostas: aceitas.length };
  }

  return {
    medido: true,
    centavos: comValor.reduce((s, p) => s + (p.valorMensalCent ?? 0), 0),
    propostas: comValor.length,
  };
}

// ── IA × humano ──────────────────────────────────────────────────────────────

export interface ComparativoIaHumano {
  ia: { atendimentos: number; qa: Awaited<ReturnType<typeof desempenhoDe>> };
  humano: { atendimentos: number; qa: Awaited<ReturnType<typeof desempenhoDe>> };
  handoffs: number;
  /** Handoffs por motivo — o que mais faz a IA largar. */
  porMotivo: Array<{ motivo: string; total: number }>;
}

/**
 * IA e humano na mesma régua.
 *
 * `porMotivo` é o número que paga o próximo ajuste do TA: se metade dos handoffs
 * é `INFORMACAO_NAO_CONFIRMADA`, o problema não é o modelo — é a base de verdade
 * da Foocci estar incompleta, e nenhum ajuste de prompt resolve isso.
 */
export async function compararIaComHumano(
  db: Cliente,
  params: { de: Date; ate: Date },
): Promise<ComparativoIaHumano> {
  const janela = { createdAt: { gte: params.de, lt: params.ate } };

  const [atendIA, atendHumano, handoffs, porMotivo, qaIA, qaHumano] = await Promise.all([
    db.leadMensagem.count({ where: { ...janela, direcao: "SAIDA", autor: "IA" } }),
    db.leadMensagem.count({ where: { ...janela, direcao: "SAIDA", autor: "HUMANO" } }),
    db.leadHandoff.count({ where: janela }),
    db.leadHandoff.groupBy({ by: ["motivo"], where: janela, _count: { _all: true } }),
    desempenhoDe(db, { avaliado: "IA", de: params.de, ate: params.ate }),
    desempenhoDe(db, { avaliado: "HUMANO", de: params.de, ate: params.ate }),
  ]);

  return {
    ia: { atendimentos: atendIA, qa: qaIA },
    humano: { atendimentos: atendHumano, qa: qaHumano },
    handoffs,
    porMotivo: porMotivo
      .map((m) => ({ motivo: m.motivo as string, total: m._count._all }))
      .sort((a, b) => b.total - a.total),
  };
}

// ── A visão completa ─────────────────────────────────────────────────────────

export interface VisaoDoGerente {
  agora: FilasDoAgora;
  time: TimeNoPainel;
  espera: Awaited<ReturnType<typeof esperaPorGente>>;
  primeiraResposta: Duracao;
  conversao: ConversaoDoPeriodo;
  comparecimento: Awaited<ReturnType<typeof taxaDeComparecimento>>;
  receita: Receita;
  perdas: MotivoDePerdaContado[];
  iaVsHumano: ComparativoIaHumano;
  periodo: { de: Date; ate: Date };
}

/**
 * Tudo que o painel do gerente mostra, numa consulta só.
 *
 * As leituras vão em paralelo porque são independentes — e porque um painel que
 * demora cinco segundos é um painel que ninguém abre no dia movimentado, que é
 * exatamente o dia em que ele serve para alguma coisa.
 */
export async function visaoDoGerente(
  db: PrismaClient,
  params: { de: Date; ate: Date; agora?: Date },
): Promise<VisaoDoGerente> {
  const agora = params.agora ?? new Date();

  const [filas, time, espera, primeira, conversao, comparecimento, receita, perdas, comparativo] =
    await Promise.all([
      filasDoAgora(db, agora),
      timeNoPainel(db),
      esperaPorGente(db, agora),
      tempoDePrimeiraResposta(db, params),
      conversaoDoPeriodo(db, params),
      taxaDeComparecimento(db, params),
      receitaGanha(db, params),
      motivosDePerda(db, params),
      compararIaComHumano(db, params),
    ]);

  return {
    agora: filas,
    time,
    espera,
    primeiraResposta: primeira,
    conversao,
    comparecimento,
    receita,
    perdas,
    iaVsHumano: comparativo,
    periodo: { de: params.de, ate: params.ate },
  };
}
