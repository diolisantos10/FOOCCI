/**
 * ORDEM DE SERVIÇO — onde o trabalho da empresa começa.
 *
 * Documento 09, seção 3.2: "Uma OS nasce de uma solicitação executiva ou
 * departamental e pode gerar um projeto." Os campos mínimos estão lá, e o
 * critério de aceite do PR 1.3 é curto:
 *
 *   "OS gera projeto e tarefas com responsável e prazo; nada perde histórico."
 *
 * ── AS DUAS EXIGÊNCIAS QUE PARECEM CHATAS E NÃO SÃO ──
 *
 * **Toda tarefa tem responsável.** Não "quase toda". Tarefa sem responsável é a
 * que ninguém pega: aparece na lista, some da conversa e reaparece atrasada, sem
 * que ninguém tenha falhado — porque não havia quem falhar. O responsável é um
 * CARGO, então uma tarefa pode nascer responsável mesmo com a cadeira vazia:
 * "Gerente de Vendas (vago)" é um endereço, e cobra-se de um endereço.
 *
 * **Toda tarefa tem prazo.** Sem prazo não existe atraso, e sem atraso o painel
 * nunca fica vermelho — o que é bem diferente de estar tudo em dia. Quando a
 * tarefa não traz prazo próprio, ela herda o da OS, e isso é explícito: herdar
 * é uma decisão, não um acidente.
 */

import type { Prisma, PrismaClient, WorkPriority } from "@prisma/client";
import { registrarEvento } from "./handoff";

type Cliente = PrismaClient | Prisma.TransactionClient;

export interface NovaTarefa {
  titulo: string;
  descricao?: string | null;
  assigneePositionId?: string | null;
  assigneeUserId?: string | null;
  prazo?: Date | null;
  prioridade?: WorkPriority;
}

export interface NovaOrdemDeServico {
  objetivo: string;
  resultadoEsperado: string;
  criterioDeAceite: string;

  contexto?: string | null;
  riscos?: string | null;
  restricoes?: string | null;

  prioridade?: WorkPriority;
  prazo?: Date | null;

  solicitanteId?: string | null;
  sponsorPositionId?: string | null;
  ownerPositionId?: string | null;
  departmentId?: string | null;

  /** Se vier, a OS abre um projeto junto. */
  projeto?: { nome: string; objetivo: string } | null;
  tarefas?: NovaTarefa[];
}

export interface RecusaDeOs {
  campo: string;
  motivo: string;
}

/**
 * Valida a OS inteira antes de gravar qualquer coisa.
 *
 * Devolve TODAS as recusas de uma vez. Uma por vez faria quem abre a OS
 * descobrir os problemas em série, num vai-e-volta que ninguém tem paciência de
 * terminar — e o jeito de escapar do vai-e-volta é preencher qualquer coisa.
 */
export function validarOrdemDeServico(nova: NovaOrdemDeServico): RecusaDeOs[] {
  const recusas: RecusaDeOs[] = [];

  if (!nova.objetivo?.trim()) {
    recusas.push({ campo: "objetivo", motivo: "sem objetivo não dá para saber o que se está pedindo" });
  }
  if (!nova.resultadoEsperado?.trim()) {
    recusas.push({ campo: "resultadoEsperado", motivo: "sem resultado esperado não há como saber se terminou" });
  }
  if (!nova.criterioDeAceite?.trim()) {
    // Sem critério de aceite, "pronto" vira opinião — e a discussão acontece no
    // fim, quando o trabalho já foi feito do jeito errado.
    recusas.push({ campo: "criterioDeAceite", motivo: "sem critério de aceite, 'pronto' vira opinião" });
  }

  (nova.tarefas ?? []).forEach((t, i) => {
    const onde = `tarefas[${i}]`;

    if (!t.titulo?.trim()) {
      recusas.push({ campo: `${onde}.titulo`, motivo: "tarefa sem título" });
    }

    if (!t.assigneePositionId && !t.assigneeUserId) {
      recusas.push({
        campo: `${onde}.responsavel`,
        motivo: "tarefa sem responsável: informe o cargo (mesmo vago) ou a pessoa",
      });
    }

    if (!t.prazo && !nova.prazo) {
      recusas.push({
        campo: `${onde}.prazo`,
        motivo: "tarefa sem prazo e OS sem prazo para herdar: sem prazo não existe atraso",
      });
    }
  });

  return recusas;
}

