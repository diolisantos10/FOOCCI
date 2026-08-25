/**
 * O HANDOFF — a passagem de bastão entre departamentos.
 *
 * O plano mestre (documento 09, seção 3.4) tem uma frase que governa este
 * arquivo inteiro:
 *
 *   "O item permanece com o emissor até o aceite do destino ou regra explícita."
 *
 * E a ficha 2.3 do catálogo diz o mesmo com outras palavras, sobre o SDR humano:
 *
 *   "Assumir é ATÔMICO. Ao confirmar, o humano vira responsável e a IA silencia
 *    ANTES do próximo envio — com lock e transação, não com boa intenção."
 *
 * ── POR QUE NÃO SE FAZ ISSO COM `findUnique` + `update` ──
 *
 * O jeito natural de escrever seria:
 *
 *     const h = await prisma.handoff.findUnique({ where: { id } });
 *     if (h.status !== "ENVIADO") return jaFoi();
 *     await prisma.handoff.update({ where: { id }, data: { status: "ACEITO" } });
 *
 * Entre a leitura e a escrita cabe outra requisição inteira. Dois atendentes
 * clicando "assumir" no mesmo segundo passam os dois pelo `if`, e os dois
 * escrevem. O segundo sobrescreve o primeiro em silêncio: dois humanos acham que
 * são donos da mesma conversa, e o cliente recebe duas respostas diferentes.
 *
 * A janela é pequena e é exatamente por isso que ela machuca — o defeito só
 * aparece quando o sistema está ocupado, que é quando ninguém pode investigar.
 *
 * ── O QUE ESTE ARQUIVO FAZ NO LUGAR ──
 *
 * A condição vai DENTRO da escrita:
 *
 *     updateMany({ where: { id, status: "ENVIADO" }, data: { ... } })
 *
 * O `where` e o `data` são a mesma instrução para o Postgres. Dois aceites
 * simultâneos disputam a mesma linha; um sai com `count: 1` e o outro com
 * `count: 0`. Não há janela porque não há intervalo entre ler e escrever.
 *
 * O perdedor recebe uma resposta clara ("outra pessoa aceitou antes"), não um
 * sucesso falso.
 */

import type { Prisma, PrismaClient, HandoffStatus } from "@prisma/client";

/** O subconjunto do Prisma que este módulo usa. Facilita testar sem banco. */
type Cliente = PrismaClient | Prisma.TransactionClient;

// ── A máquina de estados, pura ────────────────────────────────────────────────

/**
 * De quem é o item, dado o estado do handoff.
 *
 * É a tradução direta da frase do documento 09, isolada numa função para poder
 * ser exercitada nos quatro estados sem subir banco nenhum.
 */
export type Posse = "emissor" | "destino";

export function posseDoItem(status: HandoffStatus): Posse {
  // ENVIADO: ainda não houve aceite → é do emissor.
  // RECUSADO e DEVOLVIDO: voltou → é do emissor.
  // ACEITO: é o único estado em que a posse mudou.
  return status === "ACEITO" ? "destino" : "emissor";
}

/** Transições permitidas. Tudo que não estiver aqui é proibido. */
const TRANSICOES: Readonly<Record<HandoffStatus, readonly HandoffStatus[]>> = {
  ENVIADO: ["ACEITO", "RECUSADO"],
  // Aceito é final: depois do aceite, o que existe é trabalho novo, não desfazer
  // o passado. Devolver trabalho aceito é um handoff NOVO, na direção contrária
  // — e assim a linha do tempo mostra as duas passagens, em vez de uma sumir.
  ACEITO: [],
  RECUSADO: [],
  DEVOLVIDO: [],
};

export function podeIrPara(de: HandoffStatus, para: HandoffStatus): boolean {
  return TRANSICOES[de].includes(para);
}

// ── Criação ──────────────────────────────────────────────────────────────────

export interface ItemDoHandoff {
  workOrderId?: string | null;
  projectId?: string | null;
  taskId?: string | null;
}

export interface NovoHandoff extends ItemDoHandoff {
  origemDepartmentId: string;
  destinoDepartmentId: string;
  responsavelPositionId?: string | null;
  resumo: string;
  entregaveis: string[];
  evidencias?: string[];
  pendencias?: string[];
  slaHoras?: number | null;
  enviadoPorId?: string | null;
}

