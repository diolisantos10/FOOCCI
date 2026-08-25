/**
 * QA DE VENDAS — avaliar a conversa, não contar mensagem.
 *
 * ── A FRASE DO COMANDO QUE DEFINE O QUE ESTE ARQUIVO SE RECUSA A FAZER ──────
 *
 * Item 13: *"Não avaliar apenas quantidade de mensagens. Avaliar qualidade e
 * capacidade de conversão."*
 *
 * Não existe contador de mensagens aqui, e a ausência é a decisão. Uma conversa
 * de quatro linhas que marcou a demonstração é melhor que trinta que não foram a
 * lugar nenhum — e um scorecard que contasse volume diria exatamente o contrário,
 * premiando quem enrola.
 *
 * ── AS TRÊS REGRAS ──────────────────────────────────────────────────────────
 *
 * **1. Nota baixa exige comentário.** Um 1 sem explicação não ensina nada e não
 * se defende. O objetivo do QA é coaching, e coaching sem o "por quê" é só uma
 * nota ruim no fim do mês.
 *
 * **2. `null` não é zero.** Critério que não se aplica àquela conversa fica
 * `null`. Uma conversa que nunca chegou em preço não pode levar nota baixa em
 * "tentativa de fechamento" — isso puniria o vendedor por seguir o processo, e
 * é o defeito que faz o time desconfiar do QA inteiro.
 *
 * **3. Quem é avaliado pode contestar.** Avaliação sem direito de resposta vira
 * ruído que o time aprende a ignorar, e um QA ignorado é pior que nenhum: custa
 * o tempo de quem avalia e não muda comportamento.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  CriterioDeQA,
  AutorDaMensagem,
  SiteLeadStage,
  OrigemDaAvaliacao,
} from "@prisma/client";

type Cliente = PrismaClient | Prisma.TransactionClient;

/** Os quinze critérios, na ordem em que a conversa acontece. */
export const CRITERIOS: readonly CriterioDeQA[] = [
  "VELOCIDADE",
  "ABERTURA",
  "CLAREZA",
  "ESCUTA",
  "QUALIFICACAO",
  "DOR",
  "VALOR",
  "PERSONALIZACAO",
  "OBJECOES",
  "SEGURANCA_DA_INFORMACAO",
  "EMPATIA",
  "PROXIMO_PASSO",
  "FECHAMENTO",
  "CONFORMIDADE",
  "REGISTRO_NO_CRM",
];

export const ROTULO_CRITERIO: Record<CriterioDeQA, string> = {
  VELOCIDADE: "Velocidade da primeira resposta",
  ABERTURA: "Abertura",
  CLAREZA: "Clareza",
  ESCUTA: "Escuta e descoberta",
  QUALIFICACAO: "Qualificação",
  DOR: "Identificação da dor",
  VALOR: "Apresentação de valor",
  PERSONALIZACAO: "Personalização",
  OBJECOES: "Tratamento de objeções",
  SEGURANCA_DA_INFORMACAO: "Segurança das informações",
  EMPATIA: "Empatia",
  PROXIMO_PASSO: "Próximo passo",
  FECHAMENTO: "Tentativa de fechamento",
  CONFORMIDADE: "Conformidade",
  REGISTRO_NO_CRM: "Registro correto no CRM",
};

/**
 * Os pesos. Nem todo critério vale o mesmo.
 *
 * `SEGURANCA_DA_INFORMACAO` e `CONFORMIDADE` pesam mais que o resto porque
 * errar neles não é vender mal — é criar problema jurídico ou prometer o que o
 * produto não faz. Um vendedor simpático que inventa funcionalidade custa mais
 * caro que um vendedor seco.
 */
export const PESO: Record<CriterioDeQA, number> = {
  VELOCIDADE: 1,
  ABERTURA: 1,
  CLAREZA: 1,
  ESCUTA: 1.5,
  QUALIFICACAO: 1.5,
  DOR: 1.5,
  VALOR: 1.5,
  PERSONALIZACAO: 1,
  OBJECOES: 1.5,
  SEGURANCA_DA_INFORMACAO: 2,
  EMPATIA: 1,
  PROXIMO_PASSO: 1.5,
  FECHAMENTO: 1,
  CONFORMIDADE: 2,
  REGISTRO_NO_CRM: 1,
};

/** Abaixo disto, o comentário é obrigatório. */
export const NOTA_QUE_EXIGE_EXPLICACAO = 3;

export interface NotaDeCriterio {
  criterio: CriterioDeQA;
  /** 0 a 5. `null` = não se aplica a esta conversa. */
  nota: number | null;
  comentario?: string | null;
  /** A mensagem que sustenta a nota. */
  mensagemId?: string | null;
}

export interface RecusaDeQA {
  campo: string;
  motivo: string;
}

