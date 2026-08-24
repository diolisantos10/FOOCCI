/**
 * A AGENDA DA SALA DE VENDAS.
 *
 * ── O QUE ELA MEDE, E POR QUE ISSO DECIDE O DESENHO ─────────────────────────
 *
 * Uma agenda comercial não existe para mostrar horários. Ela existe para
 * responder três perguntas que decidem o mês:
 *
 *   1. Quantas demonstrações foram marcadas?
 *   2. **Quantas aconteceram?**
 *   3. O que deu errado entre uma coisa e outra?
 *
 * A segunda é a que a maioria dos sistemas perde, porque trata "não apareceu"
 * como um cancelamento. Não é: quem cancelou avisou, quem não apareceu sumiu — e
 * os dois pedem ações opostas. Por isso `NAO_COMPARECEU` é estado próprio, e por
 * isso remarcar encadeia em vez de sobrescrever: remarcar três vezes é um sinal,
 * e apagar o anterior apaga o sinal.
 *
 * ── O QUE NÃO SE FAZ AQUI ───────────────────────────────────────────────────
 *
 * Item 12: *"Não impor integração externa se o projeto ainda não possuir
 * provedor definido."* Não há Google Calendar, não há convite .ics, não há
 * fuso configurável por usuário. A estrutura aceita tudo isso depois; fingir
 * agora produziria uma agenda que promete sincronizar e não sincroniza.
 *
 * `MeetingSlot` continua existindo e é outra coisa: são as janelas que o CEO
 * abre no site para o visitante escolher. Este arquivo trata do compromisso em
 * si, que também nasce de conversa e de telefone.
 */

import type { Prisma, PrismaClient, SituacaoDoCompromisso } from "@prisma/client";

type Cliente = PrismaClient | Prisma.TransactionClient;

export interface NovoCompromisso {
  leadId: string;
  titulo: string;
  comecaEm: Date;
  duracaoMin?: number;
  local?: string | null;
  nota?: string | null;
  responsavelId?: string | null;
}

export interface RecusaDeCompromisso {
  campo: string;
  motivo: string;
}

export function validarCompromisso(
  c: NovoCompromisso,
  agora: Date,
): RecusaDeCompromisso[] {
  const recusas: RecusaDeCompromisso[] = [];

  if (!c.titulo?.trim()) {
    recusas.push({ campo: "titulo", motivo: "sem título a agenda não diz o que é o compromisso" });
  }

  if (!(c.comecaEm instanceof Date) || Number.isNaN(c.comecaEm.getTime())) {
    recusas.push({ campo: "comecaEm", motivo: "todo compromisso tem hora" });
    return recusas;
  }

  // Agendar no passado é recusado — ao contrário da tarefa, que aceita atraso.
  // A diferença é real: tarefa vencida é trabalho atrasado, e precisa aparecer
  // como atraso; compromisso no passado é engano de digitação, e cria uma
  // demonstração que nunca vai acontecer nem cobrar ninguém.
  if (c.comecaEm < agora) {
    recusas.push({ campo: "comecaEm", motivo: "compromisso no passado — confira a data" });
  }

  if (c.duracaoMin !== undefined && (c.duracaoMin < 5 || c.duracaoMin > 480)) {
    recusas.push({ campo: "duracaoMin", motivo: "duração entre 5 minutos e 8 horas" });
  }

  return recusas;
}

export type ResultadoDeAgendar =
  | { ok: true; compromissoId: string }
  | { ok: false; recusas: RecusaDeCompromisso[] };

/**
 * Marca um compromisso e cria a tarefa de confirmação.
 *
 * A confirmação nasce junto porque demonstração marcada e não confirmada é a
 * maior fonte de não comparecimento — e uma agenda que só marca, sem cobrar a
 * confirmação, entrega o não comparecimento como surpresa no dia.
 */