export type Recusa =
  | { campo: "item"; motivo: string }
  | { campo: "resumo"; motivo: string }
  | { campo: "entregaveis"; motivo: string }
  | { campo: "departamentos"; motivo: string }
  | { campo: "slaHoras"; motivo: string };

/**
 * Valida um handoff antes de ele existir.
 *
 * Cada regra aqui é uma coisa que, se passasse, produziria um handoff que parece
 * trabalho e não é.
 */
export function validarHandoff(novo: NovoHandoff): Recusa[] {
  const recusas: Recusa[] = [];

  const itens = [novo.workOrderId, novo.projectId, novo.taskId].filter(Boolean);
  if (itens.length === 0) {
    recusas.push({ campo: "item", motivo: "handoff sem item: não há o que passar" });
  } else if (itens.length > 1) {
    // Dois itens fariam o aceite mover duas coisas ao mesmo tempo, e a pergunta
    // "quem é o dono agora?" passaria a ter duas respostas.
    recusas.push({ campo: "item", motivo: "handoff com mais de um item: passe um de cada vez" });
  }

  if (!novo.resumo?.trim()) {
    recusas.push({ campo: "resumo", motivo: "resumo vazio: quem recebe precisa saber o que chegou" });
  }

  if (!novo.entregaveis?.length) {
    // Handoff sem entregável é uma conversa. O destino não tem como saber o que
    // recebeu, e o emissor não tem como provar que entregou.
    recusas.push({ campo: "entregaveis", motivo: "nenhum entregável declarado" });
  }

  if (novo.origemDepartmentId === novo.destinoDepartmentId) {
    recusas.push({ campo: "departamentos", motivo: "origem e destino são o mesmo departamento" });
  }

  if (novo.slaHoras !== undefined && novo.slaHoras !== null && novo.slaHoras <= 0) {
    // SLA zero não é "sem SLA": é um prazo já vencido no instante do envio.
    // "Sem SLA acordado" se escreve com `null`.
    recusas.push({ campo: "slaHoras", motivo: "SLA deve ser positivo; use null para 'sem SLA'" });
  }

  return recusas;
}

// ── Aceite ───────────────────────────────────────────────────────────────────

export type ResultadoDeAceite =
  | { ok: true; handoffId: string }
  | { ok: false; causa: "naoExiste" }
  | { ok: false; causa: "jaResolvido"; status: HandoffStatus; aceitoPorId: string | null };

/**
 * Aceita um handoff. Atômico.
 *
 * A condição de estado vai dentro do `where` do `updateMany` — é isso, e só
 * isso, que impede dois aceites simultâneos de passarem os dois.
 *
 * Devolve `ok: false` com a causa em vez de lançar: perder a corrida não é erro
 * de programa, é um resultado normal que a tela precisa saber explicar
 * ("Fulano assumiu primeiro").
 */
export async function aceitarHandoff(
  db: Cliente,
  params: { handoffId: string; aceitoPorId: string; agora?: Date },
): Promise<ResultadoDeAceite> {
  const agora = params.agora ?? new Date();

  const alterados = await db.handoff.updateMany({
    where: { id: params.handoffId, status: "ENVIADO" },
    data: { status: "ACEITO", aceitoPorId: params.aceitoPorId, aceitoEm: agora },
  });

  if (alterados.count === 1) {
    await registrarEvento(db, {
      tipo: "handoff.aceito",
      entidade: "Handoff",
      entidadeId: params.handoffId,
      atorTipo: "INTERNAL_USER",
      atorRotulo: params.aceitoPorId,
      dados: { aceitoEm: agora.toISOString() },
    });
    return { ok: true, handoffId: params.handoffId };
  }

  // Perdeu a corrida — ou o handoff não existe. Só agora vale a pena ler, e a
  // leitura serve para EXPLICAR, não para decidir.
  const atual = await db.handoff.findUnique({
    where: { id: params.handoffId },
    select: { status: true, aceitoPorId: true },
  });

  if (!atual) return { ok: false, causa: "naoExiste" };
  return { ok: false, causa: "jaResolvido", status: atual.status, aceitoPorId: atual.aceitoPorId };
}