/**
 * O que uma avaliação precisa ter para ser publicada.
 *
 * Rascunho não passa por aqui — é possível salvar pela metade. A validação vale
 * na PUBLICAÇÃO, que é o momento em que a nota passa a valer para o avaliado.
 */
export function validarAvaliacao(notas: NotaDeCriterio[]): RecusaDeQA[] {
  const recusas: RecusaDeQA[] = [];

  if (notas.length === 0) {
    recusas.push({ campo: "criterios", motivo: "uma avaliação sem nenhum critério não avalia nada" });
    return recusas;
  }

  const vistos = new Set<CriterioDeQA>();

  for (const n of notas) {
    if (vistos.has(n.criterio)) {
      recusas.push({ campo: n.criterio, motivo: "critério avaliado duas vezes" });
    }
    vistos.add(n.criterio);

    if (n.nota === null) continue;

    if (n.nota < 0 || n.nota > 5 || !Number.isInteger(n.nota)) {
      recusas.push({ campo: n.criterio, motivo: "a nota vai de 0 a 5, ou fica em branco quando não se aplica" });
      continue;
    }

    // A regra 1. Nota baixa sem explicação não ensina e não se defende.
    if (n.nota < NOTA_QUE_EXIGE_EXPLICACAO && !n.comentario?.trim()) {
      recusas.push({
        campo: n.criterio,
        motivo: `nota ${n.nota} precisa dizer por quê — sem isso não vira coaching, vira só uma nota ruim`,
      });
    }
  }

  // Pelo menos um critério com nota. Uma avaliação com quinze "não se aplica" é
  // uma avaliação vazia com aparência de completa.
  const comNota = notas.filter((n) => n.nota !== null);
  if (comNota.length === 0) {
    recusas.push({
      campo: "criterios",
      motivo: "todos os critérios ficaram em branco — não há avaliação nenhuma aqui",
    });
  }

  return recusas;
}

export type NotaFinal =
  | { calculada: true; nota: number; criteriosContados: number }
  /** Nenhum critério aplicável: não há nota a calcular. */
  | { calculada: false; motivo: "nadaSeAplica" };

/**
 * A nota final, 0–100, ponderada.
 *
 * ── POR QUE O DENOMINADOR SÓ CONTA O QUE FOI AVALIADO ───────────────────────
 *
 * Critérios `null` saem do numerador E do denominador. Se ficassem no
 * denominador, uma conversa curta e correta — em que metade dos critérios não
 * se aplica — tiraria nota baixa por não ter tido a chance de pontuar. O
 * vendedor seria punido pelo tamanho da conversa, que é exatamente o defeito
 * que o item 13 manda evitar, entrando pela porta dos fundos.
 */
export function calcularNota(notas: NotaDeCriterio[]): NotaFinal {
  const aplicaveis = notas.filter((n) => n.nota !== null);
  if (aplicaveis.length === 0) return { calculada: false, motivo: "nadaSeAplica" };

  let soma = 0;
  let pesos = 0;

  for (const n of aplicaveis) {
    const peso = PESO[n.criterio] ?? 1;
    soma += (n.nota as number) * peso;
    pesos += peso;
  }

  const media = soma / pesos; // 0 a 5
  return {
    calculada: true,
    nota: Math.round((media / 5) * 100),
    criteriosContados: aplicaveis.length,
  };
}

/**
 * Esta avaliação exige atenção imediata do gerente?
 *
 * Zero em segurança da informação ou em conformidade é alerta crítico
 * independentemente da média: um vendedor que inventou uma funcionalidade pode
 * ter ido bem em tudo o mais, e a média o esconderia atrás de um 78.
 */
export function ehAlertaCritico(notas: NotaDeCriterio[]): boolean {
  return notas.some(
    (n) =>
      n.nota !== null &&
      n.nota <= 1 &&
      (n.criterio === "SEGURANCA_DA_INFORMACAO" || n.criterio === "CONFORMIDADE"),
  );
}

// ── Escrita ──────────────────────────────────────────────────────────────────

export interface NovaAvaliacao {
  leadId: string;
  avaliado: AutorDaMensagem;
  avaliadoUserId?: string | null;
  avaliadorId?: string | null;
  origem?: OrigemDaAvaliacao;
  etapa?: SiteLeadStage | null;
  notas: NotaDeCriterio[];
  pontosFortes?: string | null;
  falhas?: string | null;
  oportunidades?: string | null;
  coaching?: string | null;
  riscoDePerda?: boolean;
  /** Publicar já, ou deixar em rascunho. */
  publicar?: boolean;
}

export type ResultadoDeAvaliar =
  | { ok: true; avaliacaoId: string; nota: number | null }
  | { ok: false; recusas: RecusaDeQA[] };

