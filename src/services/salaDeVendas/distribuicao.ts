/**
 * DISTRIBUIÇÃO DE LEADS — quem pega o próximo, e por quê.
 *
 * ── O PROBLEMA QUE ESTE ARQUIVO EXISTE PARA IMPEDIR ─────────────────────────
 *
 * Item 7 do comando termina com uma frase que é o critério inteiro:
 * *"Evitar leads esquecidos ou sem responsável."*
 *
 * O jeito clássico de esquecer um lead não é ninguém pegar — é alguém pegar e
 * não poder atender. Distribuir para quem saiu para almoçar, para quem já está
 * com vinte conversas, ou para quem está offline produz exatamente o mesmo
 * resultado que não distribuir, com o agravante de que a fila parece limpa.
 *
 * Por isso a elegibilidade vem antes do modo: **primeiro quem PODE, depois quem
 * é a VEZ.**
 *
 * ── E A REGRA QUE NÃO SE NEGOCIA ────────────────────────────────────────────
 *
 * Nenhuma distribuição rouba lead de gente. Quem já está com um humano
 * responsável não entra em rodízio, não é reatribuído por SLA e não é
 * redistribuído por carga. A única mão que tira lead de outra pessoa é a do
 * gerente, explicitamente, e isso fica gravado com nome (item 14: "assumir,
 * transferir, priorizar e corrigir").
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import type { EstadoDoSdr, ModoDeDistribuicao } from "@prisma/client";

type Cliente = PrismaClient | Prisma.TransactionClient;

// ── Quem está apto ───────────────────────────────────────────────────────────

export interface CandidatoADistribuicao {
  userId: string;
  nome: string;
  estado: EstadoDoSdr;
  capacidade: number;
  /** Conversas abertas agora. */
  carga: number;
  especialidades: string[];
  regioes: string[];
  pausadoAte: Date | null;
  /** Quando este SDR recebeu o último lead. Base do rodízio. */
  ultimoRecebimentoEm: Date | null;
}

export type MotivoDaInaptidao =
  | "offline"
  | "pausado"
  | "noLimite"
  | "semEspecialidade"
  | "semRegiao";

export interface Aptidao {
  apto: boolean;
  motivo?: MotivoDaInaptidao;
}

/**
 * Este SDR pode receber mais um lead agora?
 *
 * Função pura, e devolve o MOTIVO da recusa — não só `false`. O motivo é o que
 * permite ao painel do gerente dizer "ninguém disponível: 3 pausados, 2 no
 * limite" em vez de mostrar uma fila parada sem explicação.
 */
export function podeReceber(
  c: CandidatoADistribuicao,
  agora: Date,
  exigencias?: { especialidade?: string | null; regiao?: string | null },
): Aptidao {
  if (c.estado === "OFFLINE") return { apto: false, motivo: "offline" };

  // Pausa com prazo vencido não segura ninguém: o SDA voltou do almoço e
  // esqueceu de despausar. Uma pausa eterna esvazia a operação em silêncio.
  const pausaValendo = c.estado === "PAUSADO" && (!c.pausadoAte || c.pausadoAte > agora);
  if (pausaValendo) return { apto: false, motivo: "pausado" };

  if (c.carga >= c.capacidade) return { apto: false, motivo: "noLimite" };

  const esp = exigencias?.especialidade?.trim().toLowerCase();
  if (esp && !c.especialidades.some((e) => e.toLowerCase() === esp)) {
    return { apto: false, motivo: "semEspecialidade" };
  }

  const reg = exigencias?.regiao?.trim().toLowerCase();
  if (reg && !c.regioes.some((r) => r.toLowerCase() === reg)) {
    return { apto: false, motivo: "semRegiao" };
  }

  return { apto: true };
}

export type Escolha =
  | { escolhido: true; userId: string; porque: string }
  | { escolhido: false; motivo: "modoManual" }
  | { escolhido: false; motivo: "ninguemApto"; detalhe: Record<MotivoDaInaptidao, number> };

