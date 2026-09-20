/**
 * AS MEDIÇÕES QUE FALTAVAM À CONTROL TOWER (peça 02 do desenho do CEO).
 *
 * ── POR QUE ESTE ARQUIVO EXISTE ─────────────────────────────────────────────
 *
 * A Torre já lia filas, funil, raio-X e Supervisora. O desenho pede mais quatro
 * coisas que nenhum serviço da casa media: a **série do volume ao longo do
 * tempo**, a **saúde da fila em rosca** (com quem espera há mais de dez
 * minutos), o **ranking de vendedores** e as **duas conversões** (da IA e por
 * agente). Este arquivo mede o que dá para medir e **recusa por escrito** o que
 * não dá.
 *
 * ── A REGRA QUE MANDA AQUI, E ELA MANDA MAIS DO QUE EM QUALQUER OUTRO LUGAR ─
 *
 * Esta é tela de número, e o CEO decide dinheiro olhando para ela. **Número
 * plausível sem fonte é o defeito mais caro que este repositório consegue
 * produzir.** Toda função abaixo devolve `Medida<T>`: ou o valor com a base que
 * o sustenta, ou o motivo pelo qual ninguém pode afirmá-lo. Zero nunca ocupa o
 * lugar de "não sei" — zero é uma afirmação, e afirmação precisa de medição.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import { taxa, type Taxa } from "../painel";
import { MINUTOS_PARA_A_PRIMEIRA_RESPOSTA } from "../recepcao/prazoDaPrimeiraResposta";

type Banco = PrismaClient | Prisma.TransactionClient;

const MINUTO = 60_000;
const HORA = 3_600_000;

/** Medi, ou não medi e digo por quê. Nunca uma terceira opção. */
export type Medida<T> = { medido: true; valor: T } | { medido: false; motivo: string };

// ═══════════════════════════════════════════════════════════════════════════
// 1. VOLUME AO LONGO DO TEMPO — as duas séries do desenho
// ═══════════════════════════════════════════════════════════════════════════

export interface PontoDaSerie {
  /** O início da hora que o ponto representa, em ISO. */
  instante: string;
  recebidos: number;
  qualificados: number;
}

export interface SerieDeVolume {
  janelaHoras: number;
  pontos: PontoDaSerie[];
  /**
   * O que cada série mede, escrito — porque "qualificados (IA)" no desenho não
   * diz de onde sai, e aqui sai de um carimbo específico.
   */
  comoSeMede: { recebidos: string; qualificados: string };
}

/**
 * As duas linhas do desenho, hora a hora.
 *
 * ── DE ONDE SAI CADA UMA ────────────────────────────────────────────────────
 *
 *   · **Leads recebidos** — `SiteLead.createdAt`. É o carimbo de entrada, e não
 *     tem ambiguidade: o lead existe a partir dele.
 *   · **Leads qualificados (IA)** — `SiteLead.scoreAt`, o instante em que a
 *     régua de score rodou sobre o lead. É o único carimbo da casa que marca
 *     "a IA olhou e pontuou". **Não é** "virou lead bom": é "foi pontuado".
 *
 * As duas séries não somam nem se contêm: um lead pode entrar numa hora e ser
 * pontuado em outra, e um lead pontuado pode ter entrado antes da janela. A
 * tela precisa dizer isso, e por isso `comoSeMede` viaja junto com os pontos.
 *
 * Buckets vazios NÃO somem. Hora sem lead é zero medido — a linha precisa cair
 * para o chão, e um gráfico que pula a hora vazia desenha um platô que não
 * aconteceu.
 */