export async function agendar(
  db: PrismaClient,
  c: NovoCompromisso,
  agora: Date = new Date(),
): Promise<ResultadoDeAgendar> {
  const recusas = validarCompromisso(c, agora);
  if (recusas.length) return { ok: false, recusas };

  const id = await db.$transaction(async (tx) => {
    const criado = await tx.leadCompromisso.create({
      data: {
        leadId: c.leadId,
        titulo: c.titulo.trim(),
        comecaEm: c.comecaEm,
        duracaoMin: c.duracaoMin ?? 30,
        local: c.local?.trim() || null,
        nota: c.nota?.trim() || null,
        responsavelId: c.responsavelId ?? null,
      },
      select: { id: true },
    });

    // Confirmar 24h antes — ou agora, se a demo é para daqui a poucas horas.
    const umDiaAntes = new Date(c.comecaEm.getTime() - 86_400_000);
    const venceEm = umDiaAntes > agora ? umDiaAntes : agora;

    await tx.leadTarefa.create({
      data: {
        leadId: c.leadId,
        tipo: "CONFIRMACAO_DE_REUNIAO",
        titulo: `Confirmar: ${c.titulo.trim()}`,
        venceEm,
        responsavelId: c.responsavelId ?? null,
        criadaPor: "SISTEMA",
      },
    });

    return criado.id;
  });

  return { ok: true, compromissoId: id };
}

export type ResultadoDeMarcarSituacao =
  | { ok: true }
  | { ok: false; causa: "naoExiste" | "jaEncerrado" };

/** Situações que encerram o compromisso — não se sai delas por caminho normal. */
const ENCERRADAS: readonly SituacaoDoCompromisso[] = [
  "REALIZADO", "NAO_COMPARECEU", "CANCELADO", "REAGENDADO",
];

/**
 * Registra o desfecho.
 *
 * Escrita condicional: o compromisso só sai de uma situação aberta. Marcar
 * "realizado" num compromisso já marcado como "não compareceu" apagaria
 * justamente o dado que a operação precisa — e é um clique fácil de dar numa
 * lista, no dia seguinte, quando ninguém lembra mais.
 */
export async function marcarSituacao(
  db: Cliente,
  params: { compromissoId: string; situacao: SituacaoDoCompromisso; nota?: string | null },
): Promise<ResultadoDeMarcarSituacao> {
  const atual = await db.leadCompromisso.findUnique({
    where: { id: params.compromissoId },
    select: { situacao: true },
  });

  if (!atual) return { ok: false, causa: "naoExiste" };
  if (ENCERRADAS.includes(atual.situacao)) return { ok: false, causa: "jaEncerrado" };

  const alterados = await db.leadCompromisso.updateMany({
    where: { id: params.compromissoId, situacao: atual.situacao },
    data: {
      situacao: params.situacao,
      nota: params.nota?.trim() || undefined,
      confirmadoEm: params.situacao === "CONFIRMADO" ? new Date() : undefined,
    },
  });

  return alterados.count === 1 ? { ok: true } : { ok: false, causa: "jaEncerrado" };
}

export type ResultadoDeRemarcar =
  | { ok: true; novoId: string }
  | { ok: false; recusas: RecusaDeCompromisso[] }
  | { ok: false; causa: "naoExiste" | "jaEncerrado" };

/**
 * Remarca, encadeando o novo ao antigo.
 *
 * O antigo vira REAGENDADO e aponta para o novo. Sobrescrever a data no mesmo
 * registro seria mais simples e apagaria a informação que interessa: um lead
 * remarcado três vezes é um lead que provavelmente não vai fechar, e sem a
 * cadeia ele parece um lead com uma demonstração marcada como qualquer outro.
 */