/**
 * Escolhe quem recebe o próximo lead. Pura.
 *
 * ── POR QUE `MANUAL` NÃO ESCOLHE NINGUÉM, E ISSO É O PADRÃO ─────────────────
 *
 * A Sala nasce em modo manual: a fila "sem responsável" fica visível e é puxada
 * por quem está livre. Distribuição automática antes de existirem SDRs
 * cadastrados e horários definidos empurra lead para caixas vazias — e um lead
 * atribuído a ninguém é mais difícil de achar que um lead na fila aberta, porque
 * ele já não aparece como pendente.
 */
export function escolherResponsavel(
  modo: ModoDeDistribuicao,
  candidatos: CandidatoADistribuicao[],
  agora: Date,
  exigencias?: { especialidade?: string | null; regiao?: string | null },
): Escolha {
  if (modo === "MANUAL") return { escolhido: false, motivo: "modoManual" };

  const detalhe: Record<MotivoDaInaptidao, number> = {
    offline: 0, pausado: 0, noLimite: 0, semEspecialidade: 0, semRegiao: 0,
  };

  const usarExigencias = modo === "ESPECIALIDADE" ? exigencias : undefined;

  const aptos = candidatos.filter((c) => {
    const a = podeReceber(c, agora, usarExigencias);
    if (!a.apto && a.motivo) detalhe[a.motivo] += 1;
    return a.apto;
  });

  if (aptos.length === 0) return { escolhido: false, motivo: "ninguemApto", detalhe };

  if (modo === "DISPONIBILIDADE") {
    // Quem tem menos conversa aberta. Empate desempata por quem recebeu há mais
    // tempo — sem isso, o primeiro da lista alfabética levaria todos os empates.
    const ordenado = [...aptos].sort(
      (a, b) => a.carga - b.carga || tempoDesde(a) - tempoDesde(b),
    );
    const alvo = ordenado[0]!;
    return {
      escolhido: true,
      userId: alvo.userId,
      porque: `menor carga (${alvo.carga} de ${alvo.capacidade})`,
    };
  }

  // RODIZIO e ESPECIALIDADE: rodízio entre os aptos (no segundo caso, dentro do
  // grupo que atende à exigência).
  //
  // O rodízio é por "quem recebeu há mais tempo", e não por um ponteiro
  // guardado: ponteiro quebra quando alguém entra, sai ou fica offline — e
  // quebra em silêncio, sempre favorecendo a mesma pessoa.
  const ordenado = [...aptos].sort((a, b) => tempoDesde(b) - tempoDesde(a));
  const alvo = ordenado[0]!;
  return {
    escolhido: true,
    userId: alvo.userId,
    porque: alvo.ultimoRecebimentoEm
      ? "é a vez dele no rodízio"
      : "ainda não recebeu nenhum lead",
  };
}

/** Milissegundos desde o último recebimento. Nunca recebeu = espera infinita. */
function tempoDesde(c: CandidatoADistribuicao): number {
  return c.ultimoRecebimentoEm ? c.ultimoRecebimentoEm.getTime() : 0;
}

// ── Lendo o time do banco ────────────────────────────────────────────────────

/**
 * Os SDRs, com carga real contada agora.
 *
 * A carga é `count` de verdade, e não um contador guardado na linha do SDR:
 * contador incrementado a cada atribuição e decrementado a cada fechamento
 * dessincroniza no primeiro erro e nunca mais volta — e o sintoma é um SDR que
 * "está no limite" com três conversas.
 */