export type ResultadoDeRecusa =
  | { ok: true; handoffId: string }
  | { ok: false; causa: "naoExiste" }
  | { ok: false; causa: "semMotivo" }
  | { ok: false; causa: "jaResolvido"; status: HandoffStatus };

/**
 * Recusa um handoff, com motivo obrigatório.
 *
 * Mesma escrita condicional do aceite: recusar e aceitar disputam a mesma linha,
 * então os dois precisam da mesma trava. Sem isso, aceitar e recusar ao mesmo
 * tempo deixaria o handoff num estado que depende de quem escreveu por último.
 */
export async function recusarHandoff(
  db: Cliente,
  params: { handoffId: string; motivo: string; agora?: Date },
): Promise<ResultadoDeRecusa> {
  const motivo = params.motivo?.trim();
  if (!motivo) return { ok: false, causa: "semMotivo" };

  const agora = params.agora ?? new Date();

  const alterados = await db.handoff.updateMany({
    where: { id: params.handoffId, status: "ENVIADO" },
    data: { status: "RECUSADO", recusadoEm: agora, motivo },
  });

  if (alterados.count === 1) {
    await registrarEvento(db, {
      tipo: "handoff.recusado",
      entidade: "Handoff",
      entidadeId: params.handoffId,
      atorTipo: "INTERNAL_USER",
      dados: { motivo, recusadoEm: agora.toISOString() },
    });
    return { ok: true, handoffId: params.handoffId };
  }

  const atual = await db.handoff.findUnique({
    where: { id: params.handoffId },
    select: { status: true },
  });

  if (!atual) return { ok: false, causa: "naoExiste" };
  return { ok: false, causa: "jaResolvido", status: atual.status };
}

// ── SLA ──────────────────────────────────────────────────────────────────────

export type SituacaoDeSla =
  | { estado: "semSla" }
  | { estado: "dentro"; horasRestantes: number }
  | { estado: "vencido"; horasVencidas: number }
  | { estado: "naoSeAplica" };

/**
 * O SLA de aceite de um handoff.
 *
 * Três estados, e o primeiro é o que evita a mentira: **sem SLA acordado não é
 * "dentro do prazo"**. Um handoff sem prazo combinado não está cumprindo prazo
 * nenhum, e pintá-lo de verde faria a tela afirmar um acordo que não existe.
 *
 * É a mesma regra do tipo `Medida` da Sala dos Agentes: não escrever zero — nem
 * verde — quando a resposta é "não sei".
 */
export function situacaoDoSla(
  handoff: { status: HandoffStatus; slaHoras: number | null; enviadoEm: Date },
  agora: Date,
): SituacaoDeSla {
  if (handoff.status !== "ENVIADO") return { estado: "naoSeAplica" };
  if (handoff.slaHoras === null) return { estado: "semSla" };

  const limite = handoff.enviadoEm.getTime() + handoff.slaHoras * 3_600_000;
  const diferencaEmHoras = (limite - agora.getTime()) / 3_600_000;

  return diferencaEmHoras >= 0
    ? { estado: "dentro", horasRestantes: diferencaEmHoras }
    : { estado: "vencido", horasVencidas: -diferencaEmHoras };
}

// ── Linha do tempo ───────────────────────────────────────────────────────────

export interface NovoEvento {
  tipo: string;
  entidade: string;
  entidadeId: string;
  atorTipo: string;
  atorRotulo?: string | null;
  dados?: Prisma.InputJsonValue;
}

/**
 * Grava um evento na linha do tempo.
 *
 * A tabela é append-only por gatilho no banco. Aqui só se insere — e se alguém
 * um dia tentar um update, o Postgres recusa com
 * `insufficient_privilege`, não com um sucesso silencioso.
 */
export async function registrarEvento(db: Cliente, evento: NovoEvento): Promise<void> {
  await db.domainEvent.create({
    data: {
      tipo: evento.tipo,
      entidade: evento.entidade,
      entidadeId: evento.entidadeId,
      atorTipo: evento.atorTipo,
      atorRotulo: evento.atorRotulo ?? null,
      dados: evento.dados ?? {},
    },
  });
}