export interface OrdemAberta {
  workOrderId: string;
  numero: number;
  projectId: string | null;
  taskIds: string[];
}

export type ResultadoDeAbertura =
  | { ok: true; ordem: OrdemAberta }
  | { ok: false; recusas: RecusaDeOs[] };

/**
 * Abre a OS, o projeto e as tarefas — tudo ou nada.
 *
 * A transação não é zelo excessivo: uma OS que gravou e cujas tarefas falharam
 * no meio produziria trabalho pela metade, com número e tudo, esperando alguém
 * perceber. Não há metade de ordem de serviço.
 *
 * Cada objeto criado gera evento na linha do tempo, que é append-only por
 * gatilho no banco — daí "nada perde histórico" ser um fato e não uma intenção.
 */
export async function abrirOrdemDeServico(
  prisma: PrismaClient,
  nova: NovaOrdemDeServico,
  ator: { tipo: string; rotulo?: string | null } = { tipo: "SYSTEM" },
): Promise<ResultadoDeAbertura> {
  const recusas = validarOrdemDeServico(nova);
  if (recusas.length) return { ok: false, recusas };

  const aberta = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const os = await tx.workOrder.create({
      data: {
        objetivo: nova.objetivo.trim(),
        resultadoEsperado: nova.resultadoEsperado.trim(),
        criterioDeAceite: nova.criterioDeAceite.trim(),
        contexto: nova.contexto ?? null,
        riscos: nova.riscos ?? null,
        restricoes: nova.restricoes ?? null,
        prioridade: nova.prioridade ?? "MEDIA",
        prazo: nova.prazo ?? null,
        solicitanteId: nova.solicitanteId ?? null,
        sponsorPositionId: nova.sponsorPositionId ?? null,
        ownerPositionId: nova.ownerPositionId ?? null,
        departmentId: nova.departmentId ?? null,
      },
    });

    await registrarEvento(tx, {
      tipo: "os.aberta",
      entidade: "WorkOrder",
      entidadeId: os.id,
      atorTipo: ator.tipo,
      atorRotulo: ator.rotulo,
      dados: { numero: os.numero, objetivo: os.objetivo },
    });

    let projectId: string | null = null;
    if (nova.projeto) {
      const projeto = await tx.project.create({
        data: {
          nome: nova.projeto.nome,
          objetivo: nova.projeto.objetivo,
          workOrderId: os.id,
          departmentId: nova.departmentId ?? null,
          ownerPositionId: nova.ownerPositionId ?? null,
          prioridade: nova.prioridade ?? "MEDIA",
          prazo: nova.prazo ?? null,
        },
      });
      projectId = projeto.id;

      await registrarEvento(tx, {
        tipo: "projeto.aberto",
        entidade: "Project",
        entidadeId: projeto.id,
        atorTipo: ator.tipo,
        atorRotulo: ator.rotulo,
        dados: { workOrderId: os.id, nome: projeto.nome },
      });
    }

    const taskIds: string[] = [];
    for (const t of nova.tarefas ?? []) {
      const tarefa = await tx.task.create({
        data: {
          titulo: t.titulo.trim(),
          descricao: t.descricao ?? null,
          // Herdar o prazo da OS é decisão explícita, não acidente: a tarefa
          // não pode terminar depois da ordem que a gerou.
          prazo: t.prazo ?? nova.prazo ?? null,
          prioridade: t.prioridade ?? nova.prioridade ?? "MEDIA",
          assigneePositionId: t.assigneePositionId ?? null,
          assigneeUserId: t.assigneeUserId ?? null,
          projectId,
          workOrderId: os.id,
          departmentId: nova.departmentId ?? null,
        },
      });
      taskIds.push(tarefa.id);

      await registrarEvento(tx, {
        tipo: "tarefa.criada",
        entidade: "Task",
        entidadeId: tarefa.id,
        atorTipo: ator.tipo,
        atorRotulo: ator.rotulo,
        dados: { workOrderId: os.id, projectId, titulo: tarefa.titulo },
      });
    }

    return { workOrderId: os.id, numero: os.numero, projectId, taskIds };
  });

  return { ok: true, ordem: aberta };
}