/**
 * Grava a avaliação com os critérios e as evidências.
 *
 * A validação só corre quando `publicar` é verdadeiro — rascunho pela metade é
 * o fluxo normal de quem avalia dez conversas numa tarde e é interrompido.
 */
export async function avaliar(
  db: PrismaClient,
  a: NovaAvaliacao,
): Promise<ResultadoDeAvaliar> {
  if (a.publicar) {
    const recusas = validarAvaliacao(a.notas);
    if (recusas.length) return { ok: false, recusas };
  }

  const final = calcularNota(a.notas);
  const nota = final.calculada ? final.nota : null;

  const id = await db.$transaction(async (tx) => {
    const criada = await tx.leadAvaliacaoQA.create({
      data: {
        leadId: a.leadId,
        origem: a.origem ?? "HUMANA",
        situacao: a.publicar ? "PUBLICADA" : "RASCUNHO",
        avaliado: a.avaliado,
        avaliadoUserId: a.avaliadoUserId ?? null,
        avaliadorId: a.avaliadorId ?? null,
        nota,
        etapa: a.etapa ?? null,
        pontosFortes: a.pontosFortes?.trim() || null,
        falhas: a.falhas?.trim() || null,
        oportunidades: a.oportunidades?.trim() || null,
        coaching: a.coaching?.trim() || null,
        riscoDePerda: a.riscoDePerda ?? false,
        alertaCritico: ehAlertaCritico(a.notas),
      },
      select: { id: true },
    });

    if (a.notas.length) {
      await tx.leadAvaliacaoCriterio.createMany({
        data: a.notas.map((n) => ({
          avaliacaoId: criada.id,
          criterio: n.criterio,
          nota: n.nota,
          comentario: n.comentario?.trim() || null,
          mensagemId: n.mensagemId ?? null,
        })),
      });
    }

    return criada.id;
  });

  return { ok: true, avaliacaoId: id, nota };
}

export type ResultadoDeContestar =
  | { ok: true }
  | { ok: false; causa: "naoExiste" | "semTexto" | "naoPublicada" | "naoEhSeu" };

/**
 * O avaliado contesta a nota.
 *
 * Só quem foi avaliado contesta — a condição vai dentro do `where`. E só
 * avaliação PUBLICADA aceita contestação: contestar um rascunho é discutir uma
 * nota que ainda não existe.
 */
export async function contestar(
  db: Cliente,
  params: { avaliacaoId: string; porUserId: string; texto: string; agora?: Date },
): Promise<ResultadoDeContestar> {
  const texto = params.texto?.trim();
  if (!texto) return { ok: false, causa: "semTexto" };

  const alterados = await db.leadAvaliacaoQA.updateMany({
    where: {
      id: params.avaliacaoId,
      avaliadoUserId: params.porUserId,
      situacao: "PUBLICADA",
    },
    data: {
      situacao: "CONTESTADA",
      contestacao: texto,
      contestadaEm: params.agora ?? new Date(),
    },
  });

  if (alterados.count === 1) return { ok: true };

  const existe = await db.leadAvaliacaoQA.findUnique({
    where: { id: params.avaliacaoId },
    select: { avaliadoUserId: true, situacao: true },
  });

  if (!existe) return { ok: false, causa: "naoExiste" };
  if (existe.avaliadoUserId !== params.porUserId) return { ok: false, causa: "naoEhSeu" };
  return { ok: false, causa: "naoPublicada" };
}

/**
 * O gerente responde a contestação, podendo corrigir a nota.
 *
 * A nota nova é opcional: rever não obriga a mudar. O que obriga é responder —
 * uma contestação sem resposta ensina que contestar não adianta, e aí ninguém
 * contesta mais e o QA volta a ser um número que ninguém discute.
 */
export async function revisarContestacao(
  db: Cliente,
  params: {
    avaliacaoId: string;
    revisorId: string;
    resposta: string;
    novaNota?: number | null;
    agora?: Date;
  },
): Promise<{ ok: true } | { ok: false; causa: "naoExiste" | "semResposta" | "naoContestada" }> {
  const resposta = params.resposta?.trim();
  if (!resposta) return { ok: false, causa: "semResposta" };

  const alterados = await db.leadAvaliacaoQA.updateMany({
    where: { id: params.avaliacaoId, situacao: "CONTESTADA" },
    data: {
      situacao: "REVISADA",
      respostaDaRevisao: resposta,
      revisadaEm: params.agora ?? new Date(),
      ...(params.novaNota !== undefined ? { nota: params.novaNota } : {}),
    },
  });

  if (alterados.count === 1) return { ok: true };

  const existe = await db.leadAvaliacaoQA.findUnique({
    where: { id: params.avaliacaoId },
    select: { id: true },
  });
  return existe ? { ok: false, causa: "naoContestada" } : { ok: false, causa: "naoExiste" };
}