export async function remarcar(
  db: PrismaClient,
  params: {
    compromissoId: string;
    novoComecaEm: Date;
    motivo?: string | null;
    agora?: Date;
  },
): Promise<ResultadoDeRemarcar> {
  const agora = params.agora ?? new Date();

  const antigo = await db.leadCompromisso.findUnique({
    where: { id: params.compromissoId },
    select: {
      id: true, leadId: true, titulo: true, duracaoMin: true,
      local: true, responsavelId: true, situacao: true,
    },
  });

  if (!antigo) return { ok: false, causa: "naoExiste" };
  if (ENCERRADAS.includes(antigo.situacao)) return { ok: false, causa: "jaEncerrado" };

  const recusas = validarCompromisso(
    { leadId: antigo.leadId, titulo: antigo.titulo, comecaEm: params.novoComecaEm },
    agora,
  );
  if (recusas.length) return { ok: false, recusas };

  const novoId = await db.$transaction(async (tx) => {
    const novo = await tx.leadCompromisso.create({
      data: {
        leadId: antigo.leadId,
        titulo: antigo.titulo,
        comecaEm: params.novoComecaEm,
        duracaoMin: antigo.duracaoMin,
        local: antigo.local,
        responsavelId: antigo.responsavelId,
        nota: params.motivo?.trim() || null,
      },
      select: { id: true },
    });

    await tx.leadCompromisso.update({
      where: { id: antigo.id },
      data: { situacao: "REAGENDADO", remarcadoParaId: novo.id },
    });

    return novo.id;
  });

  return { ok: true, novoId };
}

// ── Leitura ──────────────────────────────────────────────────────────────────

export interface CompromissoNaAgenda {
  id: string;
  leadId: string;
  leadNome: string;
  titulo: string;
  situacao: SituacaoDoCompromisso;
  comecaEm: Date;
  duracaoMin: number;
  responsavelNome: string | null;
}

/** Os compromissos de uma janela — dia, semana ou mês, quem decide é quem chama. */
export async function agendaDaJanela(
  db: Cliente,
  params: { de: Date; ate: Date; responsavelId?: string | null },
): Promise<CompromissoNaAgenda[]> {
  const linhas = await db.leadCompromisso.findMany({
    where: {
      comecaEm: { gte: params.de, lt: params.ate },
      ...(params.responsavelId ? { responsavelId: params.responsavelId } : {}),
    },
    orderBy: { comecaEm: "asc" },
    select: {
      id: true, leadId: true, titulo: true, situacao: true,
      comecaEm: true, duracaoMin: true,
      lead: { select: { nome: true } },
      responsavel: { select: { nome: true } },
    },
  });

  return linhas.map((l) => ({
    id: l.id,
    leadId: l.leadId,
    leadNome: l.lead.nome,
    titulo: l.titulo,
    situacao: l.situacao,
    comecaEm: l.comecaEm,
    duracaoMin: l.duracaoMin,
    responsavelNome: l.responsavel?.nome ?? null,
  }));
}

export type Comparecimento =
  | { medido: true; realizadas: number; naoCompareceram: number; taxa: number }
  /** Nenhuma demonstração no período: não há taxa a calcular. */
  | { medido: false; motivo: "semDemonstracoes" };

/**
 * A taxa de comparecimento.
 *
 * Devolve `medido: false` quando não houve demonstração no período — e não 0%
 * nem 100%. As duas seriam mentiras convictas: 0% acusa uma operação que não
 * fez nada de errado, e 100% comemora um mês em que ninguém marcou nada.
 *
 * É a mesma trava de amostra mínima que `foocciCrmFunnel` já aplica às taxas do
 * funil, e pelo mesmo motivo.
 */
export async function taxaDeComparecimento(
  db: Cliente,
  params: { de: Date; ate: Date },
): Promise<Comparecimento> {
  const [realizadas, naoCompareceram] = await Promise.all([
    db.leadCompromisso.count({
      where: { comecaEm: { gte: params.de, lt: params.ate }, situacao: "REALIZADO" },
    }),
    db.leadCompromisso.count({
      where: { comecaEm: { gte: params.de, lt: params.ate }, situacao: "NAO_COMPARECEU" },
    }),
  ]);

  const total = realizadas + naoCompareceram;
  if (total === 0) return { medido: false, motivo: "semDemonstracoes" };

  return { medido: true, realizadas, naoCompareceram, taxa: realizadas / total };
}