export async function lerCandidatos(db: Cliente): Promise<CandidatoADistribuicao[]> {
  const pessoas = await db.internalUser.findMany({
    where: {
      isActive: true,
      role: { in: ["AGENTE_HUMANO", "GERENTE_DEPARTAMENTO"] },
      disponibilidade: { isNot: null },
    },
    select: {
      id: true,
      nome: true,
      disponibilidade: {
        select: {
          estado: true, capacidade: true, especialidades: true,
          regioes: true, pausadoAte: true,
        },
      },
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

  const cargaPor = new Map(
    cargas.map((c) => [c.atendenteUserId as string, c._count._all]),
  );

  const ultimos = await db.siteLead.groupBy({
    by: ["atendenteUserId"],
    where: { atendenteUserId: { not: null } },
    _max: { atendenteDesde: true },
  });

  const ultimoPor = new Map(
    ultimos.map((u) => [u.atendenteUserId as string, u._max.atendenteDesde]),
  );

  return pessoas
    .filter((p) => p.disponibilidade)
    .map((p) => ({
      userId: p.id,
      nome: p.nome,
      estado: p.disponibilidade!.estado,
      capacidade: p.disponibilidade!.capacidade,
      carga: cargaPor.get(p.id) ?? 0,
      especialidades: p.disponibilidade!.especialidades,
      regioes: p.disponibilidade!.regioes,
      pausadoAte: p.disponibilidade!.pausadoAte,
      ultimoRecebimentoEm: ultimoPor.get(p.id) ?? null,
    }));
}

// ── Atribuir ─────────────────────────────────────────────────────────────────

export type ResultadoDaAtribuicao =
  | { ok: true; leadId: string; userId: string; porque: string }
  | { ok: false; causa: "semDistribuicao"; detalhe: string }
  | { ok: false; causa: "leadJaTemDono" };

/**
 * Distribui UM lead que está sem responsável.
 *
 * A escrita é condicional em `atendidoPor` estar em NINGUEM/AGUARDANDO_HUMANO —
 * a mesma trava de `responsavel.ts`. Sem ela, a distribuição automática rodando
 * junto com um SDR clicando em "assumir" produz dois donos.
 */
export async function distribuir(
  db: Cliente,
  params: {
    leadId: string;
    modo: ModoDeDistribuicao;
    agora?: Date;
    exigencias?: { especialidade?: string | null; regiao?: string | null };
  },
): Promise<ResultadoDaAtribuicao> {
  const agora = params.agora ?? new Date();
  const candidatos = await lerCandidatos(db);
  const escolha = escolherResponsavel(params.modo, candidatos, agora, params.exigencias);

  if (!escolha.escolhido) {
    const detalhe =
      escolha.motivo === "modoManual"
        ? "distribuição está em modo manual — a fila fica aberta para quem puxar"
        : descreverInaptidao(escolha.detalhe);
    return { ok: false, causa: "semDistribuicao", detalhe };
  }

  const alterados = await db.siteLead.updateMany({
    where: {
      id: params.leadId,
      atendidoPor: { in: ["NINGUEM", "AGUARDANDO_HUMANO"] },
    },
    data: {
      atendidoPor: "HUMANO",
      atendenteUserId: escolha.userId,
      atendenteDesde: agora,
    },
  });

  if (alterados.count !== 1) return { ok: false, causa: "leadJaTemDono" };

  await db.siteLeadInteraction.create({
    data: {
      leadId: params.leadId,
      tipo: "ASSUMIU_HUMANO",
      actor: "distribuicao",
      interna: true,
      nota: `Distribuído automaticamente: ${escolha.porque}.`,
    },
  });

  return { ok: true, leadId: params.leadId, userId: escolha.userId, porque: escolha.porque };
}

/** "3 offline, 2 pausados, 1 no limite" — em vez de uma fila parada sem motivo. */
export function descreverInaptidao(d: Record<MotivoDaInaptidao, number>): string {
  const partes: string[] = [];
  if (d.offline) partes.push(`${d.offline} offline`);
  if (d.pausado) partes.push(`${d.pausado} pausado(s)`);
  if (d.noLimite) partes.push(`${d.noLimite} no limite de atendimentos`);
  if (d.semEspecialidade) partes.push(`${d.semEspecialidade} sem a especialidade`);
  if (d.semRegiao) partes.push(`${d.semRegiao} fora da região`);

  return partes.length
    ? `ninguém disponível: ${partes.join(", ")}`
    : "não há SDR cadastrado com disponibilidade";
}

// ── Transferência entre pessoas ──────────────────────────────────────────────

export type ResultadoDaTransferencia =
  | { ok: true; leadId: string }
  | { ok: false; causa: "naoEhSeu" }
  | { ok: false; causa: "semMotivo" }
  | { ok: false; causa: "mesmaPessoa" };

/**
 * Passa o lead de uma pessoa para outra.
 *
 * Exige que quem transfere SEJA o dono atual — a condição vai dentro do `where`.
 * Um SDR não move o lead de outro; para isso existe a assunção do gerente, que é
 * outra função, com outro nome, e que fica gravada como tal.
 */
export async function transferir(
  db: Cliente,
  params: {
    leadId: string;
    deUserId: string;
    paraUserId: string;
    motivo: string;
    agora?: Date;
  },
): Promise<ResultadoDaTransferencia> {
  const motivo = params.motivo?.trim();
  if (!motivo) return { ok: false, causa: "semMotivo" };
  if (params.deUserId === params.paraUserId) return { ok: false, causa: "mesmaPessoa" };

  const agora = params.agora ?? new Date();

  const alterados = await db.siteLead.updateMany({
    where: {
      id: params.leadId,
      atendidoPor: "HUMANO",
      atendenteUserId: params.deUserId,
    },
    data: { atendenteUserId: params.paraUserId, atendenteDesde: agora },
  });

  if (alterados.count !== 1) return { ok: false, causa: "naoEhSeu" };

  await db.siteLeadInteraction.create({
    data: {
      leadId: params.leadId,
      tipo: "ASSUMIU_HUMANO",
      actor: params.deUserId,
      interna: true,
      nota: `Transferido para outro atendente. Motivo: ${motivo}`,
    },
  });

  return { ok: true, leadId: params.leadId };
}

/**
 * O gerente tira o lead de quem estiver com ele.
 *
 * É a ÚNICA função da casa que sobrescreve um dono humano — por isso exige
 * motivo escrito e grava o nome de quem fez. Sem motivo obrigatório, ela viraria
 * o atalho para resolver qualquer atrito de fila, e o histórico não saberia
 * dizer por que o lead mudou de mão três vezes numa tarde.
 */
export async function assuncaoDoGerente(
  db: Cliente,
  params: { leadId: string; gerenteUserId: string; motivo: string; agora?: Date },
): Promise<{ ok: true; leadId: string } | { ok: false; causa: "semMotivo" | "naoExiste" }> {
  const motivo = params.motivo?.trim();
  if (!motivo) return { ok: false, causa: "semMotivo" };

  const agora = params.agora ?? new Date();

  const alterados = await db.siteLead.updateMany({
    where: { id: params.leadId },
    data: {
      atendidoPor: "HUMANO",
      atendenteUserId: params.gerenteUserId,
      atendenteDesde: agora,
      motivoDoPedido: null,
    },
  });

  if (alterados.count !== 1) return { ok: false, causa: "naoExiste" };

  await db.siteLeadInteraction.create({
    data: {
      leadId: params.leadId,
      tipo: "ASSUMIU_HUMANO",
      actor: params.gerenteUserId,
      interna: true,
      nota: `Assumido pelo gerente. Motivo: ${motivo}`,
    },
  });

  return { ok: true, leadId: params.leadId };
}

// ── SLA ──────────────────────────────────────────────────────────────────────

export interface LeadEstourado {
  leadId: string;
  minutosDeAtraso: number;
}

/**
 * Leads cujo SLA de primeira resposta venceu sem ninguém responder.
 *
 * A condição de "sem resposta" é `primeiraRespostaEm: null`: se a pessoa já
 * respondeu, o SLA cumpriu o papel dele, mesmo que o prazo tenha passado depois.
 * Medir pelo prazo sozinho contaria como estourado todo lead antigo da base.
 */
export async function leadsComSlaEstourado(
  db: Cliente,
  agora: Date,
): Promise<LeadEstourado[]> {
  const linhas = await db.siteLead.findMany({
    where: {
      slaVenceEm: { not: null, lt: agora },
      primeiraRespostaEm: null,
      stage: { notIn: ["GANHO", "PERDIDO", "NUTRICAO"] },
    },
    orderBy: { slaVenceEm: "asc" },
    select: { id: true, slaVenceEm: true },
  });

  return linhas.map((l) => ({
    leadId: l.id,
    minutosDeAtraso: Math.floor((agora.getTime() - l.slaVenceEm!.getTime()) / 60_000),
  }));
}