export async function serieDeVolume(
  db: Banco,
  params: { agora: Date; janelaHoras?: number },
): Promise<SerieDeVolume> {
  const janelaHoras = params.janelaHoras ?? 24;
  const fim = new Date(Math.ceil(params.agora.getTime() / HORA) * HORA);
  const inicio = new Date(fim.getTime() - janelaHoras * HORA);

  const [entradas, pontuados] = await Promise.all([
    db.siteLead.findMany({
      where: { createdAt: { gte: inicio, lt: fim } },
      select: { createdAt: true },
    }),
    db.siteLead.findMany({
      where: { scoreAt: { gte: inicio, lt: fim } },
      select: { scoreAt: true },
    }),
  ]);

  const balde = (d: Date) => Math.floor((d.getTime() - inicio.getTime()) / HORA);

  const recebidos = new Array<number>(janelaHoras).fill(0);
  const qualificados = new Array<number>(janelaHoras).fill(0);

  for (const l of entradas) {
    const i = balde(l.createdAt);
    if (i >= 0 && i < janelaHoras) recebidos[i]! += 1;
  }
  for (const l of pontuados) {
    if (!l.scoreAt) continue;
    const i = balde(l.scoreAt);
    if (i >= 0 && i < janelaHoras) qualificados[i]! += 1;
  }

  return {
    janelaHoras,
    pontos: Array.from({ length: janelaHoras }, (_, i) => ({
      instante: new Date(inicio.getTime() + i * HORA).toISOString(),
      recebidos: recebidos[i]!,
      qualificados: qualificados[i]!,
    })),
    comoSeMede: {
      recebidos: "leads criados na hora (`SiteLead.createdAt`)",
      qualificados:
        "leads que a régua de score pontuou na hora (`SiteLead.scoreAt`) — é “a IA olhou”, não “virou lead bom”",
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. SAÚDE DA FILA — a rosca do desenho, com o alerta dos +10 minutos
// ═══════════════════════════════════════════════════════════════════════════

/** O limiar do desenho, escrito aqui para não virar número solto na tela. */
export const ESPERA_QUE_ACENDE_MIN = 10;

export interface SaudeDaFila {
  emAtendimento: number;
  aguardandoVendedor: number;
  total: number;
  /** Handoffs abertos há mais de `ESPERA_QUE_ACENDE_MIN` minutos. */
  esperandoDemais: number;
  limiarMin: number;
}

/**
 * A rosca da fila.
 *
 * ⚠️ `emAtendimento` e `aguardandoVendedor` são **retrato do agora** e se
 * excluem (um lead está com a IA ou está esperando gente, nunca os dois);
 * `esperandoDemais` é um **subconjunto** de quem espera, e por isso a rosca da
 * tela desenha só as duas primeiras fatias e usa a terceira como alerta. Somar
 * as três inventaria um total maior que a fila.
 */
export async function saudeDaFila(db: Banco, agora: Date): Promise<SaudeDaFila> {
  const limite = new Date(agora.getTime() - ESPERA_QUE_ACENDE_MIN * MINUTO);

  const [emAtendimento, aguardandoVendedor, esperandoDemais] = await Promise.all([
    db.siteLead.count({ where: { atendidoPor: "IA" } }),
    db.siteLead.count({ where: { atendidoPor: "AGUARDANDO_HUMANO" } }),
    db.leadHandoff.count({
      where: { aceitoEm: null, para: { in: ["HUMANO", "AGUARDANDO_HUMANO"] }, createdAt: { lt: limite } },
    }),
  ]);

  return {
    emAtendimento,
    aguardandoVendedor,
    total: emAtendimento + aguardandoVendedor,
    esperandoDemais,
    limiarMin: ESPERA_QUE_ACENDE_MIN,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. LEADS QUENTES SEM DONO
// ═══════════════════════════════════════════════════════════════════════════

export interface QuentesSemDono {
  quantos: number;
  /** Quantos leads ativos ninguém pontuou — o denominador cego deste número. */
  semScore: number;
}

/**
 * Lead quente que ninguém assumiu.
 *
 * Conta `temperatura ∈ {PRIORIDADE_MAXIMA, QUENTE}` com `atendidoPor = NINGUEM`
 * e fora dos estados terminais. `semScore` viaja junto de propósito: se a maior
 * parte da fila nunca foi pontuada, "3 quentes sem dono" não quer dizer que só
 * há três — quer dizer que só três foram olhados. Esse contexto é a diferença
 * entre um número tranquilizador e um número verdadeiro.
 */
export async function quentesSemDono(db: Banco): Promise<QuentesSemDono> {
  const ativo = { stage: { notIn: ["GANHO", "PERDIDO", "NUTRICAO"] } } satisfies Prisma.SiteLeadWhereInput;

  const [quantos, semScore] = await Promise.all([
    db.siteLead.count({
      where: { ...ativo, atendidoPor: "NINGUEM", temperatura: { in: ["PRIORIDADE_MAXIMA", "QUENTE"] } },
    }),
    db.siteLead.count({ where: { ...ativo, temperatura: null } }),
  ]);

  return { quantos, semScore };
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. AS DUAS CONVERSÕES DO DESENHO
// ═══════════════════════════════════════════════════════════════════════════

export interface DuasConversoes {
  ia: Taxa;
  agente: Taxa;
  comoSeMede: string;
}

/**
 * Conversão da IA × conversão por agente.
 *
 * ── A DEFINIÇÃO, E POR QUE NÃO É `atendidoPor` ──────────────────────────────
 *
 * O caminho óbvio seria contar GANHO por `atendidoPor`. Ele está errado, e erra
 * para o lado que mente bem: `atendidoPor` diz quem segura o lead **agora**.
 * Todo lead que a IA abriu e passou para uma pessoa aparece como humano — some
 * do denominador da IA e entra no do humano. A conversão da IA subiria sozinha
 * exatamente quando ela mais entrega trabalho para gente.
 *
 * A régua usada aqui é o **histórico**, não o estado: um lead que nunca teve
 * `LeadHandoff` correu inteiro na trilha da IA; um que teve, passou por gente.
 * Cada lead do período cai numa trilha só, e o ganho conta na trilha em que ele
 * correu.
 *
 * `taxa()` recusa amostra menor que o mínimo da casa, então dois ganhos em três
 * leads **não** viram "67%".
 */
export async function duasConversoes(
  db: Banco,
  params: { de: Date; ate: Date },
): Promise<DuasConversoes> {
  const janela = { createdAt: { gte: params.de, lt: params.ate } };

  const [totalIa, ganhosIa, totalAgente, ganhosAgente] = await Promise.all([
    db.siteLead.count({ where: { ...janela, handoffs: { none: {} } } }),
    db.siteLead.count({ where: { ...janela, handoffs: { none: {} }, stage: "GANHO" } }),
    db.siteLead.count({ where: { ...janela, handoffs: { some: {} } } }),
    db.siteLead.count({ where: { ...janela, handoffs: { some: {} }, stage: "GANHO" } }),
  ]);

  return {
    ia: taxa(ganhosIa, totalIa),
    agente: taxa(ganhosAgente, totalAgente),
    comoSeMede:
      "cada lead do período conta numa trilha só: sem nenhum handoff registrado = correu com a IA; " +
      "com ao menos um = passou por gente. A trilha é o histórico do lead, não quem o segura agora",
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. RANKING DE VENDEDORES
// ═══════════════════════════════════════════════════════════════════════════

export interface LinhaDoRanking {
  userId: string;
  nome: string;
  /** Leads do período que passaram pelas mãos desta pessoa. */
  atendimentos: number;
  vendas: number;
  conversao: Taxa;
  sla: Medida<{ minutos: number; base: number; dentroDoPrazo: number }>;
}

export interface RankingDeVendedores {
  linhas: LinhaDoRanking[];
  slaPorPessoa: Medida<{ prazoMinutos: number; pessoasComAmostra: number }>;
}

export const MOTIVO_DO_SLA_POR_PESSOA =
  "nenhuma saída humana do período tem uma entrada do lead imediatamente anterior; sem pares entrada→resposta, a coluna não tem amostra";

/**
 * O ranking do desenho, com as colunas que têm fonte e sem a que não tem.
 *
 * `atendimentos` conta leads do período cujo `atendenteUserId` é a pessoa —
 * isto é o estado **atual** de posse, e está declarado assim na tela: um lead
 * repassado conta para quem o tem hoje. É a única atribuição que o banco
 * sustenta, e dizer isso é mais barato do que fingir uma trilha que não existe.
 */
export async function rankingDeVendedores(
  db: Banco,
  params: { de: Date; ate: Date },
): Promise<RankingDeVendedores> {
  const janela = { createdAt: { gte: params.de, lt: params.ate } };

  const [porPessoa, ganhosPorPessoa, pessoas, mensagens] = await Promise.all([
    db.siteLead.groupBy({
      by: ["atendenteUserId"],
      where: { ...janela, atendenteUserId: { not: null } },
      _count: { _all: true },
    }),
    db.siteLead.groupBy({
      by: ["atendenteUserId"],
      where: { ...janela, atendenteUserId: { not: null }, stage: "GANHO" },
      _count: { _all: true },
    }),
    db.internalUser.findMany({ select: { id: true, nome: true } }),
    db.leadMensagem.findMany({
      where: { createdAt: { gte: params.de, lt: params.ate } },
      select: { leadId: true, direcao: true, createdAt: true, autorUserId: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const prazoMinutos = MINUTOS_PARA_A_PRIMEIRA_RESPOSTA;
  const entradaPendente = new Map<string, Date>();
  const amostras = new Map<string, number[]>();
  for (const mensagem of mensagens) {
    if (mensagem.direcao === "ENTRADA") {
      if (!entradaPendente.has(mensagem.leadId)) entradaPendente.set(mensagem.leadId, mensagem.createdAt);
      continue;
    }
    const entrada = entradaPendente.get(mensagem.leadId);
    if (!entrada) continue;
    // A primeira saída encerra o relógio daquele turno. Se foi da IA, o turno
    // não vira amostra de gente; atribuir a resposta humana posterior seria
    // cobrar da pessoa por um SLA que a casa já cumpriu.
    entradaPendente.delete(mensagem.leadId);
    if (!mensagem.autorUserId) continue;
    const minutos = Math.max(0, (mensagem.createdAt.getTime() - entrada.getTime()) / MINUTO);
    const lista = amostras.get(mensagem.autorUserId) ?? [];
    lista.push(minutos);
    amostras.set(mensagem.autorUserId, lista);
  }

  const nomes = new Map(pessoas.map((p) => [p.id, p.nome]));
  const ganhos = new Map(ganhosPorPessoa.map((g) => [g.atendenteUserId as string, g._count._all]));

  const linhas: LinhaDoRanking[] = porPessoa
    .map((p) => {
      const userId = p.atendenteUserId as string;
      const atendimentos = p._count._all;
      const vendas = ganhos.get(userId) ?? 0;
      return {
        userId,
        // Pessoa desligada some do cadastro mas os leads dela ficam. Sumir com a
        // linha esconderia atendimento que aconteceu.
        nome: nomes.get(userId) ?? "(pessoa fora do cadastro)",
        atendimentos,
        vendas,
        conversao: taxa(vendas, atendimentos),
        sla: (() => {
          const tempos = amostras.get(userId) ?? [];
          if (tempos.length === 0) return { medido: false as const, motivo: "sem resposta humana pareada no período" };
          const minutos = Math.round(tempos.reduce((s, n) => s + n, 0) / tempos.length);
          const dentroDoPrazo = tempos.filter((n) => n <= prazoMinutos).length;
          return { medido: true as const, valor: { minutos, base: tempos.length, dentroDoPrazo } };
        })(),
      };
    })
    .sort((a, b) => b.vendas - a.vendas || b.atendimentos - a.atendimentos);

  const pessoasComAmostra = linhas.filter((l) => l.sla.medido).length;
  return {
    linhas,
    slaPorPessoa: pessoasComAmostra > 0
      ? { medido: true, valor: { prazoMinutos, pessoasComAmostra } }
      : { medido: false, motivo: MOTIVO_DO_SLA_POR_PESSOA },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. SLA MÉDIO — o tempo até A CASA responder
// ═══════════════════════════════════════════════════════════════════════════

export interface TempoDeResposta {
  minutos: number;
  /** Leads que entraram na conta. */
  base: number;
  /** Leads que escreveram e a casa ainda não respondeu — fora da média. */
  semResposta: number;
}

/**
 * O "SLA médio" do desenho, medido de verdade.
 *
 * ── O QUE ELE É, E O QUE ELE NÃO É ──────────────────────────────────────────
 *
 * Mede o intervalo entre a **primeira mensagem de ENTRADA** do lead e a
 * **primeira mensagem de SAÍDA depois dela**. É o tempo que a casa levou para
 * responder — que é o que um supervisor lê quando vê "SLA médio".
 *
 * ⚠️ **Não é** `tempoDePrimeiraResposta` de `painel.ts`, que mede o oposto: o
 * tempo até o LEAD responder a gente. Os dois números têm o mesmo nome no
 * português da operação e medem coisas opostas, e trocá-los faria a tela piorar
 * quando a operação melhora.
 *
 * ⚠️ **Não usa `slaVenceEm`.** O prazo só passou a ser gravado em 18/09/2026, e
 * uma média sobre ele seria uma média de uma semana apresentada como histórico.
 * Esta conta sai das mensagens, que existem desde sempre.
 *
 * Quem escreveu e nunca foi respondido fica **fora da média e dentro do
 * relatório** (`semResposta`): incluí-lo como tempo infinito tornaria o número
 * inútil, e escondê-lo faria a média melhorar justamente quando a casa para de
 * responder.
 */
export async function slaMedioDeResposta(
  db: Banco,
  params: { de: Date; ate: Date },
): Promise<Medida<TempoDeResposta>> {
  const mensagens = await db.leadMensagem.findMany({
    where: { createdAt: { gte: params.de, lt: params.ate } },
    select: { leadId: true, direcao: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  if (mensagens.length === 0) {
    return { medido: false, motivo: "nenhuma mensagem trocada no período — não há o que cronometrar" };
  }

  const primeiraEntrada = new Map<string, Date>();
  const primeiraSaidaDepois = new Map<string, Date>();

  for (const m of mensagens) {
    if (m.direcao === "ENTRADA") {
      if (!primeiraEntrada.has(m.leadId)) primeiraEntrada.set(m.leadId, m.createdAt);
      continue;
    }
    const entrada = primeiraEntrada.get(m.leadId);
    if (entrada && !primeiraSaidaDepois.has(m.leadId)) {
      primeiraSaidaDepois.set(m.leadId, m.createdAt);
    }
  }

  let soma = 0;
  let base = 0;
  for (const [leadId, entrada] of primeiraEntrada) {
    const saida = primeiraSaidaDepois.get(leadId);
    if (!saida) continue;
    soma += saida.getTime() - entrada.getTime();
    base += 1;
  }

  if (base === 0) {
    return {
      medido: false,
      motivo: `${primeiraEntrada.size} leads escreveram no período e nenhum foi respondido dentro dele — sem par pergunta/resposta não há média`,
    };
  }

  return {
    medido: true,
    valor: {
      minutos: Math.round(soma / base / MINUTO),
      base,
      semResposta: primeiraEntrada.size - base,
    },
  };
}