// ── Leitura ──────────────────────────────────────────────────────────────────

export type DesempenhoDeQA =
  | { medido: true; media: number; avaliacoes: number; alertas: number }
  /** Ninguém avaliou: não há desempenho a mostrar. Diferente de nota zero. */
  | { medido: false; motivo: "semAvaliacoes" };

/**
 * A média de QA de um avaliado.
 *
 * Devolve "não medido" quando não houve avaliação. Mostrar zero para quem nunca
 * foi avaliado é a mentira mais cara desta tela: o SDR novo apareceria no fim do
 * ranking na primeira semana, sem ninguém ter olhado uma conversa dele.
 */
export async function desempenhoDe(
  db: Cliente,
  params: { avaliadoUserId?: string | null; avaliado?: AutorDaMensagem; de?: Date; ate?: Date },
): Promise<DesempenhoDeQA> {
  const where: Prisma.LeadAvaliacaoQAWhereInput = {
    situacao: { in: ["PUBLICADA", "REVISADA"] },
    nota: { not: null },
    ...(params.avaliadoUserId ? { avaliadoUserId: params.avaliadoUserId } : {}),
    ...(params.avaliado ? { avaliado: params.avaliado } : {}),
    ...(params.de || params.ate
      ? { createdAt: { ...(params.de ? { gte: params.de } : {}), ...(params.ate ? { lt: params.ate } : {}) } }
      : {}),
  };

  const [agregado, alertas] = await Promise.all([
    db.leadAvaliacaoQA.aggregate({ where, _avg: { nota: true }, _count: { _all: true } }),
    db.leadAvaliacaoQA.count({ where: { ...where, alertaCritico: true } }),
  ]);

  if (agregado._count._all === 0) return { medido: false, motivo: "semAvaliacoes" };

  return {
    medido: true,
    media: Math.round(agregado._avg.nota ?? 0),
    avaliacoes: agregado._count._all,
    alertas,
  };
}

export interface ConversaParaRevisar {
  leadId: string;
  nome: string;
  etapa: SiteLeadStage;
  atendidoPor: string;
  ultimaMensagemEm: Date | null;
  porque: string;
}

/**
 * A fila de conversas que valem uma olhada.
 *
 * ── COMO A FILA É ESCOLHIDA, E POR QUE NÃO É ALEATÓRIA ──────────────────────
 *
 * Amostragem aleatória distribui o esforço de forma justa e encontra pouco. Esta
 * fila prioriza conversa que já deu errado ou está prestes a dar: perdida
 * recente e lead quente parado. São os dois lugares onde a revisão ainda muda
 * alguma coisa — no primeiro caso para aprender, no segundo para salvar.
 */
export async function filaDeRevisao(
  db: Cliente,
  params: { agora: Date; limite?: number },
): Promise<ConversaParaRevisar[]> {
  const limite = params.limite ?? 20;
  const seteDias = new Date(params.agora.getTime() - 7 * 86_400_000);
  const doisDias = new Date(params.agora.getTime() - 2 * 86_400_000);

  const [perdidos, quentesParados] = await Promise.all([
    db.siteLead.findMany({
      where: { stage: "PERDIDO", stageChangedAt: { gte: seteDias }, avaliacoes: { none: {} } },
      orderBy: { stageChangedAt: "desc" },
      take: limite,
      select: {
        id: true, nome: true, stage: true,
        atendidoPor: true, ultimaMensagemEm: true,
      },
    }),
    db.siteLead.findMany({
      where: {
        temperatura: { in: ["QUENTE", "PRIORIDADE_MAXIMA"] },
        ultimaMensagemEm: { not: null, lt: doisDias },
        stage: { notIn: ["GANHO", "PERDIDO", "NUTRICAO"] },
        avaliacoes: { none: {} },
      },
      orderBy: { ultimaMensagemEm: "asc" },
      take: limite,
      select: {
        id: true, nome: true, stage: true,
        atendidoPor: true, ultimaMensagemEm: true,
      },
    }),
  ]);

  const vistos = new Set<string>();
  const saida: ConversaParaRevisar[] = [];

  for (const [lista, porque] of [
    [perdidos, "perdido nos últimos 7 dias"],
    [quentesParados, "lead quente parado há mais de 2 dias"],
  ] as const) {
    for (const l of lista) {
      if (vistos.has(l.id)) continue;
      vistos.add(l.id);
      saida.push({
        leadId: l.id,
        nome: l.nome,
        etapa: l.stage,
        atendidoPor: l.atendidoPor,
        ultimaMensagemEm: l.ultimaMensagemEm,
        porque,
      });
    }
  }

  return saida.slice(0, limite);
}
